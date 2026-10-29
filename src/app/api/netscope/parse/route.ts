// NetScope — API راهنماها و مفسر خروجی (سند بخش ۳)

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { json, err } from "@/lib/netscope/api-helpers";
import { parseOutput, validateParsed } from "@/lib/netscope/parsers";
import type { ParseFormat } from "@/lib/netscope/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const project = await getProject();

  // ── تفسیر و پیش‌نمایش خروجی چسبانده‌شده (بدون ثبت) — سند ۳.۲
  if (action === "parse") {
    const text = body.text as string;
    const forced = body.format as ParseFormat | undefined;
    if (!text || !text.trim()) return err("متن خروجی خالی است");
    const result = parseOutput(text, forced);
    const validation = validateParsed(result);
    return json({ parsed: result, validation });
  }

  // ── ثبت خروجی اعتبارسنجی‌شده: شواهد + آیتم چک‌لیست + دستگاه‌ها
  if (action === "commit") {
    const { text, format, checklistKey, note } = body;
    if (!text) return err("متن خروجی خالی است");
    const parsed = parseOutput(text, format);
    const validation = validateParsed(parsed);
    if (!parsed.success) {
      return err(`خروجی قابل تفسیر نبود: ${parsed.errors.join(" | ")}`);
    }

    const evidence = await db.evidence.create({
      data: {
        projectId: project.id, checklistKey: checklistKey || null, kind: "command-output",
        sourceMethod: `parse:${parsed.format}`, content: text.slice(0, 4000),
        confidence: validation.ok ? "verified" : "limited",
        isSimulated: false, // ورود کاربر — داده واقعی از دید کاربر
      },
    });

    // بروزرسانی آیتم چک‌لیست مرتبط
    if (checklistKey) {
      const item = await db.checklistItem.findUnique({ where: { itemKey: checklistKey } });
      if (item) {
        const summary: Record<string, unknown> = {
          format: parsed.format,
          interfaces: parsed.interfaces.length,
          neighbors: parsed.neighbors.length,
          routes: parsed.routes.length,
          dnsServers: parsed.dnsServers,
          validationIssues: validation.issues,
          note: note || "",
        };
        await db.checklistItem.update({
          where: { itemKey: checklistKey },
          data: {
            status: validation.ok ? "collected" : "limited",
            value: JSON.stringify(summary),
            method: `ورود خروجی فرمان (${parsed.formatLabel})`,
            confidence: validation.ok ? "verified" : "limited",
            collectedAt: new Date(),
            error: validation.issues.join("؛ "),
            nextAction: "",
            updatedAt: new Date(),
          },
        });
      }
    }

    // دستگاه‌های کشف‌شده از خروجی — با برچسب «اطمینان محدود» تا تأیید کاربر
    let devicesCreated = 0;
    for (const n of parsed.neighbors) {
      const identityKey = `parsed-${n.mac}-${n.ip.replace(/\./g, "-")}`;
      const existing = await db.device.findUnique({ where: { identityKey } });
      if (existing) {
        await db.device.update({ where: { id: existing.id }, data: { lastSeen: new Date() } });
        continue;
      }
      const d = await db.device.create({
        data: {
          projectId: project.id, identityKey, type: "unknown",
          confidence: "limited", status: "unknown",
          notes: "از خروجی فرمان واردشده توسط کاربر — تا تأیید شما «اطمینان محدود»",
          isSimulated: false,
        },
      });
      const iface = await db.interface.create({
        data: { deviceId: d.id, name: n.interface || "unknown", mac: n.mac, status: "unknown" },
      });
      await db.iPAssignment.create({
        data: { interfaceId: iface.id, address: n.ip, source: "user-input" },
      });
      await db.evidence.create({
        data: { projectId: project.id, deviceId: d.id, kind: "command-output", sourceMethod: `parse:${parsed.format}`, content: `از خروجی واردشده: ${n.ip} → ${n.mac} (${n.state || "—"})`, confidence: "limited" },
      });
      devicesCreated++;
    }

    // هشدارهای سند براساس فرمت
    const warnings = [...parsed.warnings];
    if (parsed.format === "arp-a" || parsed.format === "arp-linux" || parsed.format === "ip-json-neigh") {
      warnings.push("این داده‌ها فقط «مشاهده‌شده» هستند؛ فهرست کامل شبکه نیستند.");
    }

    await db.auditLog.create({
      data: { projectId: project.id, action: "ثبت خروجی فرمان", target: parsed.formatLabel, detail: `${parsed.interfaces.length} رابط، ${parsed.neighbors.length} همسایه، ${devicesCreated} دستگاه جدید` },
    });

    return json({ ok: true, evidenceId: evidence.id, devicesCreated, warnings, validation });
  }

  return err("عملیات ناشناخته");
}
