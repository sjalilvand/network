// NetScope — API مانیتورینگ (سند بخش ۸)

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { json } from "@/lib/netscope/api-helpers";
import { adaptiveInterval } from "@/lib/netscope/monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  const project = await getProject();

  const devices = await db.device.findMany({
    where: { projectId: project.id },
    include: { metrics: { orderBy: { ts: "desc" }, take: 12 } },
  });

  const monitored = devices
    .filter((d) => !d.mergedIntoId && d.isSimulated)
    .map((d) => {
      const latest = (key: string) => d.metrics.find((m) => m.key === key);
      const lat = latest("latency"), loss = latest("loss"), reach = latest("reachable");
      const cpu = latest("cpu"), temp = latest("temp"), rssi = latest("rssi");
      const hasIssue = !reach || reach.value === 0;
      return {
        id: d.id, identityKey: d.identityKey, name: d.hostname || d.identityKey,
        type: d.type, status: d.status, sensitivity: d.sensitivity,
        latency: lat ? { value: lat.value, unit: lat.unit } : null,
        loss: loss ? { value: loss.value, unit: loss.unit } : null,
        cpu: cpu ? { value: cpu.value, unit: cpu.unit } : null,
        temp: temp ? { value: temp.value, unit: temp.unit } : null,
        rssi: rssi ? { value: rssi.value, unit: rssi.unit } : null,
        lastSeen: d.lastSeen,
        isSimulated: d.isSimulated,
        interval: adaptiveInterval(d.sensitivity, hasIssue), // زمان‌بندی تطبیقی — سند ۸.۲
      };
    });

  const alerts = await db.alert.findMany({
    where: { projectId: project.id },
    include: { device: { select: { identityKey: true, hostname: true } } },
    orderBy: { lastSeen: "desc" },
  });

  // تاریخچه تغییرات — نگاشت دستی به دستگاه (ChangeEvent رابطه Prisma ندارد)
  const changes = await db.changeEvent.findMany({
    where: { projectId: project.id },
    orderBy: { at: "desc" }, take: 50,
  });
  const devMap = new Map(devices.map((d) => [d.id, d]));

  return json({
    monitored,
    alerts,
    changes: changes.map((ch) => ({
      id: ch.id, kind: ch.kind, before: ch.before, after: ch.after, at: ch.at,
      device: ch.deviceId && devMap.has(ch.deviceId)
        ? { identityKey: devMap.get(ch.deviceId)!.identityKey, hostname: devMap.get(ch.deviceId)!.hostname || null }
        : null,
    })),
  });
}
