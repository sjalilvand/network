// NetScope — فاز ۲: داده شبیه‌سازی‌شده FDB/LLDP (شفاف و برچسب‌دار)
// این داده‌ها «سناریوی آزمایشی» هستند و در UI با برچسب شبیه‌سازی نمایش داده می‌شوند.
// هدف: آزمودن موتور استنباط و نمایش قواعد سند ۵.۲ بدون تجهیزات واقعی.

import type { InferFdbEntry, InferLldpEntry } from "./topology-inference";

// جدول FDB سوئیچ هسته — شامل آپ‌لینک‌ها، پورت‌های access و یک MAC ناشناس
export const SCENARIO_FDB: Record<string, InferFdbEntry[]> = {
  "SW-CORE": [
    { port: "Gi1/0/1", mac: "D4:CA:6D:11:00:01", vlan: 1 },   // RTR-01 (تک MAC → access)
    { port: "Gi1/0/2", mac: "78:8A:20:D1:00:10", vlan: 1 },   // RADIO-A (تک MAC → access)
    { port: "Gi1/0/3", mac: "3C:EF:8C:BB:00:30", vlan: 1 },   // NVR-01 (تک MAC → access)
    // پورت به سوئیچ طبقه ۳ — چند MAC → ترانک؛ فقط لینک به خود سوئیچ استنباط می‌شود
    { port: "Gi1/0/4", mac: "B4:39:D6:44:00:04", vlan: 1 },   // SW-A3 خودش
    { port: "Gi1/0/4", mac: "F8:BC:12:66:00:21", vlan: 10 },  // PC-ACC-01 پشت SW-A3
    { port: "Gi1/0/4", mac: "84:A9:3E:77:00:22", vlan: 10 },  // PC-ACC-02 پشت SW-A3
    { port: "Gi1/0/4", mac: "8C:16:45:88:00:23", vlan: 10 },  // PC-ACC-03 پشت SW-A3
    { port: "Gi1/0/4", mac: "50:8F:4C:99:00:50", vlan: 10 },  // PRN-01 پشت SW-A3
    // پورت به سوئیچ طبقه ۲ — MAC سوئیچ + دوربین‌ها → فقط لینک به سوئیچ
    { port: "Gi1/0/5", mac: "CC:2D:E0:33:00:03", vlan: 1 },   // SW-A2 خودش
    { port: "Gi1/0/5", mac: "44:47:CC:C1:00:41", vlan: 1 },   // CAM-01 پشت SW-A2
    { port: "Gi1/0/5", mac: "44:47:CC:C1:00:42", vlan: 1 },   // CAM-02 پشت SW-A2
    { port: "Gi1/0/5", mac: "3C:EF:8C:C3:00:11", vlan: 30 },  // CAM-03 پشت SW-A2 (VLAN دوربین)
    { port: "Gi1/0/5", mac: "3C:EF:8C:C3:00:12", vlan: 30 },  // CAM-04 پشت SW-A2 (VLAN دوربین)
    // MAC ناشناس — باید «دستگاه ناشناس» با اطمینان نامشخص بسازد
    { port: "Te1/1/1", mac: "AA:BB:CC:11:22:33", vlan: 1 },
  ],
  "SW-A2": [
    { port: "sfp-s+1A1", mac: "68:2C:7B:22:00:02", vlan: 1 },  // SW-CORE (آپ‌لینک)
    { port: "sfp-s+1A1", mac: "F8:BC:12:66:00:21", vlan: 10 }, // کاربر پشت هسته
    { port: "ether3", mac: "3C:EF:8C:C3:00:11", vlan: 30 },    // CAM-03 (تک MAC → access)
    { port: "ether4", mac: "3C:EF:8C:C3:00:12", vlan: 30 },    // CAM-04 (تک MAC → access)
    { port: "ether5", mac: "50:C7:BF:AA:00:20", vlan: 1 },     // AP-01 (تک MAC → access)
  ],
};

// جدول همسایه‌های LLDP — اتصال‌های تأییدشده دوطرفه
export const SCENARIO_LLDP: Record<string, InferLldpEntry[]> = {
  "SW-CORE": [
    { localPort: "Gi1/0/1", remoteChassisId: "D4:CA:6D:11:00:01", remotePortId: "ether1", remoteSysName: "rtr-gw-01", remotePortDesc: "WAN-Bridge" },
    { localPort: "Gi1/0/2", remoteChassisId: "78:8A:20:D1:00:10", remotePortId: "eth0", remoteSysName: "radio-bldgA-ptp", remotePortDesc: "lan0" },
    { localPort: "Gi1/0/5", remoteChassisId: "CC:2D:E0:33:00:03", remotePortId: "sfp-s+1A1", remoteSysName: "sw-floor2-01", remotePortDesc: "uplink-core" },
  ],
  "SW-A2": [
    { localPort: "sfp-s+1A1", remoteChassisId: "68:2C:7B:22:00:02", remotePortId: "Gi1/0/5", remoteSysName: "sw-core-01", remotePortDesc: "uplink-floor2" },
  ],
};

// SNMP سوئیچ هسته غیرفعال است (SW-A3) — این دستگاه هیچ FDB/LLDP ای نمی‌دهد
// و صرفاً از سمت SW-CORE استنباط می‌شود؛ سناریوی سند ۵.۲.
