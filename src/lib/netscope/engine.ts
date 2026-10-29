// NetScope — موتور هوشمند جمع‌آوری اطلاعات (سند بخش ۲)
// تصمیم‌گیری براساس اطلاعات موجود برای انتخاب بهترین اقدام بعدی
// داده واقعی محیط اجرا از سیستم میزبان خوانده می‌شود؛ داده شبکه آزمایشی شبیه‌سازی‌شده است.

import os from "os";
import fs from "fs";
import { db } from "@/lib/db";
import type { EngineStep, RecommendedAction, ActionFactors } from "./types";
import { ENGINE_STEP_ORDER, ENGINE_STEP_LABELS } from "./types";
import { CHECKLIST_GROUPS } from "./checklist-defs";
import {
  SCENARIO_DEVICES, SCENARIO_NETWORKS, SCENARIO_CAMERAS,
  STALE_ARP_ENTRY, IP_CONFLICT_SUSPECT, RADIO_LINK_CURRENTLY_DOWN,
  scenarioMgmtInfo,
} from "./scenario";

// ─── انواع گزارش اجرا ──────────────────────────────────────────────
export interface StepLogLine { kind: "info" | "success" | "warn" | "error" | "evidence"; text: string }
export interface RunReport {
  step: EngineStep;
  stepTitle: string;
  ok: boolean;
  blocked?: string;
  lines: StepLogLine[];
  createdDevices: number;
  createdLinks: number;
  createdEvidence: number;
  checklistUpdates: string[];
}

// ─── وضعیت موتور در تنظیمات پروژه ──────────────────────────────────
interface EngineState {
  completedSteps: EngineStep[];
  scopeApproved: boolean;
  approvedScopes: string[];
  autoMode: boolean;
  emergencyStop: boolean;
  monitoringEnabled: boolean;
  aiConsent: boolean;
  discoveryConfirmed: boolean;
  lastStepAt?: string;
  tickCount: number;
}

const DEFAULT_STATE: EngineState = {
  completedSteps: [], scopeApproved: false, approvedScopes: [],
  autoMode: false, emergencyStop: false, monitoringEnabled: false,
  aiConsent: false, discoveryConfirmed: false, tickCount: 0,
};

export async function getProject() {
  let p = await db.networkProject.findFirst({ orderBy: { createdAt: "asc" } });
  if (!p) {
    p = await db.networkProject.create({
      data: {
        name: "شبکه سازمانی — پروژه آزمایشی NetScope",
        description: "کشف، تحلیل و مانیتورینگ شبکه محلی سازمان | داده محیط اجرا واقعی و داده شبکه آزمایشی شبیه‌سازی‌شده است.",
        scope: JSON.stringify([]),
        settings: JSON.stringify({ engine: DEFAULT_STATE }),
      },
    });
    await seedChecklist(p.id);
  }
  return p;
}

export async function getEngineState(): Promise<EngineState> {
  const p = await getProject();
  const settings = JSON.parse(p.settings || "{}");
  return { ...DEFAULT_STATE, ...(settings.engine || {}) };
}

export async function saveEngineState(patch: Partial<EngineState>) {
  const p = await getProject();
  const settings = JSON.parse(p.settings || "{}");
  const engine = { ...DEFAULT_STATE, ...(settings.engine || {}), ...patch };
  await db.networkProject.update({ where: { id: p.id }, data: { settings: JSON.stringify({ ...settings, engine }) } });
  return engine;
}

// ─── بذر چک‌لیست (۱۴ گروه سند بخش ۱.۱) ────────────────────────────
export async function seedChecklist(projectId: string) {
  for (const g of CHECKLIST_GROUPS) {
    for (const item of g.items) {
      await db.checklistItem.upsert({
        where: { itemKey: item.itemKey },
        update: {},
        create: {
          projectId, groupKey: g.groupKey, itemKey: item.itemKey, title: item.title,
          status: "not-collected", applicable: true, relevance: "auto",
          guideKey: item.guideKey || null,
        },
      });
    }
  }
}

// ─── ابزارهای ثبت ──────────────────────────────────────────────────
async function audit(projectId: string, action: string, target = "", detail = "") {
  await db.auditLog.create({ data: { projectId, action, target, detail } });
}

export async function addEvidence(data: {
  projectId: string; deviceId?: string | null; linkId?: string | null; checklistKey?: string | null;
  kind: string; sourceMethod: string; content: string; confidence?: string;
  isSimulated?: boolean; agentId?: string | null; validityMinutes?: number;
}) {
  const expiresAt = data.validityMinutes ? new Date(Date.now() + data.validityMinutes * 60_000) : null;
  return db.evidence.create({
    data: {
      projectId: data.projectId, deviceId: data.deviceId ?? null, linkId: data.linkId ?? null,
      checklistKey: data.checklistKey ?? null, kind: data.kind, sourceMethod: data.sourceMethod,
      content: data.content, confidence: data.confidence || "inferred",
      isSimulated: data.isSimulated ?? false, agentId: data.agentId ?? null, expiresAt,
    },
  });
}

// دستگاه را پیدا یا بساز (هویت ترکیبی — سند بخش ۴.۲؛ نه فقط IP)
// قاعده: تنزل وضعیت/اطمینان در اجرای مجدد رخ نمی‌دهد (سند ۱۰: داده قدیمی به‌عنوان وضعیت فعلی نمایش داده نشود)
const CONF_RANK: Record<string, number> = { verified: 3, inferred: 2, limited: 1.5, unknown: 1 };
const STATUS_RANK: Record<string, number> = { online: 2, offline: 1, unknown: 0.5 };
async function upsertDevice(projectId: string, opts: {
  identityKey: string; hostname?: string | null; vendor?: string | null; model?: string | null;
  type?: string; ip?: string; mac?: string; networkKey?: string; confidence?: string;
  status?: string; roleEvidence?: string; sensitivity?: string; isSimulated?: boolean;
  notes?: string; sourceMethod: string; downgrade?: boolean; // کشف فعال اجازه ثبت «بدون پاسخ» دارد
}) {
  const existing = await db.device.findUnique({ where: { identityKey: opts.identityKey } });
  const now = new Date();
  if (existing) {
    const newConf = opts.confidence && (CONF_RANK[opts.confidence] || 0) > (CONF_RANK[existing.confidence] || 0) ? opts.confidence : existing.confidence;
    const newStatus = opts.status && (opts.downgrade || (STATUS_RANK[opts.status] || 0) >= (STATUS_RANK[existing.status] || 0)) ? opts.status : existing.status;
    return db.device.update({
      where: { identityKey: opts.identityKey },
      data: {
        hostname: opts.hostname ?? existing.hostname,
        vendor: opts.vendor ?? existing.vendor,
        model: opts.model ?? existing.model,
        type: opts.type && opts.type !== "unknown" ? opts.type : existing.type,
        confidence: newConf,
        status: newStatus,
        roleEvidence: opts.roleEvidence ?? existing.roleEvidence,
        sensitivity: opts.sensitivity ?? existing.sensitivity,
        notes: opts.notes ?? existing.notes,
        lastSeen: now,
      },
    });
  }
  return db.device.create({
    data: {
      projectId, identityKey: opts.identityKey, hostname: opts.hostname ?? null,
      vendor: opts.vendor ?? null, model: opts.model ?? null, type: opts.type || "unknown",
      confidence: opts.confidence || "inferred", status: opts.status || "unknown",
      roleEvidence: opts.roleEvidence || "", sensitivity: opts.sensitivity || "normal",
      isSimulated: opts.isSimulated ?? true, notes: opts.notes || "",
      firstSeen: now, lastSeen: now,
    },
  });
}

// رابط و IP برای دستگاه شبیه‌سازی‌شده
async function ensureIfaceIp(deviceId: string, opts: { name: string; mac?: string; ip?: string; prefix?: number; status?: string }) {
  let iface = await db.interface.findFirst({ where: { deviceId, name: opts.name } });
  if (!iface) {
    iface = await db.interface.create({
      data: { deviceId, name: opts.name, mac: opts.mac || null, status: opts.status || "up", itype: "ethernet", mtu: 1500, speed: "1 Gbps" },
    });
  }
  if (opts.ip) {
    const exists = await db.iPAssignment.findFirst({ where: { interfaceId: iface.id, address: opts.ip } });
    if (!exists) {
      await db.iPAssignment.create({
        data: { interfaceId: iface.id, address: opts.ip, prefix: opts.prefix ?? 24, family: opts.ip.includes(":") ? "IPv6" : "IPv4", isPrimary: true, source: "discovery" },
      });
    }
  }
  return iface;
}

// شبکه را پیدا یا بساز
async function upsertNetwork(projectId: string, key: string, opts: { cidr: string; name: string; vlanId?: number | null; gateway: string; confidence?: string; discoveredVia?: string }) {
  const existing = await db.network.findFirst({ where: { projectId, cidr: opts.cidr } });
  if (existing) return existing;
  return db.network.create({
    data: {
      projectId, cidr: opts.cidr, name: opts.name, vlanId: opts.vlanId ?? null,
      gateway: opts.gateway, confidence: opts.confidence || "inferred",
      discoveredVia: opts.discoveredVia || "discovery",
    },
  });
}

// اتصال را پیدا یا بساز
async function upsertLink(projectId: string, opts: {
  srcKey: string; dstKey: string; kind: string; relation?: string; srcPort?: string; dstPort?: string;
  vlan?: number | null; sourceMethod: string; confidence: string; evidenceText: string; verified?: boolean;
}) {
  const src = await db.device.findUnique({ where: { identityKey: opts.srcKey } });
  const dst = await db.device.findUnique({ where: { identityKey: opts.dstKey } });
  if (!src || !dst) return null;
  const existing = await db.link.findFirst({ where: { projectId, srcDeviceId: src.id, dstDeviceId: dst.id, kind: opts.kind, relation: opts.relation || "" } });
  if (existing) {
    return db.link.update({
      where: { id: existing.id },
      data: {
        confidence: opts.confidence, evidenceText: opts.evidenceText,
        lastVerified: opts.verified ? new Date() : existing.lastVerified,
        status: "active",
      },
    });
  }
  return db.link.create({
    data: {
      projectId, srcDeviceId: src.id, dstDeviceId: dst.id, kind: opts.kind,
      relation: opts.relation || "", srcPort: opts.srcPort || null, dstPort: opts.dstPort || null,
      vlan: opts.vlan ?? null, sourceMethod: opts.sourceMethod, confidence: opts.confidence,
      status: "active", lastVerified: opts.verified ? new Date() : null, evidenceText: opts.evidenceText,
    },
  });
}

