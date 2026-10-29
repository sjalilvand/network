"use client";

// NetScope — فاز ۲: جمع‌آوری پیشرفته (SNMP / LLDP / FDB / نقشه فیزیکی / سنجه‌ها)
// همه داده‌های شبیه‌سازی با برچسب «شبیه‌سازی» نمایش داده می‌شوند (الزام شفافیت سند).

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNetscopeData, postJson, fa, faDate, deviceTypeIcon, deviceTypeLabel, SimBadge } from "./shared";
import { useToast } from "@/hooks/use-toast";
import {
  Radar, ClipboardPaste, Play, Copy, Network, ShieldCheck, ShieldAlert,
  HelpCircle, ArrowLeftRight, Loader2, Gauge, Server,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { cn } from "@/lib/utils";

interface DeviceLite {
  id: string; identityKey: string; hostname: string | null; type: string;
  vendor: string | null; model: string | null; isSimulated: boolean;
  sysObjectID?: string | null; lastSnmpAt?: string | null;
  interfaces: { id: string; name: string; mac: string | null; status: string; portRole: string | null; trunkVlans: string }[];
}

interface SwitchPostResult {
  ok: boolean; summary: string; fdbStored: number; lldpStored: number;
  linksCreated: number; linksUpdated: number; placeholdersCreated: number;
  portRolesUpdated: number; unknownMacs: { mac: string; port: string }[];
  warnings: string[]; unknownSections: string[]; simulated: boolean; message?: string;
}

interface VendorApi {
  vendors: { id: string; label: string; guideVersion: string; notes: string; commands: { id: string; title: string; what: string; command: string; parseFormat: string; requires: string }[] }[];
}

const KIND_LABELS: Record<string, string> = {
  fdb: "جدول MAC (FDB)", lldp: "همسایه‌های LLDP", vlan: "جدول VLAN", ifstatus: "وضعیت پورت‌ها",
};

export function Phase2View() {
  const { toast } = useToast();
  const { data: devApi } = useNetscopeData<{ devices: DeviceLite[] }>("/api/netscope/devices");
  const { data: vendorApi } = useNetscopeData<VendorApi>("/api/netscope/vendors");
  const [tab, setTab] = useState("switch");

  const infraDevices = useMemo(
    () => (devApi?.devices || []).filter((d) => ["switch", "router", "radio"].includes(d.type)),
    [devApi]
  );

  return (
    <div className="space-y-4">
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Radar className="h-5 w-5 text-primary" /> جمع‌آوری پیشرفته — فاز ۲
          </CardTitle>
          <CardDescription>
            SNMP فقط‌خواندنی، FDB/LLDP و نقشه فیزیکی با درجات اطمینان — قاعده سند ۵.۲: MAC روی پورت سوئیچ به‌تنهایی اتصال مستقیم نیست.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="switch" className="gap-1"><ClipboardPaste className="h-3.5 w-3.5" /> ورود FDB/LLDP سوئیچ</TabsTrigger>
              <TabsTrigger value="snmp" className="gap-1"><Server className="h-3.5 w-3.5" /> جمع‌آوری SNMP</TabsTrigger>
              <TabsTrigger value="ports" className="gap-1"><ArrowLeftRight className="h-3.5 w-3.5" /> نقش پورت‌ها</TabsTrigger>
              <TabsTrigger value="metrics" className="gap-1"><Gauge className="h-3.5 w-3.5" /> سنجه‌ها</TabsTrigger>
            </TabsList>

            <SwitchTab infra={infraDevices} vendors={vendorApi?.vendors || []} onDone={(r) => toast({ title: r.ok ? "خروجی سوئیچ اعمال شد" : "تجزیه ناموفق", description: r.summary || r.message, variant: r.ok ? "default" : "destructive" })} />
            <SnmpTab devices={infraDevices} onDone={(msg, variant) => toast({ title: "جمع‌آوری SNMP", description: msg, variant })} />
            <PortsTab infra={infraDevices} />
            <MetricsTab devices={devApi?.devices || []} />
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── تب ۱: ورود خروجی سوئیچ ────────────────────────────────────────
function SwitchTab({ infra, vendors, onDone }: {
  infra: DeviceLite[];
  vendors: VendorApi["vendors"];
  onDone: (r: SwitchPostResult) => void;
}) {
  const { toast } = useToast();
  const [deviceId, setDeviceId] = useState("");
  const [vendorId, setVendorId] = useState("cisco");
  const [kind, setKind] = useState("fdb");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SwitchPostResult | null>(null);

  const vendor = vendors.find((v) => v.id === vendorId);
  const cmdFormat = kind === "fdb"
    ? vendor?.commands.find((c) => c.id.includes("mac"))?.parseFormat || "generic-mac-table"
    : kind === "lldp"
      ? vendor?.commands.find((c) => c.id.includes("lldp"))?.parseFormat || "generic-lldp"
      : kind === "vlan" ? "cisco-vlan-brief" : "cisco-if-status";
  const cmdText = kind === "fdb"
    ? vendor?.commands.find((c) => c.id.includes("mac"))?.command
    : kind === "lldp"
      ? vendor?.commands.find((c) => c.id.includes("lldp"))?.command
      : kind === "vlan"
        ? vendor?.commands.find((c) => c.id.includes("vlan"))?.command
        : vendor?.commands.find((c) => c.id.includes("ifstatus"))?.command;

  const runScenario = async () => {
    if (!deviceId) return;
    setBusy(true);
    try {
      const r = await postJson<SwitchPostResult>("/api/netscope/switch", { deviceId, kind: "fdb", useScenario: true });
      setResult(r); onDone(r);
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
    setBusy(false);
  };

  const submit = async () => {
    if (!deviceId || !raw.trim()) {
      toast({ title: "دستگاه و خروجی را وارد کنید", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const r = await postJson<SwitchPostResult>("/api/netscope/switch", { deviceId, kind, format: cmdFormat, raw });
      setResult(r); onDone(r);
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
    setBusy(false);
  };

  return (
    <TabsContent value="switch" className="space-y-4 mt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">سوئیچ / تجهیز هدف</Label>
          <Select value={deviceId} onValueChange={setDeviceId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="انتخاب تجهیز..." /></SelectTrigger>
            <SelectContent>
              {infra.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.hostname || d.identityKey} — {deviceTypeLabel(d.type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">سازنده (قالب تجزیه)</Label>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.label} <span className="text-[10px] opacity-60">v{v.guideVersion}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">نوع داده</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(KIND_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* فرمان پیشنهادی سازنده — پلاگین نسخه‌دار (سند ۳.۳) */}
      {cmdText && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[11px] font-medium text-muted-foreground">فرمان {vendor?.label} (فقط‌خواندنی):</span>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]"
              onClick={() => { navigator.clipboard.writeText(cmdText); toast({ title: "فرمان کپی شد" }); }}>
              <Copy className="h-3 w-3" /> کپی
            </Button>
          </div>
          <code className="code-panel block text-[11px]" dir="ltr">{cmdText}</code>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">خروجی فرمان را اینجا بچسبانید:</Label>
        <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} dir="ltr"
          placeholder={kind === "fdb" ? "Vlan    Mac Address       Type        Interfaces\n 10     4447.ccc1.0041    DYNAMIC     Gi1/0/5" : "Local Intf: Gi1/0/1\nChassis id: d4ca.6d11.0001\nPort id: ether1\nSystem Name: rtr-gw-01"}
          className="code-panel min-h-36 font-mono text-[11px]" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={submit} disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} تجزیه و اعمال
        </Button>
        <Button size="sm" variant="outline" onClick={runScenario} disabled={busy} className="gap-1">
          <ClipboardPaste className="h-4 w-4" /> بارگذاری داده نمونه (شبیه‌سازی)
        </Button>
      </div>

      {result && <IngestResult r={result} />}
    </TabsContent>
  );
}

function IngestResult({ r }: { r: SwitchPostResult }) {
  return (
    <div className={cn("rounded-xl border p-4 space-y-3", r.ok ? "border-emerald-300 bg-emerald-50/50" : "border-amber-300 bg-amber-50/50")}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={r.ok ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-amber-100 text-amber-800 border-amber-300"}>{r.ok ? "اعمال شد" : "توجه"}</Badge>
        {r.simulated && <SimBadge isSimulated />}
        <span className="text-xs">{r.summary || r.message}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <Stat label="اتصال جدید" value={r.linksCreated} tone="emerald" />
        <Stat label="اتصال به‌روزشده" value={r.linksUpdated} tone="amber" />
        <Stat label="دستگاه ناشناس" value={r.placeholdersCreated} tone="stone" />
        <Stat label="نقش پورت ثبت‌شده" value={r.portRolesUpdated} tone="teal" />
      </div>
      {r.unknownMacs?.length > 0 && (
        <div className="rounded-lg bg-white/70 border p-2.5">
          <div className="text-[11px] font-semibold flex items-center gap-1 mb-1"><HelpCircle className="h-3.5 w-3.5 text-amber-600" /> MACهای ناشناس (دستگاه جایگاه‌دار با اطمینان نامشخص ساخته شد):</div>
          {r.unknownMacs.map((u, i) => (
            <div key={i} className="text-[11px] ltr font-mono">▪ {u.mac} — port {u.port}</div>
          ))}
        </div>
      )}
      {r.warnings?.length > 0 && (
        <div className="text-[11px] space-y-1">
          {r.warnings.map((w, i) => <div key={i} className="text-amber-700">⚠ {w}</div>)}
        </div>
      )}
      {r.unknownSections?.length > 0 && (
        <div className="text-[10px] text-muted-foreground">
          بخش‌های تجزیه‌نشده ({fa(r.unknownSections.length)}) — شفافیت: این خطوط نادیده گرفته شدند.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg bg-white/80 border px-2.5 py-1.5">
      <div className={cn("text-base font-bold", tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "teal" ? "text-teal-700" : "text-stone-600")}>{fa(value || 0)}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ─── تب ۲: جمع‌آوری SNMP ───────────────────────────────────────────
function SnmpTab({ devices, onDone }: { devices: DeviceLite[]; onDone: (msg: string, variant?: "default" | "destructive") => void }) {
  const [ip, setIp] = useState("");
  const [version, setVersion] = useState("2c");
  const [community, setCommunity] = useState("");
  const [v3user, setV3user] = useState(""); const [v3pass, setV3pass] = useState(""); const [v3priv, setV3priv] = useState("");
  const [scope, setScope] = useState("all");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const run = async () => {
    setBusy(true); setResult(null);
    try {
      const body: Record<string, unknown> = { action: "collect", targetIp: ip, version, scope, deviceId: targetId || undefined };
      if (version === "2c") body.community = community;
      else body.v3 = { user: v3user, authPass: v3pass, privPass: v3priv || v3pass, authProtocol: "sha", privProtocol: "aes" };
      const r = await postJson<Record<string, unknown>>("/api/netscope/snmp", body);
      setResult(r);
      const ok = r.ok as boolean;
      onDone(
        ok ? `موفق: رابط=${(r.interfaces as unknown[])?.length || 0} FDB=${(r.fdb as unknown[])?.length || 0} LLDP=${(r.lldp as unknown[])?.length || 0}` : String((r as { message?: string }).message || (r.errors as string[])?.join(" | ") || "ناموفق"),
        ok ? "default" : "destructive"
      );
    } catch (e) { onDone((e as Error).message, "destructive"); }
    setBusy(false);
  };

  return (
    <TabsContent value="snmp" className="space-y-4 mt-4">
      <div className="flex items-start gap-2 rounded-lg border p-3 text-[11px] leading-relaxed bg-teal-50/50 border-teal-200">
        <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
        <div>
          <b>قواعد امنیتی سند ۱۲:</b> فقط خواندن (GET/WALK) — اسکن فقط در محدوده تأییدشده — اعتبارنامه فقط در حافظه همین درخواست و هرگز ذخیره نمی‌شود — اولویت با SNMPv3.
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">IP هدف (دستگاه دارای SNMP)</Label>
          <Input value={ip} onChange={(e) => setIp(e.target.value)} dir="ltr" placeholder="10.10.0.2" className="h-9 font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">ثبت نتیجه روی دستگاه</Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="اختیاری — انتخاب تجهیز موجود..." /></SelectTrigger>
            <SelectContent>
              {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.hostname || d.identityKey}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">نسخه SNMP</Label>
          <Select value={version} onValueChange={setVersion}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="v3">SNMPv3 (توصیه‌شده — احراز + رمزنگاری)</SelectItem>
              <SelectItem value="2c">SNMPv2c (Community — ناامن‌تر)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">محدوده جمع‌آوری</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه (سیستم + رابط + FDB + LLDP)</SelectItem>
              <SelectItem value="system">فقط اطلاعات سیستم</SelectItem>
              <SelectItem value="interfaces">فقط جدول رابط‌ها</SelectItem>
              <SelectItem value="fdb">فقط FDB</SelectItem>
              <SelectItem value="lldp">فقط LLDP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {version === "2c" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Community (فقط‌خواندنی — ذخیره نمی‌شود)</Label>
            <Input type="password" value={community} onChange={(e) => setCommunity(e.target.value)} dir="ltr" className="h-9 font-mono" />
          </div>
        ) : (
          <>
            <div className="space-y-1.5"><Label className="text-xs">کاربر v3</Label><Input value={v3user} onChange={(e) => setV3user(e.target.value)} dir="ltr" className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">کلید Auth</Label><Input type="password" value={v3pass} onChange={(e) => setV3pass(e.target.value)} dir="ltr" className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">کلید Priv</Label><Input type="password" value={v3priv} onChange={(e) => setV3priv(e.target.value)} dir="ltr" className="h-9 font-mono" /></div>
          </>
        )}
      </div>
      <Button size="sm" onClick={run} disabled={busy || !ip} className="gap-1">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />} اجرای جمع‌آوری SNMP
      </Button>

      {result && (
        <div className={cn("rounded-xl border p-4 space-y-2 text-[11px]", (result as { ok: boolean }).ok ? "border-emerald-300 bg-emerald-50/50" : "border-rose-300 bg-rose-50/50")}>
          {(result as { blocked?: boolean }).blocked && <Badge className="bg-rose-100 text-rose-800 border-rose-300" variant="outline"><ShieldAlert className="h-3 w-3 ml-1" /> خارج از محدوده مجاز</Badge>}
          {result.system ? <pre className="code-panel whitespace-pre-wrap">{JSON.stringify(result.system, null, 1)}</pre> : null}
          {result.errors ? <div className="text-rose-700">خطا: {(result.errors as string[]).join(" | ")}</div> : null}
          {result.warnings ? (result.warnings as string[]).map((w, i) => <div key={i} className="text-amber-700">⚠ {w}</div>) : null}
          <div className="text-muted-foreground">{result.message as string}</div>
        </div>
      )}
    </TabsContent>
  );
}

// ─── تب ۳: نقش پورت‌ها و MACهای ناشناس ─────────────────────────────
function PortsTab({ infra }: { infra: DeviceLite[] }) {
  const [deviceId, setDeviceId] = useState("");
  const dev = infra.find((d) => d.id === deviceId);
  const { data } = useNetscopeData<{ fdb: { port: string; mac: string; vlanId: number | null }[]; lldp: { localPort: string; remoteSysName: string | null; remoteChassisId: string }[] }>(
    deviceId ? `/api/netscope/switch?deviceId=${deviceId}` : "/api/netscope/switch",
    [deviceId]
  );

  return (
    <TabsContent value="ports" className="mt-4 space-y-3">
      <div className="space-y-1.5 max-w-sm">
        <Label className="text-xs">سوئیچ</Label>
        <Select value={deviceId} onValueChange={setDeviceId}>
          <SelectTrigger className="h-9"><SelectValue placeholder="انتخاب سوئیچ..." /></SelectTrigger>
          <SelectContent>
            {infra.map((d) => <SelectItem key={d.id} value={d.id}>{d.hostname || d.identityKey}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {!deviceId && <div className="text-xs text-muted-foreground py-6 text-center">یک سوئیچ انتخاب کنید تا جدول FDB/LLDP و نقش پورت‌های آن نمایش داده شود.</div>}
      {dev && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm">جدول FDB ({fa(data?.fdb.length || 0)} رکورد)</CardTitle></CardHeader>
            <CardContent className="max-h-72 overflow-y-auto custom-scrollbar">
              <table className="w-full text-[11px]">
                <thead><tr className="text-muted-foreground border-b"><th className="py-1 text-right">پورت</th><th className="text-right">MAC</th><th>VLAN</th></tr></thead>
                <tbody>
                  {(data?.fdb || []).map((e, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-1 ltr font-mono">{e.port}</td>
                      <td className="ltr font-mono">{e.mac}</td>
                      <td className="text-center">{e.vlanId ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm">همسایه‌های LLDP ({fa(data?.lldp.length || 0)})</CardTitle></CardHeader>
            <CardContent className="max-h-72 overflow-y-auto custom-scrollbar space-y-1.5">
              {(data?.lldp || []).map((n, i) => (
                <div key={i} className="rounded-md bg-muted/50 p-2 text-[11px]">
                  <span className="ltr font-mono">{n.localPort}</span> → <b>{n.remoteSysName || "؟"}</b> <span className="ltr font-mono text-muted-foreground">({n.remoteChassisId})</span>
                  <Badge variant="outline" className="mr-1 text-[9px] bg-emerald-50 text-emerald-700 border-emerald-300">تأییدشده</Badge>
                </div>
              ))}
              {!data?.lldp.length && <div className="text-xs text-muted-foreground py-4 text-center">همسایه‌ای ثبت نشده — از تب «ورود FDB/LLDP» داده وارد کنید.</div>}
            </CardContent>
          </Card>
        </div>
      )}
      {dev && (
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">نقش پورت‌های این دستگاه (از استنباط فاز ۲)</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {dev.interfaces.filter((i) => i.portRole).map((i) => (
              <Badge key={i.id} variant="outline" className={cn("text-[10px] gap-1",
                i.portRole === "access" ? "bg-teal-50 text-teal-700 border-teal-300" : "bg-amber-50 text-amber-700 border-amber-300")}>
                <span className="ltr font-mono">{i.name}</span> — {i.portRole === "access" ? "access" : "trunk/uplink"}
              </Badge>
            ))}
            {!dev.interfaces.some((i) => i.portRole) && <span className="text-xs text-muted-foreground">هنوز نقش پورتی استنباط نشده — پس از ورود FDB نمایش داده می‌شود.</span>}
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}

// ─── تب ۴: سنجه‌ها (نمودار) ────────────────────────────────────────
function MetricsTab({ devices }: { devices: DeviceLite[] }) {
  const [deviceId, setDeviceId] = useState("");
  const [key, setKey] = useState("latency");
  const { data } = useNetscopeData<{ series: { ts: string; value: number; unit: string }[] }>(
    deviceId ? `/api/netscope/metrics?deviceId=${deviceId}&key=${key}&limit=80` : "/api/netscope/metrics",
    [deviceId, key]
  );
  const chart = (data?.series || []).map((s, i) => ({ i, value: s.value, t: new Date(s.ts).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }));

  return (
    <TabsContent value="metrics" className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
        <div className="space-y-1.5">
          <Label className="text-xs">دستگاه</Label>
          <Select value={deviceId} onValueChange={setDeviceId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="انتخاب..." /></SelectTrigger>
            <SelectContent>
              {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.hostname || d.identityKey}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">سنجه</Label>
          <Select value={key} onValueChange={setKey}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="latency">تأخیر (ms)</SelectItem>
              <SelectItem value="loss">افت بسته (%)</SelectItem>
              <SelectItem value="cpu">CPU (%)</SelectItem>
              <SelectItem value="temp">دما (°C)</SelectItem>
              <SelectItem value="rssi">RSSI (dBm)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {deviceId && (
        <div className="rounded-xl border bg-white h-64 p-2" dir="ltr">
          {chart.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, direction: "rtl" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="value" name={key} stroke="#0d9488" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid place-items-center h-full text-xs text-muted-foreground gap-2" dir="rtl">
              <Network className="h-6 w-6 opacity-30" />
              هنوز داده‌ای ثبت نشده — پایش را از مرکز اقدامات فعال کنید.
            </div>
          )}
        </div>
      )}
      {deviceId && data?.series?.length ? (
        <div className="text-[11px] text-muted-foreground">آخرین نمونه: {faDate(data.series[data.series.length - 1].ts)} — تعداد نمونه‌ها: {fa(data.series.length)}</div>
      ) : null}
    </TabsContent>
  );
}
