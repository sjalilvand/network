// NetScope — فاز ۲: موتور استنباط توپولوژی فیزیکی (سند بخش ۵.۲)
// ─────────────────────────────────────────────────────────────────
// قواعد محوری (بدون استثنا):
//  ۱) همسایه LLDP → اتصال فیزیکی «تأییدشده» (پورت دو طرف ثبت می‌شود)
//  ۲) پورت با MACهای متعدد → trunk/uplink است؛ از آن «اتصال مستقیم» استنباط نمی‌شود
//     (MAC دیده‌شدن روی پورت ≠ اتصال مستقیم — سند ۵.۲)
//  ۳) پورت با فقط یک MAC خارجی که به دستگاه شناخته‌شده می‌رسد → اتصال «استنباطی»
//  ۴) MAC شناخته‌نشده → «دستگاه ناشناس» با اطمینان «نامشخص» — مفقود اطلاعات ≠ مفقود دستگاه
//  ۵) هیچ لینکی برای کامل‌شدن نقشه جعل نمی‌شود؛ همه لینک‌ها به شواهد وصل‌اند

export interface InferFdbEntry { port: string; mac: string; vlan?: number; }
export interface InferLldpEntry {
  localPort: string;
  remoteChassisId: string;
  remotePortId?: string;
  remoteSysName?: string;
  remotePortDesc?: string;
}
export interface InferDevice {
  id: string;
  identityKey: string;
  hostname?: string | null;
  type: string;
  macs: string[]; // همه MACهای شناخته‌شده دستگاه (از رابط‌ها)
}

export interface InferredPortRole {
  port: string;
  macCount: number;
  role: "uplink" | "trunk" | "access" | "unknown";
  reason: string;
  vlans: number[];
}

export interface InferredLink {
  dstDeviceId?: string;         // اگر شناسایی شد
  dstMac?: string;              // اگر MAC شناخته‌نشده بود
  dstPlaceholderName?: string;
  srcPort: string;
  dstPort?: string;
  confidence: "verified" | "inferred" | "unknown";
  sourceMethod: string;         // lldp | fdb
  evidence: string;
}

export interface InferenceOutput {
  links: InferredLink[];
  portRoles: InferredPortRole[];
  unknownMacs: { mac: string; port: string }[];
  warnings: string[];
}

const TRUNK_MAC_THRESHOLD = 4; // بیش از این تعداد MAC روی یک پورت → ترانک/آپ‌لینک

