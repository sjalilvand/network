// NetScope — فاز ۲: جمع‌آور SNMP فقط‌خواندنی (سند بخش ۳.۱ و ۱۲)
// قواعد امنیتی رعایت‌شده:
//  - فقط عملیات GET/WALK (هیچ SET یا تغییر پیکربندی)
//  - اسکن فقط در محدوده‌های تأییدشده (scope-not-approved در غیر این صورت)
//  - اعتبارنامه فقط در حافظه همین درخواست استفاده می‌شود و ذخیره نمی‌گردد
//  - اولویت SNMPv3؛ v2c فقط با رضایت کاربر
//  - Timeout و تلاش محدود برای کم‌فشار ماندن شبکه

// OIDs استاندارد
export const OIDS = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysObjectID: "1.3.6.1.2.1.1.2.0",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
  sysName: "1.3.6.1.2.1.1.5.0",
  ifTable: "1.3.6.1.2.1.2.2.1",        // ifIndex .1 | ifDescr .2 | ifType .3 | ifMtu .4 | ifSpeed .5 | ifPhysAddress .6 | ifOperStatus .8
  dot1dFdbMac: "1.3.6.1.2.1.17.4.3.1.1",
  dot1dFdbPort: "1.3.6.1.2.1.17.4.3.1.2",
  dot1dBasePortIfIndex: "1.3.6.1.2.1.17.1.4.1.2",
  lldpRemTable: "1.0.8802.1.1.2.1.4.1.1", // .2 localPortNum .5 chassisId .7 portId .8 portDesc .9 sysName
  lldpLocPortTable: "1.0.8802.1.1.2.1.3.7.1", // .1 num .2 id .3 desc
} as const;

export interface SnmpTarget {
  ip: string;
  version: "2c" | "v3";
  community?: string;          // v2c — فقط در حافظه
  v3?: {
    user: string;
    authProtocol: "sha" | "sha256" | "md5";
    authPass: string;
    privProtocol: "aes" | "des";
    privPass: string;
  };
  timeoutMs?: number;
  retries?: number;
}

export interface SnmpIfRow { index: number; descr: string; mac?: string; speedMbps?: number; operStatus: "up" | "down" | "unknown"; mtu?: number; }
export interface SnmpFdbRow { mac: string; bridgePort: number; ifIndex?: number; ifName?: string; }
export interface SnmpLldpRow { localPortNum: number; localPortName?: string; remoteChassisId?: string; remotePortId?: string; remoteSysName?: string; remotePortDesc?: string; }
export interface SnmpSystemInfo { sysName?: string; sysDescr?: string; sysObjectID?: string; upTimeTicks?: number; }

export interface SnmpCollectResult {
  ok: boolean;
  target: string;
  version: string;
  system?: SnmpSystemInfo;
  interfaces?: SnmpIfRow[];
  fdb?: SnmpFdbRow[];
  lldp?: SnmpLldpRow[];
  warnings: string[];
  errors: string[];
}

