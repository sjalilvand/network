// NetScope — فاز ۲: ثبت راهنمای اختصاصی سازندگان (سند بخش ۳.۳)
// پلاگین‌محور: هر سازنده یک «بسته فرمان» مستقل است و بدون تغییر هسته اضافه می‌شود.
// هر بسته نسخه دارد تا تغییر فرمان‌ها در به‌روزرسانی‌های بعدی قابل ردیابی باشد.

export type SwitchParseFormat =
  | "cisco-mac-table"       // show mac address-table
  | "mikrotik-bridge-host"  // /interface bridge host print (detail)
  | "generic-mac-table"     // جدول MAC عمومی
  | "cisco-lldp-detail"     // show lldp neighbors detail
  | "generic-lldp"          // بلوک‌های LLDP عمومی (Aruba/Huawei/...)
  | "cisco-vlan-brief"      // show vlan brief
  | "mikrotik-vlan"         // /interface bridge vlan print detail
  | "cisco-if-status";      // show interfaces status

export interface VendorCommand {
  id: string;
  title: string;          // چه اطلاعاتی می‌دهد؟
  what: string;           // توضیح برای کاربر
  command: string;        // فرمان فقط‌خواندنی
  parseFormat: SwitchParseFormat;
  requires: string;       // پیش‌نیاز دسترسی
  checklistKey?: string;  // اتصال به آیتم چک‌لیست
}

export interface VendorGuide {
  id: string;
  label: string;
  guideVersion: string;   // نسخه راهنما — الزام نسخه‌بندی سند ۳.۳
  notes: string;
  commands: VendorCommand[];
}

