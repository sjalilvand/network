"use client";

// NetScope — کامپوننت‌ها و هوک‌های مشترک

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CHECKLIST_STATUS_LABELS, CONFIDENCE_LABELS, type ChecklistStatus } from "@/lib/netscope/types";

// ─── هوک دریافت داده ───────────────────────────────────────────────
export function useNetscopeData<T>(url: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`خطای ${r.status}`);
        const d = (await r.json()) as T;
        if (!alive) return;
        setData(d);
        setError(null);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; };

  }, [url, tick, ...deps]);

  // گوش دادن به رویداد تازه‌سازی سراسری
  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener("netscope-refresh", handler);
    return () => window.removeEventListener("netscope-refresh", handler);
  }, []);

  return { data, loading, error, refresh };
}

export function emitRefresh() {
  window.dispatchEvent(new Event("netscope-refresh"));
}

export async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطای ${res.status}`);
  return data;
}

export async function patchJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطای ${res.status}`);
  return data;
}

// ─── قالب‌بندی ─────────────────────────────────────────────────────
export function fa(n: number | string): string {
  return Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
}

export function faDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fa-IR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ─── بج وضعیت چک‌لیست (۱۰ وضعیت سند ۱.۲) ──────────────────────────
const STATUS_STYLES: Record<string, string> = {
  "not-collected": "bg-stone-100 text-stone-600 border-stone-300",
  "collecting": "bg-sky-50 text-sky-700 border-sky-300",
  "collected": "bg-emerald-50 text-emerald-700 border-emerald-300",
  "limited": "bg-teal-50 text-teal-700 border-teal-300",
  "needs-access": "bg-amber-50 text-amber-700 border-amber-300",
  "needs-user-action": "bg-orange-50 text-orange-700 border-orange-300",
  "conflicting": "bg-rose-50 text-rose-700 border-rose-300",
  "stale": "bg-yellow-50 text-yellow-700 border-yellow-400",
  "out-of-scope": "bg-slate-100 text-slate-500 border-slate-300",
  "unavailable": "bg-zinc-100 text-zinc-500 border-zinc-300",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium", STATUS_STYLES[status] || "bg-muted", className)}>
      {CHECKLIST_STATUS_LABELS[status as ChecklistStatus] || status}
    </Badge>
  );
}

// ─── بج سطح اطمینان ────────────────────────────────────────────────
export function ConfidenceBadge({ confidence }: { confidence: string }) {
  if (!confidence) return <span className="text-xs text-muted-foreground">—</span>;
  const style =
    confidence === "verified" ? "bg-emerald-600/10 text-emerald-700 border-emerald-600/30"
    : confidence === "inferred" ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
    : confidence === "limited" ? "bg-teal-600/10 text-teal-700 border-teal-600/30"
    : "bg-stone-500/10 text-stone-600 border-stone-400/30";
  return (
    <Badge variant="outline" className={cn("text-[11px]", style)}>
      {CONFIDENCE_LABELS[confidence as keyof typeof CONFIDENCE_LABELS] || confidence}
    </Badge>
  );
}

// ─── بج شبیه‌سازی/واقعی — شفافیت داده (اصل محوری سند) ─────────────
export function SimBadge({ isSimulated }: { isSimulated?: boolean }) {
  if (isSimulated) {
    return <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-300">شبیه‌سازی</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">واقعی</Badge>;
}

// ─── بج نوع دستگاه ─────────────────────────────────────────────────
import { DEVICE_TYPE_LABELS } from "@/lib/netscope/types";
import { Camera, Router, Server, MonitorSmartphone, Printer, Network, Wifi, Video, HelpCircle } from "lucide-react";

export function deviceTypeIcon(type: string, className = "h-4 w-4") {
  switch (type) {
    case "router": return <Router className={className} />;
    case "switch": return <Network className={className} />;
    case "radio": return <Wifi className={className} />;
    case "ap": return <Wifi className={className} />;
    case "camera": return <Camera className={className} />;
    case "nvr": return <Video className={className} />;
    case "server": return <Server className={className} />;
    case "pc": return <MonitorSmartphone className={className} />;
    case "printer": return <Printer className={className} />;
    default: return <HelpCircle className={className} />;
  }
}

export function deviceTypeLabel(type: string): string {
  return DEVICE_TYPE_LABELS[type] || type || "نامشخص";
}

// ─── بج اتصال (خط پیوسته/خط‌چین/نامشخص — سند ۵.۴) ─────────────────
export function LinkConfidenceBadge({ confidence }: { confidence: string }) {
  if (confidence === "verified") {
    return <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">── تأییدشده</Badge>;
  }
  if (confidence === "inferred") {
    return <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300">┄ استنباطی</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] bg-stone-100 text-stone-500 border-stone-300">؟ نامشخص</Badge>;
}

// ─── کارت آماری ────────────────────────────────────────────────────
export function StatCard({ title, value, sub, icon, tone = "default" }: {
  title: string; value: string | number; sub?: string; icon?: React.ReactNode; tone?: "default" | "warn" | "ok" | "bad";
}) {
  const toneCls =
    tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm fade-up">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{title}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className={cn("mt-1 text-2xl font-bold", toneCls)}>{typeof value === "number" ? fa(value) : value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── نوار پیشرفت ───────────────────────────────────────────────────
export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full rounded-full bg-muted overflow-hidden", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-600 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}
