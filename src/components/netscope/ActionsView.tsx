"use client";

// NetScope — صفحه ۲: مرکز اقدامات بعدی (سند بخش ۲)
// اولویت‌بندی براساس: ارزش اطلاعاتی، احتمال موفقیت، ترافیک، حساسیت، مجوز، هزینه، دخالت کاربر

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNetscopeData, postJson, emitRefresh, fa, ProgressBar } from "./shared";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Zap, Square, ShieldAlert, ChevronLeft, CheckCircle2, XCircle,
  Info, AlertTriangle, Lightbulb, Cog, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ENGINE_STEP_LABELS, type EngineStep } from "@/lib/netscope/types";

interface ActionRow {
  id: string; step: string; title: string; description: string; score: number;
  factors: Record<string, number>;
  requiresConfirmation: boolean; gatedBy?: string;
}
interface EngineApi {
  project: { name: string; scope: string[] };
  engine: {
    completedSteps: string[]; scopeApproved: boolean; approvedScopes: string[];
    emergencyStop: boolean; monitoringEnabled: boolean; autoMode: boolean;
    tickCount: number; discoveryConfirmed: boolean;
  };
  actions: ActionRow[];
}

const FACTOR_LABELS: Record<string, string> = {
  value: "ارزش اطلاعاتی",
  successProb: "احتمال موفقیت",
  traffic: "ترافیک ایجادشده",
  sensitivity: "حساسیت دستگاه",
  permission: "نیاز به مجوز",
  cost: "هزینه و زمان",
  userInvolvement: "دخالت کاربر",
};

