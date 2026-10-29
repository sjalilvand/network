// NetScope — سناریوی شبکه آزمایشی (شبیه‌سازی‌سازی شفاف)
// ─────────────────────────────────────────────────────────────────
// همه داده‌های این فایل «شبیه‌سازی‌شده» هستند و در UI با برچسب مشخص نمایش داده می‌شوند.
// داده‌های محیط اجرا (سیستم‌عامل، رابط‌ها، مسیرها) از سیستم واقعی خوانده می‌شوند.
// این سناریو هر ۷ حالت سند بخش ۶.۳ را پوشش می‌دهد و «فهرست مرجع» برای
// اندازه‌گیری پوشش کشف (معیار پذیرش ۱۴) است.

import type { ScenarioDevice, ScenarioCamera } from "./types";

export interface ScenarioNetwork {
  key: string;
  cidr: string;
  name: string;
  vlanId: number | null;
  gateway: string;
}

export const SCENARIO_NETWORKS: ScenarioNetwork[] = [
  { key: "mgmt", cidr: "10.10.0.0/24", name: "مدیریت و تجهیزات زیرساخت", vlanId: 1, gateway: "10.10.0.1" },
  { key: "users", cidr: "10.10.10.0/24", name: "کاربران و سرورها", vlanId: 10, gateway: "10.10.10.1" },
  { key: "cams", cidr: "10.30.0.0/24", name: "دوربین‌ها (VLAN اختصاصی)", vlanId: 30, gateway: "10.30.0.1" },
  { key: "nvr-internal", cidr: "10.1.30.0/24", name: "شبکه داخلی PoE ضبط‌کننده", vlanId: null, gateway: "10.1.30.1" },
];

