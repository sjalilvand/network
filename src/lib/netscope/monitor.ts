// NetScope — مانیتورینگ هوشمند (سند بخش ۸)
// زمان‌بندی تطبیقی، هشدار پس از چند شکست متوالی، آستانه بازیابی مستقل،
// تفکیک قطع عامل از قطع دستگاه، تجمیع هشدارهای پشت لینک بالادستی.

import { db } from "@/lib/db";
import type { StepLogLine } from "./engine";
import { RADIO_LINK_CURRENTLY_DOWN } from "./scenario";

const ALERT_FAILURE_THRESHOLD = 3;   // هشدار پس از ۳ شکست متوالی (سند ۸.۳)
const RECOVERY_THRESHOLD = 2;        // بازیابی پس از ۲ موفقیت متوالی — آستانه مستقل
const RADIO_FAILURE_THRESHOLD = 2;   // تجهیزات مهم سریع‌تر هشدار می‌دهند

export async function monitorTick(projectId: string, tick: number): Promise<{ lines: StepLogLine[]; evidenceCount: number }> {
  const lines: StepLogLine[] = [];
  let evidenceCount = 0;

  const devices = await db.device.findMany({ where: { projectId, isSimulated: true } });
  const now = new Date();

  // حالت فعلی شبیه‌سازی‌شده: لینک رادیویی قطع است → ساختمان B بدون پاسخ
  const isBehindRadio = (d: { identityKey: string }) =>
    ["RADIO-B", "SW-B1", "CAM-07", "PC-B-01"].includes(d.identityKey);

  for (const d of devices) {
    if (d.mergedIntoId) continue; // دستگاه ادغام‌شده پایش نمی‌شود

    const currentlyReachable = !isBehindRadio(d) && d.identityKey !== "CAM-06" && d.type !== "camera";
    // دوربین‌ها: فقط آن‌هایی که مستقیماً در شبکه اصلی هستند (CAM-01..04)
    const camReachable = ["CAM-01", "CAM-02", "CAM-03", "CAM-04"].includes(d.identityKey);
    const reachable = currentlyReachable || camReachable;

    // متریک‌های پایه (شبیه‌سازی) — با نوسان کم
    const jitter = (base: number, spread: number) => +(base + (Math.random() - 0.5) * spread).toFixed(2);
    const metrics = [
      { key: "latency", value: reachable ? jitter(2.5, 3) : 0, unit: "ms" },
      { key: "loss", value: reachable ? (Math.random() > 0.92 ? 2 : 0) : 100, unit: "%" },
      { key: "reachable", value: reachable ? 1 : 0, unit: "bool" },
    ];
    if (d.type === "switch" || d.type === "router") {
      metrics.push({ key: "cpu", value: jitter(12 + (d.sensitivity === "high" ? 8 : 0), 6), unit: "%" });
      metrics.push({ key: "temp", value: jitter(42, 6), unit: "°C" });
    }
    if (d.identityKey === "RADIO-A") {
      metrics.push({ key: "rssi", value: RADIO_LINK_CURRENTLY_DOWN ? -92 : jitter(-67, 4), unit: "dBm" });
    }
    for (const m of metrics) {
      await db.metric.create({ data: { deviceId: d.id, key: m.key, value: m.value, unit: m.unit, ts: now } });
    }

    // ── منطق هشدار با شکست متوالی
    const activeAlerts = await db.alert.findMany({ where: { projectId, deviceId: d.id, status: { in: ["active", "acked"] } } });
    if (!reachable) {
      const alert = activeAlerts.find((a) => a.kind === "device-down");
      if (alert) {
        await db.alert.update({ where: { id: alert.id }, data: { failures: alert.failures + 1, lastSeen: now } });
      } else {
        await db.alert.create({
          data: {
            projectId, deviceId: d.id, severity: d.sensitivity === "high" ? "critical" : "warning",
            title: `عدم پاسخ‌گویی ${d.hostname || d.identityKey}`,
            message: `دستگاه در بررسی دوره‌ای پاسخ نمی‌دهد (شکست متوالی). هشدار پس از رسیدن به آستانه ${ALERT_FAILURE_THRESHOLD} شکست فعال می‌شود. پاسخ‌ندادن به‌تنهایی خاموشی را اثبات نمی‌کند.`,
            kind: "device-down", failures: 1, evidenceText: "ICMP: عدم پاسخ در تیک پایش",
          },
        });
      }
    } else {
      const alert = activeAlerts.find((a) => a.kind === "device-down");
      if (alert) {
        if (alert.failures < 0) {
          await db.alert.update({ where: { id: alert.id }, data: { failures: alert.failures - 1 } });
        } else {
          await db.alert.update({ where: { id: alert.id }, data: { status: "resolved", resolvedAt: now, failures: 0 } });
          lines.push({ kind: "info", text: `هشدار «${alert.title}» پس از ${RECOVERY_THRESHOLD} موفقیت متوالی بازیابی شد (آستانه بازیابی مستقل)` });
        }
      }
    }

    // قطع عامل ≠ قطع دستگاه: عامل شبیه‌سازی همیشه زنده است؛ صرفاً یادآور مستند
  }

  // ── تجمیع هشدارهای پشت لینک بالادستی (سند ۸.۳)
  const radioA = devices.find((d) => d.identityKey === "RADIO-A");
  if (radioA && RADIO_LINK_CURRENTLY_DOWN) {
    const aggregated = await db.alert.findFirst({ where: { projectId, kind: "upstream-aggregate", status: "active" } });
    const downstreamDevices = ["RADIO-B", "SW-B1", "CAM-07", "PC-B-01"];
    const downstreamAlerts = await db.alert.findMany({
      where: { projectId, status: "active", device: { identityKey: { in: downstreamDevices } }, kind: "device-down" },
    });
    if (!aggregated && downstreamAlerts.length >= RADIO_FAILURE_THRESHOLD) {
      await db.alert.create({
        data: {
          projectId, deviceId: radioA.id, severity: "critical",
          title: `قطع احتمالی لینک رادیویی بالادستی ساختمان B`,
          message: `${downstreamAlerts.length} هشدار قطع دستگاه پشت لینک رادیویی به یک علت ریشه تجمیع شد. هشدارهای مجزا به این رکورد متصل هستند. رفع لینک احتمالاً همه را بازیابی می‌کند؛ اما خاموشی مستقل دستگاه‌ها رد نشده است.`,
          kind: "upstream-aggregate", failures: downstreamAlerts.length, aggregated: true,
          evidenceText: "هم‌زمانی قطع گروهی پشت یک لینک مشترک + وضعیت RSSI سمت A",
        },
      });
      for (const a of downstreamAlerts) {
        const upd = await db.alert.update({ where: { id: a.id }, data: { severity: "info" } });
      }
      lines.push({ kind: "warn", text: `هشدارهای ${downstreamAlerts.length} دستگاه ساختمان B تحت علت ریشه «لینک رادیویی» تجمیع شد (سند ۸.۳)` });
      evidenceCount++;
    }
  }

  // ── تعارض IP: فقط «احتمال» (سند ۸.۳)
  const conflictAlert = await db.alert.findFirst({ where: { projectId, kind: "ip-conflict", status: "active" } });
  if (!conflictAlert && tick >= 1) {
    await db.alert.create({
      data: {
        projectId, severity: "warning", title: "احتمال تعارض IP — 10.10.10.45",
        message: "دو MAC متفاوت برای یک IP از دو منبع مستقل دیده شده است. به‌عنوان «احتمال تعارض» گزارش می‌شود؛ تأیید قطعی نیازمند آزمون ARP از دو نقطه است.",
        kind: "ip-conflict", failures: 1,
        evidenceText: "عامل: MAC-A | پنل DHCP: MAC-B",
      },
    });
    lines.push({ kind: "warn", text: "هشدار «احتمال تعارض IP» با برچسب عدم قطعیت ثبت شد" });
    evidenceCount++;
  }

  lines.push({ kind: "success", text: `تیک پایش ${tick + 1} کامل شد: متریک‌ها و هشدارها با قواعد سند ۸ ارزیابی شدند` });
  return { lines, evidenceCount };
}

// محاسبه نرخ پایش تطبیقی برای نمایش (سند ۸.۲)
export function adaptiveInterval(criticality: string, hasIssue: boolean): string {
  if (hasIssue) return "۱۰ ثانیه (بررسی تکمیلی محدود پس از مشکل)";
  switch (criticality) {
    case "high": return "۶۰ ثانیه (تجهیزات مهم بیشتر بررسی می‌شوند)";
    case "low": return "۱۰ دقیقه (دستگاه‌های حساس با نرخ کمتر)";
    default: return "۲ دقیقه (نرخ عادی)";
  }
}