// ─── بررسی محدوده تأییدشده (الزام سند ۱۲) ─────────────────────────
export function ipToInt(ip: string): number | null {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

export function cidrContains(cidr: string, ip: string): boolean {
  const [net, bitsRaw] = cidr.split("/");
  const bits = parseInt(bitsRaw, 10);
  const n = ipToInt(net), a = ipToInt(ip);
  if (n === null || a === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return ((n & mask) >>> 0) === ((a & mask) >>> 0);
}

// ─── لایه پایین: جلسه SNMP با net-snmp (import پویا) ───────────────
type SnmpVarbind = { oid: string; type: number; value: unknown };

async function snmpWalk(target: SnmpTarget, baseOid: string, maxRows = 3000): Promise<SnmpVarbind[]> {
  const snmp = (await import("net-snmp")).default as unknown as {
    Version2c: number; Version3: number;
    SecurityLevel: { noAuthNoPriv: number; authNoPriv: number; authPriv: number };
    AuthProtocols: Record<string, string>; PrivProtocols: Record<string, string>;
    createSession: (host: string, community: string, opts: Record<string, unknown>) => SnmpSession;
  };
  type SnmpSession = {
    subtree: (oid: string, maxRepetitions: number, feed: (vbs: SnmpVarbind[]) => void, done: (err?: Error) => void) => void;
    get: (oids: string[], cb: (err?: Error, vbs?: SnmpVarbind[]) => void) => void;
    close: () => void;
  };

  const opts: Record<string, unknown> = {
    port: 161,
    retries: target.retries ?? 1,
    timeout: target.timeoutMs ?? 2500,
  };
  if (target.version === "v3" && target.v3) {
    opts.version = snmp.Version3;
    opts.level = snmp.SecurityLevel.authPriv;
    opts.authProtocol = snmp.AuthProtocols[target.v3.authProtocol] || snmp.AuthProtocols.sha;
    opts.authKey = target.v3.authPass;
    opts.privProtocol = snmp.PrivProtocols[target.v3.privProtocol] || snmp.PrivProtocols.aes;
    opts.privKey = target.v3.privPass;
    // در net-snmp کاربر به‌جای community قرار می‌گیرد
    opts.context = "";
  }

  const session = snmp.createSession(target.ip, target.version === "v3" ? target.v3.user : (target.community || ""), opts);

  return new Promise<SnmpVarbind[]>((resolve, reject) => {
    const out: SnmpVarbind[] = [];
    const hardTimeout = setTimeout(() => { try { session.close(); } catch { /* */ } reject(new Error("timeout")); }, (target.timeoutMs ?? 2500) * 6);
    session.subtree(
      baseOid,
      25,
      (vbs) => { for (const vb of vbs) { if (out.length < maxRows) out.push(vb); } },
      (err) => {
        clearTimeout(hardTimeout);
        try { session.close(); } catch { /* */ }
        if (err && out.length === 0) reject(err);
        else resolve(out); // خطای جزئی با داده نیمه‌کاره هم قابل قبول است
      }
    );
  });
}

async function snmpGet(target: SnmpTarget, oids: string[]): Promise<Record<string, SnmpVarbind>> {
  const snmp = (await import("net-snmp")).default as unknown as {
    Version2c: number; Version3: number;
    SecurityLevel: { authPriv: number }; AuthProtocols: Record<string, string>; PrivProtocols: Record<string, string>;
    createSession: (host: string, community: string, opts: Record<string, unknown>) => {
      get: (oids: string[], cb: (err?: Error, vbs?: SnmpVarbind[]) => void) => void;
      close: () => void;
    };
  };
  const opts: Record<string, unknown> = { port: 161, retries: target.retries ?? 1, timeout: target.timeoutMs ?? 2500 };
  if (target.version === "v3" && target.v3) {
    opts.version = snmp.Version3;
    opts.level = snmp.SecurityLevel.authPriv;
    opts.authProtocol = snmp.AuthProtocols[target.v3.authProtocol] || snmp.AuthProtocols.sha;
    opts.authKey = target.v3.authPass;
    opts.privProtocol = snmp.PrivProtocols[target.v3.privProtocol] || snmp.PrivProtocols.aes;
    opts.privKey = target.v3.privPass;
  }
  const session = snmp.createSession(target.ip, target.version === "v3" ? target.v3.user : (target.community || ""), opts);
  return new Promise((resolve, reject) => {
    const hardTimeout = setTimeout(() => { try { session.close(); } catch { /* */ } reject(new Error("timeout")); }, (target.timeoutMs ?? 2500) * 3);
    session.get(oids, (err, vbs) => {
      clearTimeout(hardTimeout);
      try { session.close(); } catch { /* */ }
      if (err) return reject(err);
      const map: Record<string, SnmpVarbind> = {};
      for (const vb of vbs || []) map[vb.oid] = vb;
      resolve(map);
    });
  });
}

// ─── تبدیل‌ها ──────────────────────────────────────────────────────
function bytesToMac(value: unknown): string | undefined {
  let hex = "";
  if (Buffer.isBuffer(value)) hex = value.toString("hex");
  else if (typeof value === "string") hex = value.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length !== 12) return undefined;
  return hex.toUpperCase().match(/.{2}/g)!.join(":");
}

// ─── جمع‌آوری‌های سطح بالا ─────────────────────────────────────────

export async function snmpSystem(target: SnmpTarget): Promise<SnmpSystemInfo> {
  const res = await snmpGet(target, [OIDS.sysName, OIDS.sysDescr, OIDS.sysObjectID, OIDS.sysUpTime]);
  const val = (oid: string) => {
    const vb = res[oid];
    if (!vb) return undefined;
    return Buffer.isBuffer(vb.value) ? vb.value.toString() : String(vb.value);
  };
  return {
    sysName: val(OIDS.sysName),
    sysDescr: val(OIDS.sysDescr),
    sysObjectID: val(OIDS.sysObjectID),
    upTimeTicks: Number(val(OIDS.sysUpTime)) || undefined,
  };
}

export async function snmpInterfaces(target: SnmpTarget): Promise<SnmpIfRow[]> {
  const vbs = await snmpWalk(target, OIDS.ifTable);
  const rows = new Map<number, SnmpIfRow>();
  for (const vb of vbs) {
    const m = vb.oid.match(/^1\.3\.6\.1\.2\.1\.2\.2\.1\.(\d+)\.(\d+)$/);
    if (!m) continue;
    const col = Number(m[1]), idx = Number(m[2]);
    const row = rows.get(idx) || { index: idx, descr: "", operStatus: "unknown" as const };
    if (col === 2) row.descr = Buffer.isBuffer(vb.value) ? vb.value.toString() : String(vb.value);
    if (col === 4) row.mtu = Number(vb.value);
    if (col === 5) row.speedMbps = Math.round(Number(vb.value) / 1e6) || undefined;
    if (col === 6) row.mac = bytesToMac(vb.value);
    if (col === 8) row.operStatus = Number(vb.value) === 1 ? "up" : Number(vb.value) === 2 ? "down" : "unknown";
    rows.set(idx, row);
  }
  return [...rows.values()].filter((r) => r.descr && !/^(lo|null|vlan0)/i.test(r.descr));
}

export async function snmpFdb(target: SnmpTarget): Promise<SnmpFdbRow[]> {
  const [macVbs, portVbs, portMapVbs] = await Promise.all([
    snmpWalk(target, OIDS.dot1dFdbMac),
    snmpWalk(target, OIDS.dot1dFdbPort),
    snmpWalk(target, OIDS.dot1dBasePortIfIndex).catch(() => [] as SnmpVarbind[]),
  ]);
  const macByOid = new Map<string, string>();
  for (const vb of macVbs) {
    // انتهای OID خود MAC است (6 اکتت)
    const tail = vb.oid.split(".").slice(-6).join(".");
    const mac = bytesToMac(vb.value);
    if (mac) macByOid.set(tail, mac);
  }
  const portIfMap = new Map<number, number>();
  for (const vb of portMapVbs) {
    const m = vb.oid.match(/\.(\d+)$/);
    if (m) portIfMap.set(Number(m[1]), Number(vb.value));
  }
  const out: SnmpFdbRow[] = [];
  for (const vb of portVbs) {
    const tail = vb.oid.split(".").slice(-6).join(".");
    const mac = macByOid.get(tail);
    const port = Number(vb.value);
    if (mac && Number.isFinite(port)) out.push({ mac, bridgePort: port, ifIndex: portIfMap.get(port) });
  }
  return out;
}

export async function snmpLldp(target: SnmpTarget): Promise<SnmpLldpRow[]> {
  const [remVbs, locVbs] = await Promise.all([
    snmpWalk(target, OIDS.lldpRemTable).catch(() => [] as SnmpVarbind[]),
    snmpWalk(target, OIDS.lldpLocPortTable).catch(() => [] as SnmpVarbind[]),
  ]);
  const locNames = new Map<number, string>();
  for (const vb of locVbs) {
    const m = vb.oid.match(/^1\.0\.8802\.1\.1\.2\.1\.3\.7\.1\.(\d+)\.(\d+)$/);
    if (!m) continue;
    const num = Number(m[2]);
    if (m[1] === "2") locNames.set(num, Buffer.isBuffer(vb.value) ? vb.value.toString() : String(vb.value));
  }
  const rows = new Map<string, SnmpLldpRow>();
  for (const vb of remVbs) {
    const m = vb.oid.match(/^1\.0\.8802\.1\.1\.2\.1\.4\.1\.1\.(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) continue;
    const col = Number(m[1]), localPort = Number(m[2]), idx = Number(m[3]);
    const key = `${localPort}.${idx}`;
    const row = rows.get(key) || { localPortNum: localPort, localPortName: locNames.get(localPort) };
    const s = () => (Buffer.isBuffer(vb.value) ? vb.value.toString() : String(vb.value));
    if (col === 5) row.remoteChassisId = bytesToMac(vb.value) || s();
    if (col === 7) row.remotePortId = s();
    if (col === 8) row.remotePortDesc = s();
    if (col === 9) row.remoteSysName = s();
    rows.set(key, row);
  }
  return [...rows.values()];
}

// ─── جمع‌آوری کامل یک هدف ──────────────────────────────────────────
export type SnmpScope = "system" | "interfaces" | "fdb" | "lldp" | "all";

export async function snmpCollect(target: SnmpTarget, scope: SnmpScope): Promise<SnmpCollectResult> {
  const result: SnmpCollectResult = { ok: false, target: target.ip, version: target.version, warnings: [], errors: [] };
  const steps: Promise<void>[] = [];

  const run = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { result.errors.push(`${(e as Error).message}`); }
  };

  if (scope === "system" || scope === "all") {
    steps.push(run(async () => { result.system = await snmpSystem(target); }));
  }
  if (scope === "interfaces" || scope === "all") {
    steps.push(run(async () => { result.interfaces = await snmpInterfaces(target); }));
  }
  if (scope === "fdb" || scope === "all") {
    steps.push(run(async () => {
      result.fdb = await snmpFdb(target);
      if (!result.fdb?.length) result.warnings.push("جدول FDB خالی بود — ممکن است MIB-bridge فقط در VLAN خاص در دسترس باشد (community@vlan).");
    }));
  }
  if (scope === "lldp" || scope === "all") {
    steps.push(run(async () => {
      result.lldp = await snmpLldp(target);
      if (!result.lldp?.length) result.warnings.push("جدول LLDP خالی بود — LLDP روی دستگاه فعال نیست یا پشتیبانی نمی‌شود.");
    }));
  }

  await Promise.all(steps);
  result.ok = result.errors.length === 0 && (result.system !== undefined || result.interfaces !== undefined || result.fdb !== undefined || result.lldp !== undefined);
  return result;
}
