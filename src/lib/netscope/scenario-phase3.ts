// NetScope — فاز ۳: داده‌های شبیه‌سازی‌شده (شفاف و برچسب‌دار)
// ─────────────────────────────────────────────────────────────────────────────
// نکته مهم صداقت داده: این فایل «خروجی خام» را در اختیار می‌گذارد و داده‌ها
// از «همان تجزیه‌گرهای واقعی» پلاگین‌ها عبور می‌کنند — یعنی منطق تجزیه واقعاً
// آزموده می‌شود؛ فقط انتقال داده شبیه‌سازی شده است و در UI برچسب می‌خورد.
//
// پوشش سناریوهای سند ۶.۳:
//  - CAM-01/02 روی VLAN مدیریت — از ONVIF قابل کشف
//  - CAM-03/04 روی VLAN دوربین — از ONVIF قابل کشف (CAM-04 در NVR ثبت نشده)
//  - CAM-05/06 پشت PoE داخلی NVR — از ONVIF «کشف نمی‌شوند» (طبیعت شبکه داخلی NVR)
//  - CAM-07 پشت لینک رادیویی (فعلاً قطع) — از ONVIF «کشف نمی‌شود»

// ─── پاسخ‌های خام WS-Discovery (شبیه‌سازی پاسخ UDP دوربین‌ها) ──────
// تجزیه با parseProbeMatches واقعی انجام می‌شود.

export const SCENARIO_WS_DISCOVERY_RAW: string[] = [
  // CAM-01 — Hikvision
  `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:s="http://schemas.xmlsoap.org/ws/2005/04/discovery">
<SOAP-ENV:Body><s:ProbeMatches>
<d:ProbeMatch>
 <d:XAddrs>http://10.10.0.41:80/onvif/device_service</d:XAddrs>
 <d:Scopes>onvif://www.onvif.org/type/video_encoder onvif://www.onvif.org/Profile/Streaming onvif://www.onvif.org/hardware/DS-2CD2143G2-I onvif://www.onvif.org/name/cam-lobby onvif://www.onvif.org/MAC/4447ccc10041</d:Scopes>
 <d:Types>dn:NetworkVideoTransmitter</d:Types>
</d:ProbeMatch>
</s:ProbeMatches></SOAP-ENV:Body></SOAP-ENV:Envelope>`,
  // CAM-02 — Hikvision
  `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:s="http://schemas.xmlsoap.org/ws/2005/04/discovery">
<SOAP-ENV:Body><s:ProbeMatches>
<d:ProbeMatch>
 <d:XAddrs>http://10.10.0.42:80/onvif/device_service</d:XAddrs>
 <d:Scopes>onvif://www.onvif.org/type/video_encoder onvif://www.onvif.org/Profile/Streaming onvif://www.onvif.org/hardware/DS-2CD2T43G2-4I onvif://www.onvif.org/name/cam-yard onvif://www.onvif.org/MAC/4447ccc10042</d:Scopes>
 <d:Types>dn:NetworkVideoTransmitter</d:Types>
</d:ProbeMatch>
</s:ProbeMatches></SOAP-ENV:Body></SOAP-ENV:Envelope>`,
  // CAM-03 — Dahua روی VLAN دوربین
  `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:s="http://schemas.xmlsoap.org/ws/2005/04/discovery">
<SOAP-ENV:Body><s:ProbeMatches>
<d:ProbeMatch>
 <d:XAddrs>http://10.30.0.11:80/onvif/device_service</d:XAddrs>
 <d:Scopes>onvif://www.onvif.org/type/video_encoder onvif://www.onvif.org/Profile/Streaming onvif://www.onvif.org/hardware/IPC-HDW2431T onvif://www.onvif.org/name/cam-corridor-b1 onvif://www.onvif.org/MAC/3cef8cc30011</d:Scopes>
 <d:Types>dn:NetworkVideoTransmitter</d:Types>
</d:ProbeMatch>
</s:ProbeMatches></SOAP-ENV:Body></SOAP-ENV:Envelope>`,
  // CAM-04 — Dahua (ثبت‌نشده در NVR)
  `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:s="http://schemas.xmlsoap.org/ws/2005/04/discovery">
<SOAP-ENV:Body><s:ProbeMatches>
<d:ProbeMatch>
 <d:XAddrs>http://10.30.0.12:80/onvif/device_service</d:XAddrs>
 <d:Scopes>onvif://www.onvif.org/type/video_encoder onvif://www.onvif.org/Profile/Streaming onvif://www.onvif.org/hardware/IPC-HDW2431T onvif://www.onvif.org/name/cam-parking onvif://www.onvif.org/MAC/3cef8cc30012</d:Scopes>
 <d:Types>dn:NetworkVideoTransmitter</d:Types>
</d:ProbeMatch>
</s:ProbeMatches></SOAP-ENV:Body></SOAP-ENV:Envelope>`,
  // NVR-01 — ضبط‌کننده Dahua هم به WS-Discovery پاسخ می‌دهد
  `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:s="http://schemas.xmlsoap.org/ws/2005/04/discovery">
<SOAP-ENV:Body><s:ProbeMatches>
<d:ProbeMatch>
 <d:XAddrs>http://10.10.0.30:80/onvif/device_service</d:XAddrs>
 <d:Scopes>onvif://www.onvif.org/type/video_encoder onvif://www.onvif.org/type/network_videorecorder onvif://www.onvif.org/Profile/Streaming onvif://www.onvif.org/hardware/NVR4108HS-8P-4KS3 onvif://www.onvif.org/name/nvr-lobby-01 onvif://www.onvif.org/MAC/3cef8cbb0030</d:Scopes>
 <d:Types>dn:NetworkVideoTransmitter</d:Types>
</d:ProbeMatch>
</s:ProbeMatches></SOAP-ENV:Body></SOAP-ENV:Envelope>`,
];

