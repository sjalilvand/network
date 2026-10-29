// NetScope — هلپرهای مشترک API

import { db } from "@/lib/db";
import { CHECKLIST_GROUPS } from "./checklist-defs";
import { COMPLETED_STATUSES, type ChecklistStatus } from "./types";
import { getEngineState } from "./engine";

export function json(data: unknown, status = 200) {
  return Response.json(data as Record<string, unknown>, { status });
}

export function err(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export interface ChecklistItemView {
  id: string;
  groupKey: string;
  groupTitle: string;
  itemKey: string;
  title: string;
  status: ChecklistStatus | string;
  applicable: boolean;
  value: string;
  method: string;
  collectedAt: string | null;
  confidence: string;
  validity: string;
  accessReq: string;
  guideKey: string | null;
  error: string;
  nextAction: string;
  primaryPath?: string;
  alternatePath?: string;
  conditional?: string;
}

export interface GroupCompletion {
  groupKey: string;
  title: string;
  total: number;
  applicable: number;
  completed: number;
  percent: number;
  conditional: boolean;
  conditionMet: boolean;
}

export async function getChecklistView() {
  const project = await db.networkProject.findFirst({ orderBy: { createdAt: "asc" } });
  const state = await getEngineState();
  const items = project ? await db.checklistItem.findMany({ where: { projectId: project.id }, orderBy: { updatedAt: "desc" } }) : [];

  // شرایط گروه‌های شرطی (سند ۱.۲ — درصد تکمیل فقط براساس موارد مرتبط)
  const conditionMet: Record<string, boolean> = {
    "has-radio": true,      // شبکه آزمایشی رادیو دارد
    "has-cctv": true,       // سامانه نظارت تصویری دارد
    "has-monitoring": state.monitoringEnabled,
    "has-mgmt-devices": true,
  };

  const defs = CHECKLIST_GROUPS;
  const view: ChecklistItemView[] = [];
  const groupStats: GroupCompletion[] = [];

  for (const g of defs) {
    const condOk = !g.conditionKey || conditionMet[g.conditionKey];
    const groupItems = items.filter((i) => i.groupKey === g.groupKey);
    let applicable = 0, completed = 0;
    for (const it of groupItems) {
      const isApplicable = it.applicable && (!g.conditionKey || condOk || it.status === "out-of-scope");
      if (isApplicable) applicable++;
      if (isApplicable && COMPLETED_STATUSES.includes(it.status as ChecklistStatus)) completed++;
      const gDef = defs.find((x) => x.groupKey === it.groupKey);
      const iDef = gDef?.items.find((x) => x.itemKey === it.itemKey);
      view.push({
        id: it.id, groupKey: it.groupKey, groupTitle: g.title, itemKey: it.itemKey,
        title: it.title, status: it.status, applicable: isApplicable,
        value: it.value, method: it.method, collectedAt: it.collectedAt?.toISOString() || null,
        confidence: it.confidence, validity: it.validity, accessReq: it.accessReq,
        guideKey: it.guideKey, error: it.error, nextAction: it.nextAction,
        primaryPath: iDef?.primaryPath, alternatePath: iDef?.alternatePath, conditional: g.conditional,
      });
    }
    groupStats.push({
      groupKey: g.groupKey, title: g.title,
      total: groupItems.length, applicable, completed,
      percent: applicable ? Math.round((completed / applicable) * 100) : 0,
      conditional: !!g.conditionKey, conditionMet: condOk,
    });
  }

  const totalApplicable = groupStats.reduce((a, g) => a + g.applicable, 0);
  const totalCompleted = groupStats.reduce((a, g) => a + g.completed, 0);
  const overall = totalApplicable ? Math.round((totalCompleted / totalApplicable) * 100) : 0;

  return { items: view, groups: groupStats, overall };
}
