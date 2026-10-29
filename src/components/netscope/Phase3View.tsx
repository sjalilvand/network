"use client";

// NetScope — فاز ۳: کشف ONVIF، پلاگین‌های ضبط‌کننده و مدل رابطه دوربین-سوئیچ-PoE
// همه داده‌های شبیه‌سازی با برچسب مشخص (الزام شفافیت سند) — قاعده محوری:
//   MAC روی پورت ≠ اتصال قطعی؛ کانال NVR آفلاین ≠ خرابی دوربین؛ هر رابطه با شواهد.

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNetscopeData, postJson, fa, faDate, SimBadge, ConfidenceBadge, LinkConfidenceBadge } from "./shared";
import { useToast } from "@/hooks/use-toast";
import {
  ScanSearch, Loader2, Video, HardDrive, Plug, Waypoints, Zap, ZapOff,
  CircleCheck, CircleOff, HelpCircle, ShieldAlert, RefreshCw, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── تایپ‌ها ────────────────────────────────────────────────────────

interface OnvifCamera {
  deviceId: string; identityKey: string; name: string;
  vendor: string | null; model: string | null; firmware: string | null; serial: string | null;
  ip: string | null; onvifSupport: boolean; onvifXAddr: string | null;
  serviceState: string; lastOnvifAt: string | null; discoverySource: string;
  isSimulated: boolean;
}
interface DiscoverResult {
  ok: boolean; mode: string; durationMs?: number;
  discovered: { ip: string; xaddr: string; name?: string; hardware?: string; mac?: string; matched: string; deviceKey?: string; note: string }[];
  notDiscoverable: { key: string; reason: string }[];
  warnings: string[]; note?: string;
}
interface DeviceInfoResult {
  ok: boolean; isSimulated: boolean;
  info?: { state?: string; manufacturer?: string; model?: string; firmware?: string; serial?: string; error?: string };
  error?: string;
}
interface PluginInfo {
  id: string; label: string; vendor: string; version: string; rtypes: string[];
  apiPath: string; notes: string; endpoints: { key: string; path: string; what: string }[];
}
interface RecorderInfo {
  id: string; identityKey: string; name: string; rtype: string; vendor: string | null; model: string | null;
  channelCount: number; poeInternal: boolean; pluginId: string | null; pluginVersion: string | null;
  apiPath: string | null; lastSyncAt: string | null; ip: string | null; isSimulated: boolean;
  channels: { channelNo: number; online: string; recording: string; source: string; cameraIpRaw: string | null; cameraLabelRaw: string | null; cameraName: string | null }[];
}
interface RelationRow {
  cameraKey: string; cameraName: string; ip: string | null;
  switchKey: string | null; switchName: string | null; switchPort: string | null;
  poeStatus: string | null; poeWatts: number | null;
  nvrKey: string | null; nvrName: string | null; channelNo: number | null;
  channelOnline: string | null; recording: string | null;
  swConfidence: string; swSource: string | null; nvrConfidence: string;
  serviceState: string; lastOnvifAt: string | null;
  evidence: string;
}
interface NvrApi {
  plugins: PluginInfo[];
  recorders: RecorderInfo[];
  relations: RelationRow[];
}
interface SyncResult {
  ok: boolean; pluginId?: string; pluginVersion?: string; mode: string;
  channels: { channelNo: number; label?: string; ip?: string; online?: string; recording?: string }[];
  stored: number; matched: number; created: number;
  unmatched: { channelNo: number; label?: string; ip?: string; reason: string }[];
  warnings: string[]; errors: string[];
}
interface RebuildResult {
  ok: boolean;
  relations: { cameraKey: string; cameraName: string; confidence: string; evidence: string; switchName?: string; switchPort?: string; nvrName?: string; channelNo?: number | null; poeStatus?: string | null; poeWatts?: number | null; simulatedParts?: boolean }[];
  linksCreated: number; linksUpdated: number; findingsCreated: number;
  warnings: string[]; errors: string[];
}

const SERVICE_STATE_LABELS: Record<string, { label: string; cls: string }> = {
  "onvif-ok": { label: "سرویس ONVIF پاسخ می‌دهد", cls: "text-emerald-700" },
  "onvif-fail": { label: "سرویس ONVIF پاسخ نداد", cls: "text-rose-600" },
  "needs-auth": { label: "سرویس فعال — احراز هویت لازم", cls: "text-amber-600" },
  "unknown": { label: "سرویس بررسی نشده", cls: "text-stone-500" },
};

export function Phase3View() {
  const { toast } = useToast();
  const { data, loading, refresh } = useNetscopeData<NvrApi>("/api/netscope/nvr");
  const { data: onvifApi, refresh: refreshOnvif } = useNetscopeData<{ cameras: OnvifCamera[] }>("/api/netscope/onvif");
  const [tab, setTab] = useState("discover");

  const all = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) {
      toast({ title: "خطا", description: (e as Error).message, variant: "destructive" });
    } finally { refresh(); refreshOnvif(); }
  };

  if (loading && !data) return <div className="p-4 space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>;
  if (!data) return <div className="p-6 text-center text-muted-foreground">خطا در دریافت اطلاعات</div>;

  return (
    <div className="space-y-4">
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanSearch className="h-5 w-5 text-primary" /> دوربین‌ها و ضبط‌کننده‌ها — فاز ۳
          </CardTitle>
          <CardDescription>
            کشف ONVIF، پلاگین‌های نسخه‌دار سازندگان و مدل رابطه‌ای دوربین ↔ سوئیچ (PoE) ↔ کانال ضبط‌کننده —
            با قواعد سند ۵.۲ و ۶: اطمینان صادقانه، عدم حدس و حفاظت از محتوا.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            <div className="rounded-lg border p-2.5 bg-emerald-50/50 border-emerald-200">
              <div className="font-bold text-emerald-800 mb-1">قاعده ۱ — اتصال فیزیکی</div>
              MAC دوربین روی پورت سوئیچ فقط «استنباطی» است؛ با تأیید توان PoE به «تأییدشده» ارتقا می‌یابد.
            </div>
            <div className="rounded-lg border p-2.5 bg-amber-50/50 border-amber-200">
              <div className="font-bold text-amber-800 mb-1">قاعده ۲ — سه وضعیت مستقل</div>
              شبکه، سرویس و ضبط جداگانه آزمایش و گزارش می‌شوند؛ پاسخ یکی به معنی سلامت دیگری نیست.
            </div>
            <div className="rounded-lg border p-2.5 bg-violet-50/50 border-violet-200">
              <div className="font-bold text-violet-800 mb-1">قاعده ۳ — پلاگین نسخه‌دار</div>
              هر سازنده پلاگین مستقل با نسخه دارد؛ تجزیه‌گر واقعی برای داده واقعی و شبیه‌سازی یکسان است.
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="discover" className="gap-1"><ScanSearch className="h-3.5 w-3.5" /> کشف ONVIF</TabsTrigger>
          <TabsTrigger value="plugins" className="gap-1"><Plug className="h-3.5 w-3.5" /> پلاگین‌های ضبط‌کننده</TabsTrigger>
          <TabsTrigger value="relations" className="gap-1"><Waypoints className="h-3.5 w-3.5" /> مدل رابطه‌ها و PoE</TabsTrigger>
        </TabsList>

        <DiscoverTab
          cameras={onvifApi?.cameras || []}
          onDone={all}
        />
        <PluginsTab recorders={data.recorders} plugins={data.plugins} onDone={all} />
        <RelationsTab relations={data.relations} onDone={all} />
      </Tabs>
    </div>
  );
}