// ─── خروجی خام GetDeviceInformation (شبیه‌سازی) ─────────────────────
// کلید: IP دستگاه

export const SCENARIO_ONVIF_DEVICE_INFO: Record<string, { status: number; xml: string }> = {
  "10.10.0.41": {
    status: 200,
    xml: `<tds:GetDeviceInformationResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:Manufacturer>Hikvision</tds:Manufacturer><tds:Model>DS-2CD2143G2-I</tds:Model>
  <tds:FirmwareVersion>5.7.1</tds:FirmwareVersion><tds:SerialNumber>HK-2143-0001</tds:SerialNumber>
  <tds:HardwareId>0000000000000000</tds:HardwareId></tds:GetDeviceInformationResponse>`,
  },
  "10.10.0.42": {
    status: 200,
    xml: `<tds:GetDeviceInformationResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:Manufacturer>Hikvision</tds:Manufacturer><tds:Model>DS-2CD2T43G2-4I</tds:Model>
  <tds:FirmwareVersion>5.7.3</tds:FirmwareVersion><tds:SerialNumber>HK-2T43-0002</tds:SerialNumber>
  <tds:HardwareId>0000000000000000</tds:HardwareId></tds:GetDeviceInformationResponse>`,
  },
  "10.30.0.11": {
    status: 200,
    xml: `<tds:GetDeviceInformationResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:Manufacturer>Dahua</tds:Manufacturer><tds:Model>IPC-HDW2431T</tds:Model>
  <tds:FirmwareVersion>2.820</tds:FirmwareVersion><tds:SerialNumber>DH-2431-0003</tds:SerialNumber>
  <tds:HardwareId>1A0001</tds:HardwareId></tds:GetDeviceInformationResponse>`,
  },
  "10.30.0.12": {
    status: 200,
    xml: `<tds:GetDeviceInformationResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:Manufacturer>Dahua</tds:Manufacturer><tds:Model>IPC-HDW2431T</tds:Model>
  <tds:FirmwareVersion>2.820</tds:FirmwareVersion><tds:SerialNumber>DH-2431-0004</tds:SerialNumber>
  <tds:HardwareId>1A0002</tds:HardwareId></tds:GetDeviceInformationResponse>`,
  },
  "10.10.0.30": {
    status: 200,
    xml: `<tds:GetDeviceInformationResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:Manufacturer>Dahua</tds:Manufacturer><tds:Model>NVR4108HS-8P-4KS3</tds:Model>
  <tds:FirmwareVersion>4.0.2</tds:FirmwareVersion><tds:SerialNumber>DH-NVR-0030</tds:SerialNumber>
  <tds:HardwareId>NVR-8P</tds:HardwareId></tds:GetDeviceInformationResponse>`,
  },
};

// ─── خروجی خام پلاگین Dahua برای NVR-01 (شبیه‌سازی پاسخ CGI) ────────
// این متن دقیقاً همان چیزی است که configManager/nvrMgmt واقعی می‌دهد؛
// تجزیه با DAHUA_HTTP_API.parse واقعی انجام می‌شود.

export const SCENARIO_NVR_RAW_DAHUA: Record<string, string> = {
  cameras: `rows=[{"ChannelNum":1,"IP":"10.10.0.41","OnLine":true,"Name":"cam-lobby"},
{"ChannelNum":2,"IP":"10.10.0.42","OnLine":true,"Name":"cam-yard"},
{"ChannelNum":3,"IP":"10.30.0.11","OnLine":false,"Name":"cam-corridor-b1"},
{"ChannelNum":5,"IP":"10.1.30.5","OnLine":true,"Name":"cam-door-nvr"},
{"ChannelNum":6,"IP":"10.1.30.6","OnLine":false,"Name":"cam-store-nvr"},
{"ChannelNum":7,"IP":"10.10.0.51","OnLine":false,"Name":"cam-bldgB-gate"}]`,
  titles: `table.ChannelTitle[0]="لابی ورودی"
table.ChannelTitle[1]="حیاط پشتی"
table.ChannelTitle[2]="راهرو طبقه زیرزمین"
table.ChannelTitle[3]="پارکینگ"
table.ChannelTitle[4]="در ورودی (NVR)"
table.ChannelTitle[5]="انبار (NVR)"
table.ChannelTitle[6]="دروازه ساختمان B"
table.ChannelTitle[7]=""`,
  record: `table.Record[0][0].Mode="Auto"
table.Record[1][0].Mode="Auto"
table.Record[2][0].Mode="Auto"
table.Record[3][0].Mode="Off"
table.Record[4][0].Mode="Auto"
table.Record[5][0].Mode="Off"
table.Record[6][0].Mode="Auto"
table.Record[7][0].Mode="Off"`,
};

