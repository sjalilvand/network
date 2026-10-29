// NetScope — API چک‌لیست کامل + شواهد هر آیتم

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { getChecklistView, json } from "@/lib/netscope/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const evidenceKey = searchParams.get("evidence");
  const project = await getProject();
  const checklist = await getChecklistView();

  let evidence: unknown[] = [];
  if (evidenceKey) {
    const rows = await db.evidence.findMany({
      where: { projectId: project.id, checklistKey: evidenceKey },
      orderBy: { collectedAt: "desc" },
      take: 30,
    });
    evidence = rows.map((e) => ({
      id: e.id, kind: e.kind, sourceMethod: e.sourceMethod, content: e.content,
      confidence: e.confidence, isSimulated: e.isSimulated, collectedAt: e.collectedAt,
    }));
  }

  return json({ ...checklist, evidence });
}
