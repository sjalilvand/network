// NetScope — فاز ۳: پلاگین‌های سازنده ضبط‌کننده (NVR/DVR) — سند ۳.۳
// ─────────────────────────────────────────────────────────────────────────────
// هر سازنده یک «پلاگین» مستقل با نسخه مشخص است؛ افزودن سازنده جدید بدون تغییر هسته.
// قواعد:
//  - همه فرمان‌ها فقط‌خواندنی‌اند؛ هیچ تغییر پیکربندی ارسال نمی‌شود
//  - اطلاعات ورود فقط در حافظه همین درخواست استفاده و ذخیره نمی‌شود (سند ۱۲)
//  - تجزیه‌گر (parse) از خروجی خام کار می‌کند؛ پس داده واقعی و شبیه‌سازی‌شده
//    از «همان مسیر تجزیه» می‌گذرند — فقط منبع انتقال متفاوت است و برچسب می‌خورد.
//  - هر پلاگین نسخه دارد تا تغییر در آینده قابل ردیابی باشد (الزام سند ۳.۳)

import crypto from "crypto";
// ─── قرارداد پلاگین ────────────────────────────────────────────────

export interface NvrChannelRaw {
  channelNo: number;
  label?: string;                       // برچسب خام کانال
  ip?: string;                          // IP دوربین اگر API سازنده بدهد
  online?: "online" | "offline" | "unknown";
  recording?: "active" | "inactive" | "unknown";
}

export type NvrRaws = Record<string, string>; // کلید بخش‌ها → خروجی خام

export interface NvrFetchContext {
  ip: string;
  httpPort?: number;
  username?: string;   // فقط در حافظه
  password?: string;   // فقط در حافظه
  timeoutMs?: number;
  channelCount?: number; // سقف استعلام‌های تک‌کاناله
}

export interface NvrPlugin {
  id: string;
  label: string;
  vendor: string;
  version: string;          // نسخه پلاگین — الزام نسخه‌بندی سند ۳.۳
  rtypes: string[];         // NVR | DVR | Hybrid
  apiPath: string;          // مسیر API سازنده — ثبت در رکورد Recorder
  notes: string;
  readSafe: true;
  // مجموعه درخواست‌های فقط‌خواندنی — برای نمایش شفاف در UI
  endpoints: { key: string; path: string; what: string }[];
  // واکشی واقعی از دستگاه (HTTP) → خروجی خام به تفکیک بخش
  fetch(ctx: NvrFetchContext): Promise<{ raws: NvrRaws; warnings: string[]; errors: string[] }>;
  // تجزیه خروجی خام → کانال‌ها (برای داده واقعی و شبیه‌سازی یکسان)
  parse(raws: NvrRaws): { channels: NvrChannelRaw[]; warnings: string[] };
}

// ─── هلپر HTTP با احراز هویت Digest/Basic (فقط‌خواندنی) ─────────────

async function httpGetWithAuth(
  url: string,
  ctx: { username?: string; password?: string; timeoutMs?: number },
): Promise<{ status: number; text: string; wwwAuthenticate?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ctx.timeoutMs ?? 5000);
  try {
    let res = await fetch(url, { method: "GET", signal: ctrl.signal, redirect: "manual" });
    if (res.status === 401 && ctx.username && ctx.password) {
      const wwwAuth = res.headers.get("www-authenticate") || "";
      const u = new URL(url);
      let auth: string;
      if (/digest/i.test(wwwAuth)) {
        auth = digestAuthHeader(wwwAuth, "GET", u.pathname + u.search, ctx.username, ctx.password);
      } else {
        auth = `Basic ${Buffer.from(`${ctx.username}:${ctx.password}`).toString("base64")}`;
      }
      res = await fetch(url, { method: "GET", signal: ctrl.signal, headers: { Authorization: auth } });
    }
    return { status: res.status, text: await res.text(), wwwAuthenticate: res.headers.get("www-authenticate") || undefined };
  } finally {
    clearTimeout(timer);
  }
}