// ─── فهرست مرجع دستگاه‌ها (Ground Truth) ──────────────────────────
export const SCENARIO_DEVICES: ScenarioDevice[] = [
  {
    key: "RTR-01", hostname: "rtr-gw-01", vendor: "MikroTik", model: "CCR2004-1G-12S+2XS",
    type: "router", ip: "10.10.0.1", mac: "D4:CA:6D:11:00:01", network: "mgmt",
    discoveredBy: ["arp", "active", "lldp", "mgmt"],
    mgmt: { api: "ok", snmp: "disabled", lldp: "ok" },
    roleEvidence: "احتمالاً روتر/دروازه پیش‌فرض؛ براساس فرمان مسیرهای عامل (Gateway) و پاسخ API RouterOS و همسایگی LLDP سوئیچ هسته.",
    sensitivity: "high",
  },
  {
    key: "SW-CORE", hostname: "sw-core-01", vendor: "Cisco", model: "CBS350-24T-4G",
    type: "switch", ip: "10.10.0.2", mac: "68:2C:7B:22:00:02", network: "mgmt",
    discoveredBy: ["arp", "active", "lldp", "mgmt"],
    mgmt: { snmp: "ok", lldp: "ok" },
    roleEvidence: "احتمالاً سوئیچ هسته؛ براساس همسایگی LLDP با چند سوئیچ/روتر و جدول FDB پرحجم.",
    sensitivity: "high",
  },
  {
    key: "SW-A2", hostname: "sw-floor2-01", vendor: "MikroTik", model: "CRS326-24G-2S+",
    type: "switch", ip: "10.10.0.3", mac: "CC:2D:E0:33:00:03", network: "mgmt",
    discoveredBy: ["arp", "active", "lldp", "mgmt"],
    mgmt: { snmp: "ok", lldp: "ok" },
    roleEvidence: "احتمالاً سوئیچ طبقه ۲؛ براساس LLDP دوطرفه با سوئیچ هسته و اطلاعات PoE پورت‌ها.",
    sensitivity: "normal",
  },
  {
    key: "SW-A3", hostname: "sw-floor3-01", vendor: "HPE Aruba", model: "2530-24G",
    type: "switch", ip: "10.10.0.4", mac: "B4:39:D6:44:00:04", network: "mgmt",
    discoveredBy: ["arp", "active", "fdb-infer"],
    mgmt: { snmp: "disabled", lldp: "disabled" }, // SNMP و LLDP غیرفعال — دلیل نمایش شکست
    roleEvidence: "احتمالاً سوئیچ طبقه ۳؛ براساس MAC سازنده (OUI) و مشاهده MACهای متعدد کاربران روی پورت ۴ سوئیچ هسته — اتصال مستقیم قطعی نیست.",
    sensitivity: "normal",
    notes: "SNMPv3 و LLDP روی این سوئیچ غیرفعال است؛ اطلاعات مدیریتی نیازمند اقدام کاربر.",
  },
  {
    key: "SRV-DC1", hostname: "srv-dc-01", vendor: "Microsoft", model: "Windows Server 2022",
    type: "server", ip: "10.10.10.5", mac: "00:15:5D:55:00:05", network: "users",
    discoveredBy: ["arp", "active", "dns"],
    mgmt: {},
    roleEvidence: "احتمالاً سرور DHCP و DNS دامنه؛ براساس شناسه سرور DHCP در Lease عامل، پورت 53/67 باز و نام میزبان از DNS.",
    sensitivity: "high",
  },
  {
    key: "PC-ACC-01", hostname: "pc-acc-01", vendor: "Dell", model: "OptiPlex 7010",
    type: "pc", ip: "10.10.10.21", mac: "F8:BC:12:66:00:21", network: "users",
    discoveredBy: ["arp", "active", "dns"],
    roleEvidence: "احتمالاً کامپیوتر کاربری؛ براساس OUI سازنده و نام میزبان DNS.",
  },
  {
    key: "PC-ACC-02", hostname: "pc-acc-02", vendor: "HP", model: "ProDesk 400 G9",
    type: "pc", ip: "10.10.10.22", mac: "84:A9:3E:77:00:22", network: "users",
    discoveredBy: ["arp", "active", "dns"],
    roleEvidence: "احتمالاً کامپیوتر کاربری؛ براساس OUI سازنده و نام میزبان DNS.",
  },
  {
    key: "PC-ACC-03", hostname: "pc-acc-03", vendor: "Lenovo", model: "ThinkCentre M70q",
    type: "pc", ip: "10.10.10.23", mac: "8C:16:45:88:00:23", network: "users",
    discoveredBy: ["arp", "active"],
    roleEvidence: "احتمالاً کامپیوتر کاربری؛ براساس OUI سازنده.",
  },
  {
    key: "PRN-01", hostname: "prn-office-01", vendor: "Ricoh", model: "MP 301SPF",
    type: "printer", ip: "10.10.10.50", mac: "50:8F:4C:99:00:50", network: "users",
    discoveredBy: ["arp", "active", "mdns"],
    roleEvidence: "احتمالاً چاپگر شبکه؛ براساس پاسخ mDNS _ipp._tcp و OUI سازنده.",
  },
  {
    key: "AP-01", hostname: "ap-floor2-01", vendor: "TP-Link", model: "EAP245 V3",
    type: "ap", ip: "10.10.0.20", mac: "50:C7:BF:AA:00:20", network: "mgmt",
    discoveredBy: ["arp", "active"],
    mgmt: { api: "disabled" }, // کنترلر Omada در دسترس نیست
    roleEvidence: "احتمالاً اکسس‌پوینت بی‌سیم؛ براساس OUI سازنده و پاسخ پورت‌های مدیریت — بدون کنترلر، اطلاعات جزئی محدود است.",
  },
  {
    key: "AP-02", hostname: "ap-floor3-01", vendor: "TP-Link", model: "EAP245 V3",
    type: "ap", ip: "10.10.0.21", mac: "50:C7:BF:AA:00:21", network: "mgmt",
    discoveredBy: ["arp", "active"],
    mgmt: { api: "disabled" },
    roleEvidence: "احتمالاً اکسس‌پوینت بی‌سیم؛ براساس OUI سازنده — بدون کنترلر، اطلاعات جزئی محدود است.",
  },
  {
    key: "NVR-01", hostname: "nvr-lobby-01", vendor: "Dahua", model: "NVR4108HS-8P-4KS3",
    type: "nvr", ip: "10.10.0.30", mac: "3C:EF:8C:BB:00:30", network: "mgmt",
    discoveredBy: ["arp", "active", "onvif", "mgmt"],
    mgmt: { api: "ok" },
    roleEvidence: "ضبط‌کننده شبکه؛ براساس پاسخ API سازنده و فهرست ۸ کانال — دارای پورت‌های PoE داخلی.",
    sensitivity: "high",
  },
  {
    key: "CAM-01", hostname: "cam-lobby", vendor: "Hikvision", model: "DS-2CD2143G2-I",
    type: "camera", ip: "10.10.0.41", mac: "44:47:CC:C1:00:41", network: "mgmt",
    discoveredBy: ["arp", "active", "onvif"],
    roleEvidence: "احتمالاً دوربین IP؛ براساس پاسخ ONVIF و اطلاعات مدل. اتصال به ضبط‌کننده بررسی و تأیید شده است.",
    sensitivity: "normal",
  },
  {
    key: "CAM-02", hostname: "cam-yard", vendor: "Hikvision", model: "DS-2CD2T43G2-4I",
    type: "camera", ip: "10.10.0.42", mac: "44:47:CC:C1:00:42", network: "mgmt",
    discoveredBy: ["arp", "active", "onvif"],
    roleEvidence: "احتمالاً دوربین IP؛ براساس پاسخ ONVIF و اطلاعات مدل.",
  },
  {
    key: "CAM-03", hostname: "cam-corridor-b1", vendor: "Dahua", model: "IPC-HDW2431T",
    type: "camera", ip: "10.30.0.11", mac: "3C:EF:8C:C3:00:11", network: "cams",
    discoveredBy: ["active", "onvif"],
    roleEvidence: "احتمالاً دوربین IP؛ براساس پاسخ ONVIF در VLAN دوربین‌ها.",
  },
  {
    key: "CAM-04", hostname: "cam-parking", vendor: "Dahua", model: "IPC-HDW2431T",
    type: "camera", ip: "10.30.0.12", mac: "3C:EF:8C:C3:00:12", network: "cams",
    discoveredBy: ["active", "onvif"],
    roleEvidence: "احتمالاً دوربین IP؛ براساس پاسخ ONVIF — در فهرست ضبط‌کننده ثبت نشده است.",
    notes: "در شبکه کشف شد ولی در NVR ثبت نشده — سناریوی سند بخش ۶.۳-۶",
  },
  {
    key: "CAM-05", hostname: "cam-door-nvr", vendor: "TP-Link", model: "VIGI C440",
    type: "camera", ip: "10.1.30.5", mac: "74:DA:38:C5:00:05", network: "nvr-internal",
    discoveredBy: ["nvr-api"], // فقط از طریق API ضبط‌کننده — سناریوی سند ۶.۳-۳ و ۶.۳-۵
    roleEvidence: "دوربین پشت شبکه داخلی PoE ضبط‌کننده؛ فقط از طریق API ضبط‌کننده قابل مشاهده است — عدم مشاهده مستقیم، خرابی نیست.",
  },
  {
    key: "CAM-06", hostname: "cam-store-nvr", vendor: "TP-Link", model: "VIGI C340",
    type: "camera", ip: "10.1.30.6", mac: "74:DA:38:C5:00:06", network: "nvr-internal",
    discoveredBy: ["nvr-api"],
    roleEvidence: "دوربین پشت شبکه داخلی PoE ضبط‌کننده؛ در فهرست NVR آفلاین گزارش شده است.",
    notes: "NVR آنلاین گزارش نمی‌کند؛ از عامل هم غیرقابل دسترس (طبیعت شبکه داخلی NVR) — سناریوی سند ۶.۳-۳",
  },
  {
    key: "RADIO-A", hostname: "radio-bldgA-ptp", vendor: "Ubiquiti", model: "NanoBeam 5AC Gen2",
    type: "radio", ip: "10.10.0.10", mac: "78:8A:20:D1:00:10", network: "mgmt",
    discoveredBy: ["arp", "active", "lldp", "mgmt"],
    mgmt: { api: "ok", lldp: "ok" },
    roleEvidence: "لینک رادیویی نقطه‌به‌نقطه سمت ساختمان اصلی؛ براساس API airMAX و حالت کاری PtP.",
    sensitivity: "high",
  },
  {
    key: "RADIO-B", hostname: "radio-bldgB-ptp", vendor: "Ubiquiti", model: "NanoBeam 5AC Gen2",
    type: "radio", ip: "10.10.0.11", mac: "78:8A:20:D1:00:11", network: "mgmt",
    discoveredBy: ["lldp", "active-hist"], // فقط از سمت RADIO-A دیده شده
    mgmt: { api: "disabled" }, // دسترسی API رد می‌شود — نیازمند اطلاعات ورود
    roleEvidence: "سمت مقابل لینک رادیویی؛ براساس اعلام همسایه LLDP سمت RADIO-A و جدول registration آن.",
    sensitivity: "high",
  },
  {
    key: "SW-B1", hostname: "sw-bldgB-01", vendor: "MikroTik", model: "CRS112-8G-4S",
    type: "switch", ip: "10.10.0.12", mac: "CC:2D:E0:33:00:12", network: "mgmt",
    discoveredBy: ["lldp-hist", "active-hist"],
    mgmt: { snmp: "ok", lldp: "ok" },
    roleEvidence: "احتمالاً سوئیچ ساختمان B؛ براساس همسایگی LLDP تاریخی از RADIO-B و مشاهده قبلی.",
  },
  {
    key: "CAM-07", hostname: "cam-bldgB-gate", vendor: "Hikvision", model: "DS-2CD2T25",
    type: "camera", ip: "10.10.0.51", mac: "44:47:CC:C1:00:51", network: "mgmt",
    discoveredBy: ["active-hist", "nvr-api"],
    roleEvidence: "دوربین ساختمان B پشت لینک رادیویی؛ براساس مشاهده قبلی و ثبت در کانال ضبط‌کننده — سناریوی سند ۶.۳-۴",
  },
  {
    key: "PC-B-01", hostname: "pc-bldgB-01", vendor: "Asus", model: "ExpertCenter",
    type: "pc", ip: "10.10.10.60", mac: "04:D9:F5:99:00:60", network: "users",
    discoveredBy: ["active-hist"],
    roleEvidence: "احتمالاً کامپیوتر کاربری ساختمان B؛ براساس مشاهده قبلی و OUI.",
  },
  {
    key: "NAS-01", hostname: "", vendor: "Synology", model: "DS923+",
    type: "unknown", ip: "10.10.10.77", mac: "00:11:32:F7:00:77", network: "users",
    discoveredBy: ["arp", "active"],
    roleEvidence: "نقش قطعی تعیین نشده؛ براساس OUI سازنده احتمالاً ذخیره‌ساز شبکه (NAS) است. پورت‌های بررسی‌شده محدود بودند.",
  },
];

