// NetScope — فاز ۳: اعمال نتایج ONVIF/پلاگین NVR و ساخت مدل رابطه‌ای
// دوربین ↔ سوئیچ (PoE) ↔ کانال ضبط‌کننده — با سطح اطمینان و شواهد (سند ۵ و ۶)
// ─────────────────────────────────────────────────────────────────────────────
// قواعد محوری:
//  - MAC روی پورت سوئیچ ≠ اتصال فیزیکی قطعی (سند ۵.۲) — تک-MAC روی پورت access
//    فقط «استنباطی» است؛ با تأیید PoE (توان کشیده‌شده) به «تأییدشده» ارتقا می‌یابد.
//  - کانال NVR با IP → تطبیق ثبت‌شده از API خود ضبط‌کننده (معتبر)؛ IP مبهم → استنباطی
//  - هر رابطه باید شاهد داشته باشد؛ نبود شاهد یعنی «نامشخص» نه حدس
//  - دوربین‌های پشت PoE داخلی NVR از ONVIF کشف نمی‌شوند — طبیعی است (سند ۶.۳)

import { db } from "@/lib/db";
import type { NvrChannelRaw } from "./nvr-plugins";
import { SCENARIO_WS_DISCOVERY_RAW, SCENARIO_ONVIF_DEVICE_INFO, SCENARIO_NVR_RAW_DAHUA, SCENARIO_NVR_RAW_HIKVISION, SCENARIO_POE } from "./scenario-phase3";
import { parseProbeMatches, onvifGetDeviceInfo } from "./onvif";
import type { OnvifDiscovered, OnvifDeviceInfo } from "./onvif";
import { addEvidence } from "./engine";
import { onvifWsDiscover } from "./onvif";

// ─── ابزارهای مشترک ────────────────────────────────────────────────

function normMac(mac?: string | null): string | undefined {
  if (!mac) return undefined;
  const hex = mac.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return hex.length === 12 ? hex.match(/../g)!.join(":") : undefined;
}

async function audit(projectId: string, action: string, target: string, detail = "") {
  await db.auditLog.create({ data: { projectId, actor: "کاربر", action, target, detail } });
}

// ─── ۱) کشف ONVIF (واقعی یا شبیه‌سازی‌شده) ─────────────────────────

export interface OnvifApplyResult {
  ok: boolean;
  mode: "real" | "simulated";
  durationMs?: number;
  discovered: {
    ip: string; xaddr: string; name?: string; hardware?: string; mac?: string;
    matched: "existing" | "created" | "recorder" | "unknown";
    deviceKey?: string; note: string;
  }[];
  notDiscoverable: { key: string; reason: string }[];
  warnings: string[];
  note: string;
}

