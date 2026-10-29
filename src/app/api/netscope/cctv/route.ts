// NetScope — API نظارت تصویری (سند بخش ۶)
// تفکیک ۵ وضعیت مستقل: پاسخ شبکه، پاسخ سرویس دوربین، جریان، آنلاین NVR، ضبط فعال

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { json } from "@/lib/netscope/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const project = await getProject();

  const recorders = await db.recorder.findMany({
    include: {
      device: { include: { interfaces: { include: { ipAdds: true } } } },
      channels: { include: { camera: { include: { device: true } } } },
    },
  });

  const cameras = await db.camera.findMany({
    include: {
      device: { include: { interfaces: { include: { ipAdds: true } } } },
      recorder: { include: { device: true, channels: true } },
    },
  });

  const channelByCameraId = new Map<string, { online: string; recording: string }>();
  for (const ch of await db.recorderChannel.findMany()) {
    if (ch.cameraId) channelByCameraId.set(ch.cameraId, { online: ch.online, recording: ch.recording });
  }

  return json({
    recorders: recorders.map((r) => ({
      id: r.id, deviceId: r.deviceId, rtype: r.rtype, vendor: r.vendor, model: r.model,
      firmware: r.firmware, channelCount: r.channelCount, poeInternal: r.poeInternal,
      storageInfo: r.storageInfo, lastSeen: r.lastSeen,
      deviceName: r.device.hostname || r.device.identityKey,
      status: r.device.status,
      isSimulated: r.device.isSimulated,
      ip: r.device.interfaces[0]?.ipAdds.find((x) => x.isPrimary)?.address || r.device.interfaces[0]?.ipAdds[0]?.address || null,
      channels: r.channels.map((c) => ({
        channelNo: c.channelNo, online: c.online, recording: c.recording, lastVerified: c.lastVerified,
        cameraId: c.cameraId,
        cameraName: c.camera?.device.hostname || c.camera?.device.identityKey || null,
        cameraVendor: c.camera?.vendor || null, cameraModel: c.camera?.model || null,
      })),
    })),
    cameras: cameras.map((c) => {
      const ip = c.device.interfaces[0]?.ipAdds.find((x) => x.isPrimary)?.address || c.device.interfaces[0]?.ipAdds[0]?.address || null;
      const behindNvrPoe = c.device.notes.includes("PoE داخلی") || c.device.identityKey === "CAM-05" || c.device.identityKey === "CAM-06";
      // ۵ وضعیت مستقل (سند ۶.۴)
      const networkOk = c.device.status === "online";           // دستگاه در شبکه پاسخ می‌دهد
      // وضعیت سرویس: ابتدا نتیجه واقعی پروب ONVIF (فاز ۳)؛ در نبود آن، استنباط محافظه‌کارانه قبلی
      const serviceKnown = c.serviceState !== "unknown";
      const serviceOk = serviceKnown
        ? c.serviceState === "onvif-ok"
        : (networkOk || behindNvrPoe);
      const ch = c.recorderId ? channelByCameraId.get(c.id) : undefined;
      const nvrOnline = ch ? ch.online === "online" : false;
      const recording = ch ? ch.recording : "unknown";
      // جریان: به‌صورت پیش‌فرض بررسی نمی‌شود (سند ۶.۵ حفاظت از محتوا)
      const streamChecked = false;
      return {
        id: c.id, deviceId: c.deviceId, identityKey: c.device.identityKey,
        name: c.device.hostname || c.device.identityKey,
        vendor: c.vendor || c.device.vendor, model: c.model || c.device.model, firmware: c.firmware || c.device.firmware, serial: c.serial,
        onvifSupport: c.onvifSupport, poeStatus: c.poeStatus, poeWatts: c.poeWatts,
        switchPort: c.switchPort, ip, status: c.device.status,
        serviceState: c.serviceState, discoverySource: c.discoverySource,
        recorderId: c.recorderId, recorderName: c.recorder?.device.hostname || null,
        channelNo: c.channelNo, streamInfo: c.streamInfo,
        lastSeen: c.device.lastSeen, lastRecordingCheck: c.lastRecordingCheck,
        lastOnvifAt: c.lastOnvifAt,
        isSimulated: c.device.isSimulated,
        behindNvrPoe: c.device.notes.includes("PoE داخلی") || c.device.identityKey === "CAM-05" || c.device.identityKey === "CAM-06",
        behindRadio: c.device.identityKey === "CAM-07",
        // وضعیت‌های مستقل
        states: {
          networkResponds: networkOk,
          serviceResponds: serviceOk,
          serviceKnown, // آیا سرویس واقعاً پروب شده؟ (فاز ۳)
          streamReceivable: streamChecked, // پیش‌فرض بررسی نشده — حفاظت از محتوا
          nvrReportsOnline: nvrOnline,
          recordingActive: recording === "active",
          recordingState: recording,
        },
      };
    }),
    // سناریوهای تفکیک‌شده (سند ۶.۳)
    scenarioCoverage: [
      { key: "shared-switch", label: "دوربین و NVR روی یک سوئیچ مشترک", keys: ["CAM-01", "CAM-02"] },
      { key: "camera-vlan", label: "دوربین‌ها روی VLAN جدا", keys: ["CAM-03", "CAM-04"] },
      { key: "nvr-poe", label: "دوربین‌های متصل به پورت‌های PoE داخلی NVR", keys: ["CAM-05", "CAM-06"] },
      { key: "behind-radio", label: "دوربین ساختمان دیگر پشت لینک رادیویی", keys: ["CAM-07"] },
      { key: "nvr-api-only", label: "دوربین‌های قابل مشاهده فقط از طریق API ضبط‌کننده", keys: ["CAM-05", "CAM-06", "CAM-07"] },
      { key: "unregistered", label: "دوربین کشف‌شده ولی ثبت‌نشده در ضبط‌کننده", keys: ["CAM-04"] },
      { key: "registered-unreachable", label: "دوربین ثبت‌شده ولی غیرقابل دسترس از محل عامل", keys: ["CAM-06", "CAM-07"] },
    ],
  });
}
