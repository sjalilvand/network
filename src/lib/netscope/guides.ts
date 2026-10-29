// NetScope — راهنماهای استخراج اطلاعات (سند بخش ۳)
// هر راهنما شامل ۱۱ فیلد الزامی سند بخش ۳.۱ است.
// فرمان‌ها فقط‌خواندنی هستند و متناسب با سیستم‌عامل/سازنده نمایش داده می‌شوند (الزام ۳.۳).

export interface GuidePlatform {
  platform: string; // windows | linux | mikrotik | cisco | hpe | ubiquiti | hikvision | dahua | generic
  label: string;
  commands: { cmd: string; note?: string }[];
  notes?: string;
}

export interface GuideDef {
  guideKey: string;
  title: string;
  targetInfo: string;      // ۱. اطلاعات موردنیاز چیست؟
  why: string;             // ۲. چرا به آن نیاز داریم؟
  autoPossible: string;    // ۳. آیا دریافت خودکار ممکن است؟ yes|partial|no + توضیح
  prerequisites: string;   // ۴. پیش‌نیاز و سطح دسترسی
  targetSystem: string;    // ۶. اقدام روی کدام سیستم یا دستگاه انجام می‌شود؟
  expectedOutput: string;  // ۷. خروجی مورد انتظار
  fieldsToExtract: string[];  // ۸. کدام بخش خروجی باید وارد شود؟
  sensitiveFields: string[];  // ۹. چه اطلاعات حساسی باید حذف شوند؟
  validationRules: string[];  // ۱۰. برنامه چگونه خروجی را اعتبارسنجی می‌کند؟
  fallback: string;        // ۱۱. اگر روش موفق نبود، راه جایگزین
  platforms: GuidePlatform[];
  category: string;        // general | switch | camera | nvr | radio | manual
  vendor?: string;
  deviceModel?: string;
  warning?: string;
}