export async function applyOnvifDiscovery(
  projectId: string,
  opts: { mode: "real" | "simulated"; discovered?: OnvifDiscovered[]; durationMs?: number; note?: string },
): Promise<OnvifApplyResult> {
  const warnings: string[] = [];
  let devices: OnvifDiscovered[] = [];
  let durationMs = opts.durationMs;

  if (opts.mode === "real") {
    const r = await onvifWsDiscover({ timeoutMs: 4500 });
    devices = r.devices;
    durationMs = r.durationMs;
    warnings.push(r.note);
  } else {
    // شبیه‌سازی: پاسخ‌های خام از سناریو — تجزیه با parseProbeMatches «واقعی»
    devices = SCENARIO_WS_DISCOVERY_RAW.flatMap((raw) => parseProbeMatches(raw));
    warnings.push("کشف شبیه‌سازی‌شده: پاسخ‌های خام سناریو با تجزیه‌گر واقعی WS-Discovery پردازش شدند");
  }

  const result: OnvifApplyResult = { ok: true, mode: opts.mode, durationMs, discovered: [], notDiscoverable: [], warnings, note: opts.note || "" };

  // دستگاه‌های موجود پروژه (برای تطبیق MAC/IP)
  const existing = await db.device.findMany({
    where: { projectId, mergedIntoId: null },
    include: { interfaces: { include: { ipAdds: true } } },
  });
  const findDeviceByIp = (ip: string) =>
    existing.find((d) => d.interfaces.some((i) => i.ipAdds.some((a) => a.address === ip)));
  const findDeviceByMac = (mac?: string) => {
    const m = normMac(mac);
    if (!m) return undefined;
    return existing.find((d) => d.interfaces.some((i) => normMac(i.mac) === m));
  };

  for (const d of devices) {
    const dev = findDeviceByMac(d.mac) || findDeviceByIp(d.ip);
    if (dev) {
      const isNvr = dev.type === "nvr";
      if (isNvr) {
        await db.recorder.upsert({
          where: { deviceId: dev.id },
          update: { lastSeen: new Date() },
          create: { deviceId: dev.id, rtype: "NVR", channelCount: 0 },
        });
      } else {
        await db.camera.upsert({
          where: { deviceId: dev.id },
          update: { onvifSupport: true, onvifXAddr: d.xaddr, serviceState: "onvif-ok", lastOnvifAt: new Date(), discoverySource: "onvif-wsdiscovery" },
          create: { deviceId: dev.id, onvifSupport: true, onvifXAddr: d.xaddr, serviceState: "onvif-ok", lastOnvifAt: new Date(), discoverySource: "onvif-wsdiscovery" },
        });
      }
      // غنی‌سازی مشخصات از اسکوپ‌ها اگر خالی بودند
      const patch: Record<string, string> = {};
      if (d.hardware && !dev.model) patch.model = d.hardware;
      if (d.name && !dev.hostname) patch.hostname = d.name;
      if (Object.keys(patch).length) await db.device.update({ where: { id: dev.id }, data: patch });
      await addEvidence({
        projectId, deviceId: dev.id, checklistKey: "cam.inventory", kind: "api-response",
        sourceMethod: "onvif-wsdiscovery", confidence: "verified", isSimulated: opts.mode === "simulated",
        content: `ONVIF WS-Discovery: دستگاه در ${d.ip} به Probe پاسخ داد${d.hardware ? ` — مدل: ${d.hardware}` : ""}${d.mac ? ` — MAC: ${d.mac}` : ""}${d.profiles.length ? ` — پروفایل‌ها: ${d.profiles.join(", ")}` : ""}\nپاسخ پاسخ‌دهنده یعنی سرویس ONVIF فعال است (وضعیت سرویس مستقل از شبکه — سند ۶.۴).`,
      });
      result.discovered.push({
        ip: d.ip, xaddr: d.xaddr, name: d.name, hardware: d.hardware, mac: d.mac,
        matched: isNvr ? "recorder" : "existing", deviceKey: dev.identityKey,
        note: isNvr ? "ضبط‌کننده موجود — سرویس ONVIF آن فعال است" : "با دستگاه موجود پروژه تطبیق یافت (MAC/IP)",
      });
      continue;
    }

    // دستگاه جدید — ثبت صادقانه با برچسب «کشف‌شده از ONVIF»
    const key = d.mac ? `onvif-${d.mac.toLowerCase().replace(/:/g, "")}` : `onvif-${d.ip.replace(/\./g, "-")}`;
    const created = await db.device.create({
      data: {
        projectId, identityKey: key, hostname: d.name || null, vendor: null, model: d.hardware || null,
        type: "camera", confidence: "verified",
        roleEvidence: `دستگاه با سرویس ONVIF در ${d.ip} کشف شد (پاسخ WS-Discovery به NetworkVideoTransmitter) — احتمالاً دوربین IP؛ هویت دقیق پس از استعلام مشخصات تکمیل می‌شود.`,
        status: "unknown", sensitivity: "normal", isSimulated: opts.mode === "simulated",
        notes: `XAddr: ${d.xaddr}${d.mac ? ` | MAC: ${d.mac}` : ""}`,
      },
    });
    await db.interface.create({ data: { deviceId: created.id, name: "eth0", mac: normMac(d.mac) || null, status: "unknown" } });
    await db.iPAssignment.create({ data: { interfaceId: (await db.interface.findFirstOrThrow({ where: { deviceId: created.id } })).id, address: d.ip, isPrimary: true, source: "discovery" } });
    await db.camera.create({ data: { deviceId: created.id, onvifSupport: true, onvifXAddr: d.xaddr, serviceState: "onvif-ok", lastOnvifAt: new Date(), discoverySource: "onvif-wsdiscovery", onvifProfiles: JSON.stringify(d.profiles) } });
    await addEvidence({
      projectId, deviceId: created.id, checklistKey: "cam.inventory", kind: "api-response",
      sourceMethod: "onvif-wsdiscovery", confidence: "verified", isSimulated: opts.mode === "simulated",
      content: `دستگاه جدید از ONVIF کشف شد: ${d.ip} (${d.hardware || "مدل نامشخص"})${d.mac ? ` MAC: ${d.mac}` : ""} — به‌عنوان «احتمالاً دوربین» ثبت شد و در انتظار استعلام مشخصات است.`,
    });
    result.discovered.push({ ip: d.ip, xaddr: d.xaddr, name: d.name, hardware: d.hardware, mac: d.mac, matched: "created", deviceKey: key, note: "دستگاه جدید ثبت شد" });
  }

  // دوربین‌هایی که «نباید» کشف می‌شدند — توضیح صادقانه (سند ۶.۳)
  const cams = await db.device.findMany({ where: { projectId, type: "camera", mergedIntoId: null } });
  for (const cam of cams) {
    if (opts.mode === "simulated" && ["CAM-05", "CAM-06"].includes(cam.identityKey)) {
      result.notDiscoverable.push({ key: cam.identityKey, reason: "پشت شبکه داخلی PoE ضبط‌کننده — از WS-Discovery سگمنت اصلی کشف نمی‌شود؛ طبیعی است و نشانه خرابی نیست (سند ۶.۳)" });
    }
  }
  if (opts.mode === "simulated" && cams.some((c) => c.identityKey === "CAM-07")) {
    result.notDiscoverable.push({ key: "CAM-07", reason: "پشت لینک رادیویی فعلاً قطع — کشف نشدنی است تا لینک برقرار شود (سناریو سند ۶.۳-۴)" });
  }

  await audit(projectId, `کشف ONVIF (${opts.mode === "real" ? "واقعی" : "شبیه‌سازی‌شده"})`, "cctv", `${result.discovered.length} دستگاه پاسخ داد`);
  return result;
}

// ─── ۲) استعلام مشخصات یک دستگاه از ONVIF ──────────────────────────

