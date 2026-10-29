"use client";

// NetScope — صفحه ۱۰: عامل‌ها، دسترسی‌ها و تنظیمات (سند بخش ۹ و ۱۲)

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useNetscopeData, postJson, emitRefresh, fa, faDate, SimBadge } from "./shared";
import { useToast } from "@/hooks/use-toast";
import { Bot, KeyRound, ShieldCheck, Trash2, RotateCcw, Lock, Cpu, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsApi {
  agents: { id: string; name: string; platform: string; hostname: string; status: string; isSimulated: boolean; isNative: boolean; lastSeen: string | null; version: string }[];
  credentials: { id: string; label: string; kind: string; target: string; username: string | null; readOnly: boolean; hasSecret: boolean; note: string }[];
  engine: { scopeApproved: boolean; approvedScopes: string[]; monitoringEnabled: boolean; autoMode: boolean; emergencyStop: boolean; aiConsent: boolean; tickCount: number };
  project: { name: string; scope: string[] };
}

const AGENT_STATUS: Record<string, { label: string; cls: string }> = {
  online: { label: "آنلاین", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  offline: { label: "آفلاین", cls: "bg-stone-100 text-stone-500 border-stone-300" },
  degraded: { label: "محدود", cls: "bg-amber-50 text-amber-700 border-amber-300" },
};

const CRED_KINDS: Record<string, string> = {
  snmpv3: "SNMPv3 (فقط‌خواندنی)", api: "API رسمی سازنده", onvif: "ONVIF",
  "ssh-ro": "SSH فقط‌خواندنی", panel: "حساب پنل مدیریت",
};

export function SettingsView() {
  const { data, loading, refresh } = useNetscopeData<SettingsApi>("/api/netscope/settings");
  const [credForm, setCredForm] = useState({ label: "", kind: "snmpv3", target: "", username: "", secret: "", readOnly: true });
  const { toast } = useToast();

  const addCredential = async () => {
    if (!credForm.label) { toast({ title: "برچسب لازم است", variant: "destructive" }); return; }
    try {
      await postJson("/api/netscope/settings", { action: "add-credential", ...credForm, hasSecret: !!credForm.secret });
      toast({
        title: "مرجع دسترسی ثبت شد",
        description: "الزام سند ۱۲: مقدار رمز هرگز ذخیره نمی‌شود — فقط نشانگر وجود آن ثبت شد",
      });
      setCredForm({ label: "", kind: "snmpv3", target: "", username: "", secret: "", readOnly: true });
      emitRefresh(); refresh();
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
  };

  const delCredential = async (id: string) => {
    await postJson("/api/netscope/settings", { action: "delete-credential", id });
    emitRefresh(); refresh();
  };

  const resetProject = async () => {
    await postJson("/api/netscope/engine", { action: "reset" });
    toast({ title: "پروژه بازنشانی شد", description: "همه داده‌های جمع‌آوری پاک شد" });
    emitRefresh(); refresh();
  };

  if (loading && !data) return <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>;

  return (
    <div className="space-y-4">
      {/* عامل‌ها */}
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="h-5 w-5 text-primary" /> عامل‌ها
          </CardTitle>
          <CardDescription className="mt-1">
            عامل باید دسترسی واقعی به شبکه هدف داشته باشد؛ اجرای داخل WSL/کانتینر/VM بدون آزمون، معادل مشاهده شبکه فیزیکی تلقی نمی‌شود. (سند بخش ۹)
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {(data?.agents || []).map((a) => {
            const st = AGENT_STATUS[a.status] || AGENT_STATUS.offline;
            return (
              <div key={a.id} className="rounded-xl border p-3 flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-muted-foreground" /> {a.name}
                    <SimBadge isSimulated={a.isSimulated} />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {a.hostname} • <span className="ltr-inline font-mono">{a.platform}</span> • نسخه {a.version}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {a.isNative ? "اجرای بومی — دسترسی مستقیم به شبکه فیزیکی" : "محیط غیربومی — نیازمند آزمون دسترسی واقعی"}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <Badge variant="outline" className={cn("text-[10px]", st.cls)}>{st.label}</Badge>
                  <div className="text-[10px] text-muted-foreground mt-1">{faDate(a.lastSeen)}</div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* دسترسی‌ها — بدون ذخیره رمز */}
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5 text-primary" /> دسترسی‌ها (مرجع فقط‌خواندنی)
          </CardTitle>
          <CardDescription className="mt-1">
            اطلاعات ورود فقط از فرم امن دریافت و مقدار آن‌ها هرگز ذخیره نمی‌شود؛ حدس زدن رمز یا استفاده از رمزهای پیش‌فرض انجام نمی‌شود. SNMPv3 و ارتباط رمزگذاری‌شده اولویت دارند. (سند ۱۲)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.credentials || []).map((c) => (
              <div key={c.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-sm">{c.label}</div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-500" onClick={() => delCredential(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{CRED_KINDS[c.kind] || c.kind}</div>
                {c.target && <div className="font-mono ltr text-[11px] text-muted-foreground">{c.target}</div>}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.readOnly && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">فقط‌خواندنی</Badge>}
                  {c.hasSecret && (
                    <Badge variant="outline" className="text-[10px] gap-0.5">
                      <Lock className="h-3 w-3" /> رمز وارد شده (ذخیره نشده)
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-dashed p-3 space-y-2">
            <div className="text-xs font-bold">ثبت مرجع دسترسی جدید</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-xs">برچسب</Label>
                <Input className="h-8" value={credForm.label} onChange={(e) => setCredForm({ ...credForm, label: e.target.value })} placeholder="مثلاً سوئیچ هسته" />
              </div>
              <div>
                <Label className="text-xs">نوع</Label>
                <Select value={credForm.kind} onValueChange={(v) => setCredForm({ ...credForm, kind: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CRED_KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">مقصد</Label>
                <Input className="h-8" dir="ltr" value={credForm.target} onChange={(e) => setCredForm({ ...credForm, target: e.target.value })} placeholder="10.10.0.2" />
              </div>
              <div>
                <Label className="text-xs">نام کاربری (اختیاری)</Label>
                <Input className="h-8" dir="ltr" value={credForm.username} onChange={(e) => setCredForm({ ...credForm, username: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">رمز — ذخیره نمی‌شود</Label>
                <Input className="h-8" type="password" dir="ltr" value={credForm.secret} onChange={(e) => setCredForm({ ...credForm, secret: e.target.value })} placeholder="••••••••" />
              </div>
              <div className="flex items-end">
                <Button size="sm" onClick={addCredential} className="gap-1"><KeyRound className="h-3.5 w-3.5" /> ثبت مرجع</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* سیاست‌های ایمنی */}
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" /> سیاست‌های ایمنی و حدود عملیات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {[
            { on: data?.engine.scopeApproved, text: `محدوده بررسی: ${data?.engine.scopeApproved ? data.engine.approvedScopes.join("، ") : "هنوز تأیید نشده — اسکن فعال مسدود است"}` },
            { on: true, text: "بررسی فقط در محدوده تأییدشده انجام می‌شود؛ کشف شبکه جدید مجوز خودکار اسکن نمی‌دهد" },
            { on: true, text: "دسترسی فقط‌خواندنی اولویت دارد؛ تغییر DHCP، Route، VLAN، Firmware یا تنظیمات دوربین جزو جمع‌آوری نیست" },
            { on: true, text: "تمام عملیات حساس در رکورد ممیزی ثبت می‌شوند" },
            { on: true, text: "روش‌های جمع‌آوری دارای محدودیت نرخ، Timeout و توقف اضطراری هستند" },
            { on: true, text: "خروجی‌ها امکان حذف یا ناشناس‌سازی IP، MAC و سریال دارند" },
            { on: data?.engine.monitoringEnabled, text: `پایش دوره‌ای: ${data?.engine.monitoringEnabled ? `فعال (تیک ${data.engine.tickCount} اجرا شده)` : "غیرفعال"}` },
          ].map((r, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
              {r.on ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> : <ShieldCheck className="h-3.5 w-3.5 text-stone-300 shrink-0" />}
              <span className={r.on ? "" : "text-muted-foreground"}>{r.text}</span>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <a href="/api/netscope/export?format=json" className="inline-flex">
              <Button size="sm" variant="outline" className="gap-1"><Download className="h-3.5 w-3.5" /> خروجی JSON کامل</Button>
            </a>
            <a href="/api/netscope/export?format=csv" className="inline-flex">
              <Button size="sm" variant="outline" className="gap-1"><Download className="h-3.5 w-3.5" /> خروجی CSV دستگاه‌ها</Button>
            </a>
            <a href="/api/netscope/export?format=json&anon=1" className="inline-flex">
              <Button size="sm" variant="outline" className="gap-1"><Download className="h-3.5 w-3.5" /> خروجی ناشناس‌سازی‌شده</Button>
            </a>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="gap-1"><RotateCcw className="h-3.5 w-3.5" /> بازنشانی پروژه</Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl" className="max-w-md">
                <AlertDialogHeader className="text-right">
                  <AlertDialogTitle>بازنشانی کامل پروژه؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    همه دستگاه‌ها، شواهد، اتصال‌ها، متریک‌ها و وضعیت موتور پاک می‌شود و چک‌لیست از صفر شروع می‌کند. این عمل قابل برگشت نیست.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row justify-start gap-2">
                  <AlertDialogCancel>انصراف</AlertDialogCancel>
                  <AlertDialogAction onClick={resetProject} className="bg-destructive text-white hover:bg-destructive/90">بازنشانی</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
