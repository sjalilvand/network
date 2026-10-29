// NetScope — مفسر خروجی فرمان (سند بخش ۳.۲ و ۳.۳)
// پارسرهای واقعی برای فرمت‌های رایج + اعتبارسنجی + گزارش بخش‌های ناشناخته
// الزام سند: خروجی JSON بر متن آزاد ترجیح داده شود؛ موارد ناشناخته اعلام شوند.

import type { ParseFormat, ParseResult, ParsedInterface, ParsedNeighbor, ParsedRoute } from "./types";

const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

function isMac(s: string): boolean { return MAC_RE.test(s.trim()); }
function isV4(s: string): boolean {
  if (!IPV4_RE.test(s.trim())) return false;
  return s.split(".").every((o) => { const n = parseInt(o, 10); return n >= 0 && n <= 255; });
}

const FORMAT_LABELS: Record<ParseFormat, string> = {
  "ipconfig-all": "ipconfig /all (ویندوز)",
  "ip-json-addr": "ip -j address show (لینوکس)",
  "ip-json-route": "ip -j route show (لینوکس)",
  "ip-json-neigh": "ip -j neigh show (لینوکس)",
  "arp-a": "arp -a (ویندوز)",
  "arp-linux": "arp -an (لینوکس)",
  "get-netadapter": "Get-NetAdapter (ویندوز)",
  "unknown": "ناشناخته",
};

function emptyResult(format: ParseFormat): ParseResult {
  return {
    format, formatLabel: FORMAT_LABELS[format], success: false,
    interfaces: [], neighbors: [], routes: [], dnsServers: [],
    unknownSections: [], warnings: [], errors: [],
  };
}

// ─── تشخیص خودکار فرمت ─────────────────────────────────────────────
export function detectFormat(text: string): ParseFormat {
  const t = text.trim();
  if (!t) return "unknown";
  if (t.startsWith("Windows IP Configuration") || /以太网|Ethernet adapter|Wireless LAN adapter|PPP adapter/i.test(t) && /DHCP Server|Default Gateway|Subnet Mask|Physical Address/i.test(t)) return "ipconfig-all";
  if (t.includes("InterfaceList") || /ipconfig.*\/all/i.test(t.slice(0, 100))) return "ipconfig-all";
  // JSON: ip -j
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) {
        if (arr.length && ("ifname" in arr[0] || "operstate" in arr[0])) return "ip-json-addr";
        if (arr.length && ("dst" in arr[0] && "gateway" in (arr[0] as object))) return "ip-json-route";
        if (arr.length && ("dst" in arr[0] && ("lladdr" in arr[0] || "dev" in arr[0]) && !("gateway" in (arr[0] as object)))) {
          // تشخیص neigh: dst+lladdr+dev بدون gateway
          const sample = arr[0] as Record<string, unknown>;
          if ("lladdr" in sample) return "ip-json-neigh";
          return "ip-json-route";
        }
      }
    } catch { /* متن آزاد */ }
  }
  if (/^Internet Address\s+Physical Address/m.test(t) || /^Interface: \d+\.\d+\.\d+\.\d+/m.test(t)) return "arp-a";
  if (/^\?\s*\(\d+\.\d+\.\d+\.\d+\)\s+at\s+[0-9a-fA-F:]{17}/m.test(t)) return "arp-linux";
  if (/^[A-Z].*\d+\s+(Mbps|Gbps|up|disconnected)/im.test(t) && /LinkLocalAddress|ifIndex|MacAddress|InterfaceDescription|Status|LinkSpeed/i.test(t) && (t.includes("MacAddress") || t.includes("ifIndex"))) return "get-netadapter";
  return "unknown";
}

