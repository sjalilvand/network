// NetScope — فاز ۲: تجزیه‌گر خروجی سوئیچ‌ها (FDB / LLDP / VLAN / وضعیت پورت)
// همه توابع خالص‌اند و قابل تست؛ بر اساس سند بخش ۳: JSON مقدم است، متنی جایگزین آن.
// قاعده طلایی سند ۵.۲: MAC دیده‌شده روی پورت سوئیچ به‌تنهایی اتصال مستقیم نیست —
// تصمیم‌گیری نهایی با موتور استنباط (topology-inference.ts) انجام می‌شود.

import type { SwitchParseFormat } from "./vendors";

export interface ParsedFdbEntry { port: string; mac: string; vlan?: number; }
export interface ParsedLldpEntry {
  localPort: string;
  remoteChassisId: string;
  remotePortId?: string;
  remoteSysName?: string;
  remotePortDesc?: string;
}
export interface ParsedVlanEntry { vlanId: number; name?: string; ports?: string[]; }
export interface ParsedIfStatusEntry { port: string; status?: string; vlan?: string; speed?: string; duplex?: string; description?: string; }

export interface SwitchParseResult<T> {
  format: SwitchParseFormat | "unknown";
  entries: T[];
  warnings: string[];
  unknownSections: string[]; // بخش‌های تجزیه‌نشده — نمایش صادقانه به کاربر (معیار پذیرش ۱۴)
}

// ─── ابزارهای عمومی ────────────────────────────────────────────────

export function normalizeMac(raw: string): string | null {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g)!.join(":");
}

function normPort(p: string): string {
  return p.trim().replace(/\s+/g, "");
}

// ─── Cisco: show mac address-table ─────────────────────────────────
// قالب:
//   Vlan    Mac Address       Type        Interfaces
//   ----    -----------       --------    -----------
//    10     4447.ccc1.0041    DYNAMIC     Gi1/0/5
export function parseCiscoMacTable(text: string): SwitchParseResult<ParsedFdbEntry> {
  const entries: ParsedFdbEntry[] = [];
  const unknown: string[] = [];
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const t = line.trim();
    if (!t || /^[-\s]+$/.test(t)) continue;
    if (/^(vlan|mac address|total|legend|.*all mac|unicast|multicast)/i.test(t)) continue;
    // قالب ستونی: vlan mac type port(s)
    const m = t.match(/^(\d+)\s+([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}|[0-9a-fA-F:]{12,17})\s+(\S+)\s+(.+)$/);
    if (m) {
      const mac = normalizeMac(m[2]);
      if (!mac) { unknown.push(t); continue; }
      const ports = m[4].split(/[,\s]+/).filter(Boolean);
      const vlan = parseInt(m[1], 10);
      for (const p of ports) {
        if (p.toLowerCase() === "cpu" || p === "---") continue;
        entries.push({ port: normPort(p), mac, vlan: Number.isFinite(vlan) ? vlan : undefined });
      }
    } else if (/[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}/.test(t)) {
      // خط MACدار که قالب انتظاری نداشت — صادقانه گزارش می‌شود
      unknown.push(t);
    }
  }
  if (entries.length === 0) warnings.push("هیچ رکورد MAC قابل تجزیه پیدا نشد — قالب خروجی را بررسی کنید.");
  return { format: "cisco-mac-table", entries, warnings, unknownSections: unknown.slice(0, 20) };
}

// ─── جدول MAC عمومی (Aruba/Huawei/سایر) ────────────────────────────
// قالب‌های رایج:
//  MAC Address : 4447-ccc1-0041     VLAN : 10     Port : 5
//  10   4447-ccc1-0041   Dynamic    5
export function parseGenericMacTable(text: string): SwitchParseResult<ParsedFdbEntry> {
  const entries: ParsedFdbEntry[] = [];
  const unknown: string[] = [];
  const warnings: string[] = [];

  for (const lineRaw of text.split(/\r?\n/)) {
    const t = lineRaw.trim();
    if (!t || /^(mac|vlan|port|total|-{3,}|={3,}|config|status)/i.test(t)) continue;

    // قالب کلید/مقدار: MAC Address : xxx VLAN : n Port : y
    const kv = t.match(/([0-9a-fA-F]{4}[-:.][0-9a-fA-F]{4}[-:.][0-9a-fA-F]{4}|[0-9a-fA-F:]{12,17})/);
    if (kv) {
      const mac = normalizeMac(kv[1]);
      if (!mac) { unknown.push(t); continue; }
      const vlanM = t.match(/vlan\s*:?\s*(\d+)/i);
      const portM = t.match(/port\s*:?\s*([\w/.:-]+)/i);
      if (portM) {
        entries.push({ port: normPort(portM[1]), mac, vlan: vlanM ? parseInt(vlanM[1], 10) : undefined });
      } else {
        // قالب ستونی: vlan mac type port
        const cols = t.split(/\s+/);
        if (cols.length >= 4 && /^\d+$/.test(cols[0])) {
          entries.push({ port: normPort(cols[cols.length - 1]), mac, vlan: parseInt(cols[0], 10) });
        } else unknown.push(t);
      }
    }
  }
  if (entries.length === 0) warnings.push("قالب جدول MAC شناسایی نشد؛ از راهنمای سازنده استفاده کنید.");
  return { format: "generic-mac-table", entries, warnings, unknownSections: unknown.slice(0, 20) };
}

