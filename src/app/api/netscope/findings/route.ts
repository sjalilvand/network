// NetScope — API یافته‌های تحلیلی (سند بخش ۷)

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { json } from "@/lib/netscope/api-helpers";
import { generateFindings } from "@/lib/netscope/analysis";

export const dynamic = "force-dynamic";

export async function GET() {
  const project = await getProject();
  const findings = await db.analysisFinding.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
  });
  return json({
    findings: findings.map((f) => ({
      ...f,
      relatedIds: JSON.parse(f.relatedIds || "[]"),
      probableCauses: JSON.parse(f.probableCauses || "[]"),
      suggestedTests: JSON.parse(f.suggestedTests || "[]"),
      suggestedFix: JSON.parse(f.suggestedFix || "[]"),
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const project = await getProject();

  if (body.action === "regenerate") {
    const count = await generateFindings(project.id);
    await db.auditLog.create({ data: { projectId: project.id, action: "تولید مجدد یافته‌های تحلیلی", detail: `${count} یافته` } });
    return json({ ok: true, count });
  }

  if (body.action === "ai-explain") {
    // الزام سند ۷.۴: رضایت صریح برای ارسال به سرویس بیرونی + مدل فقط توضیح‌دهنده است
    const state = JSON.parse(project.settings || "{}").engine || {};
    if (!state.aiConsent) {
      return Response.json({ error: "برای استفاده از هوش مصنوعی، ابتدا رضایت صریح خود را در این صفحه ثبت کنید" }, { status: 403 });
    }
    const findings = await db.analysisFinding.findMany({ where: { projectId: project.id } });
    const devices = await db.device.findMany({ where: { projectId: project.id, isSimulated: true } });
    // حقایق از داده ساختاریافته — بدون رمز و اطلاعات حساس (الزام سند ۷.۴)
    const facts = {
      devices: devices.map((d) => ({ name: d.hostname || d.identityKey, type: d.type, status: d.status, confidence: d.confidence })),
      findings: findings.map((f) => ({ title: f.title, description: f.description, confidence: f.confidence, limitations: f.limitations })),
      note: "این داده از پایگاه داده ساختاریافته استخراج شده؛ هیچ رمز یا اطلاعات حساسی وارد مدل نمی‌شود.",
    };
    let narrative = "";
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "تو تحلیل‌گر شبکه هستی. فقط بر اساس حقایق داده‌شده به فارسی توضیح بده. هر ادعا را به شاهد متصل کن. از نتیجه‌گیری قطعی بدون شاهد خودداری کن. محدودیت‌ها را ذکر کن. حداکثر ۲۵۰ کلمه.",
          },
          { role: "user", content: `حقایق ساختاریافته شبکه:\n${JSON.stringify(facts, null, 1)}\n\nیک خلاصه اجرایی قابل فهم از وضعیت شبکه بنویس.` },
        ],
      });
      narrative = completion.choices[0]?.message?.content || "";
    } catch {
      narrative = "";
    }
    if (!narrative) {
      // جایگزین بدون AI — قالب‌بندی از یافته‌ها
      narrative =
        `بر اساس ${findings.length} یافته ثبت‌شده و ${devices.length} دستگاه شناسایی‌شده: ` +
        findings.slice(0, 3).map((f) => `«${f.title}» (اطمینان: ${f.confidence === "verified" ? "تأییدشده" : f.confidence === "inferred" ? "استنباطی" : "محدود"})`).join("، ") +
        ". توجه: این خلاصه بدون سرویس بیرونی و فقط از داده‌های ساختاریافته تولید شده است. هر یافته شواهد و محدودیت نتیجه‌گیری مستقل دارد و توصیه می‌شود پیش از اقدام، آزمون‌های پیشنهادی هر یافته اجرا شود.";
    }
    await db.auditLog.create({ data: { projectId: project.id, action: "تولید توضیح هوشمند", detail: state.aiConsent ? "با رضایت کاربر" : "" } });
    return json({ ok: true, narrative });
  }

  if (body.action === "set-consent") {
    const settings = JSON.parse(project.settings || "{}");
    settings.engine = { ...(settings.engine || {}), aiConsent: !!body.consent };
    await db.networkProject.update({ where: { id: project.id }, data: { settings: JSON.stringify(settings) } });
    await db.auditLog.create({
      data: { projectId: project.id, action: body.consent ? "رضایت ارسال داده به مدل زبانی ثبت شد" : "رضایت ارسال داده به مدل زبانی لغو شد" },
    });
    return json({ ok: true });
  }

  return Response.json({ error: "عملیات ناشناخته" }, { status: 400 });
}
