// NetScope — فاز ۳: API پلاگین‌های ضبط‌کننده، همگام‌سازی کانال‌ها و روابط
// همگام‌سازی فقط‌خواندنی است؛ رمزها فقط در حافظه همین درخواست استفاده می‌شوند (سند ۱۲)

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { json, err } from "@/lib/netscope/api-helpers";
import { pluginSummaries } from "@/lib/netscope/nvr-plugins";
import { syncNvrChannels, rebuildCctvRelations, getCctvRelations } from "@/lib/netscope/cctv-apply";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const project = await getProject();

  const recorders = await db.recorder.findMany({
    include: {
      device: { include: { interfaces: { include: { ipAdds: true } } } },
      channels: { include: { camera: { include: { device: true } } }, orderBy: { channelNo: "asc" } },
    },
  });

  const relations = await getCctvRelations(project.id);

  return json({
    plugins: pluginSummaries(),
    recorders: recorders.map((r) => ({
      id: r.id, deviceId: r.deviceId, identityKey: r.device.identityKey,
      name: r.device.hostname || r.device.identityKey,
      rtype: r.rtype, vendor: r.vendor, model: r.model, firmware: r.firmware,
      channelCount: r.channelCount, poeInternal: r.poeInternal,
      pluginId: r.pluginId, pluginVersion: r.pluginVersion, apiPath: r.apiPath, lastSyncAt: r.lastSyncAt,
      isSimulated: r.device.isSimulated,
      ip: r.device.interfaces[0]?.ipAdds.find((a) => a.isPrimary)?.address || r.device.interfaces[0]?.ipAdds[0]?.address || null,
      channels: r.channels.map((c) => ({
        channelNo: c.channelNo, online: c.online, recording: c.recording, source: c.source,
        cameraIpRaw: c.cameraIpRaw, cameraLabelRaw: c.cameraLabelRaw, lastVerified: c.lastVerified,
        cameraId: c.cameraId, cameraName: c.camera?.device.hostname || c.camera?.device.identityKey || null,
      })),
    })),
    relations,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const mode: "real" | "simulated" = body.mode === "real" ? "real" : "simulated";
  const project = await getProject();

  if (action === "sync-channels") {
    if (!body.pluginId) return err("پلاگین انتخاب نشده است");
    const r = await syncNvrChannels(project.id, {
      recorderId: typeof body.recorderId === "string" ? body.recorderId : undefined,
      deviceKey: typeof body.deviceKey === "string" ? body.deviceKey : undefined,
      pluginId: body.pluginId, mode,
      username: typeof body.username === "string" ? body.username : undefined,
      password: typeof body.password === "string" ? body.password : undefined,
      httpPort: Number(body.httpPort) || undefined,
    });
    return json(r);
  }

  if (action === "rebuild-relations") {
    const r = await rebuildCctvRelations(project.id);
    return json(r);
  }

  return err("عملیات ناشناخته");
}