export async function applyOnvifDeviceInfo(
  projectId: string,
  deviceId: string,
  opts: { mode: "real" | "simulated"; username?: string; password?: string },
): Promise<{ ok: boolean; info?: OnvifDeviceInfo; error?: string; isSimulated: boolean }> {
  const dev = await db.device.findUnique({
    where: { id: deviceId }, include: { interfaces: { include: { ipAdds: true } }, cameras: true },
  });
  if (!dev) return { ok: false, error: "دستگاه یافت نشد", isSimulated: opts.mode === "simulated" };

  const ip = dev.interfaces[0]?.ipAdds.find((a) => a.isPrimary)?.address || dev.interfaces[0]?.ipAdds[0]?.address;
  if (!ip) return { ok: false, error: "دستگاه IP شناخته‌شده ندارد", isSimulated: opts.mode === "simulated" };

  const xaddr = dev.cameras[0]?.onvifXAddr || `http://${ip}:80/onvif/device_service`;
  let info: OnvifDeviceInfo;

  if (opts.mode === "real") {
    info = await onvifGetDeviceInfo(xaddr, { username: opts.username, password: opts.password, timeoutMs: 4500 });
  } else {
    const sim = SCENARIO_ONVIF_DEVICE_INFO[ip];
    if (!sim) {
      info = { ok: false, state: "onvif-fail", error: `دستگاه ${ip} در سناریوی شبیه‌سازی پاسخ‌دهی نیست (پشت NVR یا لینک قطع — سند ۶.۳)` };
    } else {
      info = { ok: true, state: "onvif-ok", ...parseSimDeviceInfo(sim.xml), raw: sim.xml };
    }
  }

  if (info.ok) {
    await db.camera.updateMany({ where: { deviceId }, data: { serviceState: "onvif-ok", lastOnvifAt: new Date() } });
    const patchDev: Record<string, string> = {};
    if (info.manufacturer) patchDev.vendor = info.manufacturer;
    if (info.model) patchDev.model = info.model;
    if (info.firmware) patchDev.firmware = info.firmware;
    if (info.serial) patchDev.serial = info.serial;
    if (Object.keys(patchDev).length) await db.device.update({ where: { id: deviceId }, data: patchDev });
    await addEvidence({
      projectId, deviceId, checklistKey: "cam.inventory", kind: "api-response",
      sourceMethod: "onvif-deviceinfo", confidence: "verified", isSimulated: opts.mode === "simulated",
      content: `ONVIF GetDeviceInformation از ${ip}:\nسازنده: ${info.manufacturer} | مدل: ${info.model} | فرم‌ور: ${info.firmware} | سریال: ${info.serial}`,
    });
  } else {
    const state = info.state === "needs-auth" ? "needs-auth" : "onvif-fail";
    await db.camera.updateMany({ where: { deviceId }, data: { serviceState: state, lastOnvifAt: new Date() } });
    await addEvidence({
      projectId, deviceId, checklistKey: "cam.inventory", kind: "observation",
      sourceMethod: "onvif-deviceinfo", confidence: "verified", isSimulated: opts.mode === "simulated",
      content: `استعلام ONVIF ناموفق از ${ip}: ${info.error || "بدون پاسخ"} — علت ثبت شد؛ حدس درباره سلامت دستگاه زده نمی‌شود (سند ۲.۳).`,
    });
  }

  return { ok: info.ok, info, isSimulated: opts.mode === "simulated" };
}

function parseSimDeviceInfo(xml: string): { manufacturer?: string; model?: string; firmware?: string; serial?: string } {
  const field = (n: string) => xml.match(new RegExp(`<[^>]*:?${n}[^>]*>([^<]*)<`, "i"))?.[1]?.trim();
  return { manufacturer: field("Manufacturer"), model: field("Model"), firmware: field("FirmwareVersion"), serial: field("SerialNumber") };
}

// ─── ۳) همگام‌سازی کانال‌ها از ضبط‌کننده با پلاگین سازنده ───────────

export interface SyncChannelsResult {
  ok: boolean;
  pluginId?: string; pluginVersion?: string;
  mode: "real" | "simulated";
  channels: NvrChannelRaw[];
  stored: number; matched: number; created: number;
  unmatched: { channelNo: number; label?: string; ip?: string; reason: string }[];
  warnings: string[]; errors: string[];
}