// ─── ipconfig /all (ویندوز) ────────────────────────────────────────
export function parseIpconfigAll(text: string): ParseResult {
  const r = emptyResult("ipconfig-all");
  const lines = text.split(/\r?\n/);
  const adapterHeaders = /^(.+?)\s*(adapter|تطبیق‌دهنده)\s*(.+?):\s*$/;
  // هدر فارسی ویندوز هم ممکن است؛ الگوی اصلی: «Name adapter Type:» یا خطی که با «:» تمام شود و شامل adapter باشد
  let cur: ParsedInterface | null = null;
  let curSection = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const headerMatch = line.match(adapterHeaders);
    if (headerMatch && (line.includes("adapter") || line.includes("تطبیق‌دهنده")) && line.endsWith(":")) {
      cur = { name: line.replace(/:$/, "").replace(/\s*adapter.*$/, "").trim(), ips: [] };
      r.interfaces.push(cur);
      curSection = "header";
      continue;
    }
    if (!cur) {
      if (/^Windows IP Configuration/i.test(line) || /^$/ .test(line)) continue;
      // متن خارج از آداپتور — ناشناخته
      if (line.length > 3) r.unknownSections.push(line);
      continue;
    }
    const kv = line.match(/^(.+?)\s*[.:]\s*(.+)$/);
    if (!kv) { r.unknownSections.push(line); continue; }
    const key = kv[1].trim().toLowerCase();
    const val = kv[2].trim();
    curSection = key;
    if (/physical address|آدرس فیزیکی/.test(key)) {
      const m = val.match(/[0-9A-Fa-f]{2}([-:]([0-9A-Fa-f]{2})){5}/);
      if (m) cur.mac = m[0].replace(/-/g, ":").toUpperCase();
      else r.warnings.push(`MAC قابل تفسیر نبود: ${val}`);
    } else if (/dhcp enabled|dhcp فعال/.test(key)) {
      cur.dhcpEnabled = /yes|بله/i.test(val);
    } else if (/ipv4 address|آدرس ipv4/.test(key)) {
      const m = val.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (m) cur.ips.push({ address: m[1], family: "IPv4" });
    } else if (/subnet mask|ماسک زیرشبکه/.test(key)) {
      const last = cur.ips[cur.ips.length - 1];
      if (last) last.prefix = maskToPrefix(val);
    } else if (/default gateway|دروازه پیش‌فرض/.test(key)) {
      const m = val.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (m) cur.gateway = m[1];
    } else if (/dns servers|سرورهای dns/.test(key)) {
      const m = val.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (m) { cur.dnsServers = cur.dnsServers || []; cur.dnsServers.push(m[1]); if (!r.dnsServers.includes(m[1])) r.dnsServers.push(m[1]); }
    } else if (/lease obtained|زمان دریافت/.test(key)) {
      // ثبت نمی‌شود — فقط اعتبار
    } else if (!/connection-specific|پسوند dns|description|توضیح/.test(key)) {
      r.unknownSections.push(line);
    }
  }
  r.success = r.interfaces.length > 0;
  if (!r.success) r.errors.push("هیچ آداپتوری قابل شناسایی نبود. مطمئن شوید خروجی کامل «ipconfig /all» کپی شده است.");
  if (r.unknownSections.length) r.warnings.push(`${r.unknownSections.length} خط ناشناخته نادیده گرفته شد (اعلام مطابق معیار پذیرش).`);
  return r;
}

function maskToPrefix(mask: string): number | undefined {
  if (!isV4(mask)) return undefined;
  return mask.split(".").reduce((acc, o) => acc + ((parseInt(o, 10) >>> 0).toString(2).match(/1/g) || []).length, 0);
}

// ─── ip -j address show (لینوکس) ───────────────────────────────────
interface IpJsonAddrIface {
  ifname?: string; operstate?: string; mtu?: number; address?: string;
  addr_info?: { local?: string; prefixlen?: number; family?: string }[];
}

export function parseIpJsonAddr(text: string): ParseResult {
  const r = emptyResult("ip-json-addr");
  try {
    const arr: IpJsonAddrIface[] = JSON.parse(text.trim());
    for (const it of arr) {
      const iface: ParsedInterface = { name: it.ifname || "unknown", ips: [], status: it.operstate, mtu: it.mtu, mac: it.address?.toUpperCase().replace(/-/g, ":") };
      for (const ai of it.addr_info || []) {
        if (ai.local) iface.ips.push({ address: ai.local, prefix: ai.prefixlen, family: ai.family === "inet6" ? "IPv6" : "IPv4" });
      }
      r.interfaces.push(iface);
    }
    r.success = r.interfaces.length > 0;
  } catch (e) {
    r.errors.push("JSON نامعتبر: خروجی «ip -j address show» باید آرایه JSON باشد. خروجی متن آزاد پشتیبانی نمی‌شود (الزام ترجیح JSON).");
  }
  return r;
}

