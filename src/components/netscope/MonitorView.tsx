"use client";

// NetScope — صفحه ۶: داشبورد مانیتورینگ (سند بخش ۸)

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNetscopeData, postJson, emitRefresh, fa, faDate } from "./shared";
import { useToast } from "@/hooks/use-toast";
import { Activity, Gauge, Timer, ShieldAlert, RefreshCw, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { deviceTypeIcon, deviceTypeLabel } from "./shared";

interface MonitoredRow {
  id: string; identityKey: string; name: string; type: string; status: string; sensitivity: string;
  latency: { value: number; unit: string } | null;
  loss: { value: number; unit: string } | null;
  cpu: { value: number; unit: string } | null;
  temp: { value: number; unit: string } | null;
  rssi: { value: number; unit: string } | null;
  lastSeen: string | null; isSimulated: boolean; interval: string;
}
interface MonitorApi {
  monitored: MonitoredRow[];
  alerts: AlertRow[];
  changes: ChangeRow[];
}
interface AlertRow {
  id: string; severity: string; title: string; message: string; status: string;
  kind: string; failures: number; aggregated: boolean; firstSeen: string; lastSeen: string;
  evidenceText: string; device: { identityKey: string; hostname: string } | null;
}
interface ChangeRow {
  id: string; kind: string; before: string; after: string; at: string;
  device: { identityKey: string; hostname: string } | null;
}

export function MonitorView() {
  const { data, loading, refresh } = useNetscopeData<MonitorApi>("/api/netscope/monitor");
  const { toast } = useToast();

  const runTick = async () => {
    try {
      await postJson("/api/netscope/engine", { action: "run-step", step: "periodic-update" });
      toast({ title: "تیک پایش اجرا شد" });
      emitRefresh(); refresh();
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
  };

  if (loading && !data) return <div className="p-4 grid gap-3 md:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>;
  if (!data) return <div className="p-6 text-center text-muted-foreground">خطا در دریافت داده مانیتورینگ</div>;

  const online = data.monitored.filter((d) => d.status === "online").length;
  const offline = data.monitored.filter((d) => d.status === "offline").length;
  const avgLatency = (() => {
    const vals = data.monitored.map((d) => d.latency?.value).filter((v): v is number => v != null && v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  })();

  return (
    <div className="space-y-4">
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-primary" /> داشبورد مانیتورینگ — زمان‌بندی تطبیقی
              </CardTitle>
              <CardDescription className="mt-1">
                تجهیزات مهم بیشتر بررسی می‌شوند؛ پس از مشکل، بررسی تکمیلی محدود انجام و با پایداری، نرخ عادی برمی‌گردد.
                کشف موجودی از پایش سلامت جدا است. (سند ۸.۲)
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={runTick} className="gap-1">
              <RefreshCw className="h-4 w-4" /> اجرای تیک پایش
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniStat label="آنلاین" value={online} tone="ok" />
            <MiniStat label="بدون پاسخ" value={offline} tone={offline ? "bad" : "default"} />
            <MiniStat label="تأخیر میانگین" value={avgLatency ? `${fa(avgLatency)}ms` : "—"} tone="default" />
            <MiniStat label="هشدار فعال" value={data.alerts.filter((a) => a.status === "active").length} tone={data.alerts.some((a) => a.status === "active") ? "warn" : "default"} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.monitored.map((d) => (
          <Card key={d.id} className="fade-up">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={d.status === "online" ? "text-emerald-600" : d.status === "offline" ? "text-rose-500" : "text-muted-foreground"}>
                    {deviceTypeIcon(d.type, "h-4 w-4")}
                  </span>
                  <span className="text-sm font-semibold truncate">{d.name}</span>
                </div>
                <Badge variant="outline" className={cn("text-[10px]", d.status === "online" ? "bg-emerald-50 text-emerald-700 border-emerald-300" : d.status === "offline" ? "bg-rose-50 text-rose-700 border-rose-300" : "")}>
                  {d.status === "online" ? "آنلاین" : d.status === "offline" ? "بدون پاسخ" : "—"}
                </Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                <Metric label="تأخیر" icon={<Timer className="h-3 w-3" />} value={d.latency && d.latency.value > 0 ? `${fa(d.latency.value)} ${d.latency.unit}` : "—"} warn={(d.latency?.value || 0) > 8} />
                <Metric label="اتلاف بسته" icon={<CircleDot className="h-3 w-3" />} value={d.loss ? `${fa(d.loss.value)}٪` : "—"} warn={(d.loss?.value || 0) > 0} />
                <Metric label="CPU" icon={<Gauge className="h-3 w-3" />} value={d.cpu ? `${fa(d.cpu.value)}٪` : "—"} warn={(d.cpu?.value || 0) > 60} />
                <Metric label="دما" icon={<Gauge className="h-3 w-3" />} value={d.temp ? `${fa(d.temp.value)}°` : "—"} warn={(d.temp?.value || 0) > 55} />
                {d.rssi && <Metric label="سیگنال رادیو" icon={<Gauge className="h-3 w-3" />} value={`${fa(d.rssi.value)} ${d.rssi.unit}`} warn={d.rssi.value < -85} />}
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-1"><Timer className="h-3 w-3" /> نرخ: {d.interval}</span>
                <span>آخرین: {faDate(d.lastSeen)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* هشدارهای فعال با منطق تجمیع */}
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5 text-amber-500" /> هشدارها — با آستانه شکست متوالی و تجمیع علل ریشه
          </CardTitle>
          <CardDescription>
            هشدار پس از چند شکست متوالی ایجاد می‌شود؛ قطع عامل از قطع دستگاه تفکیک شده و قطع لینک بالادستی هشدارهای وابسته را تجمیع می‌کند. (سند ۸.۳)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.alerts.filter((a) => a.status === "active").length === 0 && (
            <div className="text-sm text-muted-foreground py-3 text-center">هشدار فعالی وجود ندارد.</div>
          )}
          {data.alerts.filter((a) => a.status === "active").map((a) => (
            <div key={a.id} className={cn("rounded-xl border p-3", a.kind === "upstream-aggregate" ? "border-rose-300 bg-rose-50/50" : a.severity === "critical" ? "border-amber-300 bg-amber-50/40" : "border")}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={a.severity === "critical" ? "destructive" : "outline"} className={cn("text-[10px]", a.severity === "warning" && "bg-amber-50 text-amber-700 border-amber-300")}>
                  {a.severity === "critical" ? "بحرانی" : a.severity === "warning" ? "هشدار" : "اطلاع"}
                </Badge>
                {a.aggregated && <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-700 border-rose-300">علت ریشه تجمیعی</Badge>}
                <span className="text-sm font-semibold">{a.title}</span>
                <span className="text-[10px] text-muted-foreground">{faDate(a.lastSeen)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{a.message}</p>
              {a.evidenceText && <p className="mt-1 text-[10px] text-muted-foreground">شواهد: {a.evidenceText}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone: "ok" | "bad" | "warn" | "default" }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-center">
      <div className={cn("text-xl font-bold", tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "")}>{fa(value)}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Metric({ label, icon, value, warn }: { label: string; icon: React.ReactNode; value: string; warn?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between rounded bg-muted/40 px-2 py-1", warn && "bg-amber-50 text-amber-700")}>
      <span className="flex items-center gap-1 text-muted-foreground">{icon}{label}</span>
      <span className="font-semibold ltr-inline">{value}</span>
    </div>
  );
}
