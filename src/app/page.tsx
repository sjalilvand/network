"use client";

// NetScope — پوسته اصلی: رابط فارسی راست‌به‌چپ (سند بخش ۱۱)
// IP، MAC و فرمان‌ها چپ‌به‌راست نمایش داده می‌شوند (.ltr / .ltr-inline)

import { useEffect, useState } from "react";
import { useNetscopeData, fa, emitRefresh, ProgressBar } from "@/components/netscope/shared";
import { ChecklistView } from "@/components/netscope/ChecklistView";
import { ActionsView } from "@/components/netscope/ActionsView";
import { DevicesView } from "@/components/netscope/DevicesView";
import { MapView } from "@/components/netscope/MapView";
import { CctvView } from "@/components/netscope/CctvView";
import { MonitorView } from "@/components/netscope/MonitorView";
import { AnalysisView } from "@/components/netscope/AnalysisView";
import { GuidesView } from "@/components/netscope/GuidesView";
import { AlertsView } from "@/components/netscope/AlertsView";
import { SettingsView } from "@/components/netscope/SettingsView";
import { Phase2View } from "@/components/netscope/Phase2View";
import { Phase3View } from "@/components/netscope/Phase3View";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  Radar, ClipboardList, Lightbulb, MonitorSmartphone, Network, Cctv,
  Activity, Microscope, BookOpen, ScrollText, Settings2, Menu,
  OctagonX, RefreshCw, Radio, CircleAlert, Database, Waypoints, FileWarning, Workflow, ScanSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { postJson } from "@/components/netscope/shared";

const NAV = [
  { id: "checklist", label: "پرونده شناخت شبکه", icon: ClipboardList, desc: "چک‌لیست خودتکمیل‌شونده" },
  { id: "actions", label: "مرکز اقدامات بعدی", icon: Lightbulb, desc: "موتور تصمیم‌گیری" },
  { id: "devices", label: "دستگاه‌ها و رابط‌ها", icon: MonitorSmartphone, desc: "موجودی و هویت" },
  { id: "map", label: "نقشه شبکه", icon: Network, desc: "فیزیکی، منطقی، کاربردی" },
  { id: "cctv", label: "دوربین‌ها و ضبط‌کننده‌ها", icon: Cctv, desc: "نظارت تصویری" },
  { id: "monitor", label: "داشبورد مانیتورینگ", icon: Activity, desc: "پایش تطبیقی" },
  { id: "analysis", label: "تحلیل و تشریح شبکه", icon: Microscope, desc: "یافته‌های شواهد‌محور" },
  { id: "guides", label: "راهنماها و ورود خروجی", icon: BookOpen, desc: "استخراج اطلاعات" },
  { id: "phase2", label: "جمع‌آوری پیشرفته (فاز ۲)", icon: Workflow, desc: "SNMP، LLDP/FDB، سنجه‌ها" },
  { id: "phase3", label: "دوربین‌ها و NVR (فاز ۳)", icon: ScanSearch, desc: "ONVIF، پلاگین ضبط‌کننده، PoE" },
  { id: "alerts", label: "هشدارها و تاریخچه", icon: ScrollText, desc: "تغییرات و ممیزی" },
  { id: "settings", label: "عامل‌ها و تنظیمات", icon: Settings2, desc: "دسترسی‌ها و سیاست‌ها" },
];

interface BootstrapApi {
  project: { name: string; description: string; scope: string[] };
  engine: { completedSteps: string[]; scopeApproved: boolean; emergencyStop: boolean; monitoringEnabled: boolean; tickCount: number };
  checklist: { overall: number };
  stats: { devices: number; online: number; offline: number; networks: number; links: number; evidence: number; alerts: number; agents: number; findings: number };
}