// ─── ip -j route show (لینوکس) ─────────────────────────────────────
export function parseIpJsonRoute(text: string): ParseResult {
  const r = emptyResult("ip-json-route");
  try {
    const arr: Record<string, unknown>[] = JSON.parse(text.trim());
    for (const it of arr) {
      r.routes.push({
        destination: String(it.dst || "unknown"),
        gateway: it.gateway ? String(it.gateway) : undefined,
        interface: it.dev ? String(it.dev) : undefined,
        metric: it.metric ? Number(it.metric) : undefined,
      });
    }
    r.success = r.routes.length > 0;
  } catch {
    r.errors.push("JSON نامعتبر: خروجی «ip -j route show» باید آرایه JSON باشد.");
  }
  return r;
}

// ─── ip -j neigh show (لینوکس) ─────────────────────────────────────
export function parseIpJsonNeigh(text: string): ParseResult {
  const r = emptyResult("ip-json-neigh");
  try {
    const arr: Record<string, unknown>[] = JSON.parse(text.trim());
    for (const it of arr) {
      const ip = String(it.dst || "");
      const mac = it.lladdr ? String(it.lladdr) : "";
      if (!ip) continue;
      if (mac && !isMac(mac)) { r.warnings.push(`MAC نامعتبر برای ${ip}: ${mac}`); continue; }
      r.neighbors.push({ ip, mac: mac.toUpperCase(), interface: it.dev ? String(it.dev) : undefined, state: it.state ? String(it.state) : undefined });
    }
    r.success = r.neighbors.length > 0;
    if (r.success) r.warnings.push("هشدار سند: جدول همسایه‌ها فهرست کامل دستگاه‌های شبکه نیست؛ ممکن است شامل رکوردهای قدیمی باشد.");
  } catch {
    r.errors.push("JSON نامعتبر: خروجی «ip -j neigh show» باید آرایه JSON باشد.");
  }
  return r;
}

// ─── arp -a (ویندوز) ───────────────────────────────────────────────
export function parseArpWindows(text: string): ParseResult {
  const r = emptyResult("arp-a");
  const ifaceRe = /^Interface:\s*(\d{1,3}(?:\.\d{1,3}){3})/im;
  const entryRe = /^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F-]{17})\s+(\S+)/;
  let currentIface: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const ifaceM = raw.match(ifaceRe);
    if (ifaceM) { currentIface = ifaceM[1]; continue; }
    const e = raw.match(entryRe);
    if (e) {
      const mac = e[2].replace(/-/g, ":").toUpperCase();
      r.neighbors.push({ ip: e[1], mac, interface: currentIface, state: e[3] });
      if (e[3].toLowerCase() === "invalid") r.warnings.push(`رکورد نامعتبر (invalid) برای ${e[1]} نادیده گرفته شد`);
    } else if (raw.trim() && !/Internet Address|Physical Address|Type:/i.test(raw)) {
      r.unknownSections.push(raw.trim());
    }
  }
  r.success = r.neighbors.length > 0;
  if (r.success) r.warnings.push("هشدار سند: این جدول فهرست کامل دستگاه‌های شبکه نیست و ممکن است رکوردهای قدیمی (Stale) داشته باشد.");
  return r;
}

// ─── arp -an (لینوکس) ──────────────────────────────────────────────
export function parseArpLinux(text: string): ParseResult {
  const r = emptyResult("arp-linux");
  const lineRe = /(\d{1,3}(?:\.\d{1,3}){3})\s+0x\S+\s+0x\S+\s+([0-9a-fA-F:]{17})\s+(\S+)/;
  const incompleteRe = /(\d{1,3}(?:\.\d{1,3}){3})\s+0x\S+\s+0x\S+\s+<incomplete>/;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(lineRe);
    if (m) { r.neighbors.push({ ip: m[1], mac: m[2].toUpperCase(), interface: m[3], state: "REACHABLE" }); continue; }
    const inc = raw.match(incompleteRe);
    if (inc) { r.warnings.push(`رکورد ناکامل (incomplete) برای ${inc[1]} — دستگاه پاسخ نداده است`); continue; }
    if (raw.trim() && !/^Address\s+HWtype/i.test(raw)) r.unknownSections.push(raw.trim());
  }
  r.success = r.neighbors.length > 0;
  if (r.success) r.warnings.push("هشدار سند: این جدول فهرست کامل دستگاه‌های شبکه نیست.");
  return r;
}