// ─── MikroTik: /interface bridge host print detail ─────────────────
// قالب:
//  0 DLS name="host1" mac-address=D4:CA:6D:11:00:01 on-interface=ether1 bridge=bridge1 ...
//  Flags: L - local, E - external-fdb
export function parseMikrotikBridgeHost(text: string): SwitchParseResult<ParsedFdbEntry> {
  const entries: ParsedFdbEntry[] = [];
  const unknown: string[] = [];
  const warnings: string[] = [];

  for (const lineRaw of text.split(/\r?\n/)) {
    const t = lineRaw.trim();
    if (!t || /^flags/i.test(t)) continue;
    if (!/mac-address=/i.test(t)) continue;
    const macM = t.match(/mac-address=([0-9a-fA-F:]{12,17})/i);
    const ifM = t.match(/on-interface=(\S+)/i);
    const vidM = t.match(/(?:^|\s)vid=(\d+)/i);
    if (macM && ifM) {
      const mac = normalizeMac(macM[1]);
      if (!mac) { unknown.push(t); continue; }
      entries.push({ port: normPort(ifM[1]), mac, vlan: vidM ? parseInt(vidM[1], 10) : undefined });
    } else unknown.push(t);
  }
  if (entries.length === 0) warnings.push("رکورد mac-address= یافت نشد — مطمئن شوید از print detail استفاده کرده‌اید.");
  return { format: "mikrotik-bridge-host", entries, warnings, unknownSections: unknown.slice(0, 20) };
}

// ─── LLDP بلوکی (Cisco detail / Aruba / Huawei) ────────────────────
// بلوک‌ها با خط جداکننده یا «System Name:» شناسایی می‌شوند:
//   Local Intf: Gi1/0/1   |   Local Port: 1/0/1
//   Chassis id: d4ca.6d11.0001
//   Port id: ether1
//   Port Description: ...
//   System Name: rtr-gw-01
export function parseLldpBlocks(text: string): SwitchParseResult<ParsedLldpEntry> {
  const entries: ParsedLldpEntry[] = [];
  const unknown: string[] = [];
  const warnings: string[] = [];

  // تقسیم به بلوک بر اساس جداکننده یا شروع Local
  const blocks = text
    .split(/-{8,}|={8,}/)
    .flatMap((b) => (b.includes("ocal") && b.includes("ntf") ? [b] : b.split(/(?=Local\s+(?:Intf|Port|Interface))/i)))
    .filter((b) => /local/i.test(b) || /chassis/i.test(b));

  for (const block of blocks) {
    const grab = (re: RegExp): string | undefined => {
      const m = block.match(re);
      return m ? m[1].trim() : undefined;
    };
    const localPort =
      grab(/local\s+(?:intf|interface|port)\s*:?\s*([\w/.:-]+)/i) ||
      grab(/local\s+port\s+id\s*:?\s*([\w/.:-]+)/i);
    const chassis =
      grab(/chassis\s*id\s*(?:type)?\s*:?\s*([0-9a-fA-F]{4}[-:.][0-9a-fA-F]{4}[-:.][0-9a-fA-F]{4}|[0-9a-fA-F:]{12,17})/i) ||
      grab(/chassis\s*id\s*:?\s*(\S+)/i);
    if (!localPort || !chassis) {
      if (/chassis|system name|port id/i.test(block)) unknown.push(block.trim().slice(0, 200));
      continue;
    }
    const mac = normalizeMac(chassis) || chassis.trim();
    entries.push({
      localPort: normPort(localPort),
      remoteChassisId: mac,
      remotePortId: grab(/port\s*id\s*:?\s*([\w/.():-]+)/i),
      remoteSysName: grab(/system\s*name\s*:?\s*(\S+)/i),
      remotePortDesc: grab(/port\s*desc(?:ription)?\s*:?\s*(.+)/i),
    });
  }

  if (entries.length === 0) warnings.push("بلوک LLDP قابل تجزیه یافت نشد — قالب‌های پشتیبانی‌شده: Cisco detail، Aruba، Huawei brief.");
  return { format: "generic-lldp", entries, warnings, unknownSections: unknown.slice(0, 10) };
}

