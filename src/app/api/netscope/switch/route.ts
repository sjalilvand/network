// NetScope — فاز ۲: API ورود خروجی سوئیچ (FDB/LLDP/VLAN/IfStatus) و استنباط توپولوژی

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { json, err } from "@/lib/netscope/api-helpers";
import { dispatchSwitchParse, normalizeMac } from "@/lib/netscope/switch-parsers";
import type { SwitchParseFormat } from "@/lib/netscope/vendors";
import { storeFdb, storeLldp, runInferenceAndApplyLinks } from "@/lib/netscope/phase2-apply";
import { SCENARIO_FDB, SCENARIO_LLDP } from "@/lib/netscope/scenario-phase2";
import { CHECKLIST_GROUPS } from "@/lib/netscope/checklist-defs";
import type { InferFdbEntry, InferLldpEntry } from "@/lib/netscope/topology-inference";

export const dynamic = "force-dynamic";

const FDB_ITEM = "conn.fdb-table";
const LLDP_ITEM = "conn.lldp-table";
const VLAN_ITEM = "networks.vlans";
const IF_ITEM = "mgmt.interfaces";
const NEIGH_ITEM = "conn.neighbors";

async function ensureItem(projectId: string, itemKey: string) {
  const def = CHECKLIST_GROUPS.flatMap((g) => g.items.map((i) => ({ groupKey: g.groupKey, i })))
    .find((x) => x.i.itemKey === itemKey);
  if (!def) return;
  await db.checklistItem.upsert({
    where: { itemKey },
    update: {},
    create: { projectId, groupKey: def.groupKey, itemKey, title: def.i.title, status: "not-collected" },
  });
}

async function markCollected(projectId: string, itemKey: string, value: unknown, method: string, confidence = "verified") {
  await ensureItem(projectId, itemKey);
  await db.checklistItem.update({
    where: { itemKey },
    data: {
      status: "collected", value: JSON.stringify(value), method,
      confidence, collectedAt: new Date(), validity: "تا تغییر پیکربندی",
      error: "", updatedAt: new Date(),
    },
  });
}

