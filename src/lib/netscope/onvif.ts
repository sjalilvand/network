// NetScope — فاز ۳: ماژول ONVIF (کشف WS-Discovery و استعلام مشخصات دستگاه)
// ─────────────────────────────────────────────────────────────────────────────
// قواعد امنیتی (سند ۱۲):
//  - همه درخواست‌ها فقط‌خواندنی‌اند (Probe / GetDeviceInformation / GetSystemDateAndTime)
//  - اطلاعات ورود فقط در حافظه همین درخواست استفاده و هرگز ذخیره نمی‌شود
//  - Timeout کوتاه و بدون retry تهاجمی برای کم‌فشار ماندن شبکه
//  - پاسخ 401 «نیاز به اطلاعات ورود» است — تلاش برای دور زدن انجام نمی‌شود
// هیچ محتوای تصویری دریافت نمی‌شود (حفاظت از محتوا — سند ۶.۵)

import dgram from "dgram";
import crypto from "crypto";

// ─── WS-Discovery ──────────────────────────────────────────────────

const WS_DISCOVERY_ADDR = "239.255.255.250";
const WS_DISCOVERY_PORT = 3702;

export interface OnvifDiscovered {
  xaddr: string;           // مثال: http://10.10.0.41:80/onvif/device_service
  ip: string;
  port: number;
  scopes: string[];        // اسکوپ‌های اعلام‌شده دستگاه
  name?: string;           // از اسکوپ name
  hardware?: string;       // از اسکوپ Hardware
  mac?: string;            // از اسکوپ MAC — برخی سازندگان اعلام می‌کنند
  profiles: string[];      // مثال: Profile_Streaming
  types: string[];         // مثال: NetworkVideoTransmitter
  endpointAddress?: string;
  raw: string;             // پاسخ خام — برای شفافیت کامل
}

function probeMessage(): string {
  const uuid = crypto.randomUUID();
  return `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>urn:uuid:${uuid}</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;
}

// تجزیه‌گر پاسخ ProbeMatch — برای پاسخ واقعی UDP و داده شبیه‌سازی یکسان است
export function parseProbeMatch(rawXml: string): OnvifDiscovered | null {
  // برخی دستگاه‌ها چند ProbeMatch در یک پاسخ می‌فرستند — فقط اولین را می‌گیریم
  const block = rawXml.match(/<d:ProbeMatch>[\s\S]*?<\/d:ProbeMatch>|<s:ProbeMatch>[\s\S]*?<\/s:ProbeMatch>/)?.[0] || rawXml;

  const tag = (name: string): string | undefined => {
    const m = block.match(new RegExp(`<[^>]*:?${name}[^>]*>([^<]*)<`, "i"));
    return m ? m[1].trim() : undefined;
  };

  const xaddr = tag("XAddrs");
  if (!xaddr) return null;
  let url = xaddr.split(/\s+/)[0]; // ممکن است چند آدرس با فاصله باشد
  if (!/^https?:\/\//i.test(url)) {
    // برخی دستگاه‌ها scheme را حذف می‌کنند
    url = `http://${url}`;
  }
  let ip = "", port = 80;
  try {
    const u = new URL(url);
    ip = u.hostname;
    port = Number(u.port) || (u.protocol === "https:" ? 443 : 80);
  } catch {
    return null;
  }

  const scopesStr = tag("Scopes") || "";
  const scopes = scopesStr.split(/\s+/).filter(Boolean);
  const scopeVal = (needle: string): string | undefined => {
    for (const s of scopes) {
      const m = s.match(new RegExp(`${needle}/([^/]+)/?$`, "i"));
      if (m) return decodeURIComponent(m[1]);
    }
    return undefined;
  };

  const macRaw = scopeVal("mac") || scopeVal("MacAddress");
  let mac: string | undefined;
  if (macRaw) {
    const hex = macRaw.replace(/[^0-9a-fA-F]/g, "");
    if (hex.length === 12) mac = hex.toUpperCase().match(/../g)!.join(":");
  }

  const types: string[] = [];
  const typesRaw = tag("Types") || "";
  for (const t of typesRaw.split(/\s+/)) {
    const ns = t.split(":").pop() || t;
    if (ns) types.push(ns);
  }
  const profiles = scopes.filter((s) => /Profile\/(\w+)/i.test(s)).map((s) => s.match(/Profile\/(\w+)/i)![1]);

  return {
    xaddr: url, ip, port, scopes,
    name: scopeVal("name"), hardware: scopeVal("hardware"), mac,
    profiles, types,
    endpointAddress: tag("Address"),
    raw: rawXml,
  };
}

// همه ProbeMatchهای یک پاسخ (برای پاسخ‌های ترکیبی)
export function parseProbeMatches(rawXml: string): OnvifDiscovered[] {
  const blocks = rawXml.match(/<(?:d|s):ProbeMatch>[\s\S]*?<\/(?:d|s):ProbeMatch>/g);
  if (!blocks || !blocks.length) {
    const one = parseProbeMatch(rawXml);
    return one ? [one] : [];
  }
  return blocks.map((b) => parseProbeMatch(b)).filter((x): x is OnvifDiscovered => !!x);
}