// بروزرسانی آیتم چک‌لیست
async function setChecklist(itemKey: string, patch: {
  status?: string; value?: string; method?: string; confidence?: string; validity?: string;
  accessReq?: string; error?: string; nextAction?: string; guideKey?: string | null;
}) {
  await db.checklistItem.update({ where: { itemKey }, data: { ...patch, updatedAt: new Date() } });
}

async function addAttempt(projectId: string, opts: {
  checklistKey?: string; method: string; target?: string; result: string;
  failureReason?: string; trafficCost?: string; notes?: string;
}) {
  return db.collectionAttempt.create({
    data: {
      projectId, checklistKey: opts.checklistKey || null, method: opts.method,
      target: opts.target || "", finishedAt: new Date(), result: opts.result,
      failureReason: opts.failureReason || "", trafficCost: opts.trafficCost || "low",
      notes: opts.notes || "",
    },
  });
}

// ─── داده واقعی محیط اجرا ──────────────────────────────────────────
function readRealEnvironment() {
  const ifaces: { name: string; mac?: string; ips: { address: string; prefix?: number; family: string }[]; status: string }[] = [];
  const nets = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(nets)) {
    const iface: { name: string; mac?: string; ips: { address: string; prefix?: number; family: string }[]; status: string } = { name, ips: [], status: "up" };
    for (const a of addrs || []) {
      if (a.mac && !iface.mac) iface.mac = a.mac.toUpperCase();
      if (a.family === "IPv4" || a.family === "IPv6") {
        iface.ips.push({
          address: a.address,
          prefix: a.family === "IPv4" ? cidrToPrefix(a.cidr) : undefined,
          family: a.family === "IPv4" ? "IPv4" : "IPv6",
        });
      }
    }
    ifaces.push(iface);
  }
  // مسیرها و دروازه از /proc/net/route (واقعی)
  const routes: { dest: string; gateway?: string; iface: string }[] = [];
  let gateway: string | null = null;
  try {
    const raw = fs.readFileSync("/proc/net/route", "utf8");
    for (const line of raw.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 4) continue;
      const dest = hexToIp(cols[1]);
      const gw = hexToIp(cols[2]);
      if (dest === "0.0.0.0" && gw !== "0.0.0.0" && !gateway) gateway = gw;
      routes.push({ dest: dest === "0.0.0.0" ? "default" : dest, gateway: gw !== "0.0.0.0" ? gw : undefined, iface: cols[0] });
    }
  } catch { /* غیر لینوکس */ }
  // ARP واقعی
  const arp: { ip: string; mac: string }[] = [];
  try {
    const raw = fs.readFileSync("/proc/net/arp", "utf8");
    for (const line of raw.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length >= 6 && cols[3] && cols[3] !== "00:00:00:00:00:00") arp.push({ ip: cols[0], mac: cols[3].toUpperCase() });
    }
  } catch { /* */ }
  // DNS واقعی
  const dns: string[] = [];
  try {
    const raw = fs.readFileSync("/etc/resolv.conf", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^nameserver\s+(\S+)/);
      if (m) dns.push(m[1]);
    }
  } catch { /* */ }
  // تشخیص محیط مجازی
  let virtualEnv = "بومی";
  try {
    if (fs.existsSync("/.dockerenv")) virtualEnv = "کانتینر (Docker)";
    else {
      const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8").toLowerCase();
      if (cgroup.includes("docker") || cgroup.includes("kubepods") || cgroup.includes("containerd")) virtualEnv = "کانتینر";
      const version = fs.readFileSync("/proc/version", "utf8").toLowerCase();
      if (version.includes("microsoft")) virtualEnv = "WSL";
    }
  } catch { /* */ }
  return {
    platform: `${os.type()} ${os.release()}`, hostname: os.hostname(),
    arch: os.arch(), cpuModel: os.cpus()[0]?.model || "", totalMemGB: +(os.totalmem() / 2 ** 30).toFixed(1),
    isRoot: typeof process.getuid === "function" ? process.getuid() === 0 : false,
    nodeVersion: process.version, virtualEnv, ifaces, routes, gateway, arp, dns,
  };
}

function hexToIp(hex: string): string {
  const n = parseInt(hex, 16);
  if (Number.isNaN(n)) return hex;
  return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF].join(".");
}
function cidrToPrefix(cidr: string | undefined): number | undefined {
  if (!cidr || !cidr.includes("/")) return undefined;
  const p = parseInt(cidr.split("/")[1], 10);
  return Number.isNaN(p) ? undefined : p;
}

// ─── اجرای مراحل موتور ─────────────────────────────────────────────
export async function runStep(step: EngineStep): Promise<RunReport> {
  const state = await getEngineState();
  const project = await getProject();
  const projectId = project.id;

  if (state.emergencyStop && step !== "map-report") {
    return {
      step, stepTitle: ENGINE_STEP_LABELS[step], ok: false, blocked: "توقف اضطراری فعال است. برای ادامه، توقف اضطراری را در تنظیمات غیرفعال کنید.",
      lines: [], createdDevices: 0, createdLinks: 0, createdEvidence: 0, checklistUpdates: [],
    };
  }

  switch (step) {
    case "env-detect": return stepEnvDetect(projectId);
    case "local-config": return stepLocalConfig(projectId);
    case "scope-proposal": return stepScopeProposal(projectId);
    case "existing-data": return stepExistingData(projectId);
    case "active-discovery": return stepActiveDiscovery(projectId, state);
    case "role-guess": return stepRoleGuess(projectId);
    case "mgmt-info": return stepMgmtInfo(projectId);
    case "link-analysis": return stepLinkAnalysis(projectId);
    case "missing-analysis": return stepMissingAnalysis(projectId);
    case "map-report": return stepMapReport(projectId);
    case "periodic-update": return stepPeriodicUpdate(projectId, state);
    default: {
      return {
        step, stepTitle: step, ok: false, blocked: "مرحله ناشناخته",
        lines: [], createdDevices: 0, createdLinks: 0, createdEvidence: 0, checklistUpdates: [],
      };
    }
  }
}

function report(step: EngineStep): RunReport {
  return {
    step, stepTitle: ENGINE_STEP_LABELS[step], ok: true, lines: [],
    createdDevices: 0, createdLinks: 0, createdEvidence: 0, checklistUpdates: [],
  };
}

// مرحله ۱: شناسایی محیط اجرا — داده واقعی
async function stepEnvDetect(projectId: string): Promise<RunReport> {
  const r = report("env-detect");
  const env = readRealEnvironment();

  const agent = await db.agent.create({
    data: {
      projectId, name: `agent-${env.hostname}`, platform: env.platform.includes("Linux") ? "linux" : "windows",
      hostname: env.hostname, status: "online", isSimulated: false, isNative: env.virtualEnv === "بومی",
      lastSeen: new Date(), version: "1.0.0",
    },
  });

  await addEvidence({
    projectId, checklistKey: "env.os", kind: "agent-report", sourceMethod: "agent:os-api",
    content: `سیستم‌عامل: ${env.platform} | معماری: ${env.arch} | هسته Node: ${env.nodeVersion}`,
    confidence: "verified", agentId: agent.id, validityMinutes: 24 * 60,
  });
  await setChecklist("env.os", {
    status: "collected", value: JSON.stringify({ platform: env.platform, arch: env.arch }),
    method: "عامل محلی — API سیستم‌عامل", confidence: "verified",
    validity: "۲۴ ساعت", nextAction: "",
  });

  await addEvidence({
    projectId, checklistKey: "env.privileges", kind: "agent-report", sourceMethod: "agent:os-api",
    content: `اجرای عامل با کاربر ${env.isRoot ? "ممتاز (root)" : "عادی (بدون دسترسی مدیریتی)"} — برخی بررسی‌ها (مثل sniffing) نیاز به مجوز بیشتری دارند.`,
    confidence: "verified", agentId: agent.id, validityMinutes: 24 * 60,
  });
  await setChecklist("env.privileges", {
    status: "collected", value: JSON.stringify({ root: env.isRoot }),
    method: "عامل محلی", confidence: "verified", validity: "۲۴ ساعت",
    nextAction: env.isRoot ? "" : "برای بررسی‌های لایه ۲ پیشرفته، اجرا با مجوز ممتاز بررسی شود",
  });

  await addEvidence({
    projectId, checklistKey: "env.native", kind: "agent-report", sourceMethod: "agent:os-api",
    content: `محیط اجرا: ${env.virtualEnv}. الزام سند: اجرای داخل ${env.virtualEnv !== "بومی" ? env.virtualEnv : "محیط بومی"} — ${env.virtualEnv !== "بومی" ? "بدون آزمون، معادل مشاهده شبکه فیزیکی تلقی نمی‌شود؛ صحت دسترسی شبکه باید آزمایش شود." : "دسترسی مستقیم به شبکه فیزیکی انتظار می‌رود؛ با آزمون ping تأیید شود."}`,
    confidence: "verified", agentId: agent.id, validityMinutes: 24 * 60,
  });
  await setChecklist("env.native", {
    status: "collected", value: JSON.stringify({ env: env.virtualEnv, native: env.virtualEnv === "بومی" }),
    method: "عامل محلی — بررسی cgroup/نشانگرهای مجازی‌سازی", confidence: "verified",
    validity: "۲۴ ساعت",
    nextAction: env.virtualEnv !== "بومی" ? "آزمون دسترسی واقعی به شبکه هدف انجام شود (سند بخش ۹)" : "",
  });

  // عامل شبیه‌سازی‌شده برای شبکه آزمایشی
  await db.agent.create({
    data: {
      projectId, name: "sim-agent-01", platform: "linux", hostname: "netops-sim-01",
      status: "online", isSimulated: true, isNative: true, lastSeen: new Date(),
    },
  });

  r.lines.push({ kind: "success", text: `محیط اجرا شناسایی شد: ${env.platform} (${env.virtualEnv}) — داده واقعی` });
  r.lines.push({ kind: "info", text: `رابط‌های شبکه واقعی: ${env.ifaces.length} رابط شناسایی شد` });
  r.lines.push({ kind: "evidence", text: "سطح دسترسی و نوع محیط اجرا ثبت شد" });
  r.createdEvidence = 3;
  await audit(projectId, "اجرای مرحله موتور: شناسایی محیط اجرا", "engine", "داده واقعی سیستم میزبان");
  await saveEngineState({ completedSteps: await markStepDone("env-detect"), lastStepAt: new Date().toISOString() });
  return r;
}

