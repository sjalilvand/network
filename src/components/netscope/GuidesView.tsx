"use client";

// NetScope — صفحه ۸: راهنماها و ورود خروجی فرمان (سند بخش ۳)
// راهنمای ساختاریافته ۱۱ فیلدی + مفسر خروجی با اعتبارسنجی و پیش‌نمایش

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useNetscopeData, postJson, emitRefresh, fa } from "./shared";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, ClipboardPaste, Upload, CheckCircle2, AlertTriangle, Info,
  ShieldAlert, TerminalSquare, FileJson, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GuidePlatformRow { platform: string; label: string; commands: { cmd: string; note?: string }[]; notes?: string }
interface GuideRow {
  guideKey: string; title: string; targetInfo: string; why: string; autoPossible: string;
  prerequisites: string; targetSystem: string; expectedOutput: string;
  fieldsToExtract: string[]; sensitiveFields: string[]; validationRules: string[];
  fallback: string; platforms: GuidePlatformRow[]; category: string; warning?: string;
}
interface GuidesApi { guides: { guideKey: string; title: string; category: string; targetInfo: string; autoPossible: string; warning: string | null; platforms: string[] }[] }

interface ParsedApi {
  parsed: {
    format: string; formatLabel: string; success: boolean;
    interfaces: { name: string; mac?: string; ips: { address: string; prefix?: number; family: string }[] }[];
    neighbors: { ip: string; mac: string; interface?: string; state?: string }[];
    routes: { destination: string; gateway?: string; interface?: string }[];
    dnsServers: string[];
    unknownSections: string[]; warnings: string[]; errors: string[];
  };
  validation: { ok: boolean; issues: string[] };
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "عمومی", switch: "سوئیچ/روتر", camera: "دوربین", nvr: "ضبط‌کننده", radio: "رادیو", manual: "دستی",
};

const SAMPLE_OUTPUTS: Record<string, string> = {
  "ipconfig-all": `Windows IP Configuration

Ethernet adapter Ethernet0:

   Connection-specific DNS Suffix  . : corp.local
   Description . . . . . . . . . . . : Intel(R) Ethernet Connection
   Physical Address. . . . . . . . . : 00-15-5D-55-00-05
   DHCP Enabled. . . . . . . . . . . : Yes
   IPv4 Address. . . . . . . . . . . : 10.10.10.5(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Lease Obtained. . . . . . . . . . : 1404/08/01 08:30:12
   Default Gateway . . . . . . . . . : 10.10.10.1
   DNS Servers . . . . . . . . . . . : 10.10.10.5
                                       10.10.0.1`,
  "ip-json-addr": `[
  {
    "ifname": "eth0",
    "operstate": "UP",
    "mtu": 1500,
    "address": "cc:2d:e0:33:00:09",
    "addr_info": [
      { "local": "10.10.0.9", "prefixlen": 24, "family": "inet" }
    ]
  }
]`,
  "arp-a": `Interface: 10.10.0.9 --- 0x4
  Internet Address      Physical Address      Type
  10.10.0.1             d4-ca-6d-11-00-01     dynamic
  10.10.0.2             68-2c-7b-22-00-02     dynamic
  10.10.10.99           aa-bb-cc-dd-ee-ff     invalid`,
};