export function ActionsView() {
  const { data, loading, refresh } = useNetscopeData<EngineApi>("/api/netscope");
  const [running, setRunning] = useState<string | null>(null);
  const [runLog, setRunLog] = useState<RunLogApi | null>(null);
  const [scopeDialog, setScopeDialog] = useState(false);
  const [confirmDiscovery, setConfirmDiscovery] = useState(false);
  const [scopeSel, setScopeSel] = useState<string[]>([]);
  const { toast } = useToast();

  const runStep = async (step: string) => {
    setRunning(step);
    try {
      const res = await postJson("/api/netscope/engine", { action: "run-step", step });
      setRunLog(res.report);
      toast({ title: "مرحله اجرا شد", description: res.report.stepTitle });
      emitRefresh(); refresh();
    } catch (e) {
      toast({ title: "خطا", description: (e as Error).message, variant: "destructive" });
    } finally { setRunning(null); }
  };

  const runAuto = async () => {
    setRunning("auto");
    try {
      const res = await postJson("/api/netscope/engine", { action: "run-auto" });
      const reports: RunLogApi[] = res.reports || [];
      setRunLog({
        stepTitle: `اجرای خودکار (${reports.length} مرحله)`,
        ok: true,
        blocked: undefined,
        lines: reports.flatMap((r) => [
          { kind: "info" as const, text: `── مرحله: ${r.stepTitle}${r.ok ? "" : " (متوقف شد)"}` },
          ...r.lines,
        ]),
        createdDevices: reports.reduce((a, r) => a + r.createdDevices, 0),
        createdLinks: reports.reduce((a, r) => a + r.createdLinks, 0),
        createdEvidence: reports.reduce((a, r) => a + r.createdEvidence, 0),
      });
      if (res.state && !res.state.scopeApproved) {
        toast({ title: "نیازمند تأیید شما", description: "محدوده بررسی پیشنهاد شد؛ در همین صفحه تأیید کنید." });
      } else {
        toast({ title: "اجرای خودکار کامل شد", description: `${reports.length} مرحله اجرا شد` });
      }
      emitRefresh(); refresh();
    } catch (e) {
      toast({ title: "خطا", description: (e as Error).message, variant: "destructive" });
    } finally { setRunning(null); }
  };

  const approveScope = async () => {
    try {
      await postJson("/api/netscope/engine", { action: "approve-scope", scopes: scopeSel });
      setScopeDialog(false);
      toast({ title: "محدوده تأیید شد", description: "الزام سند ۱۲: اسکن فقط در این محدوده انجام می‌شود" });
      emitRefresh(); refresh();
    } catch (e) {
      toast({ title: "خطا", description: (e as Error).message, variant: "destructive" });
    }
  };

  const confirmDiscoveryRun = async () => {
    setConfirmDiscovery(false);
    setRunning("active-discovery");
    try {
      const res = await postJson("/api/netscope/engine", { action: "confirm-discovery" });
      setRunLog(res.report);
      emitRefresh(); refresh();
    } catch (e) {
      toast({ title: "خطا", description: (e as Error).message, variant: "destructive" });
    } finally { setRunning(null); }
  };

  if (loading && !data) return <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>;
  if (!data) return <div className="p-6 text-center text-muted-foreground">خطا در دریافت وضعیت</div>;

  const steps: { key: string; label: string }[] = [
    "env-detect", "local-config", "scope-proposal", "existing-data", "active-discovery",
    "role-guess", "mgmt-info", "link-analysis", "missing-analysis", "map-report", "periodic-update",
  ].map((k) => ({ key: k, label: ENGINE_STEP_LABELS[k as EngineStep] }));

  const doneSet = new Set(data.engine.completedSteps);

  return (
    <div className="space-y-4">
      {/* نوار مراحل موتور (ترتیب سند ۲.۱) */}
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cog className="h-5 w-5 text-primary" /> موتور جمع‌آوری — ترتیب سند بخش ۲.۱
          </CardTitle>
          <CardDescription>
            هر مرحله تا گیت بعدی (تأیید کاربر یا توقف اضطراری) اجرا می‌شود. هیچ تنظیمی بدون مجوز تغییر نمی‌کند.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <div className="flex gap-1.5 pb-2 min-w-max">
              {steps.map((s, i) => {
                const done = doneSet.has(s.key);
                const isNext = data.actions[0]?.step === s.key;
                return (
                  <div key={s.key} className="flex items-center">
                    <div className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight max-w-36 text-center",
                      done ? "bg-emerald-50 border-emerald-300 text-emerald-700" : isNext ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-muted/50 text-muted-foreground"
                    )}>
                      <div className="font-bold">{fa(i + 1)}</div>
                      {s.label}
                    </div>
                    {i < steps.length - 1 && <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={runAuto} disabled={running !== null || data.engine.emergencyStop} className="gap-1.5">
              {running === "auto" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              اجرای خودکار تا گیت بعدی
            </Button>
            {data.engine.emergencyStop ? (
              <Button variant="outline" onClick={async () => { await postJson("/api/netscope/engine", { action: "resume" }); emitRefresh(); refresh(); }} className="gap-1.5">
                <Play className="h-4 w-4" /> رفع توقف اضطراری
              </Button>
            ) : (
              <Button variant="destructive" onClick={async () => { await postJson("/api/netscope/engine", { action: "stop" }); emitRefresh(); refresh(); }} className="gap-1.5">
                <Square className="h-4 w-4" /> توقف اضطراری
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* اقدام‌های پیشنهادی مرتب‌شده */}
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-primary" /> اقدام‌های پیشنهادی (اولویت‌بندی سند ۲.۲)
          </CardTitle>
          <CardDescription>
            امتیاز هر اقدام از ترکیب ارزش اطلاعاتی، احتمال موفقیت، ترافیک، حساسیت، مجوز، هزینه و دخالت کاربر محاسبه می‌شود.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.actions.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              همه مراحل غیرانسدادی اجرا شده‌اند. برای ادامه، موارد نیازمند دسترسی یا اقدام کاربر را پیگیری کنید.
            </div>
          )}
          {data.actions.map((a, i) => (
            <div key={a.id} className="rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-accent/30 transition-colors">
              <div className="text-center shrink-0">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold", i === 0 ? "bg-amber-100 text-amber-700 border border-amber-300" : "bg-muted text-muted-foreground")}>
                  {fa(i + 1)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">امتیاز {fa(a.score)}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{a.title}</span>
                  {a.gatedBy && <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-300">{a.gatedBy}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{a.description}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {Object.entries(a.factors).map(([k, v]) => (
                    <span key={k} className="text-[10px] rounded bg-muted px-1.5 py-0.5" title={`${FACTOR_LABELS[k]}: ${v}`}>
                      {FACTOR_LABELS[k]}: {k === "successProb" ? fa(v * 100) + "٪" : fa(v)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="shrink-0">
                {a.step === "scope-proposal" && !data.engine.scopeApproved ? (
                  <Button size="sm" onClick={() => { setScopeSel(SCOPES.map((s) => s.cidr)); setScopeDialog(true); }} className="gap-1">
                    <ShieldAlert className="h-4 w-4" /> بازبینی و تأیید
                  </Button>
                ) : a.id === "run-active-discovery" ? (
                  <Button size="sm" variant="outline" onClick={() => setConfirmDiscovery(true)} className="gap-1">
                    <ShieldAlert className="h-4 w-4" /> تأیید و اجرا
                  </Button>
                ) : a.id.startsWith("user-") || a.id.startsWith("access-") ? (
                  <Badge variant="secondary" className="text-[10px]">در صفحه راهنماها دنبال کنید</Badge>
                ) : a.id === "run-periodic-tick" || a.id === "enable-monitoring" ? (
                  <Button size="sm" variant={a.id === "enable-monitoring" ? "default" : "outline"} disabled={running !== null}
                    onClick={async () => {
                      setRunning(a.id);
                      try {
                        const res = await postJson("/api/netscope/engine", { action: a.id === "enable-monitoring" ? "enable-monitoring" : "run-step", step: "periodic-update" });
                        setRunLog(res.report);
                        emitRefresh(); refresh();
                      } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); } finally { setRunning(null); }
                    }}>
                    {a.id === "enable-monitoring" ? "فعال‌سازی پایش" : "اجرای تیک"}
                  </Button>
                ) : (
                  <Button size="sm" disabled={running !== null || doneSet.has(a.step)} onClick={() => runStep(a.step)} className="gap-1">
                    <Play className="h-3.5 w-3.5" /> {doneSet.has(a.step) ? "انجام شد" : "اجرا"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* دیالوگ تأیید محدوده (الزام سند ۱۲) */}
      <Dialog open={scopeDialog} onOpenChange={setScopeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-500" /> تأیید محدوده بررسی</DialogTitle>
            <DialogDescription>
              بررسی فقط در محدوده تأییدشده انجام می‌شود. کشف یک شبکه جدید، مجوز خودکار برای اسکن آن ایجاد نمی‌کند. (الزام سند بخش ۱۲)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {SCOPES.map((s) => (
              <Label key={s.cidr} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/40">
                <Checkbox
                  checked={scopeSel.includes(s.cidr)}
                  onCheckedChange={(c) => setScopeSel((prev) => c ? [...prev, s.cidr] : prev.filter((x) => x !== s.cidr))}
                  className="mt-1"
                />
                <div>
                  <div className="ltr font-mono text-sm font-bold">{s.cidr}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.name} — VLAN {s.vlan}</div>
                </div>
              </Label>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setScopeDialog(false)}>انصراف</Button>
              <Button onClick={approveScope} disabled={scopeSel.length === 0}>تأیید محدوده‌های انتخاب‌شده</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* دیالوگ تأیید کشف فعال */}
      <Dialog open={confirmDiscovery} onOpenChange={setConfirmDiscovery}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تأیید اجرای کشف فعال</DialogTitle>
            <DialogDescription>
              کشف فعال کم‌فشار فقط شامل ICMP محدود (۴ بسته به هر مقصد) و WS-Discovery است و با محدودیت نرخ اجرا می‌شود.
              دستگاه‌های حساس با نرخ کمتر بررسی می‌شوند. امکان توقف اضطراری در هر لحظه وجود دارد.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDiscovery(false)}>انصراف</Button>
            <Button onClick={confirmDiscoveryRun}>تأیید و اجرا</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* گزارش اجرا */}
      <Dialog open={!!runLog} onOpenChange={(o) => !o && setRunLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {runLog?.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-rose-600" />}
              گزارش اجرا: {runLog?.stepTitle}
            </DialogTitle>
            {runLog?.blocked && <DialogDescription className="text-rose-600">{runLog.blocked}</DialogDescription>}
          </DialogHeader>
          <div className="space-y-1.5 mt-2">
            {runLog?.lines.map((l, i) => (
              <div key={i} className={cn("flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs", lineStyle(l.kind))}>
                {l.kind === "success" ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> :
                 l.kind === "warn" ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> :
                 l.kind === "error" ? <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> :
                 l.kind === "evidence" ? <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" /> :
                 <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                <span className="leading-relaxed whitespace-pre-wrap">{l.text}</span>
              </div>
            ))}
          </div>
          {runLog && (runLog.createdDevices || runLog.createdLinks || runLog.createdEvidence) ? (
            <div className="flex gap-2 text-xs">
              {runLog.createdDevices > 0 && <Badge variant="secondary">{fa(runLog.createdDevices)} دستگاه جدید</Badge>}
              {runLog.createdLinks > 0 && <Badge variant="secondary">{fa(runLog.createdLinks)} اتصال جدید</Badge>}
              {runLog.createdEvidence > 0 && <Badge variant="secondary">{fa(runLog.createdEvidence)} شاهد جدید</Badge>}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SCOPES = [
  { cidr: "10.10.0.0/24", name: "مدیریت و تجهیزات زیرساخت", vlan: 1 },
  { cidr: "10.10.10.0/24", name: "کاربران و سرورها", vlan: 10 },
  { cidr: "10.30.0.0/24", name: "دوربین‌ها", vlan: 30 },
];

function lineStyle(kind: string): string {
  switch (kind) {
    case "success": return "bg-emerald-50 text-emerald-800";
    case "warn": return "bg-amber-50 text-amber-800";
    case "error": return "bg-rose-50 text-rose-700";
    case "evidence": return "bg-teal-50 text-teal-800";
    default: return "bg-muted text-foreground";
  }
}

interface RunLogApi {
  stepTitle: string; ok: boolean; blocked?: string;
  lines: { kind: string; text: string }[];
  createdDevices: number; createdLinks: number; createdEvidence: number;
}
