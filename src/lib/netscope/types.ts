// NetScope — انواع داده مشترک
// بر اساس سند نیازمندی‌ها بخش ۱.۲ (وضعیت‌ها)، ۲ (موتور)، ۵ (اتصال‌ها)

// ─── ۱۰ وضعیت آیتم چک‌لیست (سند بخش ۱.۲) ─────────────────────────
export type ChecklistStatus =
  | "not-collected"    // دریافت‌نشده
  | "collecting"       // در حال جمع‌آوری
  | "collected"        // دریافت‌شده
  | "limited"          // دریافت‌شده با اطمینان محدود
  | "needs-access"     // نیازمند دسترسی
  | "needs-user-action"// نیازمند اقدام کاربر
  | "conflicting"      // متناقض
  | "stale"            // قدیمی و نیازمند بازبینی
  | "out-of-scope"     // خارج از محدوده
  | "unavailable";     // غیرقابل دریافت با امکانات فعلی

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  "not-collected": "دریافت‌نشده",
  "collecting": "در حال جمع‌آوری",
  "collected": "دریافت‌شده",
  "limited": "دریافت‌شده با اطمینان محدود",
  "needs-access": "نیازمند دسترسی",
  "needs-user-action": "نیازمند اقدام کاربر",
  "conflicting": "متناقض",
  "stale": "قدیمی و نیازمند بازبینی",
  "out-of-scope": "خارج از محدوده",
  "unavailable": "غیرقابل دریافت با امکانات فعلی",
};

// وضعیت‌هایی که «تکمیل‌شده» محسوب می‌شوند (برای درصد تکمیل)
export const COMPLETED_STATUSES: ChecklistStatus[] = ["collected", "limited", "out-of-scope", "unavailable"];

// سطح اطمینان
export type Confidence = "verified" | "inferred" | "limited" | "unknown";
export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  verified: "تأییدشده",
  inferred: "استنباطی",
  limited: "اطمینان محدود",
  unknown: "نامشخص",
};

// ─── انواع رابطه (سند بخش ۵) ─────────────────────────────────────
export type LinkKind = "physical" | "logical" | "functional";
export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  physical: "فیزیکی",
  logical: "منطقی",
  functional: "کاربردی",
};

// ─── نوع دستگاه ──────────────────────────────────────────────────
export const DEVICE_TYPE_LABELS: Record<string, string> = {
  router: "روتر",
  switch: "سوئیچ",
  radio: "لینک رادیویی",
  ap: "اکسس‌پوینت",
  camera: "دوربین IP",
  nvr: "ضبط‌کننده (NVR/DVR)",
  server: "سرور",
  pc: "کامپیوتر",
  printer: "چاپگر",
  phone: "تلفن IP",
  unknown: "نامشخص",
};

// ─── علل شکست (سند بخش ۲.۳) ──────────────────────────────────────
export type FailureReason =
  | "no-route"        // نبود مسیر
  | "timeout"         // Timeout
  | "access-denied"   // رد دسترسی
  | "protocol-disabled" // پروتکل غیرفعال
  | "unsupported"     // عدم پشتیبانی
  | "scope-not-approved" // محدوده تأیید نشده
  | "blocked-by-policy"; // ممنوع توسط سیاست

export const FAILURE_REASON_LABELS: Record<FailureReason, string> = {
  "no-route": "نبود مسیر",
  "timeout": "انقضای زمان (Timeout)",
  "access-denied": "رد دسترسی",
  "protocol-disabled": "پروتکل غیرفعال",
  "unsupported": "عدم پشتیبانی",
  "scope-not-approved": "محدوده هنوز تأیید نشده است",
  "blocked-by-policy": "ممنوع توسط سیاست امنیتی",
};

// ─── مراحل موتور جمع‌آوری (سند بخش ۲.۱) ──────────────────────────
export type EngineStep =
  | "env-detect"        // ۱. شناسایی محیط اجرا و رابط‌های شبکه
  | "local-config"      // ۲. دریافت تنظیمات محلی بدون ارسال اسکن
  | "scope-proposal"    // ۳. پیشنهاد محدوده بررسی و دریافت تأیید مجوز
  | "existing-data"     // ۴. استفاده از اطلاعات موجود: ARP/NDP، Route، DNS
  | "active-discovery"  // ۵. کشف فعال کم‌فشار در محدوده تأییدشده
  | "role-guess"        // ۶. شناسایی احتمالی نقش تجهیزات
  | "mgmt-info"         // ۷. دریافت اطلاعات مدیریتی از تجهیزات دارای دسترسی
  | "link-analysis"     // ۸. تحلیل اتصال‌ها و وابستگی‌ها
  | "missing-analysis"  // ۹. تشخیص اطلاعات مفقود و راهنمای اختصاصی
  | "map-report"        // ۱۰. تولید نقشه و گزارش اولیه
  | "periodic-update";  // ۱۱. به‌روزرسانی دوره‌ای

