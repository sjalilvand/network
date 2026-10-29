// NetScope — فاز ۲: API جمع‌آوری واقعی SNMP (فقط‌خواندنی)
// امنیت (سند ۱۲): قبل از هر اتصال، محدوده هدف باید تأییدشده باشد؛
// اعتبارنامه فقط در حافظه همین درخواست استفاده و هرگز ذخیره نمی‌شود.

import { db } from "@/lib/db";
import { getProject, getEngineState } from "@/lib/netscope/engine";
import { json, err } from "@/lib/netscope/api-helpers";
import { snmpCollect, cidrContains, type SnmpTarget, type SnmpScope } from "@/lib/netscope/snmp";
import { storeFdb, storeLldp, runInferenceAndApplyLinks } from "@/lib/netscope/phase2-apply";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const project = await getProject();
  const action = body.action as "collect" | "test" || "collect";
  const targetIp = String(body.targetIp || "").trim();
  if (!targetIp) return err("آدرس IP هدف مشخص نشده است");

  // ── گیت امنیتی: اسکن فقط در محدوده تأییدشده (سند ۱۲) ─────────────
  const state = await getEngineState();
  const approved: string[] = (state as unknown as { approvedScopes?: string[] }).approvedScopes || [];
  const inScope = approved.some((cidr) => cidrContains(cidr, targetIp));
  if (!inScope) {
    return json({
      ok: false, blocked: true,
      error: "scope-not-approved",
      message: `آدرس ${targetIp} در هیچ محدوده تأییدشده‌ای نیست (الزام سند ۱۲: اسکن فقط در محدوده مجاز). ابتدا محدوده را در مرکز اقدامات تأیید کنید یا به‌عنوان محدوده جدید ثبت کنید.`,
    }, 403);
  }

  // ── ساخت هدف SNMP ────────────────────────────────────────────────
  const version = body.version === "v3" ? "v3" : "2c";
  const target: SnmpTarget = {
    ip: targetIp, version,
    timeoutMs: Number(body.timeoutMs) || 2500,
    retries: Number(body.retries) ?? 1,
  };
  if (version === "2c") {
    target.community = String(body.community || "");
    if (!target.community) return err("برای SNMPv2c، Community لازم است (فقط در حافظه استفاده می‌شود)");
  } else {
    const v3 = body.v3 || {};
    target.v3 = {
      user: String(v3.user || ""),
      authProtocol: (["sha", "sha256", "md5"].includes(v3.authProtocol) ? v3.authProtocol : "sha") as "sha",
      authPass: String(v3.authPass || ""),
      privProtocol: (["aes", "des"].includes(v3.privProtocol) ? v3.privProtocol : "aes") as "aes",
      privPass: String(v3.privPass || ""),
    };
    if (!target.v3.user || !target.v3.authPass) return err("برای SNMPv3، کاربر و کلید احراز هویت لازم است");
  }

  const scope = (["system", "interfaces", "fdb", "lldp"].includes(body.scope) ? body.scope : "all") as SnmpScope;
  const deviceId = body.deviceId ? String(body.deviceId) : null;

  // ثبت تلاش جمع‌آوری (سند ۲.۳ — همه تلاش‌ها شواهدند)
  const attempt = await db.collectionAttempt.create({
    data: { projectId: project.id, method: `snmp-${version}`, target: targetIp, result: "running", trafficCost: "low" },
  });

  try {
    const result = await snmpCollect(target, scope);

    let linksCreated = 0, placeholders = 0;
    if (result.ok && deviceId) {
      const device = await db.device.findUnique({ where: { id: deviceId }, include: { interfaces: true } });
      if (device) {
        // به‌روزرسانی اطلاعات مدیریتی دستگاه
        await db.device.update({
          where: { id: device.id },
          data: {
            sysObjectID: result.system?.sysObjectID || device.sysObjectID,
            lastSnmpAt: new Date(),
            hostname: device.hostname || result.system?.sysName || null,
            confidence: result.system?.sysObjectID ? "verified" : device.confidence,
          },
        });

        // رابط‌های SNMP → Interface (upsert بر اساس نام)
        if (result.interfaces?.length) {
          for (const r of result.interfaces.slice(0, 64)) {
            const exist = device.interfaces.find((i) => i.name === r.descr);
            const data = {
              status: r.operStatus, speed: r.speedMbps ? `${r.speedMbps} Mbps` : undefined,
              mac: r.mac || undefined, mtu: r.mtu || undefined,
            };
            if (exist) await db.interface.update({ where: { id: exist.id }, data });
            else await db.interface.create({ data: { deviceId: device.id, name: r.descr, ...data } });
          }
        }

        // FDB و LLDP و استنباط
        if (result.fdb?.length) {
          await storeFdb(device.id, result.fdb.map((f) => ({ port: f.ifName || `bridge-port-${f.bridgePort}`, mac: f.mac })), { source: "snmp", isSimulated: false });
        }
        if (result.lldp?.length) {
          await storeLldp(device.id, result.lldp.map((l) => ({
            localPort: l.localPortName || `port-${l.localPortNum}`,
            remoteChassisId: l.remoteChassisId || "", remotePortId: l.remotePortId,
            remoteSysName: l.remoteSysName, remotePortDesc: l.remotePortDesc,
          })).filter((l) => l.remoteChassisId), { source: "snmp", isSimulated: false });
        }
        if (result.fdb?.length || result.lldp?.length) {
          const ap = await runInferenceAndApplyLinks(project.id, device.id, { isSimulated: false });
          linksCreated = ap.linksCreated;
          placeholders = ap.placeholdersCreated;
        }

        await db.evidence.create({
          data: {
            projectId: project.id, deviceId: device.id, kind: "api-response", sourceMethod: `snmp-${version}`,
            content:
              `جمع‌آوری SNMP از ${targetIp}: sysName=${result.system?.sysName || "—"}, ` +
              `sysObjectID=${result.system?.sysObjectID || "—"}, رابط=${result.interfaces?.length || 0}, ` +
              `FDB=${result.fdb?.length || 0}, LLDP=${result.lldp?.length || 0}. ` +
              (result.errors.length ? `خطاها: ${result.errors.join(" | ")}` : "بدون خطا"),
            confidence: "verified",
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          },
        });
      }
    }

    await db.collectionAttempt.update({
      where: { id: attempt.id },
      data: {
        result: result.ok ? "success" : "failed",
        failureReason: result.ok ? "" : result.errors.includes("timeout") ? "timeout" : result.errors.join(" | ").slice(0, 200),
        finishedAt: new Date(),
      },
    });
    await db.auditLog.create({
      data: {
        projectId: project.id, action: `جمع‌آوری SNMP (${version})`,
        target: targetIp,
        detail: result.ok ? `موفق — scope=${scope}` : `ناموفق — ${result.errors.join(" | ").slice(0, 200)}`,
      },
    });

    return json({ ...result, linksCreated, placeholdersCreated: placeholders, deviceId });
  } catch (e) {
    const msg = (e as Error).message || "";
    const friendly = /Cannot find package|MODULE_NOT_FOUND|net-snmp/i.test(msg)
      ? "پکیج net-snmp نصب نیست — دستور «npm install net-snmp» را اجرا کنید و برنامه را دوباره راه‌اندازی کنید."
      : msg;
    await db.collectionAttempt.update({
      where: { id: attempt.id },
      data: { result: "failed", failureReason: /timeout/i.test(msg) ? "timeout" : "unsupported", finishedAt: new Date() },
    });
    return json({ ok: false, errors: [friendly], warnings: ["جمع‌آوری SNMP ناموفق بود — تلاش به‌عنوان شواهد ثبت شد."] }, 200);
  }
}