// کشف واقعی با UDP مالتی‌کست — روی شبکه واقعی کاربر کار می‌کند
export function onvifWsDiscover(opts?: { timeoutMs?: number; bindIp?: string }): Promise<{
  devices: OnvifDiscovered[]; durationMs: number; note: string;
}> {
  const timeoutMs = opts?.timeoutMs ?? 4500;
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const devices = new Map<string, OnvifDiscovered>();
    let finished = false;
    const started = Date.now();

    const finish = (note: string) => {
      if (finished) return;
      finished = true;
      try { sock.close(); } catch { /* */ }
      resolve({ devices: [...devices.values()], durationMs: Date.now() - started, note });
    };

    sock.on("error", (e) => finish(`خطای سوکت: ${e.message} — WS-Discovery ممکن است در این شبکه مسدود باشد`));
    sock.on("message", (buf) => {
      const txt = buf.toString("utf8");
      if (!/ProbeMatch/i.test(txt) && !/XAddrs/i.test(txt)) return;
      for (const d of parseProbeMatches(txt)) {
        devices.set(`${d.ip}:${d.port}`, d); // حذف تکراری بر اساس آدرس
      }
    });

    sock.bind(() => {
      try {
        const msg = Buffer.from(probeMessage());
        sock.addMembership(WS_DISCOVERY_ADDR);
        sock.setMulticastTTL(2);
        sock.send(msg, WS_DISCOVERY_PORT, WS_DISCOVERY_ADDR);
        // ارسال دوم پس از ۱.۵ ثانیه — برخی دستگاه‌ها پاسخ اول را از دست می‌دهند
        setTimeout(() => {
          if (!finished) {
            try { sock.send(msg, WS_DISCOVERY_PORT, WS_DISCOVERY_ADDR); } catch { /* */ }
          }
        }, 1500);
      } catch (e) {
        finish(`خطای ارسال Probe: ${(e as Error).message}`);
        return;
      }
      setTimeout(() => {
        finish(devices.size
          ? "کشف ONVIF کامل شد"
          : "هیچ دستگاه ONVIF پاسخ نداد — ممکن است دوربین‌ها در سگمنت دیگری باشند، مالتی‌کست مسدود باشد یا دستگاهی ONVIF نداشته باشد");
      }, timeoutMs);
    });
  });
}

// ─── استعلام مشخصات دستگاه (GetDeviceInformation) ──────────────────

export interface OnvifDeviceInfo {
  ok: boolean;
  state: "onvif-ok" | "onvif-fail" | "needs-auth";
  manufacturer?: string;
  model?: string;
  firmware?: string;
  serial?: string;
  hardwareId?: string;
  error?: string;
  raw?: string;
}

function soapXml(bodyContent: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>${bodyContent}</s:Body>
</s:Envelope>`;
}

// تجزیه فیلدهای GetDeviceInformationResponse
export function parseDeviceInfoXml(xml: string): Partial<OnvifDeviceInfo> {
  const field = (name: string): string | undefined => {
    const m = xml.match(new RegExp(`<[^>]*:?${name}[^>]*>([^<]*)<`, "i"));
    return m ? m[1].trim() : undefined;
  };
  return {
    manufacturer: field("Manufacturer"),
    model: field("Model"),
    firmware: field("FirmwareVersion"),
    serial: field("SerialNumber"),
    hardwareId: field("HardwareId"),
  };
}

async function soapPost(url: string, body: string, opts?: {
  username?: string; password?: string; timeoutMs?: number;
}): Promise<{ status: number; text: string; wwwAuthenticate?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 4000);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/soap+xml; charset=utf-8",
    };
    if (opts?.username) {
      // تلاش اول بدون هدر auth تا WWW-Authenticate گرفته شود؛ درخواست مجدد در سطح بالا انجام می‌شود
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal,
      redirect: "manual",
    });
    return { status: res.status, text: await res.text(), wwwAuthenticate: res.headers.get("www-authenticate") || undefined };
  } finally {
    clearTimeout(timer);
  }
}

// احراز هویت Digest مینیمال (فقط برای GET/POST فقط‌خواندنی) — رمز در حافظه می‌ماند
function digestHeader(wwwAuth: string, method: string, uri: string, username: string, password: string): string {
  const parse = (key: string): string => wwwAuth.match(new RegExp(`${key}="?([^",]+)"?`))?.[1] || "";
  const realm = parse("realm"), nonce = parse("nonce"), qopRaw = parse("qop");
  const qop = qopRaw.split(",")[0]?.trim() || "auth";
  const cnonce = crypto.randomBytes(8).toString("hex");
  const nc = "00000001";
  const ha1 = crypto.createHash("md5").update(`${username}:${realm}:${password}`).digest("hex");
  const ha2 = crypto.createHash("md5").update(`${method}:${uri}`).digest("hex");
  const response = crypto.createHash("md5").update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest("hex");
  return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", algorithm=MD5`;
}