// مرحله ۲: تنظیمات محلی بدون اسکن — داده واقعی
async function stepLocalConfig(projectId: string): Promise<RunReport> {
  const r = report("local-config");
  const env = readRealEnvironment();

  await addEvidence({
    projectId, checklistKey: "ifaces.list", kind: "agent-report", sourceMethod: "agent:os-api",
    content: `رابط‌های واقعی سیستم:\n${env.ifaces.map((i) => `• ${i.name} — MAC: ${i.mac || "—"} — IP: ${i.ips.map((x) => x.address + (x.prefix ? "/" + x.prefix : "")).join(", ") || "—"}`).join("\n")}`,
    confidence: "verified", validityMinutes: 60,
  });
  await setChecklist("ifaces.list", {
    status: "collected", value: JSON.stringify(env.ifaces),
    method: "عامل محلی — بدون ارسال اسکن", confidence: "verified", validity: "۱ ساعت",
  });

  await addEvidence({
    projectId, checklistKey: "routing.gateway", kind: "agent-report", sourceMethod: "agent:route-table",
    content: `دروازه پیش‌فرض واقعی: ${env.gateway || "یافت نشد"} | تعداد مسیرها: ${env.routes.length}`,
    confidence: "verified", validityMinutes: 60,
  });
  await setChecklist("routing.gateway", {
    status: "collected", value: JSON.stringify({ gateway: env.gateway }),
    method: "عامل محلی — جدول مسیریابی", confidence: "verified", validity: "۱ ساعت",
  });
  await addEvidence({
    projectId, checklistKey: "routing.routes", kind: "agent-report", sourceMethod: "agent:route-table",
    content: env.routes.map((rt) => `${rt.dest} via ${rt.gateway || "link"} dev ${rt.iface}`).join("\n") || "مسیری یافت نشد",
    confidence: "verified", validityMinutes: 60,
  });
  await setChecklist("routing.routes", {
    status: "collected", value: JSON.stringify(env.routes),
    method: "عامل محلی — جدول مسیریابی", confidence: "verified", validity: "۱ ساعت",
  });

  await addEvidence({
    projectId, checklistKey: "dns.servers", kind: "agent-report", sourceMethod: "agent:resolv-conf",
    content: `سرورهای DNS واقعی: ${env.dns.join("، ") || "یافت نشد"}`,
    confidence: "verified", validityMinutes: 60,
  });
  await setChecklist("dns.servers", {
    status: "collected", value: JSON.stringify(env.dns),
    method: "عامل محلی — resolv.conf", confidence: "verified", validity: "۱ ساعت",
  });
  await setChecklist("dns.hostname", {
    status: "collected", value: JSON.stringify({ hostname: env.hostname }),
    method: "عامل محلی — API سیستم‌عامل", confidence: "verified", validity: "۲۴ ساعت",
  });

  // ARP واقعی با هشدار سند
  if (env.arp.length) {
    await addEvidence({
      projectId, checklistKey: "devices.inventory", kind: "agent-report", sourceMethod: "agent:arp",
      content: `جدول ARP واقعی سیستم (${env.arp.length} رکورد):\n${env.arp.map((a) => `${a.ip} → ${a.mac}`).join("\n")}\n\n⚠ هشدار سند: جدول همسایه‌ها فهرست کامل دستگاه‌های شبکه نیست؛ ممکن است شامل رکوردهای قدیمی نیز باشد.`,
      confidence: "limited", validityMinutes: 30,
    });
  }

  r.lines.push({ kind: "success", text: "تنظیمات محلی واقعی دریافت شد (بدون ارسال اسکن)" });
  r.lines.push({ kind: "info", text: `${env.ifaces.length} رابط، ${env.routes.length} مسیر، ${env.arp.length} رکورد ARP واقعی ثبت شد` });
  r.createdEvidence = 4;
  await audit(projectId, "اجرای مرحله موتور: تنظیمات محلی", "engine", "داده واقعی — بدون اسکن");
  await saveEngineState({ completedSteps: await markStepDone("local-config"), lastStepAt: new Date().toISOString() });
  return r;
}

// مرحله ۳: پیشنهاد محدوده — نیازمند تأیید کاربر (الزام سند بخش ۱۲)
async function stepScopeProposal(projectId: string): Promise<RunReport> {
  const r = report("scope-proposal");
  const state = await getEngineState();

  if (state.scopeApproved) {
    await setChecklist("networks.subnets", {
      status: "collected", value: JSON.stringify(state.approvedScopes),
      method: "تأیید کاربر + استنباط از تنظیمات محلی", confidence: "verified",
      validity: "تا تغییر شبکه",
      nextAction: "",
    });
    r.lines.push({ kind: "success", text: "محدوده از قبل تأیید شده است" });
    await saveEngineState({ completedSteps: await markStepDone("scope-proposal") });
    return r;
  }

  // پیشنهاد محدوده‌های شبکه آزمایشی + ثبت شبکه‌ها
  for (const n of SCENARIO_NETWORKS) {
    await upsertNetwork(projectId, n.key, {
      cidr: n.cidr, name: n.name, vlanId: n.vlanId, gateway: n.gateway,
      confidence: "inferred", discoveredVia: "agent",
    });
  }
  const proposals = SCENARIO_NETWORKS.filter((n) => n.key !== "nvr-internal").map((n) => n.cidr);

  await addEvidence({
    projectId, checklistKey: "networks.subnets", kind: "observation", sourceMethod: "inference",
    content: `محدوده‌های پیشنهادی براساس تنظیمات محلی و مسیرهای شناخته‌شده:\n${proposals.map((c) => `• ${c}`).join("\n")}\nالزام سند: بررسی فقط در محدوده تأییدشده انجام شود؛ تأیید نهایی با کاربر است.`,
    confidence: "limited",
  });
  await setChecklist("networks.subnets", {
    status: "needs-user-action", value: JSON.stringify(proposals),
    method: "استنباط از تنظیمات محلی", confidence: "limited",
    nextAction: "محدوده‌های پیشنهادی را در «مرکز اقدامات بعدی» بازبینی و تأیید کنید",
  });

  r.lines.push({ kind: "warn", text: "محدوده‌های بررسی پیشنهاد شد؛ تأیید کاربر لازم است (الزام بخش ۱۲ سند)" });
  r.lines.push({ kind: "info", text: proposals.join(" | ") });
  r.createdEvidence = 1;
  await audit(projectId, "پیشنهاد محدوده بررسی", "engine", proposals.join(", "));
  await saveEngineState({ completedSteps: await markStepDone("scope-proposal"), lastStepAt: new Date().toISOString() });
  return r;
}

// تأیید محدوده توسط کاربر
export async function approveScopes(scopes: string[]) {
  const project = await getProject();
  // اطمینان از وجود رکورد شبکه‌های تأییدشده (حتی اگر پیشنهاد محدوده هنوز اجرا نشده باشد)
  for (const n of SCENARIO_NETWORKS) {
    if (scopes.includes(n.cidr)) {
      await upsertNetwork(project.id, n.key, {
        cidr: n.cidr, name: n.name, vlanId: n.vlanId, gateway: n.gateway,
        confidence: "verified", discoveredVia: "user",
      });
    }
  }
  // اول رکوردهای شبکه — سپس ثبت وضعیت (مقاوم در برابر خطا)
  for (const cidr of scopes) {
    await db.network.updateMany({ where: { projectId: project.id, cidr }, data: { scopeApproved: true, confidence: "verified" } }).catch(() => null);
  }
  const state = await saveEngineState({ scopeApproved: true, approvedScopes: scopes });
  await db.networkProject.update({ where: { id: project.id }, data: { scope: JSON.stringify(scopes) } });
  await setChecklist("networks.subnets", {
    status: "collected", value: JSON.stringify(scopes),
    method: "تأیید صریح کاربر", confidence: "verified", validity: "تا تغییر شبکه",
  });
  await audit(project.id, "تأیید محدوده بررسی توسط کاربر", "engine", scopes.join(", "));
  return state;
}