export const GUIDES: GuideDef[] = [
  {
    guideKey: "env-detect",
    title: "شناسایی محیط اجرای عامل",
    targetInfo: "سیستم‌عامل، سطح مجوز و بومی/مجازی بودن محیط اجرا",
    why: "عامل باید دسترسی واقعی به شبکه هدف داشته باشد؛ اجرای داخل WSL، کانتینر یا ماشین مجازی بدون آزمون، معادل مشاهده شبکه فیزیکی نیست.",
    autoPossible: "بله — عامل محلی این اطلاعات را مستقیماً از API سیستم‌عامل می‌خواند.",
    prerequisites: "اجرای عامل روی میزبان مورد نظر",
    targetSystem: "سیستمی که عامل NetScope روی آن اجرا می‌شود",
    expectedOutput: "نام سیستم‌عامل، نسخه، کاربر اجرا، و نشانه‌های مجازی‌سازی",
    fieldsToExtract: ["نام سیستم‌عامل", "نسخه", "سطح دسترسی", "نوع محیط (بومی/کانتینر/VM)"],
    sensitiveFields: ["نام کاربر در صورت نیاز به ناشناس‌سازی"],
    validationRules: ["تطبیق نام هسته با سیستم‌عامل اعلامی", "بررسی وجود مسیرهای مشخص WSL یا cgroup کانتینر"],
    fallback: "اجرای دستی فرمان تشخیصی و چسباندن خروجی در برنامه",
    category: "general",
    platforms: [
      {
        platform: "windows", label: "ویندوز (PowerShell)",
        commands: [
          { cmd: "Get-ComputerInfo -Property OsName,OsVersion,CsProcessors", note: "مشخصات سیستم‌عامل" },
          { cmd: "whoami /groups", note: "بررسی عضویت در گروه Administrators" },
          { cmd: "(Get-CimInstance Win32_ComputerSystem).Model", note: "تشخیص ماشین مجازی از مدل سیستم" },
        ],
      },
      {
        platform: "linux", label: "لینوکس",
        commands: [
          { cmd: "uname -a", note: "هسته و توزیع" },
          { cmd: "id", note: "سطح دسترسی کاربر جاری" },
          { cmd: "systemd-detect-virt", note: "تشخیص مجازی‌سازی یا کانتینر" },
        ],
      },
    ],
  },
  {
    guideKey: "linux-network-config",
    title: "دریافت تنظیمات شبکه در لینوکس",
    targetInfo: "رابط‌ها (نام، IP، MAC، MTU، وضعیت)، مسیرها، همسایه‌ها و DNS",
    why: "مبنای شناخت نقطه دید عامل از شبکه است؛ بدون این اطلاعات، محدوده کشف و مسیرهای موجود قابل تعیین نیست.",
    autoPossible: "بله — در صورت اجرای عامل روی همان سیستم؛ در غیر این صورت خروجی فرمان را بچسبانید.",
    prerequisites: "دسترسی شل به سیستم لینوکسی مورد نظر؛ برخی فرمان‌ها بدون نیاز به root هستند",
    targetSystem: "سیستم لینوکسی مورد بررسی (میزبان عامل یا هر میزبان مجاز)",
    expectedOutput: "خروجی JSON فرمان‌های ip (در صورت پشتیبانی) یا متن ساختاریافته",
    fieldsToExtract: ["نام رابط", "آدرس IP و پیشوند", "آدرس MAC", "MTU", "وضعیت لینک", "مسیر پیش‌فرض", "DNS"],
    sensitiveFields: ["آدرس‌های عمومی در صورت نیاز به ناشناس‌سازی"],
    validationRules: ["اعتبارسنجی قالب IP/MAC", "تطبیق پیشوند با Mask", "گزارش بخش‌های ناشناخته خروجی", "ترجیح JSON بر متن آزاد"],
    fallback: "استفاده از nmcli یا خواندن /etc/network/interfaces و resolv.conf",
    category: "general",
    warning: "جدول همسایه‌ها فهرست کامل دستگاه‌های شبکه نیست؛ ممکن است شامل رکوردهای قدیمی نیز باشد.",
    platforms: [
      {
        platform: "linux", label: "لینوکس",
        commands: [
          { cmd: "ip -j address show", note: "رابط‌ها و آدرس‌ها به صورت JSON (ترجیح داده شود)" },
          { cmd: "ip -j route show", note: "جدول مسیریابی JSON" },
          { cmd: "ip -j neigh show", note: "جدول همسایه‌ها JSON" },
          { cmd: "resolvectl status", note: "در صورت وجود systemd-resolved: سرورهای DNS" },
          { cmd: "nmcli device show", note: "در صورت وجود NetworkManager: وضعیت و DNS" },
          { cmd: "ethtool <interface>", note: "ویژگی‌های لینک مثل سرعت و Duplex" },
        ],
        notes: "الزام: خروجی JSON، در صورت پشتیبانی، بر متن آزاد ترجیح داده شود.",
      },
    ],
  },
  {
    guideKey: "windows-network-config",
    title: "دریافت تنظیمات شبکه در ویندوز",
    targetInfo: "رابط‌ها، IPها، Routeها، همسایه‌ها، DNS و اطلاعات DHCP محلی",
    why: "شناخت تنظیمات میزبان ویندوزی برای تعیین محدوده کشف و مسیر دسترسی به تجهیزات لازم است.",
    autoPossible: "بله — عامل ویندوزی از PowerShell دستورات را اجرا می‌کند؛ در غیر این صورت خروجی را بچسبانید.",
    prerequisites: "PowerShell بدون نیاز به دسترسی مدیریتی برای فرمان‌های فقط‌خواندنی",
    targetSystem: "سیستم ویندوزی مورد بررسی",
    expectedOutput: "خروجی ساختاریافته cmdletها یا متن ipconfig",
    fieldsToExtract: ["نام رابط", "IP و Mask", "MAC", "Gateway", "DNS", "وضعیت DHCP و Lease"],
    sensitiveFields: ["نام دامنه در صورت حساسیت", "MAC در خروجی اشتراکی"],
    validationRules: ["اعتبارسنجی قالب IP/MAC/Gateway", "تشخیص رکوردهای قدیمی جدول همسایه", "گزارش بخش‌های غیرقابل تفسیر"],
    fallback: "استفاده از ipconfig /all به عنوان مسیر جایگزین",
    category: "general",
    warning: "جدول همسایه‌ها (Get-NetNeighbor) فهرست کامل دستگاه‌های شبکه نیست؛ رکوردهای قدیمی (Stale) ممکن است دستگاه حاضر را نشان ندهند.",
    platforms: [
      {
        platform: "windows", label: "ویندوز (PowerShell)",
        commands: [
          { cmd: "Get-NetAdapter", note: "رابط‌های فیزیکی و وضعیت" },
          { cmd: "Get-NetIPConfiguration", note: "پیکربندی IP کامل با Gateway و DNS" },
          { cmd: "Get-NetIPAddress", note: "همه آدرس‌های IP" },
          { cmd: "Get-NetRoute", note: "جدول مسیریابی" },
          { cmd: "Get-NetNeighbor", note: "جدول همسایه‌ها (ARP)" },
          { cmd: "Get-DnsClientServerAddress", note: "سرورهای DNS" },
          { cmd: "ipconfig /all", note: "خلاصه کامل شامل Lease و شناسه DHCP" },
        ],
      },
    ],
  },
  {
    guideKey: "connectivity-test",
    title: "بررسی مسیر و دسترسی",
    targetInfo: "قابل دسترس بودن مقصد، مسیر عبور بسته‌ها و تأخیر",
    why: "برای تفکیک «خاموشی واقعی» از «نبود مسیر» یا «فیلتر» و برای آزمایش‌های تأیید علت یافته‌های تحلیلی.",
    autoPossible: "partial — از محل عامل فقط برای مقاصد داخل محدوده تأییدشده، با نرخ محدود",
    prerequisites: "دسترسی شبکه از محل عامل به مقصد؛ بدون نیاز به دسترسی مدیریتی",
    targetSystem: "اجرای از محل عامل به سمت مقصد داخل محدوده تأییدشده",
    expectedOutput: "پاسخ ping با آمار تأخیر، یا مسیر گام‌به‌گام traceroute",
    fieldsToExtract: ["نتیجه پاسخ/عدم پاسخ", "تأخیر میانگین", "تعداد گام‌ها", "نقاط قطع مسیر"],
    sensitiveFields: [],
    validationRules: ["تکرار محدود (۴ بسته)", "ثبت دلیل شکست: نبود مسیر/Timeout/فیلتر"],
    fallback: "بررسی از پنل تجهیزات مدیریتی یا پرس‌وجوی دستی",
    category: "general",
    warning: "پاسخ‌ندادن مقصد به‌تنهایی خاموشی را اثبات نمی‌کند. Traceroute نیز اتصال فیزیکی سوئیچ‌ها را مشخص نمی‌کند.",
    platforms: [
      {
        platform: "windows", label: "ویندوز",
        commands: [
          { cmd: "Test-NetConnection <IP> -InformationLevel Detailed" },
          { cmd: "tracert -d <IP>", note: "بدون معکوس‌گیری DNS برای سرعت بیشتر" },
        ],
      },
      {
        platform: "linux", label: "لینوکس",
        commands: [
          { cmd: "ip route get <IP>", note: "کدام رابط و Gateway استفاده می‌شود" },
          { cmd: "ping -c 4 <IP>", note: "حداقل بسته ممکن" },
          { cmd: "tracepath <IP>", note: "بدون نیاز به root" },
        ],
      },
    ],
  },
  {
    guideKey: "arp-table",
    title: "دریافت جدول ARP/همسایه‌ها",
    targetInfo: "نگاشت IP به MAC که در جدول همسایه میزبان دیده شده",
    why: "ارزان‌ترین منبع کشف؛ بدون ارسال بسته اضافی، دستگاه‌هایی که اخیراً با میزبان تبادل داشته‌اند را نشان می‌دهد.",
    autoPossible: "بله — عامل محلی جدول همسایه را می‌خواند",
    prerequisites: "بدون نیاز به دسترسی خاص",
    targetSystem: "میزبان عامل",
    expectedOutput: "فهرست IP، MAC، رابط و وضعیت رکورد",
    fieldsToExtract: ["IP", "MAC", "رابط", "وضعیت (REACHABLE/STALE...)"],
    sensitiveFields: [],
    validationRules: ["اعتبارسنجی MAC", "علامت‌گذاری رکوردهای Stale به عنوان قدیمی", "تفکیک IPv4/IPv6"],
    fallback: "دریافت جدول FDB سوئیچ از طریق SNMP/پنل",
    category: "general",
    warning: "جدول همسایه‌ها فهرست کامل دستگاه‌های شبکه نیست؛ ممکن است شامل رکوردهای قدیمی نیز باشد و نبود رکورد به معنی نبود دستگاه نیست.",
    platforms: [
      {
        platform: "windows", label: "ویندوز",
        commands: [{ cmd: "arp -a" }, { cmd: "Get-NetNeighbor" }],
      },
      {
        platform: "linux", label: "لینوکس",
        commands: [{ cmd: "ip -j neigh show" }, { cmd: "arp -an" }],
      },
    ],
  },
  {
    guideKey: "scope-confirm",
    title: "تعیین و تأیید محدوده بررسی",
    targetInfo: "زیرشبکه‌هایی که کشف در آن‌ها مجاز است",
    why: "بررسی فقط در محدوده تأییدشده انجام می‌شود؛ کشف یک شبکه جدید مجوز خودکار اسکن آن را ایجاد نمی‌کند.",
    autoPossible: "پیشنهاد محدوده خودکار است؛ تأیید الزاماً دستی است",
    prerequisites: "تصمیم مالک شبکه",
    targetSystem: "پروژه NetScope",
    expectedOutput: "فهرست CIDRهای تأییدشده",
    fieldsToExtract: ["CIDR", "توضیح کاربرد شبکه", "تأیید/عدم تأیید"],
    sensitiveFields: [],
    validationRules: ["اعتبارسنجی قالب CIDR", "جلوگیری از محدوده‌های عمومی و خارج از مجوز"],
    fallback: "ورود دستی محدوده‌های مجاز",
    category: "manual",
    platforms: [
      {
        platform: "generic", label: "پنل NetScope",
        commands: [{ cmd: "مرکز اقدامات بعدی ← تأیید محدوده", note: "دیالوگ تأیید با ذکر محدوده پیشنهادی" }],
      },
    ],
  },
  {
    guideKey: "dhcp-leases",
    title: "دریافت اطلاعات سرور DHCP",
    targetInfo: "سرور DHCP، لیست Leaseهای فعال و رزروها",
    why: "نگاشت IP به دستگاه در زمان‌های مختلف و شناسایی آدرس‌های پایدار (رزرو) برای هویت دستگاه.",
    autoPossible: "partial — فقط با دسترسی API/SSH فقط‌خواندنی به سرور DHCP",
    prerequisites: "دسترسی فقط‌خواندنی به سرور DHCP یا خروجی پنل آن",
    targetSystem: "سرور DHCP (ویندوز سرور، MikroTik، dnsmasq و...)",
    expectedOutput: "فهرست Lease: IP، MAC، نام میزبان، انقضا",
    fieldsToExtract: ["IP", "MAC", "نام میزبان", "زمان انقضا", "رزرو بودن"],
    sensitiveFields: ["نام کاربر در توضیحات Lease"],
    validationRules: ["اعتبارسنجی MAC/IP", "حذف Leaseهای منقضی", "مقایسه با جدول همسایه برای تشخیص تناقض"],
    fallback: "ورود فایل CSV/JSON خروجی پنل DHCP",
    category: "general",
    platforms: [
      {
        platform: "windows", label: "ویندوز سرور (PowerShell - فقط‌خواندنی)",
        commands: [{ cmd: "Get-DhcpServerv4Scope", note: "روی سرور DHCP" }, { cmd: "Get-DhcpServerv4Lease -ScopeId <CIDR>" }],
      },
      {
        platform: "mikrotik", label: "MikroTik (RouterOS)",
        commands: [{ cmd: "/ip dhcp-server lease print detail", note: "فقط‌خواندنی — از طریق SSH فقط‌خواندنی یا پنل" }],
      },
      {
        platform: "linux", label: "لینوکس (dnsmasq/ISC)",
        commands: [{ cmd: "cat /var/lib/misc/dnsmasq.leases", note: "نیازمند دسترسی خواندن فایل" }],
      },
    ],
  },
  {
    guideKey: "switch-snmp",
    title: "اطلاعات مدیریتی سوئیچ و روتر",
    targetInfo: "مشخصات سیستم، رابط‌ها و شمارنده‌ها، LLDP/CDP، جدول MAC (FDB)، VLAN و Bridge، Routeها و PoE",
    why: "منبع اصلی صحت نقشه فیزیکی و موجودی تجهیزات است؛ بدون آن اتصال‌ها فقط استنباطی می‌مانند.",
    autoPossible: "بله — در صورت فعال بودن SNMPv3 یا API رسمی با دسترسی فقط‌خواندنی",
    prerequisites: "SNMPv3 فعال با credential فقط‌خواندنی، یا API سازنده؛ ترجیح با SNMPv3 و ارتباط رمزگذاری‌شده",
    targetSystem: "سوئیچ/روتر مدیریتی هدف",
    expectedOutput: "OIDهای سیستم (sysDescr, sysName)، جدول ifTable، جدول LLDP، FDB",
    fieldsToExtract: ["سازنده و مدل", "Firmware", "نام رابط‌ها و شمارنده‌ها", "همسایه‌های LLDP/CDP", "جدول FDB", "VLANها", "وضعیت PoE"],
    sensitiveFields: ["community-string و کلیدهای SNMP", "IPهای مدیریتی در خروجی اشتراکی"],
    validationRules: ["بررسی پاسخ‌گویی نسخه v3", "اعتبارسنجی شمارنده‌ها (Counter64)", "گزارش OIDهای پشتیبانی‌نشده"],
    fallback: "چسباندن خروجی فرمان فقط‌خواندنی مخصوص سازنده از پنل/CLI",
    category: "switch",
    warning: "الزام: برنامه فرمان یک سازنده را برای همه تجهیزات نمایش نمی‌دهد؛ راهنما از افزونه مخصوص سازنده و مدل انتخاب می‌شود.",
    platforms: [
      {
        platform: "mikrotik", label: "MikroTik (RouterOS)",
        commands: [
          { cmd: "/system resource print", note: "مدل و نسخه RouterOS" },
          { cmd: "/interface print detail", note: "رابط‌ها" },
          { cmd: "/interface bridge host print", note: "جدول FDB" },
          { cmd: "/interface bridge vlan print", note: "VLANها" },
          { cmd: "/ip neighbor print detail", note: "همسایه‌های LLDP/MNDP" },
        ],
      },
      {
        platform: "cisco", label: "Cisco (IOS/IOS-XE)",
        commands: [
          { cmd: "show version", note: "مدل و نسخه IOS" },
          { cmd: "show interfaces status", note: "وضعیت پورت‌ها" },
          { cmd: "show lldp neighbors detail", note: "همسایه‌های LLDP با پورت" },
          { cmd: "show mac address-table", note: "جدول FDB" },
          { cmd: "show vlan brief", note: "VLANها" },
          { cmd: "show power inline", note: "وضعیت PoE" },
        ],
      },
      {
        platform: "hpe", label: "HPE Aruba (ProCurve/ArubaOS)",
        commands: [
          { cmd: "show version", note: "مدل و Firmware" },
          { cmd: "show interfaces brief", note: "رابط‌ها" },
          { cmd: "show lldp info remote-device", note: "همسایه‌های LLDP" },
          { cmd: "show mac-address-table", note: "جدول MAC" },
          { cmd: "show vlans ports detail", note: "عضویت VLAN پورت‌ها" },
          { cmd: "show power-over-ethernet", note: "وضعیت PoE" },
        ],
      },
      {
        platform: "generic", label: "SNMPv3 (عمومی - فقط‌خواندنی)",
        commands: [
          { cmd: "snmpwalk -v3 -l authPriv -u <user> -a SHA -A '<pass>' -x AES -X '<pass>' <ip> 1.3.6.1.2.1.1", note: "sysDescr و sysName" },
          { cmd: "snmpwalk -v3 ... <ip> 1.3.6.1.2.1.2", note: "ifTable — رابط‌ها و شمارنده‌ها" },
          { cmd: "snmpwalk -v3 ... <ip> 1.0.8802.1.1.2", note: "LLDP MIB" },
          { cmd: "snmpwalk -v3 ... <ip> 1.3.6.1.2.1.17.7.1.2.2", note: "BRIDGE-MIB / FDB" },
        ],
        notes: "رمزها فقط از فرم امن وارد شوند و هرگز در گزارش یا فرمان ذخیره‌شده قرار نگیرند.",
      },
    ],
  },
  {
    guideKey: "switch-lldp",
    title: "کشف اتصال‌ها با LLDP/CDP و جدول FDB",
    targetInfo: "همسایه‌ها، پورت اتصال، VLAN عضو و جدول MAC پورت‌ها",
    why: "اتصال‌های فیزیکی تأییدشده فقط از منابع معتبر (LLDP/CDP، FDB، API، کنترلر یا تأیید مستند کاربر) قابل ثبت هستند.",
    autoPossible: "بله — در صورت فعال بودن LLDP/CDP روی تجهیزات",
    prerequisites: "دسترسی فقط‌خواندنی به سوئیچ‌های مدیریتی",
    targetSystem: "سوئیچ‌های هدف",
    expectedOutput: "فهرست پورت با همسایه اعلام‌شده در LLDP یا MACهای مشاهده‌شده در FDB",
    fieldsToExtract: ["پورت محلی", "شناسه همسایه", "پورت طرف مقابل", "VLAN", "زمان آخرین مشاهده MAC"],
    sensitiveFields: [],
    validationRules: ["تطبیق دوطرفه LLDP (هر دو طرف)", "عدم اثبات اتصال مستقیم از MAC تنها", "ثبت منبع هر اتصال"],
    fallback: "تأیید دستی کاربر با ذکر مستند، یا راهنمای پنل سازنده",
    category: "switch",
    warning: "مشاهده MAC روی پورت سوئیچ به معنی اتصال مستقیم قطعی نیست؛ ممکن است چند دستگاه پشت آن پورت باشند.",
    platforms: [
      {
        platform: "cisco", label: "Cisco",
        commands: [
          { cmd: "show lldp neighbors", note: "جدول همسایه LLDP" },
          { cmd: "show cdp neighbors detail", note: "همسایه‌های CDP" },
          { cmd: "show mac address-table dynamic", note: "MACهای یادگرفته روی پورت‌ها" },
        ],
      },
      {
        platform: "mikrotik", label: "MikroTik",
        commands: [
          { cmd: "/ip neighbor print detail", note: "LLDP/MNDP" },
          { cmd: "/interface bridge host print", note: "FDB" },
        ],
      },
      {
        platform: "hpe", label: "HPE Aruba",
        commands: [
          { cmd: "show lldp info remote-device all" },
          { cmd: "show mac-address-table" },
        ],
      },
    ],
  },
  {
    guideKey: "wireless-links",
    title: "اطلاعات لینک‌های بی‌سیم و رادیویی",
    targetInfo: "طرفین لینک، حالت کاری (PtP/AP/Station) و کیفیت لینک (سیگنال/CCQ)",
    why: "اتصال رادیویی می‌تواند منبع قطع گروهی دستگاه‌های یک ساختمان باشد؛ تفکیک آن از سوئیچ برای تحلیل هشدارهای تجمیعی لازم است.",
    autoPossible: "بله — با SNMP یا API رسمی تجهیزات رادیویی",
    prerequisites: "دسترسی فقط‌خواندنی به رادیوها",
    targetSystem: "رادیوها و اکسس‌پوینت‌های هدف",
    expectedOutput: "جدول registration، سیگنال، کیفیت و نرخ",
    fieldsToExtract: ["نام لینک", "طرف مقابل", "سیگنال dBm", "CCQ/کیفیت", "حالت کاری", "نرخ"],
    sensitiveFields: [],
    validationRules: ["بررسی دوطرفه بودن اطلاعات لینک", "ثبت زمان آخرین تأیید کیفیت"],
    fallback: "ورود دستی از پنل سازنده با برچسب «ورود دستی»",
    category: "radio",
    platforms: [
      {
        platform: "ubiquiti", label: "Ubiquiti airMAX",
        commands: [
          { cmd: "wstalist", note: "فهرست stationها و سیگنال" },
          { cmd: "mca-status", note: "وضعیت کامل لینک" },
        ],
      },
      {
        platform: "mikrotik", label: "MikroTik wireless",
        commands: [
          { cmd: "/interface wireless registration-table print detail" },
          { cmd: "/interface wireless monitor <interface> once", note: "سیگنال و CCQ" },
        ],
      },
    ],
  },
  {
    guideKey: "camera-onvif",
    title: "کشف و موجودی دوربین‌های IP (ONVIF)",
    targetInfo: "نام، مدل، Firmware، IP، وضعیت اتصال و قابلیت‌های ONVIF",
    why: "برای موجودی کامل دوربین‌ها و اتصال آن‌ها به سوئیچ و ضبط‌کننده، مستقل از وضعیت ضبط.",
    autoPossible: "بله — با ONVIF WS-Discovery یا API سازنده، در صورت فعال بودن",
    prerequisites: "ONVIF فعال روی دوربین؛ حساب فقط‌خواندنی؛ بدون تغییر تنظیمات",
    targetSystem: "دوربین‌های IP هدف داخل محدوده تأییدشده",
    expectedOutput: "پاسخ WS-Discovery یا GetDeviceInformation",
    fieldsToExtract: ["سازنده و مدل", "Firmware", "IP و MAC (در صورت ارائه)", "پروفایل‌های رسانه", "وضعیت"],
    sensitiveFields: ["رمز عبور — هرگز در فرمان، URL، گزارش یا خروجی اشتراکی قرار نگیرد", "Snapshot و جریان تصویر به‌صورت پیش‌فرض دریافت نشود"],
    validationRules: ["تفکیک «پاسخ‌گویی سرویس» از «ضبط فعال»", "ثبت دوربین‌های فقط از طریق NVR قابل مشاهده"],
    fallback: "خروجی پنل NVR یا ورود دستی ساختاریافته",
    category: "camera",
    platforms: [
      {
        platform: "generic", label: "ONVIF (عمومی)",
        commands: [
          { cmd: "WS-Discovery Probe (soap over UDP 239.255.255.250:3702)", note: "کشف دوربین‌های سازگار در لایه ۲ محلی" },
          { cmd: "GetDeviceInformation (ONVIF Device Service)", note: "مدل، سازنده، Firmware — فقط‌خواندنی" },
          { cmd: "GetProfiles", note: "پروفایل‌های رسانه (بدون دریافت جریان)" },
        ],
      },
      {
        platform: "hikvision", label: "Hikvision (ISAPI - فقط‌خواندنی)",
        commands: [
          { cmd: "GET /ISAPI/System/deviceInfo", note: "اطلاعات دستگاه" },
          { cmd: "GET /ISAPI/ContentMgmt/InputProxy/channels/status", note: "وضعیت کانال‌ها از سمت دوربین" },
        ],
        notes: "رمز فقط از فرم امن؛ در URL قرار نگیرد.",
      },
      {
        platform: "dahua", label: "Dahua (HTTP API - فقط‌خواندنی)",
        commands: [
          { cmd: "GET /cgi-bin/magicBox.cgi?action=getDeviceType", note: "نوع دستگاه" },
          { cmd: "GET /cgi-bin/magicBox.cgi?action=getSoftwareVersion", note: "نسخه Firmware" },
        ],
      },
    ],
  },
  {
    guideKey: "nvr-channels",
    title: "دریافت فهرست کانال‌ها از ضبط‌کننده (NVR/DVR)",
    targetInfo: "کانال‌ها، دوربین ثبت‌شده در هر کانال، وضعیت آنلاین بودن و وضعیت ضبط",
    why: "ارتباط کاربردی دوربین و ضبط‌کننده و تفکیک وضعیت ضبط از وضعیت شبکه — الزام سند بخش ۶.۴.",
    autoPossible: "بله — با API رسمی سازنده یا اتصال رسمی؛ در غیر این صورت بررسی هدایت‌شده پنل",
    prerequisites: "حساب فقط‌خواندنی روی NVR؛ بدون تغییر تنظیمات",
    targetSystem: "ضبط‌کننده هدف",
    expectedOutput: "فهرست کانال‌ها با وضعیت آنلاین/ضبط و نام دوربین",
    fieldsToExtract: ["شماره کانال", "نام/IP دوربین", "وضعیت آنلاین", "وضعیت ضبط", "ظرفیت و سلامت دیسک"],
    sensitiveFields: ["رمز عبور NVR", "لینک‌های جریان حاوی اطلاعات ورود"],
    validationRules: ["وضعیت ضبط فقط از منبع معتبر API/پنل — نه از باز بودن پورت یا ping", "مقایسه فهرست دوربین‌های NVR با کشف شبکه (تشخیص دوربین ثبت‌نشده و غیرقابل دسترس)"],
    fallback: "بررسی هدایت‌شده پنل: کاربر فهرست کانال‌ها را از پنل NVR می‌خواند و وارد می‌کند",
    category: "nvr",
    platforms: [
      {
        platform: "hikvision", label: "Hikvision (ISAPI - فقط‌خواندنی)",
        commands: [
          { cmd: "GET /ISAPI/ContentMgmt/InputProxy/channels", note: "کانال‌ها" },
          { cmd: "GET /ISAPI/ContentMgmt/InputProxy/channels/status", note: "وضعیت آنلاین هر کانال" },
          { cmd: "GET /ISAPI/Streaming/channels", note: "مشخصات جریان — بدون دریافت محتوا" },
          { cmd: "GET /ISAPI/ContentMgmt/Storage", note: "وضعیت ذخیره‌سازی" },
        ],
      },
      {
        platform: "dahua", label: "Dahua (HTTP API - فقط‌خواندنی)",
        commands: [
          { cmd: "GET /cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle", note: "نام کانال‌ها" },
          { cmd: "GET /cgi-bin/mediaVideoChn.cgi?action=getVideoChnState", note: "وضعیت کانال‌ها" },
          { cmd: "GET /cgi-bin/storageDevice.cgi?action=getDeviceAllInfo", note: "سلامت دیسک" },
        ],
      },
    ],
  },
  {
    guideKey: "manual-location",
    title: "ثبت موقعیت فیزیکی تجهیزات",
    targetInfo: "ساختمان، اتاق، رک و نام‌گذاری استاندارد تجهیزات",
    why: "نقشه فیزیکی کامل بدون اطلاعات مکانی ناقص است؛ این اطلاعات فقط در مستندات یا دانش کاربر موجود است.",
    autoPossible: "خیر — فقط ورود دستی ساختاریافته یا مستندات موجود",
    prerequisites: "بدون پیش‌نیاز",
    targetSystem: "پروژه NetScope",
    expectedOutput: "برچسب موقعیت برای هر دستگاه",
    fieldsToExtract: ["ساختمان", "طبقه", "اتاق", "رک", "Unit"],
    sensitiveFields: [],
    validationRules: ["قالب آزاد با ثبت منشأ «ورود دستی»"],
    fallback: "بارگذاری مستندات موجود (CSV/JSON)",
    category: "manual",
    platforms: [
      {
        platform: "generic", label: "پنل NetScope",
        commands: [{ cmd: "دستگاه‌ها ← انتخاب دستگاه ← افزودن یادداشت/موقعیت" }],
      },
    ],
  },
  {
    guideKey: "panel-image",
    title: "بارگذاری تصویر پنل و استخراج اطلاعات",
    targetInfo: "اطلاعاتی که فقط در پنل گرافیکی تجهیزات نمایش داده می‌شود",
    why: "برخی تجهیزات API یا CLI ندارند؛ تصویر پنل آخرین منبع موجود اطلاعات است.",
    autoPossible: "partial — استخراج متن از تصویر انجام می‌شود؛ نتیجه تا پیش از تأیید کاربر «قطعی» محسوب نمی‌شود",
    prerequisites: "تصویر واضح از پنل",
    targetSystem: "پنل NetScope",
    expectedOutput: "متن استخراج‌شده از تصویر برای ویرایش و تأیید",
    fieldsToExtract: ["فیلدهای قابل خواندن از تصویر"],
    sensitiveFields: ["IPهای مدیریتی", "رمزها که هرگز نباید در تصویر باشند"],
    validationRules: ["نمایش متن استخراج‌شده برای تأیید کاربر", "برچسب «اطمینان محدود» روی داده استخراج‌شده از تصویر"],
    fallback: "ورود دستی ساختاریافته",
    category: "manual",
    platforms: [
      {
        platform: "generic", label: "پنل NetScope",
        commands: [{ cmd: "راهنماها ← ورود اطلاعات ← بارگذاری تصویر پنل" }],
      },
    ],
  },
];

export function findGuide(guideKey: string): GuideDef | undefined {
  return GUIDES.find((g) => g.guideKey === guideKey);
}