export const VENDOR_GUIDES: VendorGuide[] = [
  {
    id: "cisco",
    label: "Cisco (IOS / CBS / Catalyst)",
    guideVersion: "2.0.0",
    notes: "فرمان‌ها فقط‌خواندنی‌اند و پیکربندی را تغییر نمی‌دهند. برای FDB کامل چند VLAN، ممکن است نیاز به community@vlan باشد.",
    commands: [
      {
        id: "cisco-mac", title: "جدول MAC (FDB)", what: "یادگیری MAC روی هر پورت — مبنای استنباط اتصال فیزیکی",
        command: "show mac address-table", parseFormat: "cisco-mac-table",
        requires: "دسترسی CLI فقط‌خواندنی (سطح ۱)", checklistKey: "conn.fdb-table",
      },
      {
        id: "cisco-lldp", title: "همسایه‌های LLDP با جزئیات", what: "اتصال تأییدشده دوطرفه با شماره پورت هر دو طرف",
        command: "show lldp neighbors detail", parseFormat: "cisco-lldp-detail",
        requires: "فعال بودن LLDP روی سوئیچ", checklistKey: "conn.lldp-table",
      },
      {
        id: "cisco-vlan", title: "فهرست VLANها", what: "VLANهای تعریف‌شده و نام آن‌ها",
        command: "show vlan brief", parseFormat: "cisco-vlan-brief",
        requires: "دسترسی CLI فقط‌خواندنی", checklistKey: "networks.vlans",
      },
      {
        id: "cisco-ifstatus", title: "وضعیت پورت‌ها", what: "up/down، VLAN عضو، سرعت و داپلکس هر پورت",
        command: "show interfaces status", parseFormat: "cisco-if-status",
        requires: "دسترسی CLI فقط‌خواندنی", checklistKey: "mgmt.interfaces",
      },
    ],
  },
  {
    id: "mikrotik",
    label: "MikroTik (RouterOS 7)",
    guideVersion: "2.0.0",
    notes: "خروجی detail برای تجزیه بهتر است. فرمان print فقط‌خواندنی است.",
    commands: [
      {
        id: "mt-bridge-host", title: "جدول Host پل (FDB)", what: "MACهای یادگرفته‌شده روی هر رابط پل",
        command: "/interface bridge host print detail without-paging", parseFormat: "mikrotik-bridge-host",
        requires: "دسترسی CLI فقط‌خواندنی (پolicy=read)", checklistKey: "conn.fdb-table",
      },
      {
        id: "mt-lldp", title: "همسایه‌های LLDP", what: "همسایه‌های LLDP/MNDP روی هر رابط",
        command: "/ip neighbor print detail without-paging", parseFormat: "generic-lldp",
        requires: "فعال بودن LLDP/MNDP", checklistKey: "conn.lldp-table",
      },
      {
        id: "mt-vlan", title: "جدول VLAN پل", what: "عضویت VLAN رابط‌ها و پورت‌های tagged/untagged",
        command: "/interface bridge vlan print detail without-paging", parseFormat: "mikrotik-vlan",
        requires: "دسترسی CLI فقط‌خواندنی", checklistKey: "conn.vlan-bridge",
      },
    ],
  },
  {
    id: "aruba",
    label: "HPE Aruba (ProVision / AOS-CX)",
    guideVersion: "1.1.0",
    notes: "خروجی LLDP Aruba با قالب بلوکی استاندارد LLDP-MIB هماهنگ است.",
    commands: [
      {
        id: "aruba-mac", title: "جدول MAC آدرس", what: "MACهای هر پورت به تفکیک VLAN",
        command: "show mac-address", parseFormat: "generic-mac-table",
        requires: "دسترسی CLI فقط‌خواندنی (manager-read)", checklistKey: "conn.fdb-table",
      },
      {
        id: "aruba-lldp", title: "اطلاعات LLDP همسایه‌ها", what: "شناسه چیسس و پورت همسایه‌ها",
        command: "show lldp info remote-device", parseFormat: "generic-lldp",
        requires: "فعال بودن LLDP", checklistKey: "conn.lldp-table",
      },
      {
        id: "aruba-vlan", title: "VLANها و پورت‌ها", what: "عضویت VLAN پورت‌ها (tagged/untagged)",
        command: "show vlan ports", parseFormat: "cisco-vlan-brief",
        requires: "دسترسی CLI فقط‌خواندنی", checklistKey: "conn.vlan-bridge",
      },
    ],
  },
  {
    id: "huawei",
    label: "Huawei (VRP)",
    guideVersion: "1.0.0",
    notes: "قالب خروجی VRP با بلوک‌های استاندارد LLDP سازگار است.",
    commands: [
      {
        id: "hw-mac", title: "جدول MAC", what: "MACهای یادگرفته‌شده هر پورت",
        command: "display mac-address", parseFormat: "generic-mac-table",
        requires: "سطح دسترسی ۰-۳ فقط‌خواندنی", checklistKey: "conn.fdb-table",
      },
      {
        id: "hw-lldp", title: "همسایه‌های LLDP", what: "جزئیات همسایه‌های LLDP",
        command: "display lldp neighbor brief", parseFormat: "generic-lldp",
        requires: "فعال بودن LLDP", checklistKey: "conn.lldp-table",
      },
    ],
  },
  {
    id: "generic",
    label: "عمومی / سایر سازندگان",
    guideVersion: "1.0.0",
    notes: "اگر سازنده در فهرست نیست، خروجی جدول MAC یا LLDP را همین‌جا ثبت کنید؛ تجزیه‌گر عمومی تلاش می‌کند.",
    commands: [
      { id: "gen-mac", title: "جدول MAC (عمومی)", what: "هر خروجی جدولی MAC/پورت", command: "— دستور مخصوص سازنده خود را اجرا کنید —", parseFormat: "generic-mac-table", requires: "دسترسی فقط‌خواندنی", checklistKey: "conn.fdb-table" },
      { id: "gen-lldp", title: "LLDP (عمومی)", what: "هر خروجی بلوکی LLDP", command: "— دستور مخصوص سازنده خود را اجرا کنید —", parseFormat: "generic-lldp", requires: "فعال بودن LLDP", checklistKey: "conn.lldp-table" },
    ],
  },
];

export function findVendor(id: string): VendorGuide | undefined {
  return VENDOR_GUIDES.find((v) => v.id === id);
}