export const ENGINE_STEP_LABELS: Record<EngineStep, string> = {
  "env-detect": "شناسایی محیط اجرا و رابط‌های شبکه",
  "local-config": "دریافت تنظیمات محلی (بدون اسکن)",
  "scope-proposal": "پیشنهاد محدوده بررسی و دریافت تأیید مجوز",
  "existing-data": "استفاده از اطلاعات موجود (ARP، Route، DNS)",
  "active-discovery": "کشف فعال کم‌فشار در محدوده تأییدشده",
  "role-guess": "شناسایی احتمالی نقش تجهیزات",
  "mgmt-info": "دریافت اطلاعات مدیریتی تجهیزات",
  "link-analysis": "تحلیل اتصال‌ها و وابستگی‌ها",
  "missing-analysis": "تشخیص اطلاعات مفقود و راهنمای اختصاصی",
  "map-report": "تولید نقشه و گزارش اولیه",
  "periodic-update": "به‌روزرسانی دوره‌ای و تکمیل تدریجی",
};

// ترتیب اجرای مراحل
export const ENGINE_STEP_ORDER: EngineStep[] = [
  "env-detect", "local-config", "scope-proposal", "existing-data",
  "active-discovery", "role-guess", "mgmt-info", "link-analysis",
  "missing-analysis", "map-report", "periodic-update",
];

// ─── عوامل اولویت‌بندی اقدام بعدی (سند بخش ۲.۲) ──────────────────
export interface ActionFactors {
  value: number;          // ارزش اطلاعاتی (۰-۵)
  successProb: number;    // احتمال موفقیت (۰-۱)
  traffic: number;        // میزان ترافیک ایجادشده (۰-۵)
  sensitivity: number;    // حساسیت دستگاه (۰-۵)
  permission: number;     // نیاز به مجوز یا دسترسی (۰-۵)
  cost: number;           // هزینه و زمان اجرا (۰-۵)
  userInvolvement: number;// میزان دخالت کاربر (۰-۵)
}

export interface RecommendedAction {
  id: string;
  step: EngineStep;
  title: string;
  description: string;
  score: number; // هرچه بیشتر، اولویت بالاتر
  factors: ActionFactors;
  requiresConfirmation: boolean;
  gatedBy?: string; // شرط انسدادی
}

// ─── فرمت پشتیبانی‌شده مفسر خروجی (سند بخش ۳.۲) ──────────────────
export type ParseFormat =
  | "ipconfig-all"          // ویندوز: ipconfig /all
  | "ip-json-addr"          // لینوکس: ip -j address show
  | "ip-json-route"         // لینوکس: ip -j route show
  | "ip-json-neigh"         // لینوکس: ip -j neigh show
  | "arp-a"                 // ویندوز: arp -a
  | "arp-linux"             // لینوکس: arp -an / ip neigh
  | "get-netadapter"        // ویندوز: Get-NetAdapter (جدول)
  | "unknown";

export interface ParseResult {
  format: ParseFormat;
  formatLabel: string;
  success: boolean;
  interfaces: ParsedInterface[];
  neighbors: ParsedNeighbor[];
  routes: ParsedRoute[];
  dnsServers: string[];
  unknownSections: string[]; // بخش‌های ناشناخته — الزام معیار پذیرش ۱۴
  warnings: string[];
  errors: string[];
}

export interface ParsedInterface {
  name: string;
  mac?: string;
  ips: { address: string; prefix?: number; family: string }[];
  gateway?: string;
  mtu?: number;
  speed?: string;
  status?: string;
  dhcpEnabled?: boolean;
  dnsServers?: string[];
}

export interface ParsedNeighbor {
  ip: string;
  mac: string;
  interface?: string;
  state?: string;
}

export interface ParsedRoute {
  destination: string;
  gateway?: string;
  interface?: string;
  metric?: number;
}

// ─── دستگاه در سناریو آزمایشی (فهرست مرجع — معیار پذیرش ۱۴) ──────
export interface ScenarioDevice {
  key: string;           // identityKey
  hostname: string;
  vendor: string;
  model: string;
  type: string;
  ip: string;
  mac: string;
  network: string;       // کلید شبکه
  discoveredBy: string[];// روش‌هایی که این دستگاه را کشف می‌کنند
  mgmt?: {
    snmp?: "ok" | "disabled" | "auth-fail";
    api?: "ok" | "disabled";
    lldp?: "ok" | "disabled";
  };
  roleEvidence?: string;
  sensitivity?: "high" | "normal" | "low";
  notes?: string;
}

export interface ScenarioCamera {
  deviceKey: string;
  vendor: string;
  model: string;
  firmware: string;
  serial: string;
  onvif: boolean;
  channel?: number;      // کانال NVR
  behindNvrPoe?: boolean;// پشت شبکه داخلی NVR (سناریوی سند بخش ۶.۳)
  onCameraVlan?: boolean;
  behindRadio?: boolean;
  registeredInNvr?: boolean;
  reachableFromAgent: boolean;
  serviceOk: boolean;    // سرویس دوربین پاسخ می‌دهد
  nvrOnline: boolean;    // NVR آنلاین گزارش می‌کند
  recording: "active" | "inactive" | "unknown";
}

// ─── شاخص‌های مانیتورینگ (سند بخش ۸.۱) ───────────────────────────
export interface MonitoredMetric {
  key: string;
  label: string;
  unit: string;
  value: number;
  threshold?: number;
  status: "ok" | "warn" | "critical" | "unknown";
}

// ابزار قالب‌بندی اعداد فارسی
export function faNum(n: number | string): string {
  return Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
}

export function faDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("fa-IR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}