function digestAuthHeader(wwwAuth: string, method: string, uri: string, username: string, password: string): string {
  const parse = (key: string): string => wwwAuth.match(new RegExp(`${key}="?([^",]+)"?`))?.[1] || "";
  const realm = parse("realm"), nonce = parse("nonce");
  const qop = (parse("qop").split(",")[0] || "auth").trim();
  const cnonce = crypto.randomBytes(8).toString("hex");
  const nc = "00000001";
  const ha1 = crypto.createHash("md5").update(`${username}:${realm}:${password}`).digest("hex");
  const ha2 = crypto.createHash("md5").update(`${method}:${uri}`).digest("hex");
  const response = crypto.createHash("md5").update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest("hex");
  return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", algorithm=MD5`;
}

// ─── تجزیه‌گرهای مشترک ─────────────────────────────────────────────

// تبدیل IP با فرمت‌های رایج (داشته‌شده در خروجی سازندگان) به IP استاندارد
function normIp(raw?: string): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (m) {
    const ok = m[1].split(".").every((n) => Number(n) <= 255);
    return ok ? m[1] : undefined;
  }
  return undefined;
}

// ─── پلاگین ۱: Dahua HTTP API ──────────────────────────────────────

export const DAHUA_HTTP_API: NvrPlugin = {
  id: "dahua-http-api",
  label: "Dahua / Amcrest HTTP API",
  vendor: "Dahua",
  version: "1.1.0",
  rtypes: ["NVR", "DVR", "Hybrid"],
  apiPath: "/cgi-bin/configManager.cgi + /cgi-bin/nvrMgmt.cgi + /cgi-bin/eventManager.cgi",
  notes:
    "فقط فرمان‌های خواندنی CGI. listCameras فهرست دوربین‌ها با IP و وضعیت آنلاین می‌دهد؛ ChannelTitle برچسب کانال‌ها؛ Record پیکربندی ضبط هر کانال را می‌دهد. اگر دستگاه رمز داشته باشد، از فرم امن اطلاعات ورود فقط‌خواندنی وارد شود.",
  readSafe: true,
  endpoints: [
    { key: "cameras", path: "/cgi-bin/nvrMgmt.cgi?action=listCameras&start=0&rows=64", what: "فهرست دوربین‌ها: شماره کانال، IP، وضعیت آنلاین" },
    { key: "titles", path: "/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle", what: "برچسب هر کانال" },
    { key: "record", path: "/cgi-bin/configManager.cgi?action=getConfig&name=Record", what: "پیکربندی ضبط هر کانال (Mode)" },
  ],
  async fetch(ctx) {
    const warnings: string[] = [], errors: string[] = [];
    const raws: NvrRaws = {};
    const base = `http://${ctx.ip}:${ctx.httpPort || 80}`;
    const parts = [
      { key: "cameras", url: `${base}/cgi-bin/nvrMgmt.cgi?action=listCameras&start=0&rows=64` },
      { key: "titles", url: `${base}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle` },
      { key: "record", url: `${base}/cgi-bin/configManager.cgi?action=getConfig&name=Record` },
    ];
    for (const p of parts) {
      try {
        const res = await httpGetWithAuth(p.url, ctx);
        if (res.status === 401) {
          errors.push("احراز هویت رد شد — اطلاعات ورود فقط‌خواندنی لازم است");
          break;
        }
        if (res.status !== 200) {
          warnings.push(`${p.url} → HTTP ${res.status}`);
          continue;
        }
        raws[p.key] = res.text;
      } catch (e) {
        errors.push(`${p.url} → ${(e as Error).message}`);
      }
    }
    return { raws, warnings, errors };
  },
  parse(raws) {
    const warnings: string[] = [];
    const byNo = new Map<number, NvrChannelRaw>();

    // فهرست دوربین‌ها (JSON-ish: rows=[{...}] یا table=[...])
    const camText = raws["cameras"] || "";
    const camJsonMatch = camText.match(/(rows|table|data)\s*=\s*(\[[\s\S]*\])\s*;?\s*$/m) || camText.match(/(\[[\s\S]*\])/);
    if (camJsonMatch) {
      try {
        const arr = JSON.parse(camJsonMatch[2] || camJsonMatch[1]) as Record<string, unknown>[];
        for (const r of arr) {
          const no = Number(r["ChannelNum"] ?? r["channel"] ?? r["ChannelNo"] ?? r["id"]);
          if (!Number.isFinite(no) || no <= 0) continue;
          const row = byNo.get(no) || { channelNo: no };
          const ip = normIp(String(r["IP"] ?? r["ip"] ?? r["Address"] ?? ""));
          if (ip) row.ip = ip;
          const onRaw = String(r["OnLine"] ?? r["online"] ?? r["Online"] ?? "").toLowerCase();
          if (onRaw === "true" || onRaw === "1" || onRaw === "online") row.online = "online";
          else if (onRaw === "false" || onRaw === "0" || onRaw === "offline") row.online = "offline";
          const name = String(r["Name"] ?? r["name"] ?? "").trim();
          if (name) row.label = name;
          byNo.set(no, row);
        }
      } catch {
        warnings.push("بخش فهرست دوربین‌ها JSON معتبر نبود — فقط برچسب‌ها خوانده شد");
      }
    }

    // برچسب کانال‌ها — فرمت: table.ChannelTitle[0]="لابی"
    const titleText = raws["titles"] || "";
    for (const m of titleText.matchAll(/table\.ChannelTitle\[(\d+)\]\s*=\s*"([^"]*)"/g)) {
      const no = Number(m[1]) + 1; // ایندکس صفر-پایه
      const row = byNo.get(no) || { channelNo: no };
      if (m[2].trim()) row.label = m[2].trim();
      byNo.set(no, row);
    }

    // پیکربندی ضبط — فرمت: table.Record[0][0].Mode="Auto" (ایندکس اول = کانال - ۱)
    const recText = raws["record"] || "";
    for (const m of recText.matchAll(/table\.Record\[(\d+)\]\[\d+\]\.Mode\s*=\s*"([^"]*)"/g)) {
      const no = Number(m[1]) + 1;
      const mode = m[2].toLowerCase();
      const row = byNo.get(no) || { channelNo: no };
      row.recording = mode === "off" || mode === "none" ? "inactive" : mode ? "active" : "unknown";
      byNo.set(no, row);
    }

    const channels = [...byNo.values()].sort((a, b) => a.channelNo - b.channelNo);
    if (!channels.length) warnings.push("هیچ کانالی از خروجی استخراج نشد — قالب API ممکن است در این فرم‌ور متفاوت باشد؛ خروجی خام را بررسی و به‌صورت دستی وارد کنید");
    return { channels, warnings };
  },
};