// ─── تب ۱: کشف ONVIF ────────────────────────────────────────────────

function DiscoverTab({ cameras, onDone }: {
  cameras: OnvifCamera[];
  onDone: (fn: () => Promise<void>) => Promise<void>;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoverResult | null>(null);
  const [infoResult, setInfoResult] = useState<Record<string, DeviceInfoResult>>({});

  const discover = (mode: "real" | "simulated") => onDone(async () => {
    setBusy(mode === "real" ? "کشف واقعی در حال اجرا (حدود ۵ ثانیه)..." : "کشف شبیه‌سازی‌شده در حال اجرا...");
    setBusy(mode);
    try {
      const r = await postJson("/api/netscope/onvif", { action: "ws-discover", mode }) as DiscoverResult;
      setResult(r);
      toast({
        title: mode === "real" ? "کشف واقعی ONVIF تمام شد" : "کشف شبیه‌سازی‌شده تمام شد",
        description: `${fa(r.discovered.length)} دستگاه پاسخ داد`,
      });
    } finally { setBusy(null); }
  });

  const probeDevice = (cam: OnvifCamera, mode: "real" | "simulated") => onDone(async () => {
    setBusy(`info-${cam.deviceId}`);
    try {
      const r = await postJson("/api/netscope/onvif", { action: "device-info", deviceId: cam.deviceId, mode }) as DeviceInfoResult;
      setInfoResult((prev) => ({ ...prev, [cam.deviceId]: r }));
      if (r.ok) toast({ title: `مشخصات ${cam.name} دریافت شد`, description: `${r.info?.manufacturer} ${r.info?.model} — FW ${r.info?.firmware}` });
      else toast({ title: `استعلام ${cam.name} ناموفق`, description: r.info?.error || r.error, variant: "destructive" });
    } finally { setBusy(null); }
  });

  return (
    <TabsContent value="discover" className="mt-3 space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><ScanSearch className="h-4 w-4 text-primary" /> کشف با WS-Discovery (مالتی‌کست UDP)</CardTitle>
          <CardDescription>
            Probe استاندارد ONVIF به گروه ۲۳۹.۲۵۵.۲۵۵.۲۵۰:۳۷۰۲ — کاملاً فقط‌خواندنی. پاسخ‌دهی دستگاه یعنی سرویس ONVIF آن فعال است.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => discover("real")} disabled={!!busy} className="gap-1.5">
            {busy === "real" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RadarIcon />} کشف واقعی در شبکه
          </Button>
          <Button size="sm" variant="outline" onClick={() => discover("simulated")} disabled={!!busy} className="gap-1.5">
            {busy === "simulated" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />} سناریوی آزمایشی (۷ دوربین)
          </Button>
          <span className="text-[11px] text-muted-foreground self-center">
            در سناریو: CAM-05/06 پشت PoE داخلی NVR و CAM-07 پشت لینک رادیویی قطع — عمداً کشف «نمی‌شوند» (سند ۶.۳)
          </span>
        </CardContent>
      </Card>

      {result && (
        <Card className="fade-up border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              نتیجه کشف ({fa(result.discovered.length)} دستگاه)
              {result.mode === "simulated" && <SimBadge isSimulated />}
              {result.durationMs != null && <Badge variant="secondary" className="text-[10px]">{fa(Math.round(result.durationMs / 100) / 10)} ثانیه</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.discovered.map((d, i) => (
              <div key={i} className="rounded-lg border p-2.5 text-xs space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono ltr-inline font-bold">{d.ip}</span>
                  {d.hardware && <Badge variant="secondary" className="text-[10px]">{d.hardware}</Badge>}
                  {d.mac && <Badge variant="outline" className="text-[10px] font-mono ltr-inline">{d.mac}</Badge>}
                  {d.name && <span className="text-muted-foreground">«{d.name}»</span>}
                  <Badge variant="outline" className={cn("text-[10px]", d.matched === "created" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700")}>
                    {d.matched === "created" ? "دستگاه جدید ثبت شد" : d.matched === "recorder" ? "ضبط‌کننده موجود" : "تطبیق با دستگاه موجود"}
                  </Badge>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono ltr-inline">{d.xaddr}</div>
                <div className="text-[10px]">{d.note}</div>
              </div>
            ))}
            {result.notDiscoverable.map((n) => (
              <div key={n.key} className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs flex items-start gap-2">
                <HelpCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <span><b>{n.key}</b> کشف نشد — {n.reason}</span>
              </div>
            ))}
            {result.warnings.map((w, i) => (
              <div key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5"><ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />{w}</div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /> استعلام مشخصات دستگاه‌ها (GetDeviceInformation)</CardTitle>
          <CardDescription>سازنده، مدل، فرم‌ور و سریال — بدون هیچ دسترسی به محتوای تصویری (سند ۶.۵)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {cameras.map((cam) => {
            const st = SERVICE_STATE_LABELS[cam.serviceState] || SERVICE_STATE_LABELS.unknown;
            const info = infoResult[cam.deviceId];
            return (
              <div key={cam.deviceId} className="rounded-lg border p-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Video className={cn("h-4 w-4", cam.onvifSupport ? "text-emerald-600" : "text-stone-400")} />
                  <span className="text-xs font-bold">{cam.name}</span>
                  <span className="text-[10px] text-muted-foreground">{cam.vendor} {cam.model}</span>
                  {cam.ip && <Badge variant="secondary" className="text-[10px] font-mono ltr-inline">{cam.ip}</Badge>}
                  {cam.discoverySource === "onvif-wsdiscovery" && <Badge variant="outline" className="text-[10px]">کشف ONVIF</Badge>}
                  {cam.discoverySource === "nvr-api" && <Badge variant="outline" className="text-[10px]">از API ضبط‌کننده</Badge>}
                  <SimBadge isSimulated={cam.isSimulated} />
                  <div className="flex-1" />
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!!busy} onClick={() => probeDevice(cam, "simulated")}>استعلام (سناریو)</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!!busy} onClick={() => probeDevice(cam, "real")}>استعلام واقعی</Button>
                </div>
                <div className={cn("text-[11px] flex items-center gap-1.5", st.cls)}>
                  {cam.serviceState === "onvif-ok" ? <CircleCheck className="h-3.5 w-3.5" />
                    : cam.serviceState === "onvif-fail" ? <CircleOff className="h-3.5 w-3.5" />
                    : cam.serviceState === "needs-auth" ? <ShieldAlert className="h-3.5 w-3.5" />
                    : <HelpCircle className="h-3.5 w-3.5" />}
                  {st.label}
                  {cam.lastOnvifAt && <span className="text-muted-foreground">— آخرین بررسی: {faDate(cam.lastOnvifAt)}</span>}
                </div>
                {info && (
                  <div className="text-[10px] bg-muted/60 rounded p-2 space-y-0.5">
                    {info.ok ? (
                      <>سازنده: <b>{info.info?.manufacturer}</b> | مدل: <b>{info.info?.model}</b> | فرم‌ور: <b className="ltr-inline font-mono">{info.info?.firmware}</b> | سریال: <b className="ltr-inline font-mono">{info.info?.serial}</b>{info.isSimulated && <SimBadge isSimulated />}</>
                    ) : (
                      <span className="text-rose-600">{info.info?.error || info.error}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function RadarIcon() { return <ScanSearch className="h-4 w-4" />; }

// ─── تب ۲: پلاگین‌های ضبط‌کننده ──────────────────────────────────────

function PluginsTab({ recorders, plugins, onDone }: {
  recorders: RecorderInfo[];
  plugins: PluginInfo[];
  onDone: (fn: () => Promise<void>) => Promise<void>;
}) {
  const { toast } = useToast();
  const [pluginId, setPluginId] = useState("dahua-http-api");
  const [recorderId, setRecorderId] = useState(recorders[0]?.id || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  const sync = (mode: "real" | "simulated") => onDone(async () => {
    setBusy(mode);
    try {
      const r = await postJson("/api/netscope/nvr", {
        action: "sync-channels", pluginId, recorderId: recorders[0]?.id, mode,
        // رمز فقط برای همین درخواست استفاده و ذخیره نمی‌شود (سند ۱۲)
        username: username || undefined, password: password || undefined,
      }) as SyncResult;
      setResult(r);
      if (r.ok) {
        toast({
          title: "همگام‌سازی کانال‌ها انجام شد",
          description: `${fa(r.stored)} کانال ذخیره — ${fa(r.matched)} تطبیق — ${fa(r.created)} دوربین جدید از API ضبط‌کننده`,
        });
      } else {
        toast({ title: "همگام‌سازی ناموفق", description: r.errors.join(" | ") || "خطای نامشخص", variant: "destructive" });
      }
    } finally { setBusy(null); }
  });

  const rebuild = () => onDone(async () => {
    setBusy("rebuild");
    try {
      const r = await postJson("/api/netscope/nvr", { action: "rebuild-relations" }) as RebuildResult;
      toast({
        title: "روابط بازسازی شد",
        description: `${fa(r.linksCreated)} لینک جدید — ${fa(r.linksUpdated)} به‌روزرسانی — ${fa(r.findingsCreated)} یافته تحلیلی`,
      });
    } finally { setBusy(null); }
  });

  const plugin = plugins.find((p) => p.id === pluginId);

  return (
    <TabsContent value="plugins" className="mt-3 space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Plug className="h-4 w-4 text-primary" /> پلاگین‌های نسخه‌دار سازندگان (سند ۳.۳)</CardTitle>
          <CardDescription>افزودن سازنده جدید بدون تغییر هسته — هر پلاگین نسخه مستقل دارد و فقط فرمان‌های خواندنی صادر می‌کند.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            {plugins.map((p) => (
              <button
                key={p.id}
                onClick={() => setPluginId(p.id)}
                className={cn(
                  "text-right rounded-xl border p-3 transition-all",
                  pluginId === p.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40"
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold">{p.label}</span>
                  <Badge variant="secondary" className="text-[10px] font-mono ltr-inline">v{p.version}</Badge>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">{p.vendor} • {p.rtypes.join("/")} • {p.endpoints.length} فرمان فقط‌خواندنی</div>
              </button>
            ))}
          </div>

          {plugin && (
            <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1.5">
              <div className="font-bold">{plugin.label} <span className="text-muted-foreground font-mono ltr-inline">v{plugin.version}</span></div>
              <div className="text-muted-foreground leading-relaxed">{plugin.notes}</div>
              <div className="space-y-1">
                {plugin.endpoints.map((e) => (
                  <div key={e.key} className="flex flex-wrap items-baseline gap-1.5">
                    <code className="text-[10px] bg-white border rounded px-1.5 py-0.5 ltr-inline font-mono">{e.path}</code>
                    <span className="text-[10px] text-muted-foreground">{e.what}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">ضبط‌کننده هدف</Label>
              <Select value={recorderId} onValueChange={setRecorderId}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {recorders.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} ({r.vendor})</SelectItem>)}
                  {!recorders.length && <SelectItem value="none" disabled>ضبط‌کننده‌ای ثبت نشده</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">کاربر فقط‌خواندنی (اختیاری)</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} className="h-9 text-xs ltr-inline" dir="ltr" placeholder="readonly-user" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">رمز (در حافظه مصرف می‌شود)</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-9 text-xs" dir="ltr" placeholder="••••••••" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="gap-1.5 flex-1" disabled={!!busy || !recorders.length} onClick={() => sync("real")}>
                {busy === "real" ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />} واکشی واقعی
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 flex-1" disabled={!!busy || !recorders.length} onClick={() => sync("simulated")}>
                {busy === "simulated" ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />} سناریو
              </Button>
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            اطلاعات ورود فقط برای همین درخواست در حافظه استفاده می‌شود؛ ذخیره یا ثبت در گزارش انجام نمی‌گیرد (الزام سند ۱۲). هیچ فرمان تغییر پیکربندی ارسال نمی‌شود.
          </div>
        </CardContent>
      </Card>

      {result && result.ok && (
        <Card className="fade-up border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              نتیجه همگام‌سازی — {fa(result.stored)} کانال
              {result.mode === "simulated" && <SimBadge isSimulated />}
              <Badge variant="secondary" className="text-[10px] font-mono ltr-inline">{result.pluginId} v{result.pluginVersion}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700">{fa(result.matched)} کانال با دوربین تطبیق یافت</Badge>
              <Badge variant="outline" className="bg-sky-50 text-sky-700">{fa(result.created)} دوربین جدید از API ضبط‌کننده</Badge>
              <Badge variant="outline" className="bg-stone-50 text-stone-600">{fa(result.unmatched.length)} بدون تطبیق</Badge>
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead className="bg-muted/70"><tr>
                  <th className="px-3 py-2 text-right font-semibold">کانال</th>
                  <th className="px-3 py-2 text-right font-semibold">برچسب خام</th>
                  <th className="px-3 py-2 text-right font-semibold">IP گزارش‌شده</th>
                  <th className="px-3 py-2 text-right font-semibold">آنلاین NVR</th>
                  <th className="px-3 py-2 text-right font-semibold">ضبط</th>
                  <th className="px-3 py-2 text-right font-semibold">تطبیق</th>
                </tr></thead>
                <tbody className="divide-y">
                  {result.channels.map((ch) => {
                    const un = result.unmatched.find((u) => u.channelNo === ch.channelNo);
                    return (
                      <tr key={ch.channelNo} className="hover:bg-accent/30">
                        <td className="px-3 py-2 font-bold">{fa(ch.channelNo)}</td>
                        <td className="px-3 py-2">{ch.label || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 font-mono ltr-inline">{ch.ip || "—"}</td>
                        <td className="px-3 py-2">
                          {ch.online === "online" ? <Badge className="bg-emerald-600 text-white text-[10px]">آنلاین</Badge>
                            : ch.online === "offline" ? <Badge variant="destructive" className="text-[10px]">آفلاین</Badge>
                            : <Badge variant="secondary" className="text-[10px]">نامشخص</Badge>}
                        </td>
                        <td className="px-3 py-2">
                          {ch.recording === "active" ? <Badge className="bg-teal-600 text-white text-[10px]">فعال</Badge>
                            : ch.recording === "inactive" ? <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-300">غیرفعال</Badge>
                            : <Badge variant="secondary" className="text-[10px]">نامشخص</Badge>}
                        </td>
                        <td className="px-3 py-2 text-[10px]">
                          {un ? <span className="text-amber-700" title={un.reason}>{un.reason}</span> : <span className="text-emerald-700">دوربین تطبیق یافت</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {result.warnings.map((w, i) => <div key={i} className="text-[11px] text-muted-foreground">• {w}</div>)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">کانال‌های ذخیره‌شده ضبط‌کننده‌ها</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recorders.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <HardDrive className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold">{r.name}</span>
                <span className="text-[10px] text-muted-foreground">{r.vendor} {r.model} • {r.ip}</span>
                {r.pluginId && <Badge variant="secondary" className="text-[10px] font-mono ltr-inline">{r.pluginId} v{r.pluginVersion}</Badge>}
                {r.lastSyncAt && <span className="text-[10px] text-muted-foreground">آخرین همگام‌سازی: {faDate(r.lastSyncAt)}</span>}
                <SimBadge isSimulated={r.isSimulated} />
                <div className="flex-1" />
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={!!busy} onClick={rebuild}>
                  {busy === "rebuild" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} بازسازی روابط
                </Button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {r.channels.map((ch) => (
                  <div key={ch.channelNo} className={cn(
                    "rounded-lg border p-2 text-[10px] space-y-0.5",
                    ch.online === "offline" && "bg-rose-50/50 border-rose-200",
                    ch.online === "online" && ch.recording === "active" && "bg-emerald-50/50 border-emerald-200"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold">کانال {fa(ch.channelNo)}</span>
                      {ch.online === "online" ? <CircleCheck className="h-3 w-3 text-emerald-600" />
                        : ch.online === "offline" ? <CircleOff className="h-3 w-3 text-rose-500" />
                        : <HelpCircle className="h-3 w-3 text-stone-400" />}
                    </div>
                    <div className="text-muted-foreground">{ch.cameraLabelRaw || ch.cameraName || "خالی"}</div>
                    <div className="font-mono ltr-inline text-muted-foreground">{ch.cameraIpRaw || "—"}</div>
                    <div className="flex gap-1">
                      {ch.recording === "active" && <Badge className="bg-teal-600 text-white text-[9px] px-1 py-0">ضبط</Badge>}
                      {ch.recording === "inactive" && <Badge variant="outline" className="text-[9px] px-1 py-0 text-rose-600">بدون ضبط</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// ─── تب ۳: مدل رابطه‌ها و PoE ───────────────────────────────────────

function RelationsTab({ relations, onDone }: {
  relations: RelationRow[];
  onDone: (fn: () => Promise<void>) => Promise<void>;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const rebuild = () => onDone(async () => {
    setBusy(true);
    try {
      const r = await postJson("/api/netscope/nvr", { action: "rebuild-relations" }) as RebuildResult;
      toast({
        title: "روابط از شواهد بازسازی شد",
        description: `${fa(r.linksCreated)} لینک جدید — ${fa(r.findingsCreated)} یافته تحلیلی${r.warnings.length ? ` — ${r.warnings[0]}` : ""}`,
      });
    } finally { setBusy(false); }
  });

  const poeBadge = (status: string | null, watts: number | null) => {
    if (status === "poe-fault") return <Badge variant="destructive" className="text-[10px] gap-1"><ZapOff className="h-3 w-3" /> خطای PoE</Badge>;
    if (status === "poe-ok") return <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-300"><Zap className="h-3 w-3" /> PoE {fa(watts || 0)}W</Badge>;
    if (status === "poe-none") return <Badge variant="secondary" className="text-[10px]">بدون PoE</Badge>;
    return <Badge variant="secondary" className="text-[10px]">PoE نامشخص</Badge>;
  };

  return (
    <TabsContent value="relations" className="mt-3 space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Waypoints className="h-4 w-4 text-primary" /> زنجیره دوربین ↔ سوئیچ (PoE) ↔ کانال NVR</CardTitle>
          <CardDescription>
            ساخت روابط از شواهد: FDB + توان PoE برای اتصال فیزیکی، API ضبط‌کننده برای ثبت کانال. سطح اطمینان هر رابطه صادقانه ثبت می‌شود و بدون شاهد، «نامشخص» می‌ماند.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" className="gap-1.5" disabled={busy} onClick={rebuild}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} بازسازی روابط از شواهد
          </Button>
        </CardContent>
      </Card>

      <Card className="fade-up">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[820px]">
              <thead className="bg-muted/70"><tr>
                <th className="px-3 py-2 text-right font-semibold">دوربین</th>
                <th className="px-3 py-2 text-right font-semibold">سرویس ONVIF</th>
                <th className="px-3 py-2 text-right font-semibold">سوئیچ / پورت</th>
                <th className="px-3 py-2 text-right font-semibold">PoE</th>
                <th className="px-3 py-2 text-right font-semibold">ضبط‌کننده / کانال</th>
                <th className="px-3 py-2 text-right font-semibold">وضعیت کانال</th>
                <th className="px-3 py-2 text-right font-semibold">اطمینان اتصال</th>
              </tr></thead>
              <tbody className="divide-y">
                {relations.map((r) => {
                  const st = SERVICE_STATE_LABELS[r.serviceState] || SERVICE_STATE_LABELS.unknown;
                  return (
                    <tr key={r.cameraKey} className="hover:bg-accent/30">
                      <td className="px-3 py-2">
                        <div className="font-bold flex items-center gap-1.5"><Video className="h-3.5 w-3.5 text-muted-foreground" />{r.cameraName}</div>
                        <div className="text-[10px] font-mono ltr-inline text-muted-foreground">{r.ip || "—"}</div>
                      </td>
                      <td className={cn("px-3 py-2 text-[10px]", st.cls)}>
                        {r.serviceState === "onvif-ok" ? <CircleCheck className="inline h-3.5 w-3.5 ml-0.5" />
                          : r.serviceState === "onvif-fail" ? <CircleOff className="inline h-3.5 w-3.5 ml-0.5" />
                          : r.serviceState === "needs-auth" ? <ShieldAlert className="inline h-3.5 w-3.5 ml-0.5" />
                          : <HelpCircle className="inline h-3.5 w-3.5 ml-0.5" />}
                        {st.label}
                      </td>
                      <td className="px-3 py-2">
                        {r.switchName ? (
                          <>{r.switchName}<Badge variant="secondary" className="text-[10px] font-mono ltr-inline mr-1">{r.switchPort}</Badge></>
                        ) : <span className="text-muted-foreground text-[10px]">بدون شواهد FDB</span>}
                      </td>
                      <td className="px-3 py-2">{poeBadge(r.poeStatus, r.poeWatts)}</td>
                      <td className="px-3 py-2">
                        {r.nvrName ? <>{r.nvrName} <Badge variant="secondary" className="text-[10px]">کانال {fa(r.channelNo || 0)}</Badge></>
                          : <span className="text-muted-foreground text-[10px]">ثبت نشده (سناریو ۶.۳-۶)</span>}
                      </td>
                      <td className="px-3 py-2 text-[10px]">
                        {r.channelOnline === "online" ? <Badge className="bg-emerald-600 text-white text-[10px]">آنلاین</Badge>
                          : r.channelOnline === "offline" ? <Badge variant="destructive" className="text-[10px]">آفلاین</Badge>
                          : <Badge variant="secondary" className="text-[10px]">نامشخص</Badge>}
                        {r.recording === "active" && <Badge className="bg-teal-600 text-white text-[10px] mr-1">ضبط</Badge>}
                        {r.recording === "inactive" && <Badge variant="outline" className="text-[10px] mr-1 text-rose-600 border-rose-300">بدون ضبط</Badge>}
                      </td>
                      <td className="px-3 py-2"><LinkConfidenceBadge confidence={r.swConfidence} /></td>
                    </tr>
                  );
                })}
                {!relations.length && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground text-xs">
                    هنوز روابطی ثبت نشده — ابتدا کشف/سناریو و همگام‌سازی کانال‌ها را اجرا کنید
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-xs leading-relaxed flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
        <span>
          <b>تفسیر صادقانه (سند ۶.۴):</b> «آفلاین بودن کانال» سه علت متفاوت می‌تواند داشته باشد: مشکل خود دوربین، مشکل پیکربندی کانال NVR، یا قطعی بالادستی (مثل لینک رادیویی).
          برنامه این سه را با شواهد جدا می‌کند و علت را «محتمل» اعلام می‌کند — نه قطعی.
        </span>
      </div>
    </TabsContent>
  );
}
