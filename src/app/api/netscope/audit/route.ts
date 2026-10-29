// NetScope — API ممیزی و شواهد (سند بخش ۱۲: تمام عملیات حساس ثبت و قابل ممیزی باشند)

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { json } from "@/lib/netscope/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 300);
  const project = await getProject();

  const [audit, attempts, evidence, allDevices] = await Promise.all([
    db.auditLog.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: limit }),
    db.collectionAttempt.findMany({ where: { projectId: project.id }, orderBy: { startedAt: "desc" }, take: limit }),
    db.evidence.findMany({
      where: { projectId: project.id },
      orderBy: { collectedAt: "desc" }, take: limit,
    }),
    db.device.findMany({ where: { projectId: project.id }, select: { id: true, identityKey: true, hostname: true } }),
  ]);
  const devById = new Map(allDevices.map((d) => [d.id, d]));

  return json({
    audit,
    attempts,
    evidence: evidence.map((e) => ({
      id: e.id, kind: e.kind, sourceMethod: e.sourceMethod, content: e.content,
      confidence: e.confidence, isSimulated: e.isSimulated, collectedAt: e.collectedAt,
      deviceKey: e.deviceId ? devById.get(e.deviceId)?.identityKey || null : null,
      checklistKey: e.checklistKey,
      expiresAt: e.expiresAt,
    })),
  });
}