export function inferPhysicalTopology(input: {
  fdb: InferFdbEntry[];
  lldp: InferLldpEntry[];
  devices: InferDevice[];
  selfMacs: string[]; // MACهای خود سوئیچ — از استنباط حذف می‌شوند
}): InferenceOutput {
  const { fdb, lldp, devices, selfMacs } = input;
  const warnings: string[] = [];
  const links: InferredLink[] = [];
  const unknownMacs: { mac: string; port: string }[] = [];

  const macToDev = new Map<string, InferDevice>();
  // اولویت با دستگاه‌های «اصلی» است؛ جایگاه‌دارهای parse/unknown فقط در نبود گزینه بهتر
  const isPlaceholder = (d: InferDevice) =>
    d.identityKey.startsWith("parsed-") || d.identityKey.startsWith("unknown-mac-");
  const priority = (d: InferDevice) => (isPlaceholder(d) ? 1 : 0) + (d.type === "unknown" ? 1 : 0);
  const sorted = [...devices].sort((a, b) => priority(a) - priority(b));
  for (const d of sorted) {
    for (const m of d.macs) {
      const k = m.toUpperCase();
      if (!macToDev.has(k)) macToDev.set(k, d); // اولین (با کمترین اولویت جایگاه‌داری) برنده است
    }
  }
  const selfMacSet = new Set(selfMacs.map((m) => m.toUpperCase()));
  const devByMacs = (mac: string) => macToDev.get(mac.toUpperCase());
  const isInfraType = (t: string) => ["switch", "router", "radio", "ap", "nvr"].includes(t);

  // ─── ۱) نقش پورت‌ها از روی FDB ────────────────────────────────────
  const byPort = new Map<string, InferFdbEntry[]>();
  for (const e of fdb) {
    if (selfMacSet.has(e.mac.toUpperCase())) continue; // MAC خود سوئیچ
    const arr = byPort.get(e.port) || [];
    arr.push(e);
    byPort.set(e.port, arr);
  }

  const portRoles: InferredPortRole[] = [];
  for (const [port, macs] of byPort) {
    const vlans = [...new Set(macs.map((m) => m.vlan).filter((v): v is number => typeof v === "number"))];
    const infraMacs = macs.filter((m) => {
      const d = devByMacs(m.mac);
      return d && isInfraType(d.type);
    });
    const knownUnique = new Set(macs.map((m) => devByMacs(m.mac)?.id).filter(Boolean));
    if (macs.length > TRUNK_MAC_THRESHOLD || infraMacs.length > 1) {
      portRoles.push({
        port, macCount: macs.length, vlans, role: "uplink",
        reason: `${macs.length} MAC روی پورت دیده می‌شود؛ از این پورت اتصال مستقیم استنباط نمی‌شود (سند ۵.۲)`,
      });
    } else if (infraMacs.length === 1 && (macs.length > 1 || knownUnique.size > 1)) {
      portRoles.push({
        port, macCount: macs.length, vlans, role: "trunk",
        reason: "MAC تجهیز زیرساختی + کاربران پشت آن — اتصال به تجهیز زیرساختی استنباط می‌شود نه کاربران",
      });
    } else if (macs.length === 1) {
      portRoles.push({ port, macCount: 1, vlans, role: "access", reason: "تنها یک MAC — پورت access" });
    } else {
      portRoles.push({ port, macCount: macs.length, vlans, role: "unknown", reason: "الگوی MACها نامشخص" });
    }
  }
  const roleByPort = new Map(portRoles.map((p) => [p.port, p]));

  // ─── ۲) لینک‌های تأییدشده از LLDP ─────────────────────────────────
  const lldpPorts = new Set<string>();
  for (const n of lldp) {
    lldpPorts.add(n.localPort);
    const remote = devByMacs(n.remoteChassisId) ||
      devices.find((d) => (n.remoteSysName && (d.hostname === n.remoteSysName)) || d.identityKey === n.remoteSysName);
    if (!remote) {
      // همسایه LLDP شناخته‌نشده — به‌جای جعل لینک، به‌عنوان نامشخص گزارش می‌شود
      unknownMacs.push({ mac: n.remoteChassisId, port: n.localPort });
      warnings.push(
        `همسایه LLDP «${n.remoteSysName || n.remoteChassisId}» روی ${n.localPort} در موجودی دستگاه‌ها یافت نشد — ابتدا آن دستگاه را کشف/ثبت کنید.`
      );
      continue;
    }
    links.push({
      dstDeviceId: remote.id,
      srcPort: n.localPort,
      dstPort: n.remotePortId || undefined,
      confidence: "verified",
      sourceMethod: "lldp",
      evidence:
        `LLDP: سوئیچ روی ${n.localPort} همسایه «${n.remoteSysName || remote.identityKey}» را اعلام می‌کند ` +
        `(chassis=${n.remoteChassisId}${n.remotePortId ? `, remotePort=${n.remotePortId}` : ""}). اتصال فیزیکی تأییدشده دوطرفه است.`,
    });
  }

  // ─── ۳) لینک‌های استنباطی از FDB (فقط پورت‌های access یا تک-تجهیز) ──
  for (const [port, macs] of byPort) {
    if (lldpPorts.has(port)) continue; // LLDP مقدم است
    const role = roleByPort.get(port);
    const candidates = macs
      .map((m) => ({ ...m, dev: devByMacs(m.mac) }))
      .filter((m) => m.dev);

    if (role?.role === "uplink") continue; // قاعده ۲ — هرگز از آپ‌لینک لینک مستقیم نمی‌سازیم

    // پورت با چند MAC اما فقط یک دستگاه زیرساختی شناخته‌شده → اتصال به همان تجهیز
    const infra = candidates.filter((c) => isInfraType(c.dev.type));
    if (infra.length === 1) {
      const c = infra[0];
      links.push({
        dstDeviceId: c.dev.id, srcPort: port, dstPort: undefined,
        confidence: "inferred", sourceMethod: "fdb",
        evidence:
          `FDB: MAC سازنده ${c.dev.hostname || c.dev.identityKey} (${c.mac}) روی پورت ${port} دیده می‌شود` +
          `${macs.length > 1 ? ` همراه ${macs.length - 1} MAC دیگر (تجهیزات پشت این دستگاه)` : ""}. ` +
          `اتصال «استنباطی» است؛ تأیید قطعی نیازمند LLDP یا تأیید کاربر.`,
      });
      continue;
    }

    if (candidates.length === 1 && macs.length === 1) {
      links.push({
        dstDeviceId: candidates[0].dev.id, srcPort: port,
        confidence: "inferred", sourceMethod: "fdb",
        evidence:
          `FDB: تنها MAC این پورت (${candidates[0].mac}) متعلق به ${candidates[0].dev.hostname || candidates[0].dev.identityKey} است. ` +
          `تک-MAC بودن پورت احتمال اتصال مستقیم را بالا می‌برد؛ با این حال اتصال «استنباطی» ثبت شد و تا LLDP/تأیید کاربر «تأییدشده» نمی‌شود.`,
      });
      continue;
    }

    // MACهای شناخته‌نشده → دستگاه ناشناس (قاعده ۴)
    for (const m of macs) {
      if (devByMacs(m.mac)) continue;
      unknownMacs.push({ mac: m.mac, port });
    }
  }

  // یکتاسازی
  const seen = new Set<string>();
  const linksUnique = links.filter((l) => {
    const k = `${l.dstDeviceId}|${l.srcPort}|${l.confidence}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { links: linksUnique, portRoles, unknownMacs: dedupe(unknownMacs), warnings };
}

function dedupe(list: { mac: string; port: string }[]) {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = `${x.mac}|${x.port}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
