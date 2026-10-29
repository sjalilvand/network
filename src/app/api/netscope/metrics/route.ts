// NetScope — فاز ۲: API سنجه‌ها برای نمودارها (سند ۸.۱)

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { json } from "@/lib/netscope/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const project = await getProject();
  const deviceId = searchParams.get("deviceId");
  const key = searchParams.get("key") || "latency";
  const limit = Math.min(Number(searchParams.get("limit")) || 60, 300);

  if (deviceId) {
    const rows = await db.metric.findMany({
      where: { deviceId, key },
      orderBy: { ts: "asc" },
      take: limit,
    });
    // اگر رکوردها زیاد است، آخرین N تا به‌ترتیب زمانی
    const slice = rows.slice(-limit);
    return json({
      key, deviceId,
      series: slice.map((m) => ({ ts: m.ts, value: m.value, unit: m.unit })),
    });
  }

  // خلاصه همه دستگاه‌ها: آخرین latency/loss/reachable
  const devices = await db.device.findMany({
    where: { projectId: project.id, mergedIntoId: null },
    select: { id: true, identityKey: true, hostname: true, type: true, status: true, sensitivity: true },
  });
  const summary = [];
  for (const d of devices) {
    const [lat, loss] = await Promise.all([
      db.metric.findFirst({ where: { deviceId: d.id, key: "latency" }, orderBy: { ts: "desc" } }),
      db.metric.findFirst({ where: { deviceId: d.id, key: "loss" }, orderBy: { ts: "desc" } }),
    ]);
    summary.push({
      ...d,
      latency: lat?.value ?? null,
      loss: loss?.value ?? null,
      updatedAt: lat?.ts ?? null,
    });
  }
  return json({ devices: summary });
}