export function GuidesView() {
  const { data, loading } = useNetscopeData<GuidesApi>("/api/netscope/guides");
  const [detail, setDetail] = useState<GuideRow | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const { toast } = useToast();

  const openDetail = async (key: string) => {
    const res = await fetch(`/api/netscope/guides?key=${key}`);
    const d = await res.json();
    setDetail(d.guide);
  };

  return (
    <div className="space-y-4">
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5 text-primary" /> راهنمای استخراج اطلاعات
              </CardTitle>
              <CardDescription className="mt-1">
                برای هر نوع اطلاعات، راهنمای ساختاریافته با ۱۱ فیلد الزامی سند ۳.۱ — فرمان‌ها فقط‌خواندنی هستند و متناسب با سیستم‌عامل و سازنده نمایش داده می‌شوند.
              </CardDescription>
            </div>
            <Button onClick={() => setPasteOpen(true)} className="gap-1.5">
              <ClipboardPaste className="h-4 w-4" /> ورود خروجی فرمان
            </Button>
          </div>
        </CardHeader>
      </Card>

      {loading && !data ? (
        <div className="grid gap-3 md:grid-cols-2">{[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data?.guides.map((g) => (
            <button key={g.guideKey} onClick={() => openDetail(g.guideKey)} className="text-right">
              <Card className="h-full hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm">{g.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{g.targetInfo}</div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{CATEGORY_LABELS[g.category] || g.category}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={cn("text-[10px]", g.autoPossible.startsWith("بله") ? "bg-emerald-50 text-emerald-700 border-emerald-300" : g.autoPossible.startsWith("خیر") ? "bg-stone-100 text-stone-600" : "bg-amber-50 text-amber-700 border-amber-300")}>
                      {g.autoPossible.startsWith("بله") ? "خودکار ممکن" : g.autoPossible.startsWith("خیر") ? "فقط دستی" : "خودکار جزئی"}
                    </Badge>
                    {g.platforms.slice(0, 3).map((p) => (
                      <Badge key={p} variant="secondary" className="text-[10px] ltr-inline">{p}</Badge>
                    ))}
                  </div>
                  {g.warning && (
                    <div className="mt-2 text-[11px] text-amber-700 flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {g.warning}
                    </div>
                  )}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* جزئیات راهنما — ۱۱ فیلد سند ۳.۱ */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{detail.title}</DialogTitle>
                <DialogDescription>{detail.targetInfo}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-2 text-sm">
                <GuideField icon={<Info className="h-3.5 w-3.5" />} label="چرا به این اطلاعات نیاز داریم؟" value={detail.why} />
                <GuideField icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="آیا دریافت خودکار ممکن است؟" value={detail.autoPossible} />
                <GuideField icon={<ShieldAlert className="h-3.5 w-3.5" />} label="پیش‌نیاز و سطح دسترسی" value={detail.prerequisites} />
                <GuideField icon={<TerminalSquare className="h-3.5 w-3.5" />} label="اقدام روی کدام سیستم انجام می‌شود؟" value={detail.targetSystem} />

                {/* فرمان‌ها متناسب با پلتفرم — الزام سند ۳.۳ */}
                <div className="rounded-xl border overflow-hidden">
                  <div className="bg-muted/70 px-3 py-2 text-xs font-bold flex items-center gap-1.5">
                    <TerminalSquare className="h-4 w-4" /> فرمان‌ها (فقط‌خواندنی) — متناسب با هر پلتفرم
                  </div>
                  <div className="divide-y">
                    {detail.platforms.map((p) => (
                      <div key={p.platform} className="p-3">
                        <div className="text-xs font-bold mb-2 flex items-center gap-2">
                          {p.label}
                          {p.notes && <span className="text-[10px] font-normal text-muted-foreground">{p.notes}</span>}
                        </div>
                        <div className="space-y-1.5">
                          {p.commands.map((c, i) => (
                            <div key={i} className="rounded-md bg-stone-900 text-stone-100 px-3 py-2">
                              <div className="code-panel text-emerald-300">{c.cmd}</div>
                              {c.note && <div className="code-panel text-stone-400 mt-1 text-[10px]"># {c.note}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <GuideField icon={<FileJson className="h-3.5 w-3.5" />} label="خروجی مورد انتظار" value={detail.expectedOutput} />
                <GuideField icon={<ListChecks className="h-3.5 w-3.5" />} label="کدام بخش خروجی باید وارد شود؟" value={detail.fieldsToExtract.join(" • ")} />
                {detail.sensitiveFields.length > 0 && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                    <b className="flex items-center gap-1 mb-1"><ShieldAlert className="h-3.5 w-3.5" /> اطلاعات حساس که باید حذف شوند:</b>
                    {detail.sensitiveFields.join(" • ")}
                  </div>
                )}
                <GuideField icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="اعتبارسنجی برنامه" value={detail.validationRules.join(" • ")} />
                <GuideField icon={<Info className="h-3.5 w-3.5" />} label="راه جایگزین اگر روش موفق نبود" value={detail.fallback} />
                {detail.warning && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-1.5">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {detail.warning}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <PasteOutputDialog open={pasteOpen} onOpenChange={setPasteOpen} />
    </div>
  );
}

function GuideField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 mb-1">{icon}{label}</div>
      <div className="text-xs leading-relaxed">{value || "—"}</div>
    </div>
  );
}

// ─── ورود خروجی فرمان: تفسیر → پیش‌نمایش → ثبت (سند ۳.۲) ────────────
export function PasteOutputDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [text, setText] = useState("");
  const [format, setFormat] = useState("auto");
  const [parsed, setParsed] = useState<ParsedApi | null>(null);
  const [committing, setCommitting] = useState(false);
  const { data: checklistData } = useNetscopeData<{ items: { itemKey: string; title: string }[] }>("/api/netscope/checklist-full");
  const [checklistKey, setChecklistKey] = useState("devices.inventory");
  const { toast } = useToast();

  const doParse = async () => {
    try {
      const res = await postJson("/api/netscope/parse", { action: "parse", text, format: format === "auto" ? undefined : format });
      setParsed(res);
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
  };

  const doCommit = async () => {
    if (!parsed?.parsed.success) return;
    setCommitting(true);
    try {
      const res = await postJson("/api/netscope/parse", { action: "commit", text, format, checklistKey });
      toast({
        title: "خروجی ثبت شد",
        description: `${res.devicesCreated} دستگاه جدید از خروجی شناسایی شد (با اطمینان محدود تا تأیید شما)`,
      });
      onOpenChange(false); setParsed(null); setText(""); emitRefresh();
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
    finally { setCommitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardPaste className="h-5 w-5 text-primary" /> ورود خروجی فرمان
          </DialogTitle>
          <DialogDescription>
            خروجی فرمان را از سیستم مورد نظر کپی و اینجا بچسبانید. برنامه فرمت را تشخیص، تفسیر و اعتبارسنجی می‌کند و
            بخش‌های ناشناخته را اعلام می‌کند. (الزام معیار پذیرش ۱۴)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">تشخیص خودکار</SelectItem>
                <SelectItem value="ipconfig-all">ipconfig /all (ویندوز)</SelectItem>
                <SelectItem value="ip-json-addr">ip -j address show</SelectItem>
                <SelectItem value="ip-json-route">ip -j route show</SelectItem>
                <SelectItem value="ip-json-neigh">ip -j neigh show</SelectItem>
                <SelectItem value="arp-a">arp -a (ویندوز)</SelectItem>
                <SelectItem value="arp-linux">arp -an (لینوکس)</SelectItem>
                <SelectItem value="get-netadapter">Get-NetAdapter</SelectItem>
              </SelectContent>
            </Select>
            <Select value={checklistKey} onValueChange={setChecklistKey}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(checklistData?.items || []).map((i) => (
                  <SelectItem key={i.itemKey} value={i.itemKey}>{i.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            dir="ltr"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="خروجی فرمان را اینجا بچسبانید..."
            className="code-panel min-h-40 bg-stone-900 text-stone-100 border-stone-700 placeholder:text-stone-500"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setText(SAMPLE_OUTPUTS[format] || SAMPLE_OUTPUTS["arp-a"]); setFormat((f) => (f === "auto" ? "arp-a" : f)); }} className="gap-1">
              <Upload className="h-3.5 w-3.5" /> نمونه خروجی
            </Button>
            <Button size="sm" onClick={doParse} disabled={!text.trim()}>تفسیر و اعتبارسنجی</Button>
          </div>

          {parsed && (
            <div className="space-y-2 rounded-xl border p-3 fade-up">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={parsed.parsed.success ? "default" : "destructive"} className="text-[10px] bg-primary">
                  فرمت: {parsed.parsed.formatLabel}
                </Badge>
                {parsed.parsed.interfaces.length > 0 && <Badge variant="secondary" className="text-[10px]">{fa(parsed.parsed.interfaces.length)} رابط</Badge>}
                {parsed.parsed.neighbors.length > 0 && <Badge variant="secondary" className="text-[10px]">{fa(parsed.parsed.neighbors.length)} همسایه</Badge>}
                {parsed.parsed.routes.length > 0 && <Badge variant="secondary" className="text-[10px]">{fa(parsed.parsed.routes.length)} مسیر</Badge>}
                {parsed.validation.ok
                  ? <Badge className="bg-emerald-600 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 ml-1" /> اعتبارسنجی موفق</Badge>
                  : <Badge variant="destructive" className="text-[10px]">{fa(parsed.validation.issues.length)} مشکل اعتبارسنجی</Badge>}
              </div>

              {parsed.parsed.neighbors.length > 0 && (
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted/60"><tr>
                      <th className="px-2 py-1.5 text-right">IP</th><th className="px-2 py-1.5 text-right">MAC</th>
                      <th className="px-2 py-1.5 text-right">رابط</th><th className="px-2 py-1.5 text-right">وضعیت</th>
                    </tr></thead>
                    <tbody className="divide-y">
                      {parsed.parsed.neighbors.map((n, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 font-mono ltr">{n.ip}</td>
                          <td className="px-2 py-1 font-mono ltr">{n.mac}</td>
                          <td className="px-2 py-1 font-mono ltr">{n.interface || "—"}</td>
                          <td className="px-2 py-1">{n.state || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {parsed.parsed.interfaces.length > 0 && (
                <div className="space-y-1">
                  {parsed.parsed.interfaces.map((it, i) => (
                    <div key={i} className="rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px]">
                      <span className="font-bold">{it.name}</span>
                      {it.mac && <span className="font-mono ltr-inline text-muted-foreground"> — {it.mac}</span>}
                      {it.ips.map((ip, j) => (
                        <span key={j} className="font-mono ltr-inline text-muted-foreground"> — {ip.address}{ip.prefix ? `/${ip.prefix}` : ""}</span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {parsed.validation.issues.length > 0 && (
                <div className="rounded-md bg-rose-50 border border-rose-200 p-2 text-[11px] text-rose-700">
                  <b>مشکلات:</b> {parsed.validation.issues.join("؛ ")}
                </div>
              )}
              {parsed.parsed.unknownSections.length > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800">
                  <b>بخش‌های ناشناخته (اعلام الزامی):</b> {fa(parsed.parsed.unknownSections.length)} خط قابل تفسیر نبود و نادیده گرفته شد.
                </div>
              )}
              {parsed.parsed.warnings.map((w, i) => (
                <div key={i} className="rounded-md bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800 flex items-start gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{w}
                </div>
              ))}
              {parsed.parsed.success && (
                <Button size="sm" onClick={doCommit} disabled={committing} className="w-full">
                  {committing ? "در حال ثبت..." : "ثبت شواهد و به‌روزرسانی چک‌لیست"}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