export async function syncNvrChannels(
  projectId: string,
  opts: { recorderId?: string; deviceKey?: string; pluginId: string; mode: "real" | "simulated"; username?: string; password?: string; httpPort?: number },
): Promise<SyncChannelsResult> {
  const { findNvrPlugin } = await import("./nvr-plugins");
  const plugin = findNvrPlugin(opts.pluginId);
  const fail = (errors: string[]): SyncChannelsResult => ({ ok: false, mode: opts.mode, channels: [], stored: 0, matched: 0, created: 0, unmatched: [], warnings: [], errors });
  if (!plugin) return fail([`پلاگین ${opts.pluginId} یافت نشد`]);

  // یافتن ضبط‌کننده
  const nvrDevice = await db.device.findFirst({
    where: { projectId, mergedIntoId: null, ...(opts.deviceKey ? { identityKey: opts.deviceKey } : {}), type: "nvr" },
    include: { recorders: true },
  });
  if (!nvrDevice) return fail(["ضبط‌کننده (نوع nvr) در پروژه یافت نشد — ابتدا کشف/سناریو را اجرا کنید"]);

  let recorder = nvrDevice.recorders[0];
  if (!recorder) {
    recorder = await db.recorder.create({ data: { deviceId: nvrDevice.id, rtype: "NVR", vendor: nvrDevice.vendor, model: nvrDevice.model } });
  }

  // واکشی خروجی خام — واقعی یا شبیه‌سازی‌شده
  let raws: Record<string, string> = {};
  const warnings: string[] = [];
  const errors: string[] = [];
  if (opts.mode === "real") {
    const ipIf = await db.interface.findFirst({ where: { deviceId: nvrDevice.id }, include: { ipAdds: true } });
    const ip = ipIf?.ipAdds.find((a) => a.isPrimary)?.address || ipIf?.ipAdds[0]?.address;
    if (!ip) return fail(["IP ضبط‌کننده شناخته نشده است"]);
    const fetched = await plugin.fetch({ ip, username: opts.username, password: opts.password, timeoutMs: 5000, channelCount: recorder.channelCount || 8, httpPort: opts.httpPort });
    raws = fetched.raws;
    warnings.push(...fetched.warnings);
    errors.push(...fetched.errors);
    if (Object.keys(raws).length === 0) {
      return { ...fail(errors.length ? errors : ["هیچ پاسخی از ضبط‌کننده دریافت نشد"]), warnings };
    }
  } else {
    if (opts.pluginId === "dahua-http-api") raws = SCENARIO_NVR_RAW_DAHUA;
    else if (opts.pluginId === "hikvision-isapi") raws = SCENARIO_NVR_RAW_HIKVISION;
    else {
      return fail(["برای این پلاگین داده شبیه‌سازی تعریف نشده — از حالت واقعی استفاده کنید"]);
    }
    warnings.push("همگام‌سازی شبیه‌سازی‌شده: خروجی خام سناریو با تجزیه‌گر واقعی پلاگین پردازش شد");
  }

  // تجزیه — همان مسیر برای واقعی و شبیه‌سازی
  const parsed = plugin.parse(raws);
  warnings.push(...parsed.warnings);
  const channels = parsed.channels;

  // دستگاه‌های پروژه برای تطبیق IP — نمای سبک
  interface DeviceLite { id: string; identityKey: string; type: string; hostname: string | null; vendor: string | null; isSimulated: boolean }
  const devices = await db.device.findMany({
    where: { projectId, mergedIntoId: null },
    include: { interfaces: { include: { ipAdds: true } } },
  });
  const ipIndex = new Map<string, DeviceLite>();
  for (const d of devices) {
    const lite: DeviceLite = { id: d.id, identityKey: d.identityKey, type: d.type, hostname: d.hostname, vendor: d.vendor, isSimulated: d.isSimulated };
    for (const i of d.interfaces) for (const a of i.ipAdds) {
      if (!ipIndex.has(a.address)) ipIndex.set(a.address, lite);
    }
  }

  const result: SyncChannelsResult = { ok: true, pluginId: plugin.id, pluginVersion: plugin.version, mode: opts.mode, channels, stored: 0, matched: 0, created: 0, unmatched: [], warnings, errors };

  for (const ch of channels) {
    await db.recorderChannel.upsert({
      where: { recorderId_channelNo: { recorderId: recorder.id, channelNo: ch.channelNo } },
      update: { online: ch.online || "unknown", recording: ch.recording || "unknown", cameraIpRaw: ch.ip || null, cameraLabelRaw: ch.label || null, source: "nvr-api", lastVerified: new Date() },
      create: {
        recorderId: recorder.id, channelNo: ch.channelNo, online: ch.online || "unknown",
        recording: ch.recording || "unknown", cameraIpRaw: ch.ip || null, cameraLabelRaw: ch.label || null,
        source: "nvr-api", lastVerified: new Date(),
      },
    });
    result.stored++;

    // تطبیق دوربین با IP گزارش‌شده ضبط‌کننده
    let camDev = ch.ip ? ipIndex.get(ch.ip) : undefined;
    if (camDev && camDev.type !== "camera" && camDev.type !== "unknown") {
      // IP متعلق به دستگاه غیردوربین — تطبیق مشکوک؛ ثبت صادقانه
      result.unmatched.push({ channelNo: ch.channelNo, label: ch.label, ip: ch.ip, reason: `IP با دستگاه غیردوربین (${camDev.identityKey}) مشترک بود — تطبیق نشد` });
      continue;
    }
    if (!camDev && ch.ip) {
      // دوربین پشت شبکه داخلی NVR که از عامل دیده نمی‌شود — از API ضبط‌کننده ثبت می‌شود (سند ۶.۳-۳)
      const key = `nvr-cam-${ch.ip.replace(/\./g, "-")}`;
      const createdCam = await db.device.create({
        data: {
          projectId, identityKey: key, hostname: ch.label || null,
          vendor: nvrDevice.vendor, type: "camera", confidence: "limited",
          roleEvidence: `از API ضبط‌کننده (${plugin.label}) گزارش شده: کانال ${ch.channelNo} → ${ch.ip}${ch.label ? ` «${ch.label}»` : ""}. این دوربین مستقیماً از عامل قابل مشاهده نیست (شبکه داخلی ضبط‌کننده) — عدم مشاهده مستقیم خرابی نیست.`,
          status: "unknown", isSimulated: opts.mode === "simulated",
          notes: `منبع: پلاگین ${plugin.id} v${plugin.version} | کانال ${ch.channelNo}`,
        },
      });
      camDev = { id: createdCam.id, identityKey: createdCam.identityKey, type: createdCam.type, hostname: createdCam.hostname, vendor: createdCam.vendor, isSimulated: createdCam.isSimulated };
      const itf = await db.interface.create({ data: { deviceId: createdCam.id, name: "eth0", status: "unknown" } });
      await db.iPAssignment.create({ data: { interfaceId: itf.id, address: ch.ip, isPrimary: true, source: "discovery" } });
      result.created++;
    }
    if (!camDev) {
      result.unmatched.push({ channelNo: ch.channelNo, label: ch.label, ip: ch.ip, reason: "دستگاهی با این IP در پروژه یافت نشد و IP هم گزارش نشده بود" });
      continue;
    }

    const cam = await db.camera.upsert({
      where: { deviceId: camDev.id },
      // در به‌روزرسانی، منبع کشف قبلی (مثلا ONVIF) بازنویسی نمی‌شود — فقط ثبت می‌شود که NVR هم آن را می‌شناسد
      update: { recorderId: recorder.id, channelNo: ch.channelNo, lastSeen: new Date() },
      create: { deviceId: camDev.id, recorderId: recorder.id, channelNo: ch.channelNo, discoverySource: "nvr-api" },
    });
    const chRow = await db.recorderChannel.findUnique({ where: { recorderId_channelNo: { recorderId: recorder.id, channelNo: ch.channelNo } } });
    if (chRow) {
      await db.recorderChannel.update({ where: { id: chRow.id }, data: { cameraId: cam.id } });
    }
    await addEvidence({
      projectId, deviceId: camDev.id, checklistKey: "nvr.inventory", kind: "api-response",
      sourceMethod: `nvr-plugin:${plugin.id}`, confidence: "verified", isSimulated: opts.mode === "simulated",
      content: `پلاگین ${plugin.label} v${plugin.version}: کانال ${ch.channelNo} → دوربین ${camDev.identityKey}${ch.ip ? ` (IP ${ch.ip})` : ""} | آنلاین از نگاه NVR: ${ch.online || "نامشخص"} | ضبط: ${ch.recording === "active" ? "فعال" : ch.recording === "inactive" ? "غیرفعال" : "نامشخص"}${ch.label ? ` | برچسب: «${ch.label}»` : ""}`,
    });
    result.matched++;
  }

  // به‌روزرسانی رکورد ضبط‌کننده
  await db.recorder.update({
    where: { id: recorder.id },
    data: { pluginId: plugin.id, pluginVersion: plugin.version, apiPath: plugin.apiPath, channelCount: Math.max(recorder.channelCount, ...channels.map((c) => c.channelNo), 0), lastSyncAt: new Date(), lastSeen: new Date() },
  });
  await addEvidence({
    projectId, deviceId: nvrDevice.id, checklistKey: "nvr.inventory", kind: "api-response",
    sourceMethod: `nvr-plugin:${plugin.id}`, confidence: "verified", isSimulated: opts.mode === "simulated",
    content: `همگام‌سازی کانال‌ها با پلاگین ${plugin.label} v${plugin.version} (${opts.mode === "real" ? "واکشی واقعی" : "شبیه‌سازی‌شده"}): ${result.stored} کانال ذخیره، ${result.matched} کانال با دوربین تطبیق، ${result.created} دوربین جدید از API ضبط‌کننده ساخته شد.`,
  });
  await audit(projectId, "همگام‌سازی کانال‌های ضبط‌کننده", nvrDevice.identityKey, `${plugin.id} v${plugin.version} — ${result.stored} کانال`);

  return result;
}