// ─── Get-NetAdapter (جدول PowerShell) ──────────────────────────────
// فرمت جدول: Name InterfaceDescription ifIndex Status MacAddress LinkSpeed
export function parseGetNetAdapter(text: string): ParseResult {
  const r = emptyResult("get-netadapter");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  // پیدا کردن خط هدر
  let headerIdx = lines.findIndex((l) => /Name\s+.*Status\s+.*MacAddress/i.test(l));
  if (headerIdx === -1) { r.errors.push("هدر جدول Get-NetAdapter پیدا نشد. از فرمت جدولی (Format-Table) استفاده کنید."); return r; }
  // محاسبه ستون‌ها از موقعیت کلمات هدر
  const header = lines[headerIdx];
  const cols: { name: string; start: number }[] = [];
  for (const m of header.matchAll(/(\w[\w-]*)/g)) cols.push({ name: m[1], start: m.index ?? 0 });
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    const iface: ParsedInterface = { name: "", ips: [] };
    for (let c = 0; c < cols.length; c++) {
      const start = cols[c].start;
      const end = c + 1 < cols.length ? cols[c + 1].start : line.length;
      const val = line.slice(start, end).trim();
      if (!val) continue;
      switch (cols[c].name.toLowerCase()) {
        case "name": iface.name = val; break;
        case "status": iface.status = val; break;
        case "macaddress": iface.mac = val.replace(/-/g, ":").toUpperCase(); break;
        case "linkspeed": iface.speed = val; break;
        case "interfacedescription": break;
        case "ifindex": break;
        default: if (!r.unknownSections.includes(val)) r.unknownSections.push(val);
      }
    }
    if (iface.name) r.interfaces.push(iface);
  }
  r.success = r.interfaces.length > 0;
  return r;
}

// ─── نقطه ورود اصلی ────────────────────────────────────────────────
export function parseOutput(text: string, forcedFormat?: ParseFormat): ParseResult {
  const format = forcedFormat && forcedFormat !== "unknown" ? forcedFormat : detectFormat(text);
  switch (format) {
    case "ipconfig-all": return parseIpconfigAll(text);
    case "ip-json-addr": return parseIpJsonAddr(text);
    case "ip-json-route": return parseIpJsonRoute(text);
    case "ip-json-neigh": return parseIpJsonNeigh(text);
    case "arp-a": return parseArpWindows(text);
    case "arp-linux": return parseArpLinux(text);
    case "get-netadapter": return parseGetNetAdapter(text);
    default: {
      const r = emptyResult("unknown");
      r.errors.push("فرمت خروجی شناسایی نشد. فرمت‌های پشتیبانی‌شده: ipconfig /all، ip -j address/route/neigh show، arp -a (ویندوز/لینوکس)، Get-NetAdapter");
      return r;
    }
  }
}

// اعتبارسنجی سطری قبل از ثبت — طبق الزام سند ۳.۲: داده مبهم تا اعتبارسنجی «قطعی» نیست
export function validateParsed(r: ParseResult): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const it of r.interfaces) {
    if (it.mac && !isMac(it.mac)) issues.push(`MAC نامعتبر در رابط ${it.name}`);
    for (const ip of it.ips) {
      if (ip.family === "IPv4" && !isV4(ip.address)) issues.push(`IP نامعتبر: ${ip.address}`);
    }
  }
  for (const n of r.neighbors) {
    if (!isV4(n.ip) && !n.ip.includes(":")) issues.push(`IP نامعتبر در همسایه: ${n.ip}`);
    if (!isMac(n.mac)) issues.push(`MAC نامعتبر برای ${n.ip}`);
  }
  return { ok: issues.length === 0, issues };
}