// ─── دوربین‌ها: وضعیت‌های مستقل (سند بخش ۶.۴) ─────────────────────
export const SCENARIO_CAMERAS: ScenarioCamera[] = [
  {
    deviceKey: "CAM-01", vendor: "Hikvision", model: "DS-2CD2143G2-I", firmware: "5.7.1", serial: "HK-2143-0001",
    onvif: true, channel: 1, registeredInNvr: true,
    reachableFromAgent: true, serviceOk: true, nvrOnline: true, recording: "active",
  },
  {
    deviceKey: "CAM-02", vendor: "Hikvision", model: "DS-2CD2T43G2-4I", firmware: "5.7.3", serial: "HK-2T43-0002",
    onvif: true, channel: 2, registeredInNvr: true,
    reachableFromAgent: true, serviceOk: true, nvrOnline: true, recording: "active",
  },
  {
    deviceKey: "CAM-03", vendor: "Dahua", model: "IPC-HDW2431T", firmware: "2.820", serial: "DH-2431-0003",
    onvif: true, channel: 3, onCameraVlan: true, registeredInNvr: true,
    reachableFromAgent: true, serviceOk: true, nvrOnline: false, recording: "inactive",
    // NVR آفلاین گزارش می‌کند ولی دوربین از شبکه پاسخ می‌دهد → علت احتمالاً تنظیمات کانال NVR است نه شبکه
  },
  {
    deviceKey: "CAM-04", vendor: "Dahua", model: "IPC-HDW2431T", firmware: "2.820", serial: "DH-2431-0004",
    onvif: true, onCameraVlan: true, registeredInNvr: false,
    reachableFromAgent: true, serviceOk: true, nvrOnline: false, recording: "inactive",
    // کشف‌شده در شبکه ولی ثبت‌نشده در NVR — سناریوی ۶.۳-۶
  },
  {
    deviceKey: "CAM-05", vendor: "TP-Link", model: "VIGI C440", firmware: "1.2.5", serial: "TL-C440-0005",
    onvif: true, channel: 5, behindNvrPoe: true, registeredInNvr: true,
    reachableFromAgent: false, serviceOk: true, nvrOnline: true, recording: "active",
    // پشت PoE داخلی NVR — غیرقابل مشاهده مستقیم طبیعی است — سناریوی ۶.۳-۳/۵
  },
  {
    deviceKey: "CAM-06", vendor: "TP-Link", model: "VIGI C340", firmware: "1.2.2", serial: "TL-C340-0006",
    onvif: true, channel: 6, behindNvrPoe: true, registeredInNvr: true,
    reachableFromAgent: false, serviceOk: false, nvrOnline: false, recording: "inactive",
    // در NVR آفلاین؛ واقعاً خراب (PoE/کابل پورت داخلی) — سناریوی ۶.۳-۳
  },
  {
    deviceKey: "CAM-07", vendor: "Hikvision", model: "DS-2CD2T25", firmware: "5.6.5", serial: "HK-2T25-0007",
    onvif: true, channel: 7, behindRadio: true, registeredInNvr: true,
    reachableFromAgent: false, serviceOk: false, nvrOnline: false, recording: "inactive",
    // پشت لینک رادیویی که فعلاً قطع است — سناریوی ۶.۳-۴
  },
];