// ─── ۴) بازسازی روابط فیزیکی/کاربردی دوربین‌ها ──────────────────────

export interface CameraRelation {
  cameraKey: string; cameraName: string; ip: string | null;
  switchKey?: string; switchName?: string; switchPort?: string;
  poeStatus?: string | null; poeWatts?: number | null;
  nvrKey?: string; nvrName?: string; channelNo?: number | null;
  channelOnline?: string; recording?: string;
  confidence: "verified" | "inferred" | "unknown";
  evidence: string;
  simulatedParts: boolean;
}

export interface RebuildResult {
  ok: boolean;
  relations: CameraRelation[];
  linksCreated: number; linksUpdated: number;
  findingsCreated: number;
  warnings: string[]; errors: string[];
}

// ─── ادغام هویت‌های تکراری (سند ۴.۲ — هویت ترکیبی، نه فقط IP) ────────
// اگر دوربینی از ONVIF (کلید onvif-...) و همزمان از عامل/ARP ثبت شده باشد و
// MAC مشترک داشته باشند، رکورد تکراری با رکورد اصلی ادغام می‌شود.
export async function dedupeCctvIdentities(projectId: string): Promise<{ merged: number; details: string[] }> {
  const details: string[] = [];
  let merged = 0;

  const devices = await db.device.findMany({
    where: { projectId, mergedIntoId: null },
    include: { interfaces: { include: { ipAdds: true } }, cameras: true },
  });

  // گروه‌بندی بر اساس MAC
  const byMac = new Map<string, typeof devices>();
  for (const d of devices) {
    for (const i of d.interfaces) {
      const m = normMac(i.mac);
      if (!m) continue;
      if (!byMac.has(m)) byMac.set(m, []);
      byMac.get(m)!.push(d);
    }
  }

  for (const [mac, group] of byMac) {
    if (group.length < 2) continue;
    // اولویت: کلید نه-از-ONVIF (رکورد اصلی عامل/مدیریت) > رکورد جدیدتر
    const primary = group.find((d) => !d.identityKey.startsWith("onvif-")) ||
      group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    for (const dup of group) {
      if (dup.id === primary.id) continue;

      // ۱) انتقال رکورد دوربین (اگر هر دو Camera دارند، رکورد dup حذف می‌شود)
      const dupCam = dup.cameras[0];
      const primaryCam = primary.cameras[0];
      if (dupCam) {
        if (primaryCam) {
          // غنی‌سازی رکورد اصلی از رکورد تکراری — تنزل رخ نمی‌دهد
          await db.camera.update({
            where: { id: primaryCam.id },
            data: {
              onvifSupport: primaryCam.onvifSupport || dupCam.onvifSupport,
              onvifXAddr: primaryCam.onvifXAddr || dupCam.onvifXAddr,
              onvifProfiles: primaryCam.onvifProfiles === "[]" ? dupCam.onvifProfiles : primaryCam.onvifProfiles,
              serviceState: primaryCam.serviceState === "unknown" ? dupCam.serviceState : primaryCam.serviceState,
              lastOnvifAt: primaryCam.lastOnvifAt || dupCam.lastOnvifAt,
              discoverySource: primaryCam.discoverySource || dupCam.discoverySource,
            },
          });
          await db.camera.delete({ where: { id: dupCam.id } });
        } else {
          await db.camera.update({ where: { id: dupCam.id }, data: { deviceId: primary.id } });
        }
      }

      // ۲) انتقال IPهای یگانه از رکورد تکراری به رکورد اصلی
      const primaryIface = primary.interfaces[0];
      if (primaryIface) {
        for (const i of dup.interfaces) {
          for (const a of i.ipAdds) {
            const exists = primary.interfaces.some((pi) => pi.ipAdds.some((pa) => pa.address === a.address));
            if (!exists) {
              await db.iPAssignment.create({ data: { interfaceId: primaryIface.id, address: a.address, prefix: a.prefix, family: a.family, isPrimary: a.isPrimary, source: a.source } });
            }
          }
        }
      }

      // ۳) انتقال لینک‌ها
      await db.link.updateMany({ where: { srcDeviceId: dup.id }, data: { srcDeviceId: primary.id } });
      await db.link.updateMany({ where: { dstDeviceId: dup.id }, data: { dstDeviceId: primary.id } });

      // ۴) ادغام نرم — رکورد تکراری حذف نمی‌شود؛ با نشانگر mergedIntoId از فهرست کنار می‌رود
      await db.device.update({
        where: { id: dup.id },
        data: {
          mergedIntoId: primary.id,
          notes: `${dup.notes} | ادغام‌شده با ${primary.identityKey} بر اساس MAC یکسان (${mac}) — سند ۴.۲`,
        },
      });
      await db.evidence.create({
        data: {
          projectId, deviceId: primary.id, kind: "observation", sourceMethod: "identity-merge",
          confidence: "verified", isSimulated: dup.isSimulated,
          content: `ادغام هویت: رکورد «${dup.identityKey}» (کشف‌شده از ONVIF) با رکورد «${primary.identityKey}» بر اساس MAC یکسان ${mac} ادغام شد. هر دو نمای همان دستگاه بودند — سند ۴.۲: هویت ترکیبی، نه دو رکورد جدا.`,
        },
      });
      details.push(`${dup.identityKey} → ${primary.identityKey}`);
      merged++;
    }
  }

  if (merged > 0) {
    await db.auditLog.create({
      data: { projectId, actor: "موتور", action: "ادغام هویت‌های تکراری دوربین‌ها", detail: details.join(" | ") },
    });
  }
  return { merged, details };
}

