// NetScope — API تنظیمات: عامل‌ها، دسترسی‌ها و سیاست‌های ایمنی (سند بخش ۱۲)

import { db } from "@/lib/db";
import { getProject, getEngineState, saveEngineState } from "@/lib/netscope/engine";
import { json, err } from "@/lib/netscope/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const project = await getProject();
  const state = await getEngineState();
  const agents = await db.agent.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });
  const credentials = await db.credentialReference.findMany({ where: { projectId: project.id } });
  return json({
    agents,
    // رمزها هرگز بازگردانده نمی‌شوند — فقط مرجع (الزام سند ۱۲)
    credentials: credentials.map((c) => ({
      id: c.id, label: c.label, kind: c.kind, target: c.target,
      username: c.username, readOnly: c.readOnly, hasSecret: c.hasSecret, note: c.note,
    })),
    engine: state,
    project: { name: project.name, description: project.description, scope: JSON.parse(project.scope || "[]") },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const project = await getProject();

  // ثبت مرجع دسترسی — بدون ذخیره رمز (الزام سند ۱۲: اطلاعات ورود فقط از فرم امن)
  if (action === "add-credential") {
    const { label, kind, target, username, readOnly } = body;
    if (!label || !kind) return err("برچسب و نوع دسترسی لازم است");
    const c = await db.credentialReference.create({
      data: {
        projectId: project.id, label, kind, target: target || "",
        username: username || null, readOnly: readOnly !== false, hasSecret: !!body.hasSecret,
        note: body.note || "",
      },
    });
    await db.auditLog.create({
      data: { projectId: project.id, action: "ثبت مرجع دسترسی", target: label, detail: `نوع: ${kind} — رمز ذخیره نشد` },
    });
    return json({ ok: true, id: c.id });
  }

  if (action === "delete-credential") {
    await db.credentialReference.delete({ where: { id: body.id } });
    await db.auditLog.create({ data: { projectId: project.id, action: "حذف مرجع دسترسی", target: body.id } });
    return json({ ok: true });
  }

  if (action === "update-policy") {
    const state = await saveEngineState({
      autoMode: !!body.autoMode,
      monitoringEnabled: typeof body.monitoringEnabled === "boolean" ? body.monitoringEnabled : undefined,
    });
    await db.auditLog.create({ data: { projectId: project.id, action: "به‌روزرسانی سیاست‌های موتور", detail: JSON.stringify(body) } });
    return json({ ok: true, state });
  }

  return err("عملیات ناشناخته");
}