// ─── پلاگین ۲: Hikvision ISAPI ─────────────────────────────────────

export const HIKVISION_ISAPI: NvrPlugin = {
  id: "hikvision-isapi",
  label: "Hikvision ISAPI",
  vendor: "Hikvision",
  version: "1.0.0",
  rtypes: ["NVR", "DVR", "Hybrid"],
  apiPath: "/ISAPI/ContentMgmt/InputProxy/channels",
  notes:
    "ISAPI فقط‌خواندنی: فهرست کانال‌های ورودی و وضعیت آنلاین هر کانال. وضعیت ضبط از RecordingControl هر کانال پرسیده می‌شود (سقف: channelCount). احراز هویت Digest پشتیبانی می‌شود؛ رمز ذخیره نمی‌شود.",
  readSafe: true,
  endpoints: [
    { key: "channels", path: "/ISAPI/ContentMgmt/InputProxy/channels", what: "فهرست کانال‌های ورودی با IP و نام دوربین" },
    { key: "status", path: "/ISAPI/ContentMgmt/InputProxy/channels/status", what: "وضعیت آنلاین هر کانال" },
    { key: "recording", path: "/ISAPI/ContentMgmt/RecordingControl?channel=N&status", what: "وضعیت ضبط هر کانال (تک‌کاناله)" },
  ],
  async fetch(ctx) {
    const warnings: string[] = [], errors: string[] = [];
    const raws: NvrRaws = {};
    const base = `http://${ctx.ip}:${ctx.httpPort || 80}`;
    try {
      let res = await httpGetWithAuth(`${base}/ISAPI/ContentMgmt/InputProxy/channels`, ctx);
      if (res.status === 401) {
        errors.push("احراز هویت ISAPI رد شد — حساب فقط‌خواندنی لازم است");
        return { raws, warnings, errors };
      }
      if (res.status !== 200) {
        errors.push(`کانال‌ها → HTTP ${res.status}`);
        return { raws, warnings, errors };
      }
      raws["channels"] = res.text;

      const st = await httpGetWithAuth(`${base}/ISAPI/ContentMgmt/InputProxy/channels/status`, ctx);
      if (st.status === 200) raws["status"] = st.text;
      else warnings.push(`وضعیت کانال‌ها → HTTP ${st.status}`);

      // وضعیت ضبط تک‌کاناله — حداکثر channelCount (پیش‌فرض 16) درخواست، فاصله‌دار
      const maxCh = Math.min(ctx.channelCount || 16, 32);
      const recParts: string[] = [];
      let authFailed = false;
      for (let ch = 1; ch <= maxCh; ch++) {
        try {
          const r = await httpGetWithAuth(`${base}/ISAPI/ContentMgmt/RecordingControl?channel=${ch}&status`, ctx);
          if (r.status === 200) recParts.push(r.text);
          else if (r.status === 401) { authFailed = true; break; }
        } catch { /* کانال بعدی */ }
      }
      if (recParts.length) raws["recording"] = recParts.join("\n");
      else if (authFailed) warnings.push("استعلام وضعیت ضبط نیازمند احراز هویت بود — وضعیت ضبط «نامشخص» می‌ماند (حدس زده نمی‌شود)");
    } catch (e) {
      errors.push((e as Error).message);
    }
    return { raws, warnings, errors };
  },
  parse(raws) {
    const warnings: string[] = [];
    const byNo = new Map<number, NvrChannelRaw>();

    // کانال‌ها — XML
    const chText = raws["channels"] || "";
    const blocks = chText.match(/<InputProxyChannel>[\s\S]*?<\/InputProxyChannel>/g) || [];
    for (const b of blocks) {
      const id = Number(b.match(/<id>(\d+)<\/id>/)?.[1]);
      if (!Number.isFinite(id)) continue;
      const row: NvrChannelRaw = { channelNo: id };
      const src = b.match(/<sourceInputPortDescriptor>[\s\S]*?<\/sourceInputPortDescriptor>/)?.[0] || "";
      const ip = normIp(src.match(/<address>([\s\S]*?)<\/address>/)?.[1] || "");
      if (ip) row.ip = ip;
      const name = src.match(/<proxyName>([\s\S]*?)<\/proxyName>/)?.[1]?.trim();
      if (name) row.label = name;
      byNo.set(id, row);
    }
    if (!blocks.length) warnings.push("بلوک InputProxyChannel در پاسخ یافت نشد");

    // وضعیت آنلاین — XML
    const stText = raws["status"] || "";
    for (const b of (stText.match(/<InputProxyChannelStatus>[\s\S]*?<\/InputProxyChannelStatus>/g) || [])) {
      const id = Number(b.match(/<sourceInputPortDescriptor>[\s\S]*?<id>(\d+)<\/id>/)?.[1] || b.match(/<id>(\d+)<\/id>/)?.[1]);
      if (!Number.isFinite(id)) continue;
      const online = /<online>\s*(true|1)\s*<\/online>/i.test(b) ? "online" : /<online>\s*(false|0)\s*<\/online>/i.test(b) ? "offline" : "unknown";
      const row = byNo.get(id) || { channelNo: id };
      row.online = online as NvrChannelRaw["online"];
      byNo.set(id, row);
    }

    // وضعیت ضبط — XML های متعدد RecordingStatus
    const recText = raws["recording"] || "";
    for (const b of (recText.match(/<RecordingStatus[^>]*>[\s\S]*?<\/RecordingStatus>/g) || [])) {
      const ch = Number(b.match(/channel="?(\d+)"?/)?.[1] || b.match(/<channel>(\d+)<\/channel>/)?.[1]);
      if (!Number.isFinite(ch)) continue;
      const active = /<recording[^>]*>\s*(true|1|Active|active)\s*<\/recording>/i.test(b) || /status="?active"?/i.test(b);
      const row = byNo.get(ch) || { channelNo: ch };
      row.recording = active ? "active" : "inactive";
      byNo.set(ch, row);
    }

    const channels = [...byNo.values()].sort((a, b) => a.channelNo - b.channelNo);
    if (!channels.length) warnings.push("هیچ کانالی از پاسخ ISAPI استخراج نشد");
    return { channels, warnings };
  },
};