// مرحله ۴: استفاده از اطلاعات موجود (ARP/Route/DNS) — شبیه‌سازی‌شده
async function stepExistingData(projectId: string): Promise<RunReport> {
  const r = report("existing-data");
  let devices = 0;

  // عامل شبیه‌سازی‌شده روی 10.10.0.9 — جدول ARP آن
  for (const dev of SCENARIO_DEVICES) {
    if (!dev.discoveredBy.includes("arp")) continue;
    const d = await upsertDevice(projectId, {
      identityKey: dev.key, hostname: dev.hostname || null, vendor: dev.vendor, model: dev.model,
      type: "unknown", ip: dev.ip, mac: dev.mac, confidence: "inferred", status: "unknown",
      isSimulated: true, sourceMethod: "arp",
    });
    await ensureIfaceIp(d.id, { name: "eth0", mac: dev.mac, ip: dev.ip });
    devices++;
    await addEvidence({
      projectId, deviceId: d.id, checklistKey: "devices.inventory", kind: "observation",
      sourceMethod: "arp", confidence: "limited", isSimulated: true, validityMinutes: 30,
      content: `رکورد جدول همسایه عامل شبیه‌سازی‌شده: ${dev.ip} → ${dev.mac} (وضعیت REACHABLE)\nهویت اولیه: فقط IP+MAC؛ نوع دستگاه هنوز تعیین نشده است.`,
    });
  }

  // رکورد قدیمی ARP — به عنوان شاهد قدیمی ثبت می‌شود نه دستگاه قطعی (الزام سند ۲.۳)
  await addEvidence({
    projectId, checklistKey: "devices.inventory", kind: "observation", sourceMethod: "arp",
    confidence: "limited", isSimulated: true,
    content: `رکورد قدیمی (STALE) در جدول همسایه: ${STALE_ARP_ENTRY.ip} → ${STALE_ARP_ENTRY.mac}\nهشدار سند: این رکورد ممکن است متعلق به دستگاهی باشد که دیگر در شبکه نیست؛ نبود دستگاه فعلی تأیید نمی‌شود.`,
    validityMinutes: 30,
  });
  r.lines.push({ kind: "warn", text: `رکورد قدیمی ARP برای ${STALE_ARP_ENTRY.ip} مشاهده شد — به عنوان «قدیمی» علامت خورد، دستگاه قطعی ایجاد نشد` });

  // DNS معکوس برای دستگاه‌های دارای dns در discoveredBy
  for (const dev of SCENARIO_DEVICES.filter((d) => d.discoveredBy.includes("dns") && d.hostname)) {
    await upsertDevice(projectId, {
      identityKey: dev.key, hostname: dev.hostname, confidence: "inferred", sourceMethod: "dns",
    });
    await addEvidence({
      projectId, checklistKey: "dns.hostname", kind: "observation", sourceMethod: "dns",
      confidence: "limited", isSimulated: true,
      content: `پرس‌وجوی DNS معکوس: ${dev.ip} → ${dev.hostname} (منبع: DNS داخلی srv-dc-01)`,
    });
  }

  await setChecklist("devices.inventory", {
    status: "limited",
    value: JSON.stringify({ count: devices, source: "arp+dns" }),
    method: "جدول همسایه عامل + DNS معکوس", confidence: "limited", validity: "۳۰ دقیقه",
    nextAction: "کشف فعال کم‌فشار برای تأیید دسترس‌پذیری و کشف موارد جدید اجرا شود",
  });
  await setChecklist("dhcp.server", {
    status: "limited", value: JSON.stringify({ server: "10.10.10.5", serverHostname: "srv-dc-01" }),
    method: "شناسه سرور DHCP در Lease فعلی عامل", confidence: "limited",
    nextAction: "دریافت فهرست Leaseها نیازمند دسترسی به سرور DHCP یا خروجی پنل است",
  });
  await setChecklist("dns.hostname", {
    status: "collected", method: "عامل + DNS معکوس", confidence: "limited", validity: "۲۴ ساعت",
  });

  r.lines.push({ kind: "success", text: `${devices} دستگاه از جدول همسایه عامل (شبیه‌سازی) ثبت شد — با اطمینان محدود` });
  r.lines.push({ kind: "info", text: "نام میزبان‌ها از DNS معکوس تکمیل شد" });
  r.createdDevices = devices;
  r.createdEvidence = devices + 2;
  await audit(projectId, "اجرای مرحله موتور: اطلاعات موجود (ARP/DNS)", "engine", `${devices} دستگاه`);
  await saveEngineState({ completedSteps: await markStepDone("existing-data"), lastStepAt: new Date().toISOString() });
  return r;
}

// مرحله ۵: کشف فعال کم‌فشار — فقط در محدوده تأییدشده
async function stepActiveDiscovery(projectId: string, state: EngineState): Promise<RunReport> {
  const r = report("active-discovery");
  if (!state.scopeApproved) {
    await addAttempt(projectId, {
      method: "active-discovery", result: "blocked", failureReason: "scope-not-approved",
      notes: "الزام سند ۱۲: بررسی فقط در محدوده تأییدشده انجام می‌شود",
    });
    return {
      ...r, ok: false,
      blocked: "محدوده بررسی هنوز تأیید نشده است. ابتدا در «مرکز اقدامات بعدی» محدوده را تأیید کنید.",
      lines: [{ kind: "error", text: "اجرای کشف فعال متوقف شد: محدوده تأیید نشده (الزام بخش ۱۲)" }],
    };
  }

  let found = 0;
  let offline = 0;
  // ICMP کم‌فشار: فقط دستگاه‌های «active» در سناریو — به ترتیب با فاصله (شبیه‌سازی نرخ محدود)
  for (const dev of SCENARIO_DEVICES) {
    if (!dev.discoveredBy.includes("active")) continue;
    const d = await upsertDevice(projectId, {
      identityKey: dev.key, vendor: dev.vendor, model: dev.model,
      confidence: "inferred", status: "online", sourceMethod: "icmp",
    });
    await ensureIfaceIp(d.id, { name: "eth0", mac: dev.mac, ip: dev.ip });
    await addEvidence({
      projectId, deviceId: d.id, kind: "observation", sourceMethod: "icmp",
      confidence: "limited", isSimulated: true, validityMinutes: 10,
      content: `پاسخ ICMP از ${dev.ip} (۴ بسته، تأخیر میانگین ${(Math.random() * 4 + 1).toFixed(1)}ms) — دسترس‌پذیری تأیید شد؛ پاسخ‌ندادن به‌تنهایی خاموشی را اثبات نمی‌کند و بالعکس.`,
    });
    found++;
  }
  // دستگاه‌های تاریخی پشت لینک رادیویی — الان پاسخ نمی‌دهند (لینک رادیویی قطع است)
  for (const dev of SCENARIO_DEVICES) {
    if (!dev.discoveredBy.includes("active-hist")) continue;
    const d = await upsertDevice(projectId, {
      identityKey: dev.key, vendor: dev.vendor, model: dev.model,
      confidence: "limited", status: "offline", sourceMethod: "icmp-hist", downgrade: true,
      notes: "مشاهده تاریخی — در بررسی فعلی پاسخ نمی‌دهد",
    });
    await ensureIfaceIp(d.id, { name: "eth0", mac: dev.mac, ip: dev.ip });
    await addEvidence({
      projectId, deviceId: d.id, kind: "observation", sourceMethod: "icmp",
      confidence: "limited", isSimulated: true,
      content: `عدم پاسخ ICMP از ${dev.ip} در بررسی فعلی. سابقه مشاهده قبلی وجود دارد. علت‌های محتمل: قطع مسیر/لینک بالادستی، خاموشی، فیلتر. پاسخ‌ندادن به‌تنهایی خاموشی را اثبات نمی‌کند.`,
    });
    await db.changeEvent.create({
      data: { projectId, deviceId: d.id, kind: "status-change", before: "online", after: "offline", source: "icmp" },
    });
    offline++;
  }

  // ONVIF WS-Discovery در لایه ۲ محلی
  for (const dev of SCENARIO_DEVICES) {
    if (!dev.discoveredBy.includes("onvif")) continue;
    const d = await db.device.findUnique({ where: { identityKey: dev.key } });
    if (!d) continue;
    await addEvidence({
      projectId, deviceId: d.id, kind: "api-response", sourceMethod: "onvif",
      confidence: "verified", isSimulated: true,
      content: `پاسخ ONVIF WS-Discovery از ${dev.ip}: سازنده=${dev.vendor} مدل=${dev.model} — دستگاه در لایه ۲ محلی قابل کشف است.`,
    });
  }

  await setChecklist("devices.inventory", {
    status: "collected", value: JSON.stringify({ reachable: found, unreachable: offline }),
    method: "ICMP کم‌فشار + جدول همسایه + DNS", confidence: "limited", validity: "۱۰ دقیقه",
  });
  await setChecklist("networks.ipv6", {
    status: "collected", value: JSON.stringify({ seen: false }),
    method: "بررسی NDP و رابط‌ها در محدوده تأییدشده", confidence: "limited",
    error: "", nextAction: "",
  });
  await addAttempt(projectId, { method: "active-discovery", result: "success", trafficCost: "low", notes: `${found} پاسخ، ${offline} بدون پاسخ` });

  r.lines.push({ kind: "success", text: `کشف کم‌فشار کامل شد: ${found} دستگاه پاسخ داد، ${offline} دستگاه پاسخ نداد (شبیه‌سازی)` });
  r.lines.push({ kind: "info", text: "ONVIF WS-Discovery: دستگاه‌های سازگار در لایه ۲ کشف شدند" });
  r.createdDevices = found + offline;
  r.createdEvidence = found + offline;
  await audit(projectId, "اجرای مرحله موتور: کشف فعال کم‌فشار", "engine", `محدوده تأییدشده — ${found}+${offline}`);
  await saveEngineState({ completedSteps: await markStepDone("active-discovery"), lastStepAt: new Date().toISOString() });
  return r;
}

// مرحله ۶: شناسایی احتمالی نقش تجهیزات — با چند شاهد (سند ۴.۳)
async function stepRoleGuess(projectId: string): Promise<RunReport> {
  const r = report("role-guess");
  let count = 0;
  for (const dev of SCENARIO_DEVICES) {
    const d = await db.device.findUnique({ where: { identityKey: dev.key } });
    if (!d) continue;
    await db.device.update({
      where: { id: d.id },
      data: { type: dev.type, roleEvidence: dev.roleEvidence || "", confidence: dev.discoveredBy.includes("onvif") ? "verified" : "inferred" },
    });
    await addEvidence({
      projectId, deviceId: d.id, checklistKey: "devices.inventory", kind: "observation",
      sourceMethod: "multi-source", confidence: dev.discoveredBy.includes("onvif") ? "verified" : "limited",
      isSimulated: true,
      content: `طبقه‌بندی چندشاهدی: ${dev.roleEvidence || "براساس OUI سازنده"}\nشواهد: ${dev.discoveredBy.map((s) => s).join("، ")}`,
    });
    count++;
  }
  r.lines.push({ kind: "success", text: `نقش احتمالی ${count} دستگاه با ذکر شواهد ثبت شد (شبیه‌سازی)` });
  r.lines.push({ kind: "info", text: "نمونه: «احتمالاً دوربین IP؛ براساس پاسخ ONVIF و اطلاعات مدل»" });
  r.createdEvidence = count;
  await audit(projectId, "اجرای مرحله موتور: طبقه‌بندی نقش دستگاه‌ها", "engine", `${count} دستگاه`);
  await saveEngineState({ completedSteps: await markStepDone("role-guess"), lastStepAt: new Date().toISOString() });
  return r;
}

