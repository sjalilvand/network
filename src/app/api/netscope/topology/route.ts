// NetScope — API توپولوژی (سه نوع رابطه جدا — سند بخش ۵)

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { json, err } from "@/lib/netscope/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || "physical"; // physical | logical | functional
  const project = await getProject();

  const links = await db.link.findMany({
    where: { projectId: project.id, kind },
    include: {
      src: { select: { id: true, identityKey: true, hostname: true, type: true, status: true } },
      dst: { select: { id: true, identityKey: true, hostname: true, type: true, status: true } },
    },
  });

  const devices = await db.device.findMany({
    where: { projectId: project.id },
    select: { id: true, identityKey: true, hostname: true, type: true, status: true, vendor: true, model: true, confidence: true, mergedIntoId: true, isSimulated: true },
  });

  const networks = await db.network.findMany({ where: { projectId: project.id } });

  // شواهد هر لینک — کاربر باید بتواند شواهد هر خط را ببیند (الزام سند ۵.۴)
  const linkIds = links.map((l) => l.id);
  const evidence = linkIds.length
    ? await db.evidence.findMany({ where: { linkId: { in: linkIds } }, orderBy: { collectedAt: "desc" } })
    : [];

  return json({
    kind,
    nodes: devices
      .filter((d) => !d.mergedIntoId)
      .map((d) => ({
        id: d.id, key: d.identityKey, label: d.hostname || d.identityKey,
        type: d.type, status: d.status, vendor: d.vendor, model: d.model,
        confidence: d.confidence, isSimulated: d.isSimulated,
      })),
    edges: links.map((l) => ({
      id: l.id, source: l.srcDeviceId, target: l.dstDeviceId,
      relation: l.relation, srcPort: l.srcPort, dstPort: l.dstPort,
      vlan: l.vlan, sourceMethod: l.sourceMethod, confidence: l.confidence,
      status: l.status, lastVerified: l.lastVerified, evidenceText: l.evidenceText,
      srcKey: l.src.identityKey, dstKey: l.dst.identityKey,
    })),
    evidence: evidence.map((e) => ({
      id: e.id, linkId: e.linkId, content: e.content, sourceMethod: e.sourceMethod,
      confidence: e.confidence, collectedAt: e.collectedAt, isSimulated: e.isSimulated,
    })),
    networks,
  });
}

// تأیید دستی اتصال توسط کاربر (منبع معتبر سند ۵.۱: تأیید مستند کاربر)
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { linkId, verdict, note } = body;
  if (!linkId) return err("اتصال مشخص نشده است");
  const project = await getProject();

  if (verdict === "confirm") {
    await db.link.update({
      where: { id: linkId },
      data: { confidence: "verified", sourceMethod: "user-confirmed", lastVerified: new Date() },
    });
    await db.evidence.create({
      data: {
        projectId: project.id, linkId, kind: "user-entry", sourceMethod: "user-confirmation",
        content: `اتصال توسط کاربر با ذکر مستند تأیید شد${note ? ": " + note : ""}`, confidence: "verified",
      },
    });
    await db.auditLog.create({ data: { projectId: project.id, action: "تأیید دستی اتصال", target: linkId, detail: note || "" } });
  } else if (verdict === "reject") {
    await db.link.update({ where: { id: linkId }, data: { status: "inactive", evidenceText: (note ? note + " — " : "") + "رد شده توسط کاربر" } });
    await db.auditLog.create({ data: { projectId: project.id, action: "رد اتصال", target: linkId, detail: note || "" } });
  }
  return json({ ok: true });
}
