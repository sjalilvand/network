// NetScope — تعاریف چک‌لیست پرونده شناخت شبکه
// دقیقاً بر اساس جدول سند بخش ۱.۱ (۱۴ گروه)

export interface ChecklistItemDef {
  itemKey: string;
  title: string;
  primaryPath: string;   // مسیر اصلی دریافت
  alternatePath: string; // مسیر جایگزین
  guideKey?: string;     // اتصال به راهنمای استخراج
  autoSource?: string;   // توضیح روش خودکار در موتور
}

export interface ChecklistGroupDef {
  groupKey: string;
  title: string;
  items: ChecklistItemDef[];
  // گروه‌های شرطی: اگر شبکه این قابلیت را ندارد، نباید ناقص حساب شود (الزام بخش ۱.۲)
  conditional?: string;
  conditionKey?: "has-radio" | "has-cctv" | "has-monitoring" | "has-mgmt-devices";
}

export const CHECKLIST_GROUPS: ChecklistGroupDef[] = [
  {
    groupKey: "env",
    title: "محیط اجرا",
    items: [
      {
        itemKey: "env.os",
        title: "سیستم‌عامل محیط اجرا",
        primaryPath: "API سیستم‌عامل",
        alternatePath: "دستور تشخیصی",
        guideKey: "env-detect",
        autoSource: "شناسایی خودکار از طریق عامل محلی (اطلاعات واقعی سیستم میزبان)",
      },
      {
        itemKey: "env.privileges",
        title: "مجوزهای اجرای عامل",
        primaryPath: "API سیستم‌عامل",
        alternatePath: "دستور تشخیصی",
        guideKey: "env-detect",
        autoSource: "بررسی سطح دسترسی عامل (کاربر ممتاز یا عادی)",
      },
      {
        itemKey: "env.native",
        title: "اجرای بومی یا مجازی (WSL/کانتینر/VM)",
        primaryPath: "API سیستم‌عامل",
        alternatePath: "دستور تشخیصی",
        guideKey: "env-detect",
        autoSource: "بررسی نشانه‌های محیط مجازی — الزام سند: اجرای غیربومی بدون آزمون معادل مشاهده شبکه فیزیکی نیست",
      },
    ],
  },
  {
    groupKey: "ifaces",
    title: "رابط‌ها",
    items: [
      {
        itemKey: "ifaces.list",
        title: "نام، IP، MAC، Mask، MTU، وضعیت و سرعت رابط‌ها",
        primaryPath: "عامل محلی",
        alternatePath: "خروجی فرمان",
        guideKey: "linux-network-config",
        autoSource: "خواندن رابط‌های شبکه از عامل محلی",
      },
    ],
  },
  {
    groupKey: "routing",
    title: "مسیریابی",
    items: [
      {
        itemKey: "routing.gateway",
        title: "دروازه پیش‌فرض (Gateway)",
        primaryPath: "سیستم‌عامل",
        alternatePath: "فرمان مسیرها",
        guideKey: "linux-network-config",
        autoSource: "خواندن جدول مسیریابی عامل محلی",
      },
      {
        itemKey: "routing.routes",
        title: "جدول Route و رابط خروجی",
        primaryPath: "سیستم‌عامل",
        alternatePath: "فرمان مسیرها",
        guideKey: "linux-network-config",
        autoSource: "خواندن مسیرهای شناخته‌شده عامل",
      },
    ],
  },
  {
    groupKey: "networks",
    title: "شبکه‌ها",
    items: [
      {
        itemKey: "networks.subnets",
        title: "زیرشبکه‌ها (Subnet)",
        primaryPath: "تنظیمات محلی و تجهیزات",
        alternatePath: "تأیید کاربر",
        guideKey: "scope-confirm",
        autoSource: "استنباط از آدرس و Mask رابط‌ها + تأیید کاربر",
      },
      {
        itemKey: "networks.vlans",
        title: "شبکه‌های مجازی (VLAN)",
        primaryPath: "تنظیمات محلی و تجهیزات",
        alternatePath: "تأیید کاربر",
        guideKey: "switch-snmp",
        autoSource: "دریافت از تجهیزات مدیریتی (SNMP/API)",
      },
      {
        itemKey: "networks.ipv6",
        title: "آدرس‌دهی IPv6",
        primaryPath: "تنظیمات محلی و تجهیزات",
        alternatePath: "تأیید کاربر",
        guideKey: "linux-network-config",
        autoSource: "بررسی آدرس‌های IPv6 رابط‌ها و NDP — پیمایش /64 ممنوع (الزام سند ۴.۱)",
      },
    ],
  },
  {
    groupKey: "dns",
    title: "نام‌گذاری",
    items: [
      {
        itemKey: "dns.servers",
        title: "سرورهای DNS",
        primaryPath: "سیستم‌عامل و DNS",
        alternatePath: "فرمان تشخیصی",
        guideKey: "linux-network-config",
        autoSource: "خواندن تنظیمات DNS عامل",
      },
      {
        itemKey: "dns.hostname",
        title: "نام میزبان و دامنه",
        primaryPath: "سیستم‌عامل و DNS",
        alternatePath: "فرمان تشخیصی",
        guideKey: "linux-network-config",
        autoSource: "خواندن نام میزبان عامل و پرس‌وجوی DNS معکوس دستگاه‌ها",
      },
    ],
  },
  {
    groupKey: "dhcp",
    title: "آدرس‌دهی",
    items: [
      {
        itemKey: "dhcp.server",
        title: "شناسایی سرور DHCP",
        primaryPath: "سیستم محلی و API DHCP",
        alternatePath: "خروجی یا فایل پنل",
        guideKey: "dhcp-leases",
        autoSource: "بررسی شناسه سرور DHCP در Lease فعلی عامل",
      },
      {
        itemKey: "dhcp.leases",
        title: "لیست Leaseهای فعال",
        primaryPath: "سیستم محلی و API DHCP",
        alternatePath: "خروجی یا فایل پنل",
        guideKey: "dhcp-leases",
        autoSource: "نیازمند دسترسی به سرور DHCP یا خروجی پنل",
      },
      {
        itemKey: "dhcp.reservations",
        title: "رزروها (Reservation)",
        primaryPath: "سیستم محلی و API DHCP",
        alternatePath: "خروجی یا فایل پنل",
        guideKey: "dhcp-leases",
        autoSource: "نیازمند دسترسی به سرور DHCP",
      },
    ],
  },
  {
    groupKey: "devices",
    title: "دستگاه‌ها",
    items: [
      {
        itemKey: "devices.inventory",
        title: "IP، MAC، نوع، نام و آخرین مشاهده",
        primaryPath: "کشف شبکه",
        alternatePath: "افزودن دستی",
        guideKey: "arp-table",
        autoSource: "ترکیب جدول همسایه‌ها + کشف کم‌فشار + ورود دستی",
      },
    ],
  },
  {
    groupKey: "mgmt",
    title: "تجهیزات مدیریتی",
    items: [
      {
        itemKey: "mgmt.vendor-model",
        title: "سازنده و مدل تجهیزات",
        primaryPath: "SNMP/API",
        alternatePath: "خروجی فقط‌خواندنی",
        guideKey: "switch-snmp",
        autoSource: "SNMPv3 یا API رسمی — راهنمای مخصوص هر سازنده",
      },
      {
        itemKey: "mgmt.firmware",
        title: "نسخه Firmware",
        primaryPath: "SNMP/API",
        alternatePath: "خروجی فقط‌خواندنی",
        guideKey: "switch-snmp",
      },
      {
        itemKey: "mgmt.interfaces",
        title: "رابط‌ها و شمارنده‌های تجهیزات مدیریتی",
        primaryPath: "SNMP/API",
        alternatePath: "خروجی فقط‌خواندنی",
        guideKey: "switch-snmp",
      },
    ],
  },
  {
    groupKey: "conn",
    title: "اتصال‌ها",
    items: [
      {
        itemKey: "conn.neighbors",
        title: "همسایه‌ها و پورت‌های اتصال",
        primaryPath: "LLDP/CDP/FDB",
        alternatePath: "راهنمای پنل یا تأیید دستی",
        guideKey: "switch-lldp",
        autoSource: "LLDP/CDP تجهیزات مدیریتی + جدول FDB — هشدار: MAC روی پورت به معنی اتصال مستقیم قطعی نیست",
      },
      {
        itemKey: "conn.vlan-bridge",
        title: "عضویت VLAN و Bridge",
        primaryPath: "LLDP/CDP/FDB",
        alternatePath: "راهنمای پنل یا تأیید دستی",
        guideKey: "switch-lldp",
      },
      {
        itemKey: "conn.fdb-table",
        title: "جدول MAC سوئیچ (FDB)",
        primaryPath: "SNMP (BRIDGE-MIB)",
        alternatePath: "خروجی CLI: show mac address-table / bridge host print",
        guideKey: "switch-snmp",
        autoSource: "مبنای استنباط اتصال فیزیکی — قاعده: MAC روی پورت ≠ اتصال مستقیم (سند ۵.۲)",
      },
      {
        itemKey: "conn.lldp-table",
        title: "جدول همسایه‌های LLDP",
        primaryPath: "SNMP (LLDP-MIB)",
        alternatePath: "خروجی CLI: show lldp neighbors detail",
        guideKey: "switch-lldp",
        autoSource: "تنها منبع اتصال فیزیکی «تأییدشده» دوطرفه با پورت هر دو طرف",
      },
    ],
  },
  {
    groupKey: "radio",
    title: "بی‌سیم و رادیو",
    conditional: "اگر شبکه لینک رادیویی ندارد، این گروه از محاسبه تکمیل حذف می‌شود",
    conditionKey: "has-radio",
    items: [
      {
        itemKey: "radio.links",
        title: "طرفین لینک، حالت کاری و کیفیت",
        primaryPath: "API/SNMP",
        alternatePath: "اطلاعات پنل",
        guideKey: "wireless-links",
        autoSource: "SNMP یا API تجهیزات رادیویی",
      },
    ],
  },
  {
    groupKey: "cameras",
    title: "دوربین‌ها",
    conditional: "اگر سامانه نظارت تصویری ندارد، این گروه از محاسبه تکمیل حذف می‌شود",
    conditionKey: "has-cctv",
    items: [
      {
        itemKey: "cam.inventory",
        title: "مدل، IP، وضعیت و عضویت در ضبط‌کننده",
        primaryPath: "ONVIF/API",
        alternatePath: "خروجی پنل",
        guideKey: "camera-onvif",
        autoSource: "ONVIF WS-Discovery یا API رسمی سازنده",
      },
    ],
  },
  {
    groupKey: "nvr",
    title: "ضبط‌کننده‌ها",
    conditional: "اگر ضبط‌کننده وجود ندارد، این گروه از محاسبه تکمیل حذف می‌شود",
    conditionKey: "has-cctv",
    items: [
      {
        itemKey: "nvr.inventory",
        title: "کانال‌ها، دوربین‌های ثبت‌شده و وضعیت ضبط",
        primaryPath: "API یا اتصال رسمی سازنده",
        alternatePath: "بررسی هدایت‌شده پنل",
        guideKey: "nvr-channels",
        autoSource: "API ضبط‌کننده (فقط‌خواندنی) یا ورود از پنل",
      },
    ],
  },
  {
    groupKey: "monitor",
    title: "پایش",
    conditional: "اگر پایش فعال نشده باشد، فقط نیازمند اقدام کاربر است",
    conditionKey: "has-monitoring",
    items: [
      {
        itemKey: "monitor.reachability",
        title: "دسترس‌پذیری دوره‌ای",
        primaryPath: "بررسی دوره‌ای",
        alternatePath: "داده واردشده با برچسب",
        guideKey: "connectivity-test",
        autoSource: "بررسی دوره‌ای ICMP کم‌فشار با زمان‌بندی تطبیقی",
      },
      {
        itemKey: "monitor.latency-loss",
        title: "تأخیر و Packet Loss",
        primaryPath: "بررسی دوره‌ای",
        alternatePath: "داده واردشده با برچسب",
        guideKey: "connectivity-test",
      },
      {
        itemKey: "monitor.traffic-errors",
        title: "ترافیک پورت و خطاها",
        primaryPath: "بررسی دوره‌ای",
        alternatePath: "داده واردشده با برچسب",
        guideKey: "switch-snmp",
        autoSource: "شمارنده‌های SNMP — با اعتبارسنجی شمارنده",
      },
    ],
  },
  {
    groupKey: "location",
    title: "موقعیت",
    items: [
      {
        itemKey: "location.map",
        title: "ساختمان، اتاق، رک و نام‌گذاری",
        primaryPath: "داده موجود",
        alternatePath: "سؤال از کاربر",
        guideKey: "manual-location",
        autoSource: "این اطلاعات فقط از کاربر یا مستندات موجود قابل دریافت است",
      },
    ],
  },
];

// برچسب گروه‌ها برای نمایش
export const CHECKLIST_GROUP_TITLES: Record<string, string> = Object.fromEntries(
  CHECKLIST_GROUPS.map((g) => [g.groupKey, g.title])
);

// یافتن تعریف آیتم
export function findItemDef(itemKey: string): ChecklistItemDef | undefined {
  for (const g of CHECKLIST_GROUPS) {
    const it = g.items.find((i) => i.itemKey === itemKey);
    if (it) return it;
  }
  return undefined;
}
