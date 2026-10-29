// NetScope — API موتور جمع‌آوری

import { db } from "@/lib/db";
import { runStep, getEngineState, nextAutoStep, approveScopes, saveEngineState } from "@/lib/netscope/engine";
import { getChecklistView, json, err } from "@/lib/netscope/api-helpers";
import { reseedProject } from "@/lib/netscope/seed";
import type { EngineStep } from "@/lib/netscope/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getEngineState();
  const next = await nextAutoStep();
  return json({ state, nextStep: next });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  switch (action) {
    case "run-step": {
      const step = body.step as EngineStep;
      if (!step) return err("مرحله مشخص نشده است");
      const report = await runStep(step);
      const checklist = await getChecklistView();
      return json({ report, checklist });
    }
    case "run-auto": {
      // اجرای خودکار: تا گیت بعدی (تأیید کاربر/توقف اضطراری) ادامه می‌دهد
      const reports = [];
      for (let i = 0; i < 12; i++) {
        const next = await nextAutoStep();
        if (!next) break;
        const state = await getEngineState();
        if (state.emergencyStop) break;
        const report = await runStep(next);
        reports.push(report);
        if (!report.ok) break; // گیت یا شکست — توقف
      }
      const checklist = await getChecklistView();
      const state = await getEngineState();
      return json({ reports, checklist, state });
    }
    case "approve-scope": {
      const scopes = (body.scopes as string[]) || [];
      if (!scopes.length) return err("محدوده‌ای انتخاب نشده است");
      await approveScopes(scopes);
      return json({ ok: true, state: await getEngineState() });
    }
    case "confirm-discovery": {
      // تأیید نهایی اجرای کشف فعال (دروازه دوم)
      await saveEngineState({ discoveryConfirmed: true });
      const report = await runStep("active-discovery");
      const checklist = await getChecklistView();
      return json({ report, checklist });
    }
    case "enable-monitoring": {
      await saveEngineState({ monitoringEnabled: true });
      const report = await runStep("periodic-update");
      const checklist = await getChecklistView();
      return json({ report, checklist });
    }
    case "stop": {
      await saveEngineState({ emergencyStop: true, autoMode: false });
      await db.auditLog.create({
        data: {
          projectId: (await (await import("@/lib/netscope/engine")).getProject()).id,
          action: "توقف اضطراری فعال شد", detail: "تمام عملیات جمع‌آوری متوقف شد",
        },
      });
      return json({ ok: true, state: await getEngineState() });
    }
    case "resume": {
      await saveEngineState({ emergencyStop: false });
      return json({ ok: true, state: await getEngineState() });
    }
    case "reset": {
      await reseedProject();
      return json({ ok: true, state: await getEngineState() });
    }
    case "update-checklist": {
      const { itemKey, status, applicable } = body;
      if (!itemKey) return err("آیتم مشخص نشده است");
      const patch: Record<string, unknown> = {};
      if (status) patch.status = status;
      if (typeof applicable === "boolean") patch.applicable = applicable;
      await db.checklistItem.update({ where: { itemKey }, data: patch });
      return json({ ok: true, checklist: await getChecklistView() });
    }
    default:
      return err("عملیات ناشناخته");
  }
}