// مرحله ۷: اطلاعات مدیریتی — با ثبت دلیل شکست (سند ۲.۳)
async function stepMgmtInfo(projectId: string): Promise<RunReport> {
  const r = report("mgmt-info");
  let ok = 0, failed = 0, partial = 0;

  for (const dev of SCENARIO_DEVICES) {
    const d = await db.device.findUnique({ where: { identityKey: dev.key } });
    if (!d || !dev.mgmt) continue;

    // SNMP فعال
    if (dev.mgmt.snmp === "ok") {
      const info = scenarioMgmtInfo(dev);
      await db.device.update({ where: { id: d.id }, data: { confidence: "verified" } });
      await addEvidence({
        projectId, deviceId: d.id, checklistKey: "mgmt.vendor-model", kind: "api-response",
        sourceMethod: "snmpv3", confidence: "verified", isSimulated: true, validityMinutes: 24 * 60,
        content: `SNMPv3 (فقط‌خواندنی) از ${dev.ip}:\n${JSON.stringify(info, null, 1)}`,
      });
      ok++;
      continue;
    }
    // API فعال
    if (dev.mgmt.api === "ok" && dev.mgmt.snmp !== "ok") {
      const info = scenarioMgmtInfo(dev);
      await db.device.update({ where: { id: d.id }, data: { confidence: "verified" } });
      await addEvidence({
        projectId, deviceId: d.id, checklistKey: "mgmt.vendor-model", kind: "api-response",
        sourceMethod: "api-ro", confidence: "verified", isSimulated: true, validityMinutes: 24 * 60,
        content: `API رسمی سازنده (فقط‌خواندنی) از ${dev.ip}:\n${JSON.stringify(info, null, 1)}`,
      });
      ok++;
      continue;
    }
    // SNMP غیرفعال — شکست با علت مشخص
    if (dev.mgmt.snmp === "disabled") {
      await addAttempt(projectId, {
        checklistKey: "mgmt.vendor-model", method: "snmpv3", target: dev.ip,
        result: "failed", failureReason: "protocol-disabled",
        notes: "پاسخی از SNMP دریافت نشد — احتمال غیرفعال بودن سرویس یا فیلتر پورت 161",
      });
      await addEvidence({
        projectId, deviceId: d.id, checklistKey: "mgmt.vendor-model", kind: "observation",
        sourceMethod: "snmpv3", confidence: "inferred", isSimulated: true,
        content: `عدم پاسخ SNMPv3 از ${dev.ip}: علت ثبت‌شده = پروتکل غیرفعال/فیلتر. تنظیمات بدون اطلاع تغییر نمی‌کند (الزام سند).`,
      });
      await setChecklist("mgmt.vendor-model", {
        status: "needs-user-action",
        error: `SNMPv3 روی ${dev.hostname} غیرفعال است (Timeout/پروتکل غیرفعال)`,
        nextAction: "راهنمای «اطلاعات مدیریتی سوئیچ» را دنبال کنید: SNMPv3 فقط‌خواندنی فعال شود یا خروجی CLI چسبانده شود",
      });
      failed++;
      continue;
    }
    // API با دسترسی محدود
    if (dev.mgmt.api === "disabled") {
      await addAttempt(projectId, {
        checklistKey: "mgmt.vendor-model", method: "api", target: dev.ip,
        result: "failed", failureReason: "access-denied",
        notes: "کنترلر/حساب API در دسترس نیست",
      });
      await setChecklist("mgmt.vendor-model", {
        status: "limited",
        error: "دسترسی API کامل نیست — اطلاعات از OUI سازنده محدود است",
        nextAction: "خروجی پنل سازنده یا اطلاعات دستگاه را وارد کنید",
      });
      partial++;
    }
  }

  // RADIO-B: نیاز به اطلاعات ورود
  const rb = await db.device.findUnique({ where: { identityKey: "RADIO-B" } });
  if (rb) {
    await addAttempt(projectId, {
      checklistKey: "radio.links", method: "api", target: "10.10.0.11",
      result: "failed", failureReason: "access-denied",
      notes: "هیچ حدس یا رمز پیش‌فرضی آزمایش نشد (الزام سند ۱۲)",
    });
    await setChecklist("radio.links", {
      status: "needs-access",
      error: "اطلاعات ورود فقط‌خواندنی برای سمت B لینک رادیویی موجود نیست",
      nextAction: "اطلاعات ورود فقط‌خواندنی را از فرم امن وارد کنید یا خروجی پنل را بچسبانید",
    });
  }

  // اطلاعات NVR از API فقط‌خواندنی — ایجاد دوربین‌های پشت شبکه داخلی NVR
  const nvrDev = await db.device.findUnique({ where: { identityKey: "NVR-01" } });
  if (nvrDev) {
    const recorder = await db.recorder.upsert({
      where: { deviceId: nvrDev.id },
      update: { channelCount: 8, poeInternal: true, storageInfo: "۲ دیسک ۴TB — سلامت: طبیعی", lastSeen: new Date() },
      create: { deviceId: nvrDev.id, rtype: "NVR", vendor: "Dahua", model: "NVR4108HS-8P-4KS3", firmware: "4.0.2", channelCount: 8, poeInternal: true, storageInfo: "۲ دیسک ۴TB — سلامت: طبیعی", lastSeen: new Date() },
    });
    for (const cam of SCENARIO_CAMERAS.filter((c) => c.channel)) {
      const camDev = await upsertDevice(projectId, {
        identityKey: cam.deviceKey, vendor: cam.vendor, model: cam.model, type: "camera",
        ip: SCENARIO_DEVICES.find((d) => d.key === cam.deviceKey)?.ip, mac: SCENARIO_DEVICES.find((d) => d.key === cam.deviceKey)?.mac,
        confidence: cam.behindNvrPoe ? "limited" : "verified", roleEvidence: SCENARIO_DEVICES.find((d) => d.key === cam.deviceKey)?.roleEvidence,
        sourceMethod: "nvr-api",
      });
      const scen = SCENARIO_DEVICES.find((d) => d.key === cam.deviceKey);
      if (scen) await ensureIfaceIp(camDev.id, { name: "eth0", mac: scen.mac, ip: scen.ip });
      await db.camera.upsert({
        where: { deviceId: camDev.id },
        update: { firmware: cam.firmware, serial: cam.serial, onvifSupport: cam.onvif, recorderId: recorder.id, channelNo: cam.channel ?? null, lastSeen: cam.reachableFromAgent || cam.behindNvrPoe ? new Date() : null },
        create: {
          deviceId: camDev.id, vendor: cam.vendor, model: cam.model, firmware: cam.firmware,
          serial: cam.serial, onvifSupport: cam.onvif, recorderId: recorder.id, channelNo: cam.channel ?? null,
        },
      });
      const camRec = await db.camera.findUnique({ where: { deviceId: camDev.id } });
      await db.recorderChannel.upsert({
        where: { recorderId_channelNo: { recorderId: recorder.id, channelNo: cam.channel! } },
        update: { cameraId: camRec?.id ?? null, online: cam.nvrOnline ? "online" : "offline", recording: cam.recording, lastVerified: new Date() },
        create: { recorderId: recorder.id, channelNo: cam.channel!, cameraId: camRec?.id ?? null, online: cam.nvrOnline ? "online" : "offline", recording: cam.recording, lastVerified: new Date() },
      });
      await addEvidence({
        projectId, deviceId: camDev.id, checklistKey: "nvr.inventory", kind: "api-response",
        sourceMethod: "nvr-api", confidence: cam.behindNvrPoe ? "limited" : "verified", isSimulated: true,
        content: `API فقط‌خواندنی ضبط‌کننده: کانال ${cam.channel} → دوربین ${cam.deviceKey} (${cam.model}) | وضعیت آنلاین NVR: ${cam.nvrOnline ? "آنلاین" : "آفلاین"} | وضعیت ضبط از API: ${cam.recording === "active" ? "فعال" : cam.recording === "inactive" ? "غیرفعال" : "نامشخص"}${cam.behindNvrPoe ? "\n⚠ این دوربین پشت شبکه داخلی PoE ضبط‌کننده است؛ عدم مشاهده مستقیم آن از عامل، خرابی تلقی نمی‌شود (الزام سند ۶.۳)." : ""}`,
      });
    }
    await setChecklist("nvr.inventory", {
      status: "collected", value: JSON.stringify({ recorder: "NVR-01", channels: 8 }),
      method: "API رسمی سازنده (فقط‌خواندنی)", confidence: "limited", validity: "۶۰ دقیقه",
    });
    await setChecklist("cam.inventory", {
      status: "collected", value: JSON.stringify({ total: SCENARIO_CAMERAS.length }),
      method: "ONVIF + API ضبط‌کننده", confidence: "limited", validity: "۶۰ دقیقه",
    });
  }

  await setChecklist("mgmt.vendor-model", {
    status: ok > 0 ? "collected" : "needs-user-action",
    value: JSON.stringify({ verified: ok, failed, partial }),
    method: "SNMPv3/API فقط‌خواندنی متناسب با سازنده", confidence: ok > 0 ? "limited" : "",
    validity: "۲۴ ساعت",
    error: failed > 0 ? `${failed} دستگاه با شکست مواجه شد (علت: پروتکل غیرفعال/رد دسترسی)` : "",
    nextAction: failed > 0 ? "برای دستگاه‌های ناموفق، راهنمای اختصاصی سازنده دنبال شود" : "",
  });
  await setChecklist("mgmt.firmware", {
    status: ok > 0 ? "collected" : "limited", method: "SNMPv3/API", confidence: "verified", validity: "۷ روز",
  });
  await setChecklist("mgmt.interfaces", {
    status: ok > 0 ? "collected" : "limited", method: "SNMPv3 (ifTable)", confidence: "verified", validity: "۷ روز",
  });

  // تعارض IP مشکوک — از مقایسه خروجی DHCP پنل با مشاهده عامل (سند ۸.۳)
  await addEvidence({
    projectId, checklistKey: "dhcp.leases", kind: "observation", sourceMethod: "cross-check",
    confidence: "limited", isSimulated: true,
    content: `مقایسه متقاطع: برای IP ${IP_CONFLICT_SUSPECT.ip} دو MAC متفاوت مشاهده شده:\n• از عامل: ${IP_CONFLICT_SUSPECT.macA}\n• از خروجی پنل DHCP: ${IP_CONFLICT_SUSPECT.macB}\nطبق سند ۸.۳: این یک «احتمال تعارض» است تا بررسی شود — قطعی اعلام نمی‌شود.`,
  });
  await setChecklist("dhcp.leases", {
    status: "limited", value: JSON.stringify({ count: 14, conflictSuspect: IP_CONFLICT_SUSPECT.ip }),
    method: "خروجی پنل DHCP (داده شبیه‌سازی‌شده)", confidence: "limited", validity: "۳۰ دقیقه",
    error: "فهرست کامل Leaseها نیازمند تأیید کاربر است",
  });

  r.lines.push({ kind: "success", text: `اطلاعات مدیریتی: ${ok} موفق، ${failed} ناموفق (علت ثبت شد)، ${partial} محدود (شبیه‌سازی)` });
  r.lines.push({ kind: "warn", text: `عدم پاسخ SNMP سومین سوئیچ: علت = پروتکل غیرفعال — اقدام کاربر پیشنهاد شد` });
  r.lines.push({ kind: "info", text: "کانال‌های NVR خوانده شد؛ دوربین‌های پشت PoE داخلی NVR به‌درستی مدل شدند" });
  r.createdEvidence = ok + failed + SCENARIO_CAMERAS.filter((c) => c.channel).length + 1;
  await audit(projectId, "اجرای مرحله موتور: اطلاعات مدیریتی", "engine", `${ok} موفق / ${failed} ناموفق`);
  await saveEngineState({ completedSteps: await markStepDone("mgmt-info"), lastStepAt: new Date().toISOString() });
  return r;
}

