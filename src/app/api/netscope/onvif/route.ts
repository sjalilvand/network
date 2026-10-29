// NetScope — فاز ۳: API کشف ONVIF و استعلام سرویس دوربین‌ها
// همه عملیات فقط‌خواندنی؛ اطلاعات ورود در حافظه مصرف و ذخیره نمی‌شود (سند ۱۲)

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { json, err } from "@/lib/netscope/api-helpers";
import { applyOnvifDiscovery, applyOnvifDeviceInfo } from "@/lib/netscope/cctv-apply";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const project = await getProject();
  const cameras = await db.camera.findMany({
    include: { device: { include: { interfaces: { include: { ipAdds: true } } } } },
  });
  return json({
    cameras: cameras.map((c) => {
      const ip = c.device.interfaces[0]?.ipAdds.find((a) => a.isPrimary)?.address || c.device.interfaces[0]?.ipAdds[0]?.address || null;
      return {
        deviceId: c.deviceId, identityKey: c.device.identityKey,
        name: c.device.hostname || c.device.identityKey,
        vendor: c.device.vendor, model: c.device.model, firmware: c.device.firmware, serial: c.device.serial,
        ip, onvifSupport: c.onvifSupport, onvifXAddr: c.onvifXAddr,
        serviceState: c.serviceState, lastOnvifAt: c.lastOnvifAt,
        discoverySource: c.discoverySource, isSimulated: c.device.isSimulated,
      };
    }),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const mode: "real" | "simulated" = body.mode === "real" ? "real" : "simulated";
  const project = await getProject();

  if (action === "ws-discover") {
    const r = await applyOnvifDiscovery(project.id, { mode });
    return json(r);
  }

  if (action === "device-info") {
    if (!body.deviceId) return err("deviceId لازم است");
    const r = await applyOnvifDeviceInfo(project.id, body.deviceId, {
      mode,
      // رمزها فقط در حافظه همین درخواست — ذخیره نمی‌شوند (سند ۱۲)
      username: typeof body.username === "string" ? body.username : undefined,
      password: typeof body.password === "string" ? body.password : undefined,
    });
    return json(r);
  }

  return err("عملیات ناشناخته");
}
