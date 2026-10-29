// NetScope — فاز ۲: اعمال نتایج جمع‌آوری سوئیچ و استنباط توپولوژی
// این ماژول مشترک بین API ورود خروجی CLI و جمع‌آور SNMP است.

import { db } from "@/lib/db";
import { inferPhysicalTopology, type InferDevice } from "./topology-inference";
import type { InferFdbEntry, InferLldpEntry } from "./topology-inference";

export interface ApplyResult {
  fdbStored: number;
  lldpStored: number;
  linksCreated: number;
  linksUpdated: number;
  placeholdersCreated: number;
  portRolesUpdated: number;
  unknownMacs: { mac: string; port: string }[];
  warnings: string[];
}

// ─── ذخیره جدول FDB ────────────────────────────────────────────────
export async function storeFdb(deviceId: string, entries: InferFdbEntry[], opts: { source: string; isSimulated: boolean }) {
  await db.fdbEntry.deleteMany({ where: { deviceId } });
  if (!entries.length) return 0;
  const seen = new Set<string>();
  const rows = entries
    .filter((e) => e.mac)
    .map((e) => ({ ...e, mac: e.mac.toUpperCase() }))
    .filter((e) => {
      const k = `${e.port}|${e.mac}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  await db.fdbEntry.createMany({
    data: rows.map((e) => ({
      deviceId, port: e.port, mac: e.mac, vlanId: e.vlan ?? null,
      source: opts.source, isSimulated: opts.isSimulated, seenAt: new Date(),
    })),
  });
  return rows.length;
}

// ─── ذخیره همسایه‌های LLDP ─────────────────────────────────────────
export async function storeLldp(deviceId: string, entries: InferLldpEntry[], opts: { source: string; isSimulated: boolean }) {
  await db.lldpNeighbor.deleteMany({ where: { deviceId } });
  if (!entries.length) return 0;
  const seen = new Set<string>();
  const rows = entries
    .filter((n) => n.localPort && n.remoteChassisId)
    .filter((n) => {
      const k = `${n.localPort}|${n.remoteChassisId.toUpperCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  await db.lldpNeighbor.createMany({
    data: rows.map((n) => ({
      deviceId, localPort: n.localPort, remoteChassisId: n.remoteChassisId.toUpperCase(),
      remotePortId: n.remotePortId || null, remoteSysName: n.remoteSysName || null,
      remotePortDesc: n.remotePortDesc || null,
      source: opts.source, isSimulated: opts.isSimulated, seenAt: new Date(),
    })),
  });
  return rows.length;
}

// ─── اجرای استنباط و ساخت/به‌روزرسانی لینک‌های فیزیکی ──────────────
export async function runInferenceAndApplyLinks(
  projectId: string,
  switchDeviceId: string,
  opts: { isSimulated: boolean }
): Promise<ApplyResult> {
  const result: ApplyResult = {
    fdbStored: 0, lldpStored: 0, linksCreated: 0, linksUpdated: 0,
    placeholdersCreated: 0, portRolesUpdated: 0, unknownMacs: [], warnings: [],
  };

  const sw = await db.device.findUnique({ where: { id: switchDeviceId }, include: { interfaces: true } });
  if (!sw) return result;

  const fdbRows = await db.fdbEntry.findMany({ where: { deviceId: switchDeviceId } });
  const lldpRows = await db.lldpNeighbor.findMany({ where: { deviceId: switchDeviceId } });

  const fdb: InferFdbEntry[] = fdbRows.map((r) => ({ port: r.port, mac: r.mac, vlan: r.vlanId ?? undefined }));
  const lldp: InferLldpEntry[] = lldpRows.map((r) => ({
    localPort: r.localPort, remoteChassisId: r.remoteChassisId,
    remotePortId: r.remotePortId || undefined, remoteSysName: r.remoteSysName || undefined,
    remotePortDesc: r.remotePortDesc || undefined,
  }));

  // دستگاه‌های شناخته‌شده با MACهایشان (به جز خود سوئیچ و ادغام‌شده‌ها)
  const allDevices = await db.device.findMany({
    where: { projectId, mergedIntoId: null },
    include: { interfaces: { select: { mac: true } } },
  });
  const devices: InferDevice[] = allDevices
    .filter((d) => d.id !== sw.id)
    // دستگاه‌های جایگاه‌دار (ناشناس) وارد استنباط نمی‌شوند — MAC آن‌ها باید «نامشخص» بماند
    .filter((d) => !d.identityKey.startsWith("unknown-mac-"))
    .map((d) => ({
      id: d.id, identityKey: d.identityKey, hostname: d.hostname, type: d.type,
      macs: d.interfaces.map((i) => i.mac).filter((m): m is string => !!m),
    }));

  const inference = inferPhysicalTopology({
    fdb, lldp,
    devices,
    selfMacs: sw.interfaces.map((i) => i.mac).filter((m): m is string => !!m),
  });
  result.unknownMacs = inference.unknownMacs;
  result.warnings = inference.warnings;

  // به‌روزرسانی نقش پورت‌ها روی Interfaceهای خود سوئیچ
  for (const pr of inference.portRoles) {
    const itf = sw.interfaces.find((i) =>
      i.name.toLowerCase() === pr.port.toLowerCase() ||
      i.name.toLowerCase().endsWith(pr.port.toLowerCase()) ||
      pr.port.toLowerCase().endsWith(i.name.toLowerCase())
    );
    if (itf) {
      await db.interface.update({
        where: { id: itf.id },
        data: { portRole: pr.role === "uplink" || pr.role === "trunk" ? "trunk" : pr.role, trunkVlans: JSON.stringify(pr.vlans) },
      });
      result.portRolesUpdated++;
    }
  }

  // MACهای ناشناس → دستگاه جایگاه‌دار (هویت ناشناس با برچسب صادقانه)
  for (const um of inference.unknownMacs) {
    const key = `unknown-mac-${um.mac.toLowerCase().replace(/:/g, "")}`;
    let ph = await db.device.findUnique({ where: { identityKey: key } });
    if (!ph) {
      ph = await db.device.create({
        data: {
          projectId, identityKey: key, hostname: null,
          vendor: null, type: "unknown", role: "دستگاه ناشناس پشت سوئیچ",
          roleEvidence: `MAC ${um.mac} روی پورت ${um.port} سوئیچ ${sw.hostname || sw.identityKey} دیده می‌شود؛ ماهیت دستگاه هنوز شناسایی نشده است — مفقود اطلاعات به معنای مفقود دستگاه نیست.`,
          confidence: "unknown", status: "unknown", isSimulated: opts.isSimulated,
          notes: `MAC: ${um.mac} | پورت: ${um.port}`,
        },
      });
      // رکورد MAC به‌عنوان رابط این دستگاه جایگاه‌دار
      await db.interface.create({ data: { deviceId: ph.id, name: "unknown-port", mac: um.mac, status: "unknown" } });
      result.placeholdersCreated++;
    }
    // لینک نامشخص سوئیچ → جایگاه‌دار
    const created = await upsertPhysicalLink(projectId, {
      srcDeviceId: sw.id, dstDeviceId: ph.id, srcPort: um.port, dstPort: null,
      confidence: "unknown", sourceMethod: "fdb",
      evidenceText: `MAC ناشناس ${um.mac} روی پورت ${um.port} مشاهده شد. اطمینان «نامشخص»: دستگاه و ماهیت اتصال هنوز تأیید نشده‌اند. اقدام پیشنهادی: کشف دستگاه، بررسی پنل سوئیچ یا تأیید دستی.`,
      isSimulated: opts.isSimulated,
    });
    if (created === "created") result.linksCreated++;
    if (created === "updated") result.linksUpdated++;
  }

  // لینک‌های استنباطی/تأییدشده
  for (const l of inference.links) {
    if (!l.dstDeviceId) continue;
    const created = await upsertPhysicalLink(projectId, {
      srcDeviceId: sw.id, dstDeviceId: l.dstDeviceId, srcPort: l.srcPort, dstPort: l.dstPort || null,
      confidence: l.confidence, sourceMethod: l.sourceMethod, evidenceText: l.evidence,
      isSimulated: opts.isSimulated,
    });
    if (created === "created") result.linksCreated++;
    if (created === "updated") result.linksUpdated++;
  }

  return result;
}

// upsert لینک فیزیکی — با ملاحظه جهت مخالف (اتصال A→B همان B→A است)
async function upsertPhysicalLink(projectId: string, o: {
  srcDeviceId: string; dstDeviceId: string; srcPort: string | null; dstPort: string | null;
  confidence: string; sourceMethod: string; evidenceText: string; isSimulated: boolean;
}): Promise<"created" | "updated" | "skipped"> {
  const pairWhere = {
    projectId, kind: "physical",
    OR: [
      { srcDeviceId: o.srcDeviceId, dstDeviceId: o.dstDeviceId },
      { srcDeviceId: o.dstDeviceId, dstDeviceId: o.srcDeviceId },
    ],
  };
  const existing = await db.link.findFirst({ where: pairWhere });

  const confidenceRank: Record<string, number> = { unknown: 0, inferred: 1, verified: 2 };
  const better = (a: string, b: string) => (confidenceRank[a] ?? 0) > (confidenceRank[b] ?? 0) ? a : b;

  const emptyPort = (p: string | null) => !p || p === "—" || p === "-";
  const clean = (p: string | null) => (emptyPort(p) ? null : p);

  if (existing) {
    // اگر همین‌قدر یا قوی‌تر است و پورت‌ها قبلاً ثبت شده، فقط شواهد اضافه می‌شود
    const sameConf = (confidenceRank[existing.confidence] ?? 0) >= (confidenceRank[o.confidence] ?? 0);
    const portsKnown = !emptyPort(existing.srcPort) && !emptyPort(existing.dstPort);
    await db.link.update({
      where: { id: existing.id },
      data: {
        confidence: better(existing.confidence, o.confidence),
        sourceMethod: sameConf && existing.sourceMethod === "user-confirmed" ? "user-confirmed" : better(existing.confidence, o.confidence) === o.confidence ? o.sourceMethod : existing.sourceMethod,
        srcPort: clean(existing.srcPort) || clean(o.srcPort),
        dstPort: clean(existing.dstPort) || clean(o.dstPort),
        lastVerified: o.confidence === "verified" ? new Date() : existing.lastVerified,
        status: "active",
        evidenceText: existing.evidenceText.includes(o.evidenceText.slice(0, 40))
          ? existing.evidenceText
          : `${o.evidenceText}\n——\n${existing.evidenceText}`,
      },
    });
    if (!sameConf || o.confidence === "verified" || !portsKnown) {
      await db.evidence.create({
        data: {
          projectId, deviceId: o.srcDeviceId, linkId: existing.id, kind: "observation",
          sourceMethod: o.sourceMethod === "lldp" ? "snmp-lldp" : "fdb-analysis",
          content: o.evidenceText, confidence: o.confidence,
          isSimulated: o.isSimulated,
        },
      });
    }
    return "updated";
  }

  const link = await db.link.create({
    data: {
      projectId, srcDeviceId: o.srcDeviceId, dstDeviceId: o.dstDeviceId, kind: "physical",
      relation: o.confidence === "verified" ? "lldp-peer" : "switch-port",
      srcPort: o.srcPort, dstPort: o.dstPort, sourceMethod: o.sourceMethod,
      confidence: o.confidence, status: "active",
      lastVerified: o.confidence === "verified" ? new Date() : null,
      evidenceText: o.evidenceText,
    },
  });
  await db.evidence.create({
    data: {
      projectId, deviceId: o.srcDeviceId, linkId: link.id, kind: "observation",
      sourceMethod: o.sourceMethod === "lldp" ? "snmp-lldp" : "fdb-analysis",
      content: o.evidenceText, confidence: o.confidence, isSimulated: o.isSimulated,
    },
  });
  return "created";
}
