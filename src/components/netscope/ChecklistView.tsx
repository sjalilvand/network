"use client";

// NetScope — صفحه ۱: پرونده شناخت شبکه و چک‌لیست خودتکمیل‌شونده (سند بخش ۱)

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  StatusBadge, ConfidenceBadge, ProgressBar, useNetscopeData, fa,
  deviceTypeIcon,
} from "./shared";
import {
  ClipboardList, ShieldCheck, Clock, MapPin, KeyRound, Wrench, Eye,
  CircleDot, Database, Radio, Cctv, Activity, Boxes, Route, Globe, MonitorSmartphone,
  AlertTriangle, ChevronLeft, FileQuestion,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistApi {
  items: ChecklistItemRow[];
  groups: GroupStat[];
  overall: number;
}
interface ChecklistItemRow {
  id: string; groupKey: string; groupTitle: string; itemKey: string; title: string;
  status: string; applicable: boolean; value: string; method: string;
  collectedAt: string | null; confidence: string; validity: string; accessReq: string;
  guideKey: string | null; error: string; nextAction: string;
  primaryPath?: string; alternatePath?: string; conditional?: string;
}
interface GroupStat {
  groupKey: string; title: string; total: number; applicable: number;
  completed: number; percent: number; conditional: boolean; conditionMet: boolean;
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  env: <MonitorSmartphone className="h-4 w-4" />,
  ifaces: <CircleDot className="h-4 w-4" />,
  routing: <Route className="h-4 w-4" />,
  networks: <Globe className="h-4 w-4" />,
  dns: <FileQuestion className="h-4 w-4" />,
  dhcp: <KeyRound className="h-4 w-4" />,
  devices: <Boxes className="h-4 w-4" />,
  mgmt: <Wrench className="h-4 w-4" />,
  conn: <Database className="h-4 w-4" />,
  radio: <Radio className="h-4 w-4" />,
  cameras: <Cctv className="h-4 w-4" />,
  nvr: <Cctv className="h-4 w-4" />,
  monitor: <Activity className="h-4 w-4" />,
  location: <MapPin className="h-4 w-4" />,
};

// آیکن‌های شواهد
const KIND_LABELS: Record<string, string> = {
  observation: "مشاهده",
  "command-output": "خروجی فرمان",
  "agent-report": "گزارش عامل",
  "user-entry": "ورود کاربر",
  "panel-image": "تصویر پنل",
  "api-response": "پاسخ API",
};

export function ChecklistView({ onGoActions }: { onGoActions?: () => void }) {
  const { data, loading } = useNetscopeData<ChecklistApi>("/api/netscope/checklist-full");
  const [detail, setDetail] = useState<ChecklistItemRow | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [evLoading, setEvLoading] = useState(false);

  const openDetail = async (item: ChecklistItemRow) => {
    setDetail(item);
    setEvLoading(true);
    try {
      const res = await fetch(`/api/netscope/checklist-full?evidence=${item.itemKey}`);
      const d = await res.json();
      setEvidence(d.evidence || []);
    } catch { setEvidence([]); } finally { setEvLoading(false); }
  };

  if (loading && !data) {
    return <div className="grid gap-3 p-4">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>;
  }
  if (!data) return <div className="p-6 text-center text-muted-foreground">خطا در دریافت چک‌لیست</div>;

  const pending = data.items.filter((i) => i.applicable && !["collected", "limited", "out-of-scope", "unavailable"].includes(i.status));

  return (
    <div className="space-y-4">
      {/* خلاصه پرونده */}
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="h-5 w-5 text-primary" />
                پرونده شناخت شبکه
              </CardTitle>
              <CardDescription className="mt-1">
                پیش از رسم نقشه یا تحلیل، این پرونده مشخص می‌کند چه اطلاعاتی نیاز است، چه چیزی خودکار دریافت شده،
                چه چیزی ناقص است و برای هر مورد چه اقدامی لازم است. (سند بخش ۱)
              </CardDescription>
            </div>
            <div className="text-center min-w-36">
              <div className="text-3xl font-bold text-primary">{fa(data.overall)}٪</div>
              <div className="text-[11px] text-muted-foreground">تکمیل موارد مرتبط</div>
            </div>
          </div>
          <ProgressBar percent={data.overall} className="mt-3" />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{fa(data.groups.reduce((a, g) => a + g.applicable, 0))} مورد مرتبط</Badge>
            {pending.length > 0 && (
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                {fa(pending.length)} مورد نیازمند تکمیل
              </Badge>
            )}
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              درصد تکمیل فقط براساس موارد مرتبط با همین شبکه محاسبه می‌شود؛ نبود رادیو یا NVR شبکه را ناقص اعلام نمی‌کند.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* گروه‌های چک‌لیست */}
      <Accordion type="multiple" defaultValue={["env", "ifaces", "devices"]} className="space-y-3">
        {data.groups.map((g) => (
          <AccordionItem key={g.groupKey} value={g.groupKey} className="border rounded-xl bg-card shadow-sm overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-3 w-full">
                <span className="text-primary">{GROUP_ICONS[g.groupKey]}</span>
                <div className="flex-1 text-right">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    {g.title}
                    {g.conditional && (
                      <Badge variant="outline" className={cn("text-[10px]", g.conditionMet ? "border-teal-300 bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-500")}>
                        {g.conditionMet ? "مرتبط" : "خارج از محدوده"}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-normal">
                    {fa(g.completed)} از {fa(g.applicable)} مورد مرتبط تکمیل شده
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-bold", g.percent === 100 ? "text-emerald-600" : g.percent > 50 ? "text-teal-600" : "text-amber-600")}>
                    {fa(g.percent)}٪
                  </span>
                  <div className="w-20 hidden sm:block"><ProgressBar percent={g.percent} /></div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-0 pb-0">
              <div className="divide-y">
                {data.items.filter((i) => i.groupKey === g.groupKey).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => openDetail(item)}
                    className="w-full text-right px-4 py-3 hover:bg-accent/50 transition-colors flex items-start gap-3"
                  >
                    <div className="mt-0.5">{item.status === "collected" || item.status === "limited" ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : item.status === "needs-user-action" ? <Eye className="h-4 w-4 text-orange-500" /> : item.status === "needs-access" ? <KeyRound className="h-4 w-4 text-amber-500" /> : <Clock className="h-4 w-4 text-stone-400" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{item.title}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                        {item.method && <span>روش: {item.method}</span>}
                        {item.confidence && <ConfidenceBadge confidence={item.confidence} />}
                        {item.validity && <span>اعتبار: {item.validity}</span>}
                        {item.error && <span className="text-rose-600">خطا: {item.error}</span>}
                        {item.nextAction && <span className="text-amber-700 flex items-center gap-1"><ChevronLeft className="h-3 w-3" />{item.nextAction}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* راهنمای اقدام — دعوت به مرکز اقدامات */}
      {pending.length > 0 && onGoActions && (
        <Card className="border-dashed">
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              برای تکمیل موارد باقی‌مانده، مرکز اقدامات بعدی بهترین اقدام را براساس ارزش اطلاعاتی، هزینه و سطح دسترسی پیشنهاد می‌دهد.
            </div>
            <Button onClick={onGoActions} className="gap-1">
              رفتن به مرکز اقدامات <ChevronLeft className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* جزئیات و شواهد هر داده (الزام سند بخش ۱.۳) */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                  {detail.title}
                  <StatusBadge status={detail.status} />
                </DialogTitle>
                <DialogDescription>مشخصات کامل این داده مطابق سند بخش ۱.۳</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <DetailField label="گروه" value={detail.groupTitle} />
                  <DetailField label="روش و منبع دریافت" value={detail.method || "—"} />
                  <DetailField label="مسیر اصلی دریافت" value={detail.primaryPath || "—"} />
                  <DetailField label="مسیر جایگزین" value={detail.alternatePath || "—"} />
                  <DetailField label="زمان دریافت" value={detail.collectedAt ? new Date(detail.collectedAt).toLocaleString("fa-IR") : "—"} />
                  <DetailField label="مدت اعتبار" value={detail.validity || "—"} />
                  <DetailField label="سطح اطمینان" value={detail.confidence || "—"} />
                  <DetailField label="نیازمندی دسترسی" value={detail.accessReq || "—"} />
                </div>
                {detail.error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <b>خطا یا علت دریافت‌نشدن:</b> {detail.error}
                  </div>
                )}
                {detail.nextAction && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <b>اقدام بعدی پیشنهادی:</b> {detail.nextAction}
                  </div>
                )}
                {detail.value && (
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <div className="text-xs font-semibold mb-1 flex items-center gap-1"><Database className="h-3.5 w-3.5" /> مقدار ثبت‌شده</div>
                    <pre className="code-panel whitespace-pre-wrap max-h-44 overflow-y-auto custom-scrollbar">{prettyJson(detail.value)}</pre>
                  </div>
                )}
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-semibold mb-2">شواهد مربوط به این داده</div>
                  {evLoading ? (
                    <div className="h-10 rounded bg-muted animate-pulse" />
                  ) : evidence.length === 0 ? (
                    <div className="text-xs text-muted-foreground">هنوز شاهدی ثبت نشده است.</div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                      {evidence.map((e) => (
                        <div key={e.id} className="rounded-md bg-muted/60 p-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px]">{KIND_LABELS[e.kind] || e.kind}</Badge>
                            <span className="ltr-inline text-[10px] text-muted-foreground">{e.sourceMethod}</span>
                            <ConfidenceBadge confidence={e.confidence} />
                            {e.isSimulated && <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-300">شبیه‌سازی</Badge>}
                            <span className="text-[10px] text-muted-foreground">{new Date(e.collectedAt).toLocaleString("fa-IR")}</span>
                          </div>
                          <pre className="code-panel whitespace-pre-wrap">{e.content}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium mt-0.5">{value}</div>
    </div>
  );
}

function prettyJson(v: string): string {
  try { return JSON.stringify(JSON.parse(v), null, 1); } catch { return v; }
}

interface EvidenceRow {
  id: string; kind: string; sourceMethod: string; content: string;
  confidence: string; isSimulated: boolean; collectedAt: string;
}