// ─── Cisco: show vlan brief ────────────────────────────────────────
export function parseCiscoVlanBrief(text: string): SwitchParseResult<ParsedVlanEntry> {
  const entries: ParsedVlanEntry[] = [];
  const unknown: string[] = [];
  for (const lineRaw of text.split(/\r?\n/)) {
    const t = lineRaw.trim();
    const m = t.match(/^(\d{1,4})\s+([\w-]+)\s+(.*)$/);
    if (m && !/^(name|type|vlan)/i.test(t)) {
      const ports = m[3].split(/[,\s]+/).filter((p) => /[\w]/.test(p) && !/^(act\/|unsup)/i.test(p));
      entries.push({ vlanId: parseInt(m[1], 10), name: m[2], ports });
    } else if (/^\d{1,4}\s/.test(t)) unknown.push(t);
  }
  if (entries.length === 0) warnings.push("هیچ VLAN قابل تجزیه یافت نشد.");
  return { format: "cisco-vlan-brief", entries, warnings, unknownSections: unknown.slice(0, 20) };
}

// ─── MikroTik: /interface bridge vlan print detail ─────────────────
export function parseMikrotikVlan(text: string): SwitchParseResult<ParsedVlanEntry> {
  const entries: ParsedVlanEntry[] = [];
  const unknown: string[] = [];
  for (const lineRaw of text.split(/\r?\n/)) {
    const t = lineRaw.trim();
    if (!/vlan-ids=/i.test(t)) continue;
    const idsM = t.match(/vlan-ids=([\d,]+)/i);
    const taggedM = t.match(/tagged=([\w,/.\-]*)/i);
    const untaggedM = t.match(/untagged=([\w,/.\-]*)/i);
    const splitPorts = (s?: string) =>
      s && s !== "" ? s.split(",").flatMap((p) => p.split("/").map((x) => x.trim())).filter(Boolean) : [];
    if (idsM) {
      for (const id of idsM[1].split(",")) {
        entries.push({
          vlanId: parseInt(id, 10),
          ports: [...splitPorts(taggedM?.[1]), ...splitPorts(untaggedM?.[1])],
        });
      }
    }
  }
  if (entries.length === 0) warnings.push("رکورد vlan-ids= یافت نشد — از print detail استفاده کنید.");
  return { format: "mikrotik-vlan", entries, warnings, unknownSections: unknown.slice(0, 10) };
}

// ─── Cisco: show interfaces status ─────────────────────────────────
// Port      Name               Status       Vlan       Duplex  Speed Type
// Gi1/0/1   uplink-router      connected    trunk      a-full  a-1000
export function parseCiscoIfStatus(text: string): SwitchParseResult<ParsedIfStatusEntry> {
  const entries: ParsedIfStatusEntry[] = [];
  const unknown: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const lineRaw of lines) {
    const t = lineRaw.trimEnd();
    if (!t.trim() || /^(port|—|-{3,})/i.test(t.trim())) continue;
    const m = t.trim().match(/^([\w/.:-]+)\s+(?:"?([^"]*?)"?\s+)?(connected|notconnect|disabled|err-disabled|monitoring|inactive)\s+(\S+)(?:\s+(\S+)\s+(\S+)(?:\s+(\S+))?)?/i);
    if (m) {
      entries.push({
        port: normPort(m[1]), description: (m[2] || "").trim() || undefined,
        status: m[3].toLowerCase() === "connected" ? "up" : m[3].toLowerCase() === "notconnect" ? "down" : "down",
        vlan: m[4], duplex: m[5], speed: m[6],
      });
    } else unknown.push(t.trim());
  }
  if (entries.length === 0) warnings.push("هیچ ردیف وضعیت پورت قابل تجزیه نبود.");
  return { format: "cisco-if-status", entries, warnings, unknownSections: unknown.slice(0, 20) };
}

// ─── دیسپچر بر اساس فرمت ───────────────────────────────────────────
export function dispatchSwitchParse(
  format: SwitchParseFormat,
  raw: string
): SwitchParseResult<ParsedFdbEntry[] | ParsedLldpEntry[] | ParsedVlanEntry[] | ParsedIfStatusEntry[]> {
  switch (format) {
    case "cisco-mac-table": return parseCiscoMacTable(raw);
    case "generic-mac-table": return parseGenericMacTable(raw);
    case "mikrotik-bridge-host": return parseMikrotikBridgeHost(raw);
    case "cisco-lldp-detail":
    case "generic-lldp": return parseLldpBlocks(raw);
    case "cisco-vlan-brief": return parseCiscoVlanBrief(raw);
    case "mikrotik-vlan": return parseMikrotikVlan(raw);
    case "cisco-if-status": return parseCiscoIfStatus(raw);
    default: return { format: "unknown", entries: [], warnings: ["فرمت ناشناخته"], unknownSections: [] };
  }
}
