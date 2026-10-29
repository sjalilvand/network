// NetScope — API خروجی‌گرفتن JSON/CSV (سند بخش ۱۵)
// با امکان ناشناس‌سازی IP، MAC و سریال (الزام سند بخش ۱۲)

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { getChecklistView } from "@/lib/netscope/api-helpers";

export const dynamic = "force-dynamic";

function anonymize(s: string): string {
  // ناشناس‌سازی ساده: IPها → 10.x.y.z جایگزین، MAC → XX:XX
  return s
    .replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, (m, a, b, c) => `10.${a}.${b}.${c}`)
    .replace(/\b([0-9A-Fa-f]{2}[:-]){2}[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){3}\b/g, "XX:XX:XX:XX:XX:XX");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "json";
  const anon = searchParams.get("anon") === "1";
  const project = await getProject();

  const [devices, networks, links, checklist, findings, alerts] = await Promise.all([
    db.device.findMany({ where: { projectId: project.id }, include: { interfaces: { include: { ipAdds: true } } } }),
    db.network.findMany({ where: { projectId: project.id } }),
    db.link.findMany({ where: { projectId: project.id }, include: { src: { select: { identityKey: true } }, dst: { select: { identityKey: true } } } }),
    getChecklistView(),
    db.analysisFinding.findMany({ where: { projectId: project.id } }),
    db.alert.findMany({ where: { projectId: project.id }, include: { device: { select: { identityKey: true } } } }),
  ]);

  if (format === "csv") {
    // خروجی CSV دستگاه‌ها
    const rows = [["نام", "نوع", "سازنده", "مدل", "IP", "MAC", "وضعیت", "اطمینان", "شبیه‌سازی", "آخرین مشاهده"]];
    for (const d of devices) {
      const ip = d.interfaces[0]?.ipAdds[0]?.address || "";
      rows.push([
        d.hostname || d.identityKey, d.type, d.vendor || "", d.model || "",
        ip, d.interfaces[0]?.mac || "", d.status, d.confidence,
        d.isSimulated ? "بله" : "خیر", d.lastSeen?.toISOString() || "",
      ]);
    }
    let csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    if (anon) csv = anonymize(csv);
    return new Response("\uFEFF" + csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="netscope-devices.csv"' },
    });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    project: { name: project.name, description: project.description, scope: JSON.parse(project.scope || "[]") },
    checklist: { overall: checklist.overall, groups: checklist.groups, items: checklist.items },
    inventory: {
      devices: devices.map((d) => ({
        identityKey: d.identityKey, hostname: d.hostname, type: d.type, vendor: d.vendor,
        model: d.model, status: d.status, confidence: d.confidence,
        roleEvidence: d.roleEvidence, isSimulated: d.isSimulated,
        interfaces: d.interfaces.map((i) => ({ name: i.name, mac: i.mac, ips: i.ipAdds.map((x) => x.address) })),
      })),
      networks,
    },
    topology: links.map((l) => ({
      kind: l.kind, relation: l.relation, src: l.src.identityKey, dst: l.dst.identityKey,
      confidence: l.confidence, sourceMethod: l.sourceMethod, evidence: l.evidenceText,
    })),
    findings: findings.map((f) => ({
      title: f.title, description: f.description, confidence: f.confidence,
      evidence: f.evidenceText, limitations: f.limitations,
    })),
    alerts: alerts.map((a) => ({ title: a.title, severity: a.severity, kind: a.kind, status: a.status, device: a.device?.identityKey })),
  };

  let body = JSON.stringify(payload, null, 2);
  if (anon) body = anonymize(body);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="netscope-projeh-${anon ? "anon" : "full"}.json"`,
    },
  });
}