export default function Home() {
  const [view, setView] = useState("checklist");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data, loading } = useNetscopeData<BootstrapApi>("/api/netscope");
  const { toast } = useToast();

  // در اولین بارگذاری، اگر موتور شروع نشده، پیام راهنما
  useEffect(() => {
    const t = setTimeout(() => {
      if (data && data.engine.completedSteps.length === 0) {
        toast({
          title: "به NetScope خوش آمدید",
          description: "برای شروع، به «مرکز اقدامات بعدی» بروید یا دکمه اجرای خودکار را بزنید.",
          duration: 6000,
        });
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [data?.engine.completedSteps.length]);

  const emergencyStop = async () => {
    try {
      await postJson("/api/netscope/engine", { action: "stop" });
      toast({ title: "توقف اضطراری فعال شد", description: "تمام عملیات جمع‌آوری متوقف شد", variant: "destructive" });
      emitRefresh();
    } catch { /* */ }
  };

  const resume = async () => {
    try {
      await postJson("/api/netscope/engine", { action: "resume" });
      toast({ title: "توقف اضطراری رفع شد" });
      emitRefresh();
    } catch { /* */ }
  };

  const current = NAV.find((n) => n.id === view);

  const navList = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((n) => {
        const Icon = n.icon;
        const active = view === n.id;
        return (
          <button
            key={n.id}
            onClick={() => { setView(n.id); setMobileOpen(false); }}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-right transition-colors",
              active ? "bg-sidebar-primary/15 text-sidebar-primary-foreground font-bold" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className={cn("h-4.5 w-4.5 shrink-0", active && "text-sidebar-primary")} />
            <span className="flex-1">
              <span className="block text-[13px] leading-tight">{n.label}</span>
              <span className={cn("block text-[10px] leading-tight mt-0.5", active ? "opacity-80" : "opacity-50")}>{n.desc}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      {/* هدر */}
      <header className="sticky top-0 z-40 border-b bg-sidebar text-sidebar-foreground shadow-sm">
        <div className="flex items-center gap-3 px-3 sm:px-4 h-14">
          {/* موبایل: منو */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden text-sidebar-foreground">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-sidebar text-sidebar-foreground p-0 w-72">
              <SheetTitle className="sr-only">ناوبری NetScope</SheetTitle>
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <Radar className="h-6 w-6 text-sidebar-primary" />
                <span className="font-bold">NetScope</span>
              </div>
              {navList}
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <Radar className="h-6 w-6 text-sidebar-primary shrink-0" />
            <div className="leading-tight">
              <div className="font-bold text-sm sm:text-base">NetScope</div>
              <div className="hidden sm:block text-[10px] opacity-60">سامانه هوشمند کشف، تحلیل و مانیتورینگ شبکه</div>
            </div>
          </div>

          <div className="flex-1" />

          {/* وضعیت فشرده */}
          <div className="hidden lg:flex items-center gap-2 text-[11px]">
            <Badge variant="outline" className="bg-white/5 border-white/20 text-sidebar-foreground/80">
              <Database className="h-3 w-3 ml-1" /> {fa(data?.stats.devices || 0)} دستگاه
            </Badge>
            <Badge variant="outline" className="bg-white/5 border-white/20 text-sidebar-foreground/80">
              <Waypoints className="h-3 w-3 ml-1" /> {fa(data?.stats.links || 0)} اتصال
            </Badge>
            <Badge variant="outline" className="bg-white/5 border-white/20 text-sidebar-foreground/80">
              <FileWarning className="h-3 w-3 ml-1" /> {fa(data?.stats.alerts || 0)} هشدار فعال
            </Badge>
          </div>

          {/* درصد تکمیل */}
          <div className="hidden sm:flex flex-col items-end min-w-24">
            <span className="text-[10px] opacity-70">تکمیل پرونده</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-sidebar-primary">{fa(data?.checklist.overall || 0)}٪</span>
              <div className="w-16"><ProgressBar percent={data?.checklist.overall || 0} className="bg-white/10" /></div>
            </div>
          </div>

          {/* توقف اضطراری */}
          {data?.engine.emergencyStop ? (
            <Button size="sm" variant="outline" onClick={resume} className="gap-1 border-emerald-400/50 text-emerald-300 hover:bg-emerald-400/10">
              <RefreshCw className="h-4 w-4" /> رفع توقف
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={emergencyStop} className="gap-1">
              <OctagonX className="h-4 w-4" /> <span className="hidden sm:inline">توقف اضطراری</span>
            </Button>
          )}
        </div>
        {data?.engine.emergencyStop && (
          <div className="bg-rose-600 text-white text-[11px] text-center py-1 flex items-center justify-center gap-1.5">
            <CircleAlert className="h-3.5 w-3.5" /> توقف اضطراری فعال است — تمام عملیات جمع‌آوری متوقف شده (الزام سند ۱۲)
          </div>
        )}
      </header>

      <div className="flex flex-1">
        {/* سایدبار دسکتاپ */}
        <aside className="hidden md:flex flex-col w-60 shrink-0 border-l bg-sidebar text-sidebar-foreground sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto custom-scrollbar">
          {navList}
          <div className="mt-auto p-3 text-[10px] opacity-50 leading-relaxed border-t border-sidebar-border">
            NetScope نسخه ۲.۰ — پیاده‌سازی سند نیازمندی‌ها
            <br />داده محیط اجرا: واقعی | شبکه آزمایشی: شبیه‌سازی‌شده
          </div>
        </aside>

        {/* محتوا */}
        <main className="flex-1 min-w-0 p-3 sm:p-5 pb-10 flex flex-col">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-bold flex items-center gap-2">
              {current && <current.icon className="h-5 w-5 text-primary" />}
              {current?.label}
            </h1>
            <div className="flex items-center gap-2">
              {!data?.engine.scopeApproved && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px]">
                  <Radio className="h-3 w-3 ml-1" /> محدوده اسکن تأیید نشده
                </Badge>
              )}
              {data?.engine.monitoringEnabled && (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">
                  <Activity className="h-3 w-3 ml-1" /> پایش فعال — تیک {fa(data.engine.tickCount)}
                </Badge>
              )}
            </div>
          </div>

          {loading && !data ? (
            <div className="grid place-items-center py-24">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Radar className="h-10 w-10 animate-pulse text-primary" />
                <span className="text-sm">در حال بارگذاری پروژه...</span>
              </div>
            </div>
          ) : (
            <div key={view} className="fade-up">
              {view === "checklist" && <ChecklistView onGoActions={() => setView("actions")} />}
              {view === "actions" && <ActionsView />}
              {view === "devices" && <DevicesView />}
              {view === "map" && <MapView />}
              {view === "cctv" && <CctvView />}
              {view === "monitor" && <MonitorView />}
              {view === "analysis" && <AnalysisView />}
              {view === "guides" && <GuidesView />}
              {view === "phase2" && <Phase2View />}
              {view === "phase3" && <Phase3View />}
              {view === "alerts" && <AlertsView />}
              {view === "settings" && <SettingsView />}
            </div>
          )}

          {/* پاورقی چسبیده */}
          <footer className="mt-auto pt-4 border-t text-center text-[11px] text-muted-foreground">
            NetScope — پرونده زنده و مستند شبکه | اصل محوری: بیشترین اطلاعات معتبر با کمترین دخالت کاربر؛ هرجا شواهد کافی نیست، ابهام نمایش داده می‌شود و مسیر رفع آن ارائه می‌گردد.
          </footer>
        </main>
      </div>
    </div>
  );
}