// وضعیت لینک رادیویی در لحظه شبیه‌سازی — قطع: برای نمایش هشدار تجمیعی (سند ۸.۳)
export const RADIO_LINK_CURRENTLY_DOWN = true;

// رکورد قدیمی جدول ARP برای نمایش هشدار «جدول همسایه فهرست کامل نیست»
export const STALE_ARP_ENTRY = { ip: "10.10.10.99", mac: "AA:BB:CC:DD:EE:FF", note: "رکورد قدیمی دستگاه حذف‌شده" };

// تعارض IP مشکوک — دو MAC برای یک IP (سند ۸.۳: ابتدا «احتمال تعارض»)
export const IP_CONFLICT_SUSPECT = {
  ip: "10.10.10.45",
  macA: "F8:BC:12:66:00:21", // PC-ACC-02 — از عامل
  macB: "3C:7A:8D:52:00:45", // MAC ناشناس — از خروجی DHCP/پنل
  note: "دو MAC متفاوت در منابع مختلف برای یک IP مشاهده شده است",
};

// فهرست اجزای موتور شبیه‌سازی که هر دستگاه را کشف می‌کنند
export const DISCOVERY_SOURCE_LABELS: Record<string, string> = {
  arp: "جدول همسایه عامل (ARP)",
  dns: "پرس‌وجوی DNS",
  mdns: "mDNS",
  active: "کشف فعال کم‌فشار (ICMP محدود)",
  "active-hist": "کشف فعال قبلی (مشاهده تاریخی)",
  lldp: "LLDP/CDP",
  "lldp-hist": "LLDP تاریخی",
  "fdb-infer": "استنباط از جدول FDB",
  mgmt: "اطلاعات مدیریتی (SNMP/API)",
  onvif: "ONVIF WS-Discovery",
  "nvr-api": "API ضبط‌کننده",
};

// اطلاعات مدیریتی شبیه‌سازی‌شده هر دستگاه
export function scenarioMgmtInfo(dev: ScenarioDevice): Record<string, unknown> | null {
  if (!dev.mgmt) return null;
  if (dev.mgmt.snmp === "ok" || dev.mgmt.api === "ok") {
    return {
      vendor: dev.vendor,
      model: dev.model,
      firmware: dev.type === "switch" ? (dev.vendor === "Cisco" ? "3.1.2" : dev.vendor === "MikroTik" ? "7.14.3" : "PC.aruba 16.10.3") : dev.type === "router" ? "7.14.3" : "4.0.2",
      uptime: "۴۲ روز",
      interfaces: dev.type === "switch" ? 24 : dev.type === "router" ? 14 : 8,
      vlans: dev.type === "switch" && dev.vendor === "Cisco" ? [1, 10, 30] : undefined,
      poe: dev.key === "SW-A2" ? "پورت‌های 1-8 فعال، مصرف ۱۹.۴ وات" : dev.key === "NVR-01" ? "۸ پورت داخلی PoE" : undefined,
    };
  }
  return null;
}