// مرحله ۸: تحلیل اتصال‌ها — سه نوع رابطه جدا (سند بخش ۵)
async function stepLinkAnalysis(projectId: string): Promise<RunReport> {
  const r = report("link-analysis");

  // ── فیزیکی تأییدشده با LLDP دوطرفه
  const lldpLinks: { src: string; dst: string; srcPort: string; dstPort: string; note: string }[] = [
    { src: "SW-CORE", dst: "RTR-01", srcPort: "Gi1/0/1", dstPort: "eth1", note: "LLDP دوطرفه: هر دو طرف همسایگی را اعلام می‌کنند" },
    { src: "SW-CORE", dst: "SW-A2", srcPort: "Gi1/0/3", dstPort: "SFP1", note: "LLDP دوطرفه" },
    { src: "SW-CORE", dst: "RADIO-A", srcPort: "Gi1/0/7", dstPort: "eth0", note: "LLDP دوطرفه" },
    { src: "SW-A2", dst: "NVR-01", srcPort: "eth8", dstPort: "eth0", note: "LLDP دوطرفه" },
    { src: "RADIO-A", dst: "SW-B1", srcPort: "eth0-wireless", dstPort: "eth0", note: "همسایگی LLDP تاریخی هنگام برقراری لینک — اکنون لینک رادیویی قطع است" },
  ];
  for (const l of lldpLinks) {
    const link = await upsertLink(projectId, {
      srcKey: l.src, dstKey: l.dst, kind: "physical", relation: "uplink",
      srcPort: l.srcPort, dstPort: l.dstPort, sourceMethod: "lldp",
      confidence: l.src === "RADIO-A" ? "limited" : "verified", evidenceText: l.note,
      verified: true,
    });
    if (link) {
      await addEvidence({
        projectId, linkId: link.id, kind: "api-response", sourceMethod: "lldp",
        confidence: "verified", isSimulated: true,
        content: `LLDP از ${l.src} (${l.srcPort}): همسایه ${l.dst} (${l.dstPort}). ${l.note}`,
      });
      r.createdEvidence++;
    }
    r.createdLinks++;
  }

  // ── فیزیکی استنباطی از FDB — با هشدار صریح سند
  const fdbInfer: { src: string; dst: string; srcPort: string; note: string }[] = [
    { src: "SW-CORE", dst: "SW-A3", srcPort: "Gi1/0/4", note: "MACهای متعدد کاربران روی این پورت دیده شده؛ LLDP سمت مقابل غیرفعال است. ممکن است سوئیچ دیگری پشت پورت باشد — اتصال مستقیم قطعی نیست." },
    { src: "SW-A2", dst: "CAM-01", srcPort: "eth5", note: "فقط MAC دوربین روی پورت دیده شده — استنباط اتصال، تأیید نشده" },
    { src: "SW-A2", dst: "CAM-02", srcPort: "eth9", note: "MAC دوربین روی پورت (از FDB سوئیچ)" },
    { src: "SW-CORE", dst: "NVR-01", srcPort: "—", note: "MAC از مسیر SW-A2 مسیر یابی می‌شود؛ اتصال مستقیم نیست" },
  ];
  for (const l of fdbInfer) {
    const link = await upsertLink(projectId, {
      srcKey: l.src, dstKey: l.dst, kind: "physical", relation: "fdb-inferred",
      srcPort: l.srcPort, sourceMethod: "fdb", confidence: "inferred", evidenceText: l.note, verified: false,
    });
    if (link) {
      await addEvidence({
        projectId, linkId: link.id, kind: "observation", sourceMethod: "fdb",
        confidence: "limited", isSimulated: true,
        content: `FDB ${l.src} پورت ${l.srcPort}: MAC مقصد مشاهده شد.\n⚠ محدودیت سند: مشاهده MAC روی پورت سوئیچ به معنی اتصال مستقیم قطعی نیست. ${l.note}`,
      });
      r.createdEvidence++;
    }
    r.createdLinks++;
  }

  // لینک رادیویی دوطرفه
  const radioLink = await upsertLink(projectId, {
    srcKey: "RADIO-A", dstKey: "RADIO-B", kind: "physical", relation: "radio-ptp",
    sourceMethod: "api-ro", confidence: RADIO_LINK_CURRENTLY_DOWN ? "limited" : "verified",
    evidenceText: RADIO_LINK_CURRENTLY_DOWN
      ? "جدول registration سمت A همسایه B را نشان می‌دهد؛ اکنون لینک قطع است (عدم پاسخ‌گویی). کیفیت آخرین تأیید: -67dBm"
      : "لینک رادیویی برقرار و دوطرفه تأیید شده",
    verified: !RADIO_LINK_CURRENTLY_DOWN,
  });
  if (radioLink) {
    await addEvidence({
      projectId, linkId: radioLink.id, kind: "api-response", sourceMethod: "api-ro",
      confidence: "limited", isSimulated: true,
      content: `API airMAX سمت A: طرف مقابل RADIO-B، حالت PtP، آخرین سیگنال -67dBm، وضعیت فعلی: ${RADIO_LINK_CURRENTLY_DOWN ? "قطع" : "برقرار"}. سمت B نیازمند اطلاعات ورود است.`,
    });
    r.createdEvidence++;
  }
  r.createdLinks++;

  // دوربین‌های VLAN دوربین — استنباط از FDB سوئیچ طبقه ۲ (با هشدار سند ۵.۱)
  const camVlanInfer: { src: string; dst: string; port: string }[] = [
    { src: "SW-A2", dst: "CAM-03", port: "eth12" },
    { src: "SW-A2", dst: "CAM-04", port: "eth13" },
  ];
  for (const l of camVlanInfer) {
    const link = await upsertLink(projectId, {
      srcKey: l.src, dstKey: l.dst, kind: "physical", relation: "fdb-inferred",
      srcPort: l.port, sourceMethod: "fdb", confidence: "inferred",
      evidenceText: "MAC دوربین روی پورت سوئیچ طبقه ۲ در VLAN ۳۰ مشاهده شد — استنباط اتصال، تأیید مستقیم نیست (LLDP دوربین فعال نیست).",
      verified: false,
    });
    if (link) r.createdLinks++;
  }

  // دوربین‌های پشت PoE داخلی NVR — اتصال فیزیکی فقط به خود ضبط‌کننده (سند ۶.۳-۳)
  for (const camKey of ["CAM-05", "CAM-06"]) {
    const link = await upsertLink(projectId, {
      srcKey: camKey, dstKey: "NVR-01", kind: "physical", relation: "nvr-poe-internal",
      sourceMethod: "nvr-api", confidence: "limited",
      evidenceText: "دوربین به پورت PoE داخلی خود ضبط‌کننده متصل است (براساس API ضبط‌کننده و شبکه داخلی 10.1.30.0/24). این دوربین به سوئیچ سازمانی متصل نیست و از عامل قابل مشاهده مستقیم نیست — عدم مشاهده، خرابی نیست (الزام سند ۶.۳).",
      verified: false,
    });
    if (link) {
      await addEvidence({
        projectId, linkId: link.id, kind: "api-response", sourceMethod: "nvr-api",
        confidence: "limited", isSimulated: true,
        content: `API ضبط‌کننده: کانال داخلی PoE برای ${camKey} — عضو شبکه داخلی 10.1.30.0/24`,
      });
      r.createdEvidence++;
    }
    r.createdLinks++;
  }

  // دوربین ساختمان B — پشت سوئیچ ساختمان B (مشاهده تاریخی)
  const cam7Link = await upsertLink(projectId, {
    srcKey: "SW-B1", dstKey: "CAM-07", kind: "physical", relation: "fdb-inferred",
    srcPort: "eth3", sourceMethod: "fdb", confidence: "inferred",
    evidenceText: "MAC دوربین روی پورت ۳ سوئیچ ساختمان B (مشاهده تاریخی هنگام برقراری لینک رادیویی) — اکنون به دلیل قطع لینک رادیویی قابل تأیید مجدد نیست.",
    verified: false,
  });
  if (cam7Link) r.createdLinks++;

  // ── منطقی: عضویت VLAN و Gateway
  for (const n of SCENARIO_NETWORKS.filter((x) => x.vlanId)) {
    for (const dev of SCENARIO_DEVICES.filter((d) => d.network === n.key)) {
      const link = await upsertLink(projectId, {
        srcKey: dev.key, dstKey: "RTR-01", kind: "logical", relation: `vlan-${n.vlanId}-gateway`,
        vlan: n.vlanId!, sourceMethod: "inferred", confidence: "inferred",
        evidenceText: `عضویت در VLAN ${n.vlanId} (${n.name}) استنباط از آدرس IP و مسیر Gateway — طبق سند: VLAN از روی کلاس IP به‌تنهایی تعیین نمی‌شود؛ تأیید از SNMP سوئیچ هسته.`,
      });
      if (link) r.createdLinks++;
    }
  }
  // VLANها از SNMP سوئیچ هسته — تأییدشده
  await addEvidence({
    projectId, checklistKey: "networks.vlans", kind: "api-response", sourceMethod: "snmpv3",
    confidence: "verified", isSimulated: true, validityMinutes: 24 * 60,
    content: "SNMP سوئیچ هسته: VLANهای فعال ۱ (مدیریت)، ۱۰ (کاربران)، ۳۰ (دوربین‌ها) + ترانک‌های مربوطه",
  });
  await setChecklist("networks.vlans", {
    status: "collected", value: JSON.stringify([1, 10, 30]),
    method: "SNMPv3 سوئیچ هسته", confidence: "verified", validity: "۲۴ ساعت",
  });
  await setChecklist("networks.subnets", {
    status: "collected", value: JSON.stringify(SCENARIO_NETWORKS.map((n) => n.cidr)),
    method: "تأیید کاربر + SNMP تجهیزات", confidence: "verified", validity: "تا تغییر شبکه",
  });

  // ── کاربردی: کانال NVR و وابستگی‌ها
  const nvrDev = await db.device.findUnique({ where: { identityKey: "NVR-01" } });
  if (nvrDev) {
    for (const cam of SCENARIO_CAMERAS.filter((c) => c.registeredInNvr && c.channel)) {
      const link = await upsertLink(projectId, {
        srcKey: cam.deviceKey, dstKey: "NVR-01", kind: "functional", relation: "nvr-channel",
        sourceMethod: "nvr-api", confidence: "verified",
        evidenceText: `دوربین در کانال ${cam.channel} ضبط‌کننده ثبت شده است.\n⚠ سند ۵.۳: ثبت در NVR به معنی اتصال کابلی مستقیم به NVR نیست.`,
        verified: true,
      });
      if (link) {
        await addEvidence({
          projectId, linkId: link.id, kind: "api-response", sourceMethod: "nvr-api",
          confidence: "verified", isSimulated: true,
          content: `فهرست کانال‌های NVR (API فقط‌خواندنی): کانال ${cam.channel} = ${cam.deviceKey}`,
        });
        r.createdEvidence++;
      }
      r.createdLinks++;
    }
    // دوربین کشف‌شده ولی ثبت‌نشده — سناریوی ۶.۳-۶
    const unreg = await db.device.findUnique({ where: { identityKey: "CAM-04" } });
    if (unreg) {
      await addEvidence({
        projectId, deviceId: unreg.id, checklistKey: "cam.inventory", kind: "observation",
        sourceMethod: "cross-check", confidence: "verified", isSimulated: true,
        content: "مقایسه فهرست دوربین‌های کشف‌شده با کانال‌های NVR: این دوربین در شبکه پاسخ می‌دهد ولی در هیچ کانالی از ضبط‌کننده ثبت نشده است (سناریوی ۶.۳-۶ سند).",
      });
      r.createdEvidence++;
    }
  }
  // وابستگی DNS/DHCP
  const dnsLink = await upsertLink(projectId, {
    srcKey: "SRV-DC1", dstKey: "RTR-01", kind: "functional", relation: "dhcp-dns-service",
    sourceMethod: "inferred", confidence: "limited",
    evidenceText: "این سرور سرویس DHCP و DNS شبکه را ارائه می‌دهد (براساس شناسه Lease و پورت‌های باز). وابستگی سایر دستگاه‌ها به آن احتمالی است.",
  });
  if (dnsLink) r.createdLinks++;

  await setChecklist("conn.neighbors", {
    status: "collected", value: JSON.stringify({ verified: 5, inferred: 4 }),
    method: "LLDP/CDP + FDB", confidence: "limited", validity: "۷ روز",
    error: "",
    nextAction: "برای تأیید اتصال‌های استنباطی، LLDP روی سوئیچ طبقه ۳ فعال یا پنل بررسی شود",
  });
  await setChecklist("conn.vlan-bridge", {
    status: "collected", method: "SNMPv3 سوئیچ هسته", confidence: "verified", validity: "۷ روز",
  });

  r.lines.push({ kind: "success", text: "اتصال‌ها در سه نوع جداگانه ثبت شد: فیزیکی (۵ تأییدشده + ۴ استنباطی + رادیویی)، منطقی (VLAN/Gateway)، کاربردی (کانال NVR)" });
  r.lines.push({ kind: "warn", text: "اتصال‌های استنباطی از FDB با هشدار «اتصال مستقیم قطعی نیست» ثبت شدند" });
  await audit(projectId, "اجرای مرحله موتور: تحلیل اتصال‌ها", "engine", `${r.createdLinks} رابطه`);
  await saveEngineState({ completedSteps: await markStepDone("link-analysis"), lastStepAt: new Date().toISOString() });
  return r;
}