// نکته سناریو: کانال ۳ آنلاین نیست (متناقض با پاسخ‌دهی خود دوربین) → یافته تحلیلی
// کانال ۶ پشت PoE داخلی NVR آفلاین است و PoE پورتش خطا دارد → علت احتمالی تغذیه
// کانال ۷ پشت لینک رادیویی قطع → علت بالادستی

// ─── خروجی خام پلاگین Hikvision (نمونه ثانویه — برای آزمایش پلاگین دوم) ──

export const SCENARIO_NVR_RAW_HIKVISION: Record<string, string> = {
  channels: `<?xml version="1.0" encoding="UTF-8"?>
<ISAPI:InputProxyChannelList xmlns:ISAPI="http://www.hikvision.com/ver20/XMLSchema">
<InputProxyChannel><id>1</id><sourceInputPortDescriptor><proxyName>cam-lobby</proxyName><address>10.10.0.41</address><port>554</port></sourceInputPortDescriptor></InputProxyChannel>
<InputProxyChannel><id>2</id><sourceInputPortDescriptor><proxyName>cam-yard</proxyName><address>10.10.0.42</address><port>554</port></sourceInputPortDescriptor></InputProxyChannel>
</ISAPI:InputProxyChannelList>`,
  status: `<?xml version="1.0" encoding="UTF-8"?>
<InputProxyChannelStatusList xmlns="http://www.hikvision.com/ver20/XMLSchema">
<InputProxyChannelStatus><sourceInputPortDescriptor><id>1</id><online>true</online></sourceInputPortDescriptor></InputProxyChannelStatus>
<InputProxyChannelStatus><sourceInputPortDescriptor><id>2</id><online>true</online></sourceInputPortDescriptor></InputProxyChannelStatus>
</InputProxyChannelStatusList>`,
  recording: `<RecordingStatus xmlns="http://www.hikvision.com/ver20/XMLSchema" channel="1"><recording>true</recording></RecordingStatus>
<RecordingStatus xmlns="http://www.hikvision.com/ver20/XMLSchema" channel="2"><recording>true</recording></RecordingStatus>`,
};

// ─── داده PoE شبیه‌سازی‌شده (سند ۶.۲ — PoE داخلی و سوئیچ) ───────────
// کلید: کلید دستگاه تأمین‌کننده → پورت → توان (وات). صفر = بدون PoE، fault = خطا

export interface PoePortInfo { watts: number; status: "poe-ok" | "poe-none" | "poe-fault"; note?: string }

export const SCENARIO_POE: Record<string, Record<string, PoePortInfo>> = {
  "SW-A2": {
    ether3: { watts: 6.2, status: "poe-ok", note: "دوربین CAM-03 تغذیه می‌شود" },
    ether4: { watts: 6.1, status: "poe-ok", note: "دوربین CAM-04 تغذیه می‌شود" },
    ether5: { watts: 4.8, status: "poe-ok", note: "اکسس‌پوینت AP-01 تغذیه می‌شود" },
    ether1: { watts: 0, status: "poe-none" },
    ether2: { watts: 0, status: "poe-none" },
  },
  "NVR-01": {
    // پورت‌های PoE داخلی ضبط‌کننده — به ترتیب شماره کانال
    "ch5": { watts: 5.9, status: "poe-ok" },
    "ch6": { watts: 0, status: "poe-fault", note: "خطای PoE پورت داخلی — دوربین کانال ۶ تغذیه نمی‌شود" },
  },
};

// ─── تحلیل‌های آماده سناریو (فقط برای شبیه‌سازی) ────────────────────
// این‌ها در rebuild-relations از روی داده واقعی DB استخراج می‌شوند؛ اینجا صرفاً
// «انتظار» ما ثبت شده تا در تست مقایسه شود:
//  ۱. CAM-04 در NVR ثبت نشده (کانال ۴ خالی) — سناریو ۶.۳-۶
//  ۲. CAM-03 آنلاین است ولی NVR آفلاین گزارش می‌کند → مشکل از تنظیم کانال NVR
//  ۳. CAM-06 کانال آفلاین + PoE fault پورت داخلی → علت احتمالی: قطعی تغذیه
//  ۴. CAM-07 کانال آفلاین + لینک رادیویی قطع → علت: بالادستی (تجمیع هشدار سند ۸.۳)
