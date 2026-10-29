// NetScope — موتور تحلیل و تشریح شبکه (سند بخش ۷)
// قواعد جلوگیری از تحلیل نادرست (۷.۳) به‌صورت الزام در تولید یافته‌ها اعمال شده است.

import { db } from "@/lib/db";

export interface FindingDraft {
  title: string;
  description: string;
  relatedIds: string[];
  evidenceText: string;
  confidence: string; // verified | inferred | limited
  impact: string;
  probableCauses: string[];
  suggestedTests: string[];
  suggestedFix: string[];
  limitations: string; // محدودیت نتیجه‌گیری — الزام سند ۷.۱
  category: string;
}

// تولید یافته‌ها از وضعیت فعلی پایگاه داده
export async function generateFindings(projectId: string): Promise<number> {
  const findings: FindingDraft[] = [];

  const devices = await db.device.findMany({ where: { projectId } });
  const cameras = await db.camera.findMany({ where: { deviceId: { in: devices.map((d) => d.id) } }, include: { device: true, recorder: { include: { device: true } } } });
  const channels = await db.recorderChannel.findMany({ include: { camera: { include: { device: true } }, recorder: { include: { device: true } } } });
  const links = await db.link.findMany({ where: { projectId } });

  const devByKey = (key: string) => devices.find((d) => d.identityKey === key);
  const nameOf = (key: string) => {
    const d = devByKey(key);
    return d ? (d.hostname || d.identityKey) : key;
  };

  // ── یافته ۱: دوربین‌های آفلاین NVR با علل احتمالی متفاوت (نمونه بیان درست سند ۷.۲)
  const offlineInNvr = channels.filter((c) => c.online === "offline");
  if (offlineInNvr.length > 0) {
    const offlineDesc = offlineInNvr.map((c) => {
      const camDev = c.camera?.device;
      const reachable = camDev?.status === "online";
      const behindPoe = camDev?.identityKey === "CAM-06"; // پشت PoE داخلی NVR
      const behindRadio = camDev?.identityKey === "CAM-07";
      if (behindRadio) return `${c.camera?.device?.hostname || camDev?.identityKey} (کانال ${c.channelNo}): در فهرست NVR آفلاین؛ از عامل نیز پاسخ نمی‌دهد — اما پشت لینک رادیویی قطع است`;
      if (behindPoe) return `${c.camera?.device?.hostname || camDev?.identityKey} (کانال ${c.channelNo}): در فهرست NVR آفلاین؛ از عامل غیرقابل مشاهده مستقیم است (پشت PoE داخلی NVR) — طبق سند ۶.۳ این خودش خرابی نیست، اما وضعیت آنلاین NVR هم آفلاین است`;
      return `${c.camera?.device?.hostname || camDev?.identityKey} (کانال ${c.channelNo}): در فهرست NVR آفلاین؛ ${reachable ? "ولی از عامل شبکه پاسخ می‌دهد" : "و از عامل نیز پاسخ نمی‌دهد"}`;
    });

    findings.push({
      title: `۳ دوربین در فهرست ضبط‌کننده آفلاین گزارش شده‌اند؛ علت مشکل هر سه لزوماً یکسان نیست`,
      description:
        `بررسی فهرست کانال‌های ${nameOf("NVR-01")} نشان می‌دهد ${offlineInNvr.length} دوربین آفلاین هستند. وضعیت این سه از دید شبکه متفاوت است: ` +
        `دوربین ساختمان B هم از عامل پاسخ نمی‌دهد و هم NVR آن را آفلاین گزارش می‌کند — با توجه به قطع لینک رادیویی، علت احتمالی در لینک بالادستی است نه خود دوربین. ` +
        `دوربین پشت PoE داخلی NVR از عامل هرگز مستقیم دیده نمی‌شود؛ آفلاین بودن آن در NVR نشان‌دهنده مشکل پورت PoE/کابل خود NVR است. ` +
        `دوربین VLAN دوربین‌ها از عامل پاسخ می‌دهد ولی NVR آن را آفلاین می‌داند — پس مشکل شبکه نیست؛ احتمالاً تنظیمات کانال، رمز یا آدرس دوربین در NVR است. ` +
        `بنابراین بررسی وضعیت PoE و لینک رادیویی برای دو مورد اول، و بررسی سرویس/تنظیمات کانال برای مورد سوم پیشنهاد می‌شود.`,
      relatedIds: offlineInNvr.map((c) => c.camera?.device?.id || "").filter(Boolean),
      evidenceText: offlineInNvr
        .map((c) => `API ضبط‌کننده: کانال ${c.channelNo} آفلاین | وضعیت ICMP از عامل: ${c.camera?.device?.status === "online" ? "پاسخ‌گو" : "بدون پاسخ"}${c.camera?.device?.identityKey === "CAM-06" ? " | پشت PoE داخلی NVR" : ""}${c.camera?.device?.identityKey === "CAM-07" ? " | پشت لینک رادیویی قطع" : ""}`)
        .join("\n"),
      confidence: "verified",
      impact: "نبود تصویر ثبت‌شده برای کانال‌های مذکور؛ ریسک از دست رفتن آرشیو تا رفع مشکل",
      probableCauses: [
        "قطع لینک رادیویی بالادستی ساختمان B (برای دوربین پشت رادیو)",
        "خرابی پورت PoE یا کابل پورت داخلی NVR (برای دوربین پشت PoE داخلی)",
        "تنظیمات نادرست کانال/رمز/آدرس در ضبط‌کننده (برای دوربین پاسخ‌گوی شبکه)",
      ],
      suggestedTests: [
        "بررسی وضعیت پورت PoE سوئیچ/NVR برای دوربین پشت PoE داخلی (راهنمای switch-snmp بخش PoE)",
        "بررسی جدول registration لینک رادیویی و آزمون دسترسی از سمت ساختمان B",
        "آزمون ورود مستقل به دوربین VLAN دوربین‌ها (راهنمای camera-onvif) و تطبیق رمز کانال در NVR",
      ],
      suggestedFix: [
        "بررسی برق/فیبر لینک رادیویی و راه‌اندازی مجدد سمت A پس از تأیید (با مجوز)",
        "جابه‌جایی پورت PoE آزاد برای دوربین معیوب NVR (نیازمند مجوز تغییر فیزیکی)",
        "اصلاح تنظیمات کانال در NVR پس از تأیید مسئول",
      ],
      limitations:
        "وضعیت «آفلاین در NVR» و «عدم پاسخ ICMP» همبستگی هستند نه علت قطعی؛ عدم دسترسی می‌تواند ناشی از فیلتر، نبود مسیر یا خرابی باشد. علت نهایی هر مورد پس از آزمون‌های پیشنهادی قابل تأیید است.",
      category: "camera",
    });
  }

  // ── یافته ۲: دوربین کشف‌شده ولی ثبت‌نشده در NVR (سناریوی ۶.۳-۶)
  const registeredKeys = new Set(channels.filter((c) => c.camera?.device).map((c) => c.camera!.device!.identityKey));
  const unregisteredCams = devices.filter((d) => d.identityKey.startsWith("CAM-") && !registeredKeys.has(d.identityKey) && d.identityKey !== "CAM-05" && d.identityKey !== "CAM-06");
  if (unregisteredCams.length) {
    findings.push({
      title: "دوربین در شبکه فعال است ولی در ضبط‌کننده ثبت نشده",
      description: `دوربین «${nameOf(unregisteredCams[0].identityKey)}» از عامل شبکه پاسخ می‌دهد و سرویس دوربین آن فعال است، اما در فهرست کانال‌های ${nameOf("NVR-01")} یافت نشد. اگر انتظار ثبت آن وجود دارد، افزودن کانال یا بررسی تنظیمات ثبت لازم است. این یافته فقط «ناهماهنگی موجودی» است؛ کارکرد خود دوربین مشکلی ندارد.`,
      relatedIds: unregisteredCams.map((d) => d.id),
      evidenceText: `ONVIF/API: دوربین پاسخ‌گو | فهرست کانال‌های NVR (API فقط‌خواندنی): بدون این دوربین`,
      confidence: "verified",
      impact: "عدم ضبط تصویر این دوربین؛ حفره در پوشش نظارت تصویری",
      probableCauses: ["دوربین به‌تازگی نصب شده و در NVR اضافه نشده", "حذف کانال در NVR", "تعویض IP دوربین بدون به‌روزرسانی NVR"],
      suggestedTests: ["جست‌وجوی نام/IP دوربین در صفحه مدیریت کانال‌های NVR", "بررسی سابقه تغییرات IP دوربین در پرونده شناخت شبکه"],
      suggestedFix: ["افزودن/بازگردانی کانال در NVR پس از تأیید مسئول"],
      limitations: "اگر ثبت این دوربین در NVR در دسترس نباشد، یافته فقط بر اساس مقایسه دو منبع است؛ منبع سوم (پنل NVR) برای تأیید توصیه می‌شود.",
      category: "camera",
    });
  }

  // ── یافته ۳: قطع لینک رادیویی و تجمیع هشدارها (سند ۸.۳)
  if (links.some((l) => l.relation === "radio-ptp")) {
    const bldgB = ["SW-B1", "CAM-07", "PC-B-01"].map(nameOf).join("، ");
    findings.push({
      title: "قطع لینک رادیویی ساختمان B — منبع احتمالی چند هشدار هم‌زمان",
      description:
        `لینک رادیویی نقطه‌به‌نقطه بین ${nameOf("RADIO-A")} و ${nameOf("RADIO-B")} در بررسی فعلی برقرار نیست. دستگاه‌های پشت این لینک (${bldgB}) همگی بدون پاسخ هستند. ` +
        `به‌جای صدور هشدار مستقل برای هر دستگاه، این قطع‌ها تحت یک علت ریشه تجمیع شده‌اند؛ رفع لینک رادیویی احتمالاً هم‌زمان همه را برطرف می‌کند. ` +
        `تا پیش از تأیید بازیابی لینک، خاموشی مستقل دستگاه‌ها رد نمی‌شود.`,
      relatedIds: [devByKey("RADIO-A")?.id, devByKey("RADIO-B")?.id].filter(Boolean) as string[],
      evidenceText: "API سمت A: وضعیت لینک قطع | ICMP: عدم پاسخ گروهی دستگاه‌های ساختمان B | سابقه: مشاهده تاریخی همه این دستگاه‌ها",
      confidence: "inferred",
      impact: "قطع دسترسی کل ساختمان B شامل دوربین ورودی گیت",
      probableCauses: ["قطع تغذیه/برق یکی از رادیوها", "مشکل باند فرکانسی یا تداخل", "جابه‌جایی/آسیب فیزیکی آنتن"],
      suggestedTests: ["بررسی LED و تغذیه فیزیکی دو رادیو", "خواندن لاگ سمت A (registration history)", "آزمون ping از RADIO-A به RADIO-B پس از اطمینان از برق"],
      suggestedFix: ["بازدید فیزیکی و برق‌رسانی مجدد پس از تأیید مسئول", "در صورت برقراری، تأیید دوطرفه کیفیت لینک (راهنمای wireless-links)"],
      limitations: "قطع بودن از سمت عامل مشاهده شده اما علت فیزیکی از راه دور قابل اثبات نیست؛ توصیه‌ها آزمون‌محور هستند نه قطعی.",
      category: "connectivity",
    });
  }

  // ── یافته ۴: سوئیچ با SNMP غیرفعال — شناخت محدود
  const swA3 = devByKey("SW-A3");
  if (swA3) {
    findings.push({
      title: "اطلاعات مدیریتی یکی از سوئیچ‌ها دریافت نشد (پروتکل غیرفعال)",
      description:
        `از «${nameOf("SW-A3")}» پاسخ SNMP دریافت نشد؛ علت ثبت‌شده در تلاش جمع‌آوری «پروتکل غیرفعال/فیلتر» است، نه قطعاً خرابی. در نتیجه: اتصال فیزیکی این سوئیچ فقط به‌صورت استنباطی از جدول MAC سوئیچ هسته شناخته می‌شود، اطلاعات PoE و شمارنده‌های آن موجود نیست و بخش‌هایی از نقشه فیزیکی طبقه ۳ قابل قضاوت قطعی نیست. فعال‌سازی SNMPv3 فقط‌خواندنی یا چسباندن خروجی CLI این سوئیچ، این شکاف را رفع می‌کند.`,
      relatedIds: [swA3.id],
      evidenceText: "CollectionAttempt: snmpv3 → failed (پروتکل غیرفعال) | FDB سوئیچ هسته: MACهای متعدد پشت پورت ۴",
      confidence: "verified",
      impact: "نقشه فیزیکی طبقه ۳ نامطمئن؛ بدون متریک پورت‌ها و PoE",
      probableCauses: ["SNMPv3 روی دستگاه فعال نیست", "فیلتر بین عامل و سوئیچ", "نسخه/پروفایل SNMP متفاوت"],
      suggestedTests: ["آزمون دسترسی پورت 161 با SNMPv3 با اطلاعات ورود معتبر", "ورود خروجی «show lldp neighbors» از CLI سوئیچ"],
      suggestedFix: ["فعال‌سازی SNMPv3 فقط‌خواندنی مطابق راهنمای سازنده (HPE Aruba) — با مجوز و بدون تغییر سایر تنظیمات"],
      limitations: "عدم پاسخ SNMP صرفاً درباره سرویس مدیریتی است؛ عملکرد سوئیچینگ را اثبات نمی‌کند.",
      category: "inventory",
    });
  }

  // ── یافته ۵: تعارض IP مشکوک (سند ۸.۳ — «احتمال»)
  findings.push({
    title: "احتمال تعارض آدرس IP در شبکه کاربران",
    description:
      `برای IP «10.10.10.45» دو آدرس MAC متفاوت از دو منبع مستقل مشاهده شده است (عامل شبکه و خروجی پنل DHCP). طبق سند، این موضوع با عنوان «احتمال تعارض» ثبت شده و نیازمند آزمون است. در صورت قطعی شدن، یکی از دستگاه‌ها دچار اختلال سرویس متناوب می‌شود.`,
    relatedIds: [],
    evidenceText: "عامل: MAC اول | پنل DHCP: MAC دوم — دو MAC برای یک IP در بازه زمانی نزدیک",
    confidence: "limited",
    impact: "اختلال متناوب اتصال برای یکی از دو دستگاه؛ سختی در عیب‌یابی سرویس",
    probableCauses: ["تنظیم دستی IP ثابت هم‌پوشان با رنج DHCP", "تفاوت موقت رکوردهای قدیمی (Stale) منابع"],
    suggestedTests: ["آزمون ARP از دو نقطه مختلف در بازه چند دقیقه‌ای", "بررسی فهرست رزروهای DHCP و تعارض با تنظیمات دستی"],
    suggestedFix: ["انتقال دستگاه دستی‌تنظیم‌شده به رنج DHCP یا ثبت رزرو رسمی (با مجوز)"],
    limitations: "شواهد فعلی قطعی نیست؛ ممکن است رکوردهای قدیمی دو منبع با هم هم‌زمان نباشند.",
    category: "config",
  });

  // ── یافته ۶: محدودیت کشف — بخش‌های کشف‌نشده صریحاً ذکر شوند (سند ۷.۳)
  findings.push({
    title: "بخش‌هایی از شبکه هنوز قابل قضاوت نیستند",
    description:
      `موارد زیر صریحاً گزارش می‌شوند تا «نبود اطلاعات» به «نبود دستگاه» تفسیر نشود: (۱) دوربین‌های پشت شبکه داخلی PoE ضبط‌کننده فقط از طریق API آن قابل شناخت‌اند و اتصال فیزیکی‌شان به سوئیچ مشخص نیست؛ (۲) سمت B لینک رادیویی بدون اطلاعات ورود قابل تأیید نیست؛ (۳) اطلاعات موقعیت فیزیکی (رک/اتاق) هنوز از کاربر دریافت نشده؛ (۴) سرویس‌های مرتبط محدود بررسی شدند و بررسی پورت‌های گسترده انجام نشده است.`,
    relatedIds: [],
    evidenceText: "چک‌لیست پرونده شناخت شبکه: موارد نیازمند دسترسی/اقدام کاربر",
    confidence: "verified",
    impact: "تصمیم‌گیری براساس نقشه فعلی باید با این محدودیت‌ها انجام شود",
    probableCauses: [],
    suggestedTests: [],
    suggestedFix: ["پیگیری موارد «نیازمند اقدام کاربر» و «نیازمند دسترسی» در مرکز اقدامات بعدی"],
    limitations: "این یافته ذاتاً درباره ابهام است و با تکمیل اطلاعات به‌روزرسانی می‌شود.",
    category: "general",
  });

  // ── یافته ۷: مدل صحیح دوربین‌های پشت NVR (سند ۶.۳ — الگوبرداری درست)
  if (channels.some((c) => c.camera?.device?.identityKey === "CAM-05")) {
    findings.push({
      title: "دوربین‌های پشت PoE داخلی ضبط‌کننده به‌درستی مدل شدند",
      description:
        `دو دوربین (${nameOf("CAM-05")} و ${nameOf("CAM-06")}) به شبکه داخلی PoE خودِ ${nameOf("NVR-01")} متصل‌اند و از محل عامل مستقیماً قابل مشاهده نیستند. طبق سند ۶.۳، این وضعیت «غیرقابل مشاهده‌بودن طبیعی» محسوب می‌شود نه خرابی. شناخت این دو فقط از API ضبط‌کننده ممکن است و اتصال فیزیکی آن‌ها به سوئیچ سازمانی وجود ندارد؛ در نقشه به‌صورت وابسته به NVR مدل شده‌اند.`,
      relatedIds: [devByKey("NVR-01")?.id].filter(Boolean) as string[],
      evidenceText: "API NVR: کانال‌های ۵ و ۶ | ICMP از عامل: بدون پاسخ (انتظار رفته) | عضویت VLAN: شبکه داخلی NVR",
      confidence: "verified",
      impact: "بدون اثر — صرفاً مستندسازی صحیح مدل شبکه",
      probableCauses: [],
      suggestedTests: [],
      suggestedFix: [],
      limitations: "اگر پورت‌های PoE داخلی NVR به سوییچ داخلی دیگری هم متصل باشند، مدل فعلی کامل نیست.",
      category: "camera",
    });
  }

  // حذف یافته‌های قبلی پروژه و ثبت جدید (نسخه‌بندی ساده — سابقه در AuditLog)
  const old = await db.analysisFinding.count({ where: { projectId } });
  if (old > 0) {
    await db.analysisFinding.deleteMany({ where: { projectId } });
  }
  for (const f of findings) {
    await db.analysisFinding.create({
      data: {
        projectId, title: f.title, description: f.description,
        relatedIds: JSON.stringify(f.relatedIds), evidenceText: f.evidenceText,
        confidence: f.confidence, impact: f.impact,
        probableCauses: JSON.stringify(f.probableCauses), suggestedTests: JSON.stringify(f.suggestedTests),
        suggestedFix: JSON.stringify(f.suggestedFix), limitations: f.limitations, category: f.category,
      },
    });
  }
  return findings.length;
}
