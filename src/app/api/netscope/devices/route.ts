// NetScope — API دستگاه‌ها و رابط‌ها

import { db } from "@/lib/db";
import { getProject } from "@/lib/netscope/engine";
import { json, err } from "@/lib/netscope/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const project = await getProject();
  const devices = await db.device.findMany({
    where: { projectId: project.id },
    include: {
      interfaces: { include: { ipAdds: true } },
      cameras: true,
      recorders: true,
      alerts: { where: { status: "active" } },
    },
    orderBy: { firstSeen: "asc" },
  });
  const networks = await db.network.findMany({ where: { projectId: project.id } });
  const attempts = await db.collectionAttempt.findMany({
    where: { projectId: project.id },
    orderBy: { startedAt: "desc" }, take: 40,
  });

  return json({
    devices: devices.map((d) => ({
      ...d,
      isMerged: !!d.mergedIntoId,
      alertCount: d.alerts.length,
      alerts: undefined,
    })),
    networks,
    attempts,
  });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const project = await getProject();

  switch (action) {
    // ادغام دستی دستگاه‌ها (الزام سند ۴.۲)
    case "merge": {
      const { sourceId, targetId } = body;
      if (!sourceId || !targetId) return err("دستگاه مبدأ و مقصد مشخص نشده است");
      const source = await db.device.findUnique({ where: { id: sourceId } });
      const target = await db.device.findUnique({ where: { id: targetId } });
      if (!source || !target) return err("دستگاه یافت نشد");
      if (source.id === target.id) return err("ادغام دستگاه با خودش ممکن نیست");

      await db.device.update({ where: { id: sourceId }, data: { mergedIntoId: targetId } });
      // انتقال روابط به مقصد
      await db.link.updateMany({ where: { srcDeviceId: sourceId }, data: { srcDeviceId: targetId } });
      await db.link.updateMany({ where: { dstDeviceId: sourceId }, data: { dstDeviceId: targetId } });
      await db.evidence.updateMany({ where: { deviceId: sourceId }, data: { deviceId: targetId } });
      await db.manualAnnotation.create({
        data: {
          projectId: project.id, targetType: "device", targetId,
          field: "merge", value: source.identityKey,
          note: `دستگاه ${source.identityKey} به ${target.identityKey} ادغام شد — منشأ: تصمیم دستی کاربر`,
        },
      });
      await db.auditLog.create({
        data: { projectId: project.id, action: "ادغام دستگاه", target: target.identityKey, detail: `${source.identityKey} → ${target.identityKey}` },
      });
      return json({ ok: true });
    }
    // جداسازی دستگاه ادغام‌شده
    case "unmerge": {
      const { deviceId } = body;
      const d = await db.device.findUnique({ where: { id: deviceId } });
      if (!d || !d.mergedIntoId) return err("این دستگاه ادغام نشده است");
      await db.device.update({ where: { id: deviceId }, data: { mergedIntoId: null } });
      await db.auditLog.create({
        data: { projectId: project.id, action: "جداسازی دستگاه", target: d.identityKey, detail: "برگشت از ادغام" },
      });
      return json({ ok: true });
    }
    // تأیید هویت دستگاه توسط کاربر
    case "confirm-identity": {
      const { deviceId } = body;
      const d = await db.device.findUnique({ where: { id: deviceId } });
      if (!d) return err("دستگاه یافت نشد");
      await db.device.update({ where: { id: deviceId }, data: { confidence: "verified" } });
      await db.evidence.create({
        data: {
          projectId: project.id, deviceId, kind: "user-entry", sourceMethod: "user-confirmation",
          content: "هویت دستگاه توسط کاربر تأیید شد (منبع: تأیید دستی)", confidence: "verified",
        },
      });
      await db.manualAnnotation.create({
        data: { projectId: project.id, targetType: "device", targetId: deviceId, field: "identity", value: "verified", note: "تأیید هویت توسط کاربر" },
      });
      await db.auditLog.create({ data: { projectId: project.id, action: "تأیید هویت دستگاه", target: d.identityKey } });
      return json({ ok: true });
    }
    // یادداشت/موقعیت دستی
    case "annotate": {
      const { deviceId, field, value, note } = body;
      const d = await db.device.findUnique({ where: { id: deviceId } });
      if (!d) return err("دستگاه یافت نشد");
      await db.manualAnnotation.create({
        data: { projectId: project.id, targetType: "device", targetId: deviceId, field: field || "note", value: value || "", note: note || "" },
      });
      if (field === "location") {
        await db.device.update({ where: { id: deviceId }, data: { notes: (d.notes ? d.notes + "\n" : "") + `موقعیت: ${value}` } });
      }
      await db.auditLog.create({ data: { projectId: project.id, action: "یادداشت دستی", target: d.identityKey, detail: `${field}: ${value}` } });
      return json({ ok: true });
    }
    // افزودن دستی دستگاه (مسیر جایگزین سند ۱.۱)
    case "manual-add": {
      const { hostname, ip, mac, type, vendor, model, notes } = body;
      if (!ip && !mac) return err("حداقل IP یا MAC لازم است");
      const identityKey = `manual-${mac || ip}-${Date.now().toString(36)}`;
      const d = await db.device.create({
        data: {
          projectId: project.id, identityKey, hostname: hostname || null,
          vendor: vendor || null, model: model || null, type: type || "unknown",
          confidence: "verified", isSimulated: true,
          notes: (notes || "") + " | منشأ: افزودن دستی کاربر",
        },
      });
      const iface = await db.interface.create({ data: { deviceId: d.id, name: "manual", mac: mac || null, status: "unknown" } });
      if (ip) {
        await db.iPAssignment.create({ data: { interfaceId: iface.id, address: ip, source: "user" } });
      }
      await db.evidence.create({
        data: { projectId: project.id, deviceId: d.id, kind: "user-entry", sourceMethod: "manual", content: "دستگاه به‌صورت دستی توسط کاربر اضافه شد", confidence: "verified" },
      });
      await db.auditLog.create({ data: { projectId: project.id, action: "افزودن دستی دستگاه", target: identityKey, detail: ip || mac } });
      return json({ ok: true, device: d });
    }
    default:
      return err("عملیات ناشناخته");
  }
}