// مرحله ۹: تشخیص اطلاعات مفقود
async function stepMissingAnalysis(projectId: string): Promise<RunReport> {
  const r = report("missing-analysis");
  const items = await db.checklistItem.findMany({ where: { projectId } });

  let missing = 0;
  for (const it of items) {
    if (it.status !== "not-collected" && it.status !== "needs-access" && it.status !== "needs-user-action") continue;
    missing++;
    const def = CHECKLIST_GROUPS.flatMap((g) => g.items).find((i) => i.itemKey === it.itemKey);
    if (it.status === "not-collected") {
      await setChecklist(it.itemKey, {
        status: it.guideKey === "manual-location" ? "needs-user-action" : "needs-access",
        nextAction: def ? `مسیر جایگزین: ${def.alternatePath}` : "راهنمای استخراج دنبال شود",
        error: "هنوز هیچ روش خودکاری برای این مورد موفق نبوده است",
      });
    }
  }

  // بررسی تازگی شواهد — داده قدیمی نباید وضعیت فعلی نمایش داده شود (الزام سند ۱۰)
  const now = Date.now();
  const staleEvidences = await db.evidence.findMany({ where: { projectId, expiresAt: { not: null, lt: new Date(now) } } });
  for (const ev of staleEvidences) {
    if (!ev.checklistKey) continue;
    const it = await db.checklistItem.findUnique({ where: { itemKey: ev.checklistKey } });
    if (it && it.status === "collected") {
      await setChecklist(it.itemKey, { status: "stale", nextAction: "شواهد این مورد منقضی شده‌اند؛ بازبینی و جمع‌آوری مجدد لازم است" });
    }
  }

  r.lines.push({ kind: "info", text: `${missing} مورد ناقص شناسایی شد؛ راهنمای اختصاصی و اقدام بعدی برای هرکدام ثبت شد` });
  r.lines.push({ kind: "warn", text: `${staleEvidences.length} شاهد منقضی بررسی شد` });
  await audit(projectId, "اجرای مرحله موتور: تحلیل شکاف اطلاعات", "engine", `${missing} مورد ناقص`);
  await saveEngineState({ completedSteps: await markStepDone("missing-analysis"), lastStepAt: new Date().toISOString() });
  return r;
}

// مرحله ۱۰: نقشه و گزارش اولیه — تولید یافته‌های تحلیلی
async function stepMapReport(projectId: string): Promise<RunReport> {
  const r = report("map-report");
  const { generateFindings } = await import("./analysis");
  const count = await generateFindings(projectId);
  r.lines.push({ kind: "success", text: `${count} یافته تحلیلی با شواهد و محدودیت نتیجه‌گیری تولید شد` });
  r.lines.push({ kind: "info", text: "نقشه سه‌لایه و گزارش اولیه آماده است" });
  await audit(projectId, "اجرای مرحله موتور: نقشه و گزارش اولیه", "engine", `${count} یافته`);
  await saveEngineState({ completedSteps: await markStepDone("map-report"), lastStepAt: new Date().toISOString() });
  return r;
}

// مرحله ۱۱: به‌روزرسانی دوره‌ای — مانیتورینگ تطبیقی (سند بخش ۸)
async function stepPeriodicUpdate(projectId: string, state: EngineState): Promise<RunReport> {
  const r = report("periodic-update");
  const { monitorTick } = await import("./monitor");
  const res = await monitorTick(projectId, state.tickCount);
  r.lines.push(...res.lines);
  r.createdEvidence = res.evidenceCount;
  await setChecklist("monitor.reachability", {
    status: "collected", method: "بررسی دوره‌ای تطبیقی", confidence: "limited", validity: "۵ دقیقه",
  });
  await setChecklist("monitor.latency-loss", {
    status: "collected", method: "بررسی دوره‌ای تطبیقی", confidence: "limited", validity: "۵ دقیقه",
  });
  await setChecklist("monitor.traffic-errors", {
    status: "limited", method: "شمارنده‌های SNMP", confidence: "limited", validity: "۵ دقیقه",
    error: "شمارنده‌های ترافیک فقط برای تجهیزات با SNMP فعال در دسترس است",
  });
  await saveEngineState({ completedSteps: await markStepDone("periodic-update"), tickCount: state.tickCount + 1, lastStepAt: new Date().toISOString() });
  await audit(projectId, "اجرای مرحله موتور: به‌روزرسانی دوره‌ای", "engine", `تیک ${state.tickCount + 1}`);
  return r;
}