// استعلام مشخصات — بدون رمز شروع می‌کند؛ 401 یعنی «نیاز به اطلاعات ورود» (دور زدن ممنوع)
export async function onvifGetDeviceInfo(xaddr: string, opts?: {
  username?: string; password?: string; timeoutMs?: number;
}): Promise<OnvifDeviceInfo> {
  const uriPath = (() => { try { return new URL(xaddr).pathname || "/onvif/device_service"; } catch { return "/onvif/device_service"; } })();
  const body = soapXml(`<tds:GetDeviceInformation xmlns:tds="http://www.onvif.org/ver10/device/wsdl"/>`);

  try {
    let res = await soapPost(xaddr, body, { timeoutMs: opts?.timeoutMs });
    if (res.status === 401 && res.wwwAuthenticate && opts?.username && opts?.password) {
      const auth = digestHeader(res.wwwAuthenticate, "POST", uriPath, opts.username, opts.password);
      res = await soapPost(xaddr, body, { timeoutMs: opts?.timeoutMs, username: opts.username, password: opts.password });
      // ارسال مجدد با هدر Digest
      if (res.status === 401) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 4000);
          const retry = await fetch(xaddr, {
            method: "POST",
            headers: { "Content-Type": "application/soap+xml; charset=utf-8", Authorization: auth },
            body, signal: ctrl.signal,
          });
          clearTimeout(timer);
          res = { status: retry.status, text: await retry.text(), wwwAuthenticate: retry.headers.get("www-authenticate") || undefined };
        } catch { /* خطای شبکه در پایین مدیریت می‌شود */ }
      }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, state: "needs-auth", error: "دستگاه احراز هویت می‌خواهد — اطلاعات ورود فقط‌خواندنی از فرم امن وارد شود (سند ۱۲)" };
    }
    if (res.status !== 200) {
      return { ok: false, state: "onvif-fail", error: `پاسخ HTTP ${res.status}` };
    }
    if (!/GetDeviceInformationResponse/i.test(res.text)) {
      return { ok: false, state: "onvif-fail", error: "پاسخ ONVIF معتبر نبود" };
    }
    const fields = parseDeviceInfoXml(res.text);
    return { ok: true, state: "onvif-ok", ...fields, raw: res.text.slice(0, 2000) };
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "Timeout — دستگاه پاسخ نداد" : (e as Error).message;
    return { ok: false, state: "onvif-fail", error: msg };
  }
}

// پروب سبک سرویس (GetSystemDateAndTime — معمولاً بدون رمز پاسخ می‌دهد)
export async function onvifProbeService(ip: string, port: number, opts?: { timeoutMs?: number }): Promise<OnvifDeviceInfo> {
  const paths = ["/onvif/device_service", "/onvif/device_service/", "/onvif.cgi"];
  for (const p of paths) {
    const url = `http://${ip}:${port}${p}`;
    const body = soapXml(`<tds:GetSystemDateAndTime xmlns:tds="http://www.onvif.org/ver10/device/wsdl"/>`);
    try {
      const res = await soapPost(url, body, { timeoutMs: opts?.timeoutMs ?? 2500 });
      if (res.status === 200 && /SystemDateAndTime/i.test(res.text)) {
        return { ok: true, state: "onvif-ok" };
      }
      if (res.status === 401) {
        return { ok: false, state: "needs-auth", error: "سرویس ONVIF پاسخ داد ولی احراز هویت می‌خواهد" };
      }
      // مسیر بعدی را امتحان کن
    } catch { /* مسیر بعدی */ }
  }
  return { ok: false, state: "onvif-fail", error: "سرویس ONVIF در پورت‌های رایج پاسخ نداد" };
}

// دریافت پروفایل‌های مدیا (GetProfiles) — فقط نام و مشخصات، بدون محتوا
export async function onvifGetProfiles(xaddr: string, opts?: { timeoutMs?: number }): Promise<{ ok: boolean; profiles: { token: string; name: string }[]; error?: string }> {
  const body = soapXml(`<trt:GetProfiles xmlns:trt="http://www.onvif.org/ver10/media/wsdl"/>`);
  try {
    const res = await soapPost(xaddr, body, { timeoutMs: opts?.timeoutMs ?? 4000 });
    if (res.status === 401) return { ok: false, profiles: [], error: "needs-auth" };
    if (res.status !== 200) return { ok: false, profiles: [], error: `HTTP ${res.status}` };
    const profiles: { token: string; name: string }[] = [];
    const blocks = res.text.match(/<[^>]*:?Profiles [^>]*>[\s\S]*?<\/[^>]*:?Profiles>/g) || [];
    for (const b of blocks) {
      const token = b.match(/token="([^"]+)"/)?.[1] || "";
      const name = b.match(new RegExp(`<[^>]*:?Name[^>]*>([^<]*)<`, "i"))?.[1] || token;
      if (token) profiles.push({ token, name });
    }
    return { ok: profiles.length > 0, profiles };
  } catch (e) {
    return { ok: false, profiles: [], error: (e as Error).message };
  }
}