export async function rebuildCctvRelations(projectId: string): Promise<RebuildResult> {
  const warnings: string[] = [], errors: string[] = [];
  let linksCreated = 0, linksUpdated = 0, findingsCreated = 0;

  // ── ادغام هویت‌های تکراری (سند ۴.۲): دوربین کشف‌شده از ONVIF که همان MAC
  //    را در فهرست عامل دارد، با دستگاه اصلی ادغام می‌شود — دو رکورد برای یک دستگاه ممنوع.
  const merged = await dedupeCctvIdentities(projectId);
  if (merged.merged > 0) {
    warnings.push(`${merged.merged} هویت تکراری ادغام شد: ${merged.details.join(" | ")}`);
  }

  const cameras = await db.camera.findMany({
    include: { device: { include: { interfaces: { include: { ipAdds: true } } } }, recorder: { include: { device: true } }, channels: true },
  });
  const fdb = await db.fdbEntry.findMany({ include: { device: true } });
  const links = await db.link.findMany({ where: { projectId } });

  if (!fdb.length) warnings.push("جدول FDB خالی است — رابطه دوربین↔سوئیچ بدون جمع‌آوری فاز ۲ (FDB/SNMP) قابل استنباط نیست؛ فقط روابط NVR/کانال ساخته می‌شود");

  // شمارش MACهای هر پورت هر سوئیچ (برای تشخیص access/uplink — سند ۵.۲)
  const portMacs = new Map<string, Set<string>>();
  for (const f of fdb) {
    const k = `${f.deviceId}|${f.port}`;
    if (!portMacs.has(k)) portMacs.set(k, new Set());
    portMacs.get(k)!.add(f.mac.toUpperCase());
  }

  const relations: CameraRelation[] = [];

  for (const cam of cameras) {
    const dev = cam.device;
    const ip = dev.interfaces[0]?.ipAdds.find((a) => a.isPrimary)?.address || dev.interfaces[0]?.ipAdds[0]?.address || null;
    const camMacs = dev.interfaces.map((i) => i.mac).filter((m): m is string => !!m).map((m) => m.toUpperCase());

    let relation: CameraRelation = {
      cameraKey: dev.identityKey, cameraName: dev.hostname || dev.identityKey, ip,
      confidence: "unknown", evidence: "", simulatedParts: dev.isSimulated,
    };

    // ── رابطه دوربین ↔ سوئیچ از FDB + ارتقا با PoE ──
    for (const mac of camMacs) {
      const rows = fdb.filter((f) => f.mac.toUpperCase() === mac);
      for (const row of rows) {
        const sw = row.device;
        const portKey = `${sw.id}|${row.port}`;
        const macsOnPort = portMacs.get(portKey) || new Set<string>();
        // پورت چند MAC دارد → ترانک/آپ‌لینک؛ اتصال مستقیم دوربین به این پورت نیست
        if (macsOnPort.size > 2) continue; // MAC دوربین + MAC خود سوئیچ حداکثر

        let confidence: CameraRelation["confidence"] = "inferred";
        let evidence = `MAC دوربین (${mac}) روی پورت ${row.port} سوئیچ ${sw.hostname || sw.identityKey} — تک‌MAC روی پورت access (سند ۵.۲: استنباطی)`;

        // PoE — از داده شبیه‌سازی/آینده SNMP: توان کشیده‌شده یعنی تغذیه فیزیکی تأیید
        const poeTable = SCENARIO_POE[sw.identityKey];
        const poe = poeTable?.[row.port];
        if (poe && poe.status === "poe-ok" && poe.watts > 0) {
          confidence = "verified";
          evidence += ` + توان PoE ${poe.watts} وات روی همین پورت — تغذیه فیزیکی تأیید شد`;
          await db.camera.update({ where: { id: cam.id }, data: { poeStatus: "poe-ok", poeWatts: poe.watts, switchPort: row.port, switchDeviceId: sw.id } });
        } else if (poe?.status === "poe-fault") {
          await db.camera.update({ where: { id: cam.id }, data: { poeStatus: "poe-fault", poeWatts: 0, switchPort: row.port, switchDeviceId: sw.id } });
          evidence += ` + ⚠ خطای PoE روی پورت — دوربین احتمالاً بدون تغذیه است`;
          await db.analysisFinding.create({
            data: {
              projectId, title: `خطای تغذیه PoE برای ${dev.hostname || dev.identityKey}`,
              description: `سوئیچ/ضبط‌کننده روی پورت ${row.port} خطای PoE گزارش می‌کند و دوربین پاسخ نمی‌دهد. علت احتمالی: قطعی تغذیه/کابل. این یافته بر اساس شواهد PoE و نبود پاسخ است — قطعی نهایی پس از بازدید فیزیکی.`,
              relatedIds: JSON.stringify([dev.id, sw.id]),
              evidenceText: evidence,
              confidence: "inferred", impact: `دوربین ${dev.identityKey} تصویر نمی‌دهد`, category: "camera",
              probableCauses: JSON.stringify(["خطای پورت PoE", "خرابی کابل", "خرابی آداپتور/دوربین"]),
              suggestedTests: JSON.stringify(["آزمایش دوربین روی پورت PoE سالم دیگر", "بررسی LED دوربین", "تعویض پچ‌کورد"]),
              suggestedFix: JSON.stringify(["بازنشانی پورت PoE از پنل سوئیچ", "تعویض کابل/پورت"]),
            },
          });
          findingsCreated++;
        } else {
          await db.camera.updateMany({ where: { id: cam.id }, data: { switchPort: row.port, switchDeviceId: sw.id } });
        }

        // ساخت/به‌روزرسانی لینک فیزیکی دوربین↔سوئیچ
        const existing = links.find((l) =>
          (l.srcDeviceId === sw.id && l.dstDeviceId === dev.id) || (l.srcDeviceId === dev.id && l.dstDeviceId === sw.id));
        if (existing) {
          await db.link.update({
            where: { id: existing.id },
            data: {
              relation: "camera-to-switch", srcPort: existing.srcPort || row.port, dstPort: existing.dstPort || null,
              confidence: confidence === "verified" || existing.confidence === "verified" ? "verified" : confidence,
              sourceMethod: confidence === "verified" ? "fdb+poe" : "fdb",
              status: "active", lastVerified: confidence === "verified" ? new Date() : existing.lastVerified,
              evidenceText: existing.evidenceText.includes(evidence.slice(0, 40)) ? existing.evidenceText : `${evidence}\n——\n${existing.evidenceText}`,
            },
          });
          linksUpdated++;
        } else {
          const link = await db.link.create({
            data: {
              projectId, srcDeviceId: sw.id, dstDeviceId: dev.id, kind: "physical",
              relation: "camera-to-switch", srcPort: row.port, dstPort: null,
              sourceMethod: confidence === "verified" ? "fdb+poe" : "fdb",
              confidence, status: "active", lastVerified: confidence === "verified" ? new Date() : null,
              evidenceText: evidence,
            },
          });
          links.push(link);
          linksCreated++;
          await db.evidence.create({
            data: { projectId, deviceId: dev.id, linkId: link.id, kind: "observation", sourceMethod: "fdb", content: evidence, confidence, isSimulated: row.isSimulated },
          });
        }

        relation = {
          ...relation,
          switchKey: sw.identityKey, switchName: sw.hostname || sw.identityKey, switchPort: row.port,
          poeStatus: poe?.status || relation.poeStatus, poeWatts: poe?.watts ?? relation.poeWatts,
          confidence: confidence === "verified" ? "verified" : relation.confidence === "verified" ? "verified" : confidence,
          evidence: relation.evidence ? `${relation.evidence}\n${evidence}` : evidence,
          simulatedParts: relation.simulatedParts || row.isSimulated,
        };
      }
    }

    // ── رابطه دوربین ↔ کانال ضبط‌کننده (کاربردی) ──
    const chInline = cam.channels.find((c) => c.recorderId === cam.recorderId);
    const chFull = chInline
      ? null
      : await db.recorderChannel.findFirst({ where: { cameraId: cam.id }, include: { recorder: { include: { device: true } } } });
    const ch = chInline || chFull;
    const nvr = cam.recorder?.device || chFull?.recorder.device || undefined;
    if (nvr && (cam.channelNo || ch)) {
      const channelNo = cam.channelNo ?? ch?.channelNo ?? null;
      const conf: CameraRelation["confidence"] = "verified"; // ثبت از API خود ضبط‌کننده معتبر است
      const ev = `ثبت در کانال ${channelNo} ضبط‌کننده ${nvr.hostname || nvr.identityKey} (منبع: API ضبط‌کننده ${ch?.source || "nvr-api"})`;
      const existingFn = links.find((l) =>
        l.kind === "functional" && l.relation === "nvr-channel" &&
        ((l.srcDeviceId === dev.id && l.dstDeviceId === nvr.id) || (l.srcDeviceId === nvr.id && l.dstDeviceId === dev.id)));
      if (existingFn) {
        await db.link.update({
          where: { id: existingFn.id },
          data: { status: "active", lastVerified: new Date(), evidenceText: existingFn.evidenceText.includes(ev) ? existingFn.evidenceText : `${ev}\n——\n${existingFn.evidenceText}` },
        });
        linksUpdated++;
      } else {
        await db.link.create({
          data: {
            projectId, srcDeviceId: dev.id, dstDeviceId: nvr.id, kind: "functional",
            relation: "nvr-channel", sourceMethod: "nvr-api", confidence: conf, status: "active",
            lastVerified: new Date(), evidenceText: ev,
          },
        });
        linksCreated++;
      }
      relation = {
        ...relation, nvrKey: nvr.identityKey, nvrName: nvr.hostname || nvr.identityKey,
        channelNo, channelOnline: ch?.online, recording: ch?.recording,
        confidence: relation.confidence === "verified" ? "verified" : conf,
        evidence: relation.evidence ? `${relation.evidence}\n${ev}` : ev,
      };

      // PoE داخلی ضبط‌کننده (سند ۶.۲): وضعیت تغذیه کانال‌های داخلی NVR
      const rec = cam.recorder || chFull?.recorder;
      if (rec?.poeInternal && channelNo) {
        const nvrPoe = SCENARIO_POE[nvr.identityKey]?.[`ch${channelNo}`];
        if (nvrPoe?.status === "poe-fault") {
          await db.camera.update({ where: { id: cam.id }, data: { poeStatus: "poe-fault", poeWatts: 0 } });
          const faultEv = `ضبط‌کننده ${nvr.hostname || nvr.identityKey} برای کانال ${channelNo} خطای PoE داخلی گزارش می‌کند — دوربین تغذیه نمی‌شود (شاهد: API/وضعیت پورت داخلی)`;
          relation = {
            ...relation, poeStatus: "poe-fault", poeWatts: 0,
            evidence: `${relation.evidence}\n${faultEv}`,
          };
          await db.analysisFinding.create({
            data: {
              projectId, title: `خطای تغذیه PoE داخلی NVR برای ${dev.hostname || dev.identityKey}`,
              description: `کانال ${channelNo} ضبط‌کننده ${nvr.hostname || nvr.identityKey} هم آفلاین است و هم پورت PoE داخلی آن خطا دارد. علت محتمل: قطعی تغذیه روی پورت داخلی یا خرابی کابل — نه مشکل شبکه اصلی. این نتیجه «محتمل» است و قطعی نهایی نیازمند بازدید فیزیکی است (سند ۶.۴).`,
              relatedIds: JSON.stringify([dev.id, nvr.id]),
              evidenceText: `${faultEv}\n${relation.evidence}`,
              confidence: "inferred", impact: `دوربین ${dev.identityKey} تصویر نمی‌دهد و ضبط انجام نمی‌شود`, category: "camera",
              probableCauses: JSON.stringify(["خطای PoE پورت داخلی ضبط‌کننده", "خرابی کابل", "خرابی خود دوربین"]),
              suggestedTests: JSON.stringify(["اتصال دوربین به پورت PoE سالم دیگر ضبط‌کننده", "بررسی LED دوربین", "بازنشانی پورت از منوی ضبط‌کننده"]),
              suggestedFix: JSON.stringify(["انتقال دوربین به پورت سالم", "تعویض کابل", "تعویض دوربین در صورت ادامه مشکل"]),
            },
          });
          findingsCreated++;
        } else if (nvrPoe?.status === "poe-ok") {
          await db.camera.update({ where: { id: cam.id }, data: { poeStatus: "poe-ok", poeWatts: nvrPoe.watts } });
          relation = {
            ...relation, poeStatus: "poe-ok", poeWatts: nvrPoe.watts,
            evidence: `${relation.evidence}\nتغذیه PoE داخلی ضبط‌کننده سالم است (${nvrPoe.watts} وات)`,
          };
        }
      }
    }

    relations.push(relation);
  }

  // یافته تحلیلی: کانال آنلاین نیست ولی دوربین در شبکه پاسخ می‌دهد (سند ۶.۳)
  for (const rel of relations) {
    if (rel.channelOnline === "offline" && rel.ip && rel.confidence !== "unknown") {
      const dev = await db.device.findFirst({ where: { projectId, identityKey: rel.cameraKey }, include: { interfaces: { include: { ipAdds: true } } } });
      const netOk = dev?.status === "online";
      const behindNvr = rel.nvrKey && rel.ip.startsWith("10.1.30.");
      if (netOk && !behindNvr) {
        await db.analysisFinding.create({
          data: {
            projectId, title: `تناقض وضعیت: ${rel.cameraKey} از شبکه پاسخ می‌دهد ولی NVR آفلاین گزارش می‌کند`,
            description: `دوربین در شبکه پاسخ می‌دهد (status=online) اما ضبط‌کننده آن را آفلاین می‌بیند. طبق تفکیک وضعیت‌های مستقل سند ۶.۴، مشکل احتمالاً از پیکربندی کانال ضبط‌کننده است، نه از شبکه.`,
            relatedIds: JSON.stringify([dev?.id]),
            evidenceText: `شبکه: پاسخ می‌دهد | NVR: آفلاین | رابطه: ${rel.evidence}`,
            confidence: "inferred", impact: "ضبط تصویر این دوربین انجام نمی‌شود", category: "camera",
            probableCauses: JSON.stringify(["رمز اشتباه کانال در NVR", "پروتکل/پورت نامناسب در NVR", "ناتمام بودن افزودن دوربین در NVR"]),
            suggestedTests: JSON.stringify(["بررسی وضعیت کانال در منوی ضبط‌کننده", "آزمایش ورود با همان رمز به پنل دوربین"]),
            suggestedFix: JSON.stringify(["حذف و افزودن مجدد کانال در NVR", "به‌روزرسانی فرم‌ور ضبط‌کننده"]),
          },
        });
        findingsCreated++;
      }
    }
  }

  await audit(projectId, "بازسازی روابط دوربین‌ها", "cctv", `${linksCreated} لینک جدید، ${linksUpdated} به‌روزرسانی، ${findingsCreated} یافته`);
  return { ok: true, relations, linksCreated, linksUpdated, findingsCreated, warnings, errors };
}