// ─── پلاگین ۳: ONVIF عمومی ─────────────────────────────────────────

export const ONVIF_GENERIC: NvrPlugin = {
  id: "onvif-generic",
  label: "ONVIF عمومی (هر سازنده سازگار)",
  vendor: "عمومی",
  version: "1.1.0",
  rtypes: ["NVR", "DVR", "Hybrid"],
  apiPath: "/onvif/device_service (GetVideoSources / GetProfiles)",
  notes:
    "پلاگین استاندارد ONVIF: تعداد و توکن کانال‌ها از GetVideoSources و نام پروفایل‌ها از GetProfiles. محدودیت صادقانه: ONVIF استاندارد آدرس IP هر کانال را در GetVideoSources نمی‌دهد؛ تطبیق کانال↔دوربین از این مسیر با اطمینان «محدود» ثبت می‌شود.",
  readSafe: true,
  endpoints: [
    { key: "videosources", path: "POST /onvif/device_service — GetVideoSources", what: "تعداد و توکن ورودی‌های ویدئویی" },
    { key: "profiles", path: "POST /onvif/device_service — GetProfiles", what: "پروفایل‌های مدیا" },
  ],
  async fetch(ctx) {
    const warnings: string[] = [], errors: string[] = [];
    const raws: NvrRaws = {};
    const url = `http://${ctx.ip}:${ctx.httpPort || 80}/onvif/device_service`;
    const envelope = (body: string) =>
      `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>${body}</s:Body></s:Envelope>`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ctx.timeoutMs ?? 5000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
        body: envelope(`<trt:GetVideoSources xmlns:trt="http://www.onvif.org/ver10/media/wsdl"/>`),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      raws["videosources"] = await res.text();
      if (res.status !== 200) warnings.push(`GetVideoSources → HTTP ${res.status}`);

      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), ctx.timeoutMs ?? 5000);
      const res2 = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
        body: envelope(`<trt:GetProfiles xmlns:trt="http://www.onvif.org/ver10/media/wsdl"/>`),
        signal: ctrl2.signal,
      });
      clearTimeout(t2);
      raws["profiles"] = await res2.text();
    } catch (e) {
      errors.push((e as Error).message);
    }
    return { raws, warnings, errors };
  },
  parse(raws) {
    const warnings: string[] = [];
    const channels: NvrChannelRaw[] = [];
    const vsText = raws["videosources"] || "";
    const blocks = vsText.match(/<[^>]*:?VideoSource\s+token="([^"]+)"[^>]*>/g) || [];
    blocks.forEach((b, i) => {
      const token = b.match(/token="([^"]+)"/)?.[1] || `vs-${i + 1}`;
      channels.push({ channelNo: i + 1, label: token });
    });
    if (!channels.length) warnings.push("VideoSourceی در پاسخ ONVIF یافت نشد");
    return { channels, warnings };
  },
};

// ─── ثبت پلاگین‌ها ─────────────────────────────────────────────────

export const NVR_PLUGINS: NvrPlugin[] = [DAHUA_HTTP_API, HIKVISION_ISAPI, ONVIF_GENERIC];

export function findNvrPlugin(id: string): NvrPlugin | undefined {
  return NVR_PLUGINS.find((p) => p.id === id);
}

export function pluginSummaries() {
  return NVR_PLUGINS.map((p) => ({
    id: p.id, label: p.label, vendor: p.vendor, version: p.version,
    rtypes: p.rtypes, apiPath: p.apiPath, notes: p.notes, endpoints: p.endpoints,
  }));
}