function detectFormat(raw: string): SwitchParseFormat {
  if (/mac-address=/i.test(raw)) return "mikrotik-bridge-host";
  if (/chassis\s*id/i.test(raw) && /system\s*name|port\s*id/i.test(raw)) return "cisco-lldp-detail";
  if (/[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}/im.test(raw)) return "cisco-mac-table";
  return "generic-mac-table";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId");
  const project = await getProject();
  if (!deviceId) {
    const counts = await db.device.findMany({
      where: { projectId: project.id },
      select: { id: true, identityKey: true, hostname: true, type: true, _count: { select: { fdbEntries: true, lldpNeighbors: true } } },
    });
    return json({ devices: counts.filter((d) => d._count.fdbEntries || d._count.lldpNeighbors) });
  }
  const [fdb, lldp] = await Promise.all([
    db.fdbEntry.findMany({ where: { deviceId }, orderBy: { port: "asc" } }),
    db.lldpNeighbor.findMany({ where: { deviceId }, orderBy: { localPort: "asc" } }),
  ]);
  return json({ fdb, lldp });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const project = await getProject();
  const deviceId = body.deviceId as string;
  const kind = body.kind as "fdb" | "lldp" | "vlan" | "ifstatus";
  if (!deviceId || !kind) return err("دستگاه و نوع داده مشخص نشده است");

  const device = await db.device.findUnique({ where: { id: deviceId }, include: { interfaces: true } });
  if (!device) return err("دستگاه یافت نشد", 404);

  const isSimulated = !!body.useScenario;
  let raw = (body.raw as string) || "";
  const format = (body.format as SwitchParseFormat) || detectFormat(raw);
  const warnings: string[] = [];
  const unknownSections: string[] = [];
  let fdbEntries: InferFdbEntry[] = [];
  let lldpEntries: InferLldpEntry[] = [];
  let vlanData: unknown[] = [];
  let ifStatusData: unknown[] = [];

  // ── داده نمونه — سناریوی آزمایشی (برچسب شبیه‌سازی در UI) ──────────
  if (isSimulated) {
    fdbEntries = SCENARIO_FDB[device.identityKey] || [];
    lldpEntries = SCENARIO_LLDP[device.identityKey] || [];
    if (!fdbEntries.length && !lldpEntries.length)
      return err(`برای «${device.identityKey}» داده نمونه تعریف نشده است`);
    raw = JSON.stringify({ fdb: fdbEntries, lldp: lldpEntries }, null, 1);
    warnings.push("داده نمونه شبیه‌سازی‌شده برای آزمودن موتور استنباط — داده واقعی نیست.");
  } else {
    if (!raw.trim()) return err("خروجی فرمان خالی است");
    const parsed = dispatchSwitchParse(format, raw);
    warnings.push(...parsed.warnings);
    unknownSections.push(...parsed.unknownSections);
    if (format === "cisco-lldp-detail" || format === "generic-lldp") {
      lldpEntries = parsed.entries as InferLldpEntry[];
    } else if (format === "cisco-vlan-brief") {
      vlanData = parsed.entries as unknown[];
    } else if (format === "cisco-if-status") {
      ifStatusData = parsed.entries as unknown[];
    } else {
      fdbEntries = parsed.entries as InferFdbEntry[];
    }
    if (!fdbEntries.length && !lldpEntries.length && !vlanData.length && !ifStatusData.length) {
      return json({ ok: false, summary: "چیزی قابل تجزیه نبود", warnings, unknownSections });
    }
  }

  // ── ذخیره و استنباط ───────────────────────────────────────────────
  let fdbStored = 0, lldpStored = 0;
  if (fdbEntries.length) {
    fdbStored = await storeFdb(deviceId, fdbEntries, { source: isSimulated ? "api" : "cli", isSimulated });
  }
  if (lldpEntries.length) {
    lldpStored = await storeLldp(deviceId, lldpEntries, { source: isSimulated ? "api" : "cli", isSimulated });
  }

  const apply = await runInferenceAndApplyLinks(project.id, deviceId, { isSimulated });
  warnings.push(...apply.warnings);

  // ── VLAN / IfStatus — به‌عنوان مشاهده و به‌روزرسانی رابط‌ها ────────
  if (vlanData.length) {
    await db.observation.create({ data: { deviceId, key: "vlan-table", value: JSON.stringify(vlanData).slice(0, 4000), source: "cli-parse" } });
  }
  if (ifStatusData.length) {
    for (const row of ifStatusData as { port: string; status?: string }[]) {
      const itf = device.interfaces.find(
        (i) => i.name.toLowerCase() === row.port.toLowerCase() || i.name.toLowerCase().endsWith(row.port.toLowerCase())
      );
      if (itf && row.status) await db.interface.update({ where: { id: itf.id }, data: { status: row.status } });
    }
  }

  // ── شواهد و حسابرسی ───────────────────────────────────────────────
  const summary =
    `ورود ${isSimulated ? "داده نمونه (شبیه‌سازی)" : "خروجی CLI"} سوئیچ ${device.hostname || device.identityKey}: ` +
    `${fdbStored} رکورد FDB، ${lldpStored} همسایه LLDP، ${apply.linksCreated} اتصال جدید، ` +
    `${apply.linksUpdated} اتصال به‌روزشده، ${apply.placeholdersCreated} دستگاه ناشناس جایگاه‌دار.`;
  await db.evidence.create({
    data: {
      projectId: project.id, deviceId, kind: isSimulated ? "observation" : "command-output",
      sourceMethod: `parse:${format}`, content: summary + "\n\n" + raw.slice(0, 2000),
      confidence: isSimulated ? "limited" : "verified", isSimulated,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  await db.auditLog.create({
    data: { projectId: project.id, action: "ورود خروجی سوئیچ (فاز ۲)", target: device.identityKey, detail: summary },
  });

  // ── بروزرسانی چک‌لیست ─────────────────────────────────────────────
  const topPorts = fdbEntries
    .reduce<Record<string, number>>((acc, e) => { acc[e.port] = (acc[e.port] || 0) + 1; return acc; }, {});
  if (fdbStored) {
    await markCollected(project.id, FDB_ITEM, { device: device.identityKey, entries: fdbStored, topPorts }, "خروجی CLI + تجزیه‌گر NetScope", isSimulated ? "limited" : "verified");
    await markCollected(project.id, NEIGH_ITEM, { device: device.identityKey, fdb: fdbStored, lldp: lldpStored, note: "MAC روی پورت ≠ اتصال مستقیم؛ اتصال‌ها با قواعد سند ۵.۲ استنباط شدند" }, "FDB/LLDP + موتور استنباط", "inferred");
  }
  if (lldpStored) {
    await markCollected(project.id, LLDP_ITEM, { device: device.identityKey, neighbors: lldpStored }, "خروجی LLDP + تجزیه‌گر", isSimulated ? "limited" : "verified");
  }
  if (vlanData.length) await markCollected(project.id, VLAN_ITEM, vlanData, "خروجی CLI + تجزیه‌گر");
  if (ifStatusData.length) await markCollected(project.id, IF_ITEM, { count: ifStatusData.length }, "خروجی CLI + تجزیه‌گر");

  return json({
    ok: true, summary, fdbStored, lldpStored,
    linksCreated: apply.linksCreated, linksUpdated: apply.linksUpdated,
    placeholdersCreated: apply.placeholdersCreated, portRolesUpdated: apply.portRolesUpdated,
    unknownMacs: apply.unknownMacs, warnings, unknownSections,
    simulated: isSimulated,
  });
}