// ─── ۵) خواندن روابط (بدون نوشتن) برای GET ─────────────────────────

export async function getCctvRelations(projectId: string) {
  const cameras = await db.camera.findMany({
    include: { device: { include: { interfaces: { include: { ipAdds: true } } } }, recorder: { include: { device: true } } },
  });
  const links = await db.link.findMany({ where: { projectId, OR: [{ relation: "camera-to-switch" }, { relation: "nvr-channel" }] } });
  const channels = await db.recorderChannel.findMany({ include: { recorder: { include: { device: true } } } });

  interface RelationSummary {
    cameraKey: string; cameraName: string; ip: string | null;
    serviceState: string; lastOnvifAt: Date | null;
    switchKey: string | null; switchName: string | null; switchPort: string | null;
    poeStatus: string | null; poeWatts: number | null;
    nvrKey: string | null; nvrName: string | null; channelNo: number | null;
    channelOnline: string | null; recording: string | null;
    swConfidence: string; swSource: string | null; nvrConfidence: string;
    evidence: string;
  }
  const out: RelationSummary[] = [];
  for (const cam of cameras) {
    const dev = cam.device;
    const ip = dev.interfaces[0]?.ipAdds.find((a) => a.isPrimary)?.address || dev.interfaces[0]?.ipAdds[0]?.address || null;
    const swLink = links.find((l) => (l.srcDeviceId === dev.id || l.dstDeviceId === dev.id) && l.relation === "camera-to-switch");
    const nvrLink = links.find((l) => (l.srcDeviceId === dev.id || l.dstDeviceId === dev.id) && l.relation === "nvr-channel");
    const sw = swLink ? await db.device.findUnique({ where: { id: swLink.srcDeviceId === dev.id ? swLink.dstDeviceId : swLink.srcDeviceId } }) : null;
    const nvr = nvrLink ? await db.device.findUnique({ where: { id: nvrLink.srcDeviceId === dev.id ? nvrLink.dstDeviceId : nvrLink.srcDeviceId } }) : null;
    const ch = channels.find((c) => c.cameraId === cam.id);
    out.push({
      cameraKey: dev.identityKey, cameraName: dev.hostname || dev.identityKey, ip,
      serviceState: cam.serviceState, lastOnvifAt: cam.lastOnvifAt,
      switchKey: sw?.identityKey || null, switchName: sw?.hostname || sw?.identityKey || null,
      switchPort: swLink?.srcPort || (swLink?.srcDeviceId === dev.id ? swLink?.dstPort : swLink?.srcPort) || cam.switchPort,
      poeStatus: cam.poeStatus, poeWatts: cam.poeWatts,
      nvrKey: nvr?.identityKey || null, nvrName: nvr?.hostname || nvr?.identityKey || null,
      channelNo: cam.channelNo ?? ch?.channelNo ?? null,
      channelOnline: ch?.online || null, recording: ch?.recording || null,
      swConfidence: swLink?.confidence || "unknown", swSource: swLink?.sourceMethod || null,
      nvrConfidence: nvrLink?.confidence || "unknown",
      evidence: swLink?.evidenceText || "",
    });
  }
  return out;
}