async function markStepDone(step: EngineStep): Promise<EngineStep[]> {
  const state = await getEngineState();
  if (!state.completedSteps.includes(step)) return [...state.completedSteps, step];
  return state.completedSteps;
}

// ─── پیشنهاد اقدام بعدی (سند بخش ۲.۲) ─────────────────────────────
// امتیاز = ارزش اطلاعاتی، احتمال موفقیت، ترافیک، حساسیت، مجوز، هزینه، دخالت کاربر
function scoreAction(f: ActionFactors): number {
  return +(f.value * 3 + f.successProb * 10 - f.traffic * 1.5 - f.sensitivity * 1.5 - f.permission * 1.2 - f.cost * 1.0 - f.userInvolvement * 2).toFixed(2);
}

export async function recommendNextActions(): Promise<RecommendedAction[]> {
  const state = await getEngineState();
  const project = await getProject();
  const items = await db.checklistItem.findMany({ where: { projectId: project.id } });
  const done = new Set(state.completedSteps);
  const candidates: RecommendedAction[] = [];

  const add = (a: Omit<RecommendedAction, "score">) => candidates.push({ ...a, score: scoreAction(a.factors) });

  if (!done.has("env-detect")) {
    add({
      id: "run-env-detect", step: "env-detect", title: "شناسایی محیط اجرا و رابط‌های شبکه",
      description: "دریافت سیستم‌عامل، مجوزها و رابط‌های واقعی از عامل محلی — بدون ارسال هیچ بسته‌ای به شبکه.",
      factors: { value: 5, successProb: 1, traffic: 0, sensitivity: 0, permission: 0, cost: 0, userInvolvement: 0 },
      requiresConfirmation: false,
    });
  }
  if (!done.has("local-config")) {
    add({
      id: "run-local-config", step: "local-config", title: "دریافت تنظیمات محلی بدون اسکن",
      description: "خواندن رابط‌ها، مسیرها، DNS و جدول همسایه محلی — کاملاً منفعل و کم‌هزینه.",
      factors: { value: 5, successProb: 1, traffic: 0, sensitivity: 0, permission: 0, cost: 0, userInvolvement: 0 },
      requiresConfirmation: false,
    });
  }
  if (!state.scopeApproved) {
    add({
      id: "approve-scope", step: "scope-proposal", title: "بازبینی و تأیید محدوده بررسی",
      description: "الزام سند: کشف فعال فقط در محدوده تأییدشده انجام می‌شود. کشف یک شبکه جدید، مجوز خودکار اسکن آن را ایجاد نمی‌کند.",
      factors: { value: 5, successProb: 1, traffic: 0, sensitivity: 0, permission: 0, cost: 0, userInvolvement: 4 },
      requiresConfirmation: true, gatedBy: "تأیید کاربر لازم است",
    });
  }
  if (!done.has("existing-data")) {
    add({
      id: "run-existing-data", step: "existing-data", title: "استفاده از اطلاعات موجود (ARP/DNS)",
      description: "کشف ارزان و منفعل از جدول همسایه و DNS معکوس — قبل از هر اسکنی.",
      factors: { value: 4, successProb: 0.95, traffic: 0.5, sensitivity: 0.5, permission: 0, cost: 0.5, userInvolvement: 0 },
      requiresConfirmation: false,
    });
  }
  if (state.scopeApproved && !done.has("active-discovery")) {
    add({
      id: "run-active-discovery", step: "active-discovery", title: "کشف فعال کم‌فشار در محدوده تأییدشده",
      description: "ICMP محدود (۴ بسته) با نرخ کنترل‌شده + WS-Discovery — فقط در محدوده‌های تأییدشده.",
      factors: { value: 5, successProb: 0.85, traffic: 2, sensitivity: 1.5, permission: 1, cost: 1.5, userInvolvement: 0 },
      requiresConfirmation: true, gatedBy: "تأیید نهایی اجرای کشف فعال",
    });
  }
  if (done.has("active-discovery") && !done.has("role-guess")) {
    add({
      id: "run-role-guess", step: "role-guess", title: "شناسایی احتمالی نقش تجهیزات",
      description: "طبقه‌بندی چندشاهدی (OUI + پورت + mDNS + ONVIF) با ذکر شواهد — بدون نتیجه قطعی ناکافی.",
      factors: { value: 4, successProb: 0.9, traffic: 0.5, sensitivity: 0.5, permission: 0, cost: 0.5, userInvolvement: 0 },
      requiresConfirmation: false,
    });
  }
  if (done.has("role-guess") && !done.has("mgmt-info")) {
    add({
      id: "run-mgmt-info", step: "mgmt-info", title: "دریافت اطلاعات مدیریتی تجهیزات",
      description: "SNMPv3/API فقط‌خواندنی از تجهیزات دارای دسترسی؛ شکست‌ها با علت ثبت می‌شوند.",
      factors: { value: 5, successProb: 0.75, traffic: 1, sensitivity: 2.5, permission: 2.5, cost: 2, userInvolvement: 0 },
      requiresConfirmation: false,
    });
  }
  if (done.has("mgmt-info") && !done.has("link-analysis")) {
    add({
      id: "run-link-analysis", step: "link-analysis", title: "تحلیل اتصال‌ها و وابستگی‌ها",
      description: "ترکیب LLDP/CDP/FDB برای ساخت سه نوع رابطه: فیزیکی، منطقی، کاربردی.",
      factors: { value: 5, successProb: 0.8, traffic: 0.5, sensitivity: 1, permission: 1, cost: 1, userInvolvement: 0 },
      requiresConfirmation: false,
    });
  }
  if (done.has("link-analysis") && !done.has("missing-analysis")) {
    add({
      id: "run-missing-analysis", step: "missing-analysis", title: "تشخیص اطلاعات مفقود",
      description: "شناسایی شکاف‌ها، علت دریافت‌نشدن و راهنمای اختصاصی هر مورد.",
      factors: { value: 4, successProb: 1, traffic: 0, sensitivity: 0, permission: 0, cost: 0, userInvolvement: 0 },
      requiresConfirmation: false,
    });
  }
  if (!done.has("map-report") && done.has("missing-analysis")) {
    add({
      id: "run-map-report", step: "map-report", title: "تولید نقشه و گزارش اولیه",
      description: "ساخت یافته‌های تحلیلی مبتنی بر شواهد با محدودیت نتیجه‌گیری مشخص.",
      factors: { value: 5, successProb: 1, traffic: 0, sensitivity: 0, permission: 0, cost: 0.5, userInvolvement: 0 },
      requiresConfirmation: false,
    });
  }
  if (done.has("map-report") && !state.monitoringEnabled) {
    add({
      id: "enable-monitoring", step: "periodic-update", title: "فعال‌سازی پایش دوره‌ای تطبیقی",
      description: "بررسی دسترس‌پذیری و متریک‌ها با نرخ تطبیقی؛ هشدار پس از چند شکست متوالی.",
      factors: { value: 4, successProb: 0.9, traffic: 1.5, sensitivity: 2, permission: 0.5, cost: 1, userInvolvement: 1 },
      requiresConfirmation: true, gatedBy: "رضایت برای ترافیک دوره‌ای",
    });
  }
  if (state.monitoringEnabled) {
    add({
      id: "run-periodic-tick", step: "periodic-update", title: "اجرای تیک پایش دوره‌ای",
      description: `به‌روزرسانی متریک‌ها و ارزیابی هشدارها (تیک ${state.tickCount + 1}).`,
      factors: { value: 3, successProb: 1, traffic: 1, sensitivity: 1, permission: 0, cost: 0.5, userInvolvement: 0 },
      requiresConfirmation: false,
    });
  }

  // اقدام‌های مبتنی بر کاربر براساس وضعیت چک‌لیست
  const needsUser = items.filter((i) => i.status === "needs-user-action");
  for (const it of needsUser.slice(0, 5)) {
    add({
      id: `user-${it.itemKey}`, step: "missing-analysis", title: `اقدام کاربر: ${it.title}`,
      description: it.nextAction || it.error || "راهنمای استخراج اطلاعات دنبال شود",
      factors: { value: 4, successProb: 0.8, traffic: 0, sensitivity: 0.5, permission: 1, cost: 1, userInvolvement: 5 },
      requiresConfirmation: false, gatedBy: "نیازمند دخالت کاربر",
    });
  }
  const needsAccess = items.filter((i) => i.status === "needs-access");
  for (const it of needsAccess.slice(0, 5)) {
    add({
      id: `access-${it.itemKey}`, step: "missing-analysis", title: `دسترسی لازم: ${it.title}`,
      description: it.nextAction || it.error || "اطلاعات ورود فقط‌خواندنی از فرم امن وارد شود",
      factors: { value: 3.5, successProb: 0.6, traffic: 0.5, sensitivity: 1.5, permission: 3, cost: 1.5, userInvolvement: 3.5 },
      requiresConfirmation: false, gatedBy: "نیازمند اطلاعات دسترسی",
    });
  }

  // قاعده سند ۲.۲: اگر اطلاعاتی از API دریافت شده، دوباره از کاربر خواسته نشود
  return candidates.sort((a, b) => b.score - a.score);
}

// گام بعدی خودکار بر اساس ترتیب سند ۲.۱
export async function nextAutoStep(): Promise<EngineStep | null> {
  const state = await getEngineState();
  const done = new Set(state.completedSteps);
  if (state.emergencyStop) return null;
  for (const s of ENGINE_STEP_ORDER) {
    if (!done.has(s)) {
      if (s === "active-discovery" && !state.scopeApproved) continue; // گیت تأیید
      if (s === "periodic-update" && !state.monitoringEnabled) continue;
      return s;
    }
  }
  return state.monitoringEnabled ? "periodic-update" : null;
}
