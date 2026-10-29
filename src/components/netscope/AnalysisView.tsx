"use client";

// NetScope — صفحه ۷: تحلیل و تشریح شبکه (سند بخش ۷)
// هر یافته: شواهد، علت‌های محتمل، آزمایش پیشنهادی، محدودیت نتیجه‌گیری

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNetscopeData, postJson, emitRefresh, fa, ConfidenceBadge } from "./shared";
import { useToast } from "@/hooks/use-toast";
import {
  BrainCircuit, RefreshCw, FlaskConical, Wrench, AlertTriangle, ChevronDown,
  Microscope, Scale, Sparkles, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FindingRow {
  id: string; title: string; description: string; evidenceText: string;
  confidence: string; impact: string; limitations: string; category: string;
  probableCauses: string[]; suggestedTests: string[]; suggestedFix: string[];
  observedAt: string;
}
interface FindingsApi {
  findings: FindingRow[];
}

export function AnalysisView() {
  const { data, loading, refresh } = useNetscopeData<FindingsApi>("/api/netscope/findings");
  const [narrative, setNarrative] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [consent, setConsent] = useState(false);
  const { toast } = useToast();

  const regenerate = async () => {
    try {
      const res = await postJson("/api/netscope/findings", { action: "regenerate" });
      toast({ title: "یافته‌ها بازتولید شد", description: `${res.count} یافته` });
      emitRefresh(); refresh();
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
  };

  const aiExplain = async () => {
    setAiLoading(true);
    try {
      await postJson("/api/netscope/findings", { action: "set-consent", consent });
      const res = await postJson("/api/netscope/findings", { action: "ai-explain" });
      setNarrative(res.narrative);
      toast({ title: "توضیح تولید شد" });
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
    finally { setAiLoading(false); }
  };

  if (loading && !data) return <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}</div>;

  const findings = data?.findings || [];

  return (
    <div className="space-y-4">
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Microscope className="h-5 w-5 text-primary" /> تحلیل و تشریح کامل وضعیت شبکه
              </CardTitle>
              <CardDescription className="mt-1">
                نتایج قطعی بدون شاهد کافی ممنوع است؛ همبستگی به‌عنوان علت قطعی گزارش نمی‌شود و بخش‌های کشف‌نشده صریحاً ذکر می‌شوند. (سند ۷.۳)
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={regenerate} className="gap-1">
              <RefreshCw className="h-4 w-4" /> بازتولید یافته‌ها
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
              {fa(findings.filter((f) => f.confidence === "verified").length)} یافته با شواهد تأییدشده
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
              {fa(findings.filter((f) => f.confidence === "inferred").length)} استنباطی
            </Badge>
            <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-300">
              {fa(findings.filter((f) => f.confidence === "limited").length)} با اطمینان محدود
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* یافته‌ها */}
      {findings.map((f) => (
        <Card key={f.id} className="fade-up">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-bold text-sm leading-relaxed">{f.title}</h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <ConfidenceBadge confidence={f.confidence} />
                <Badge variant="secondary" className="text-[10px]">{f.category === "camera" ? "نظارت تصویری" : f.category === "connectivity" ? "اتصال" : f.category === "config" ? "پیکربندی" : f.category === "inventory" ? "موجودی" : "عمومی"}</Badge>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90">{f.description}</p>
            {f.evidenceText && (
              <div className="rounded-lg bg-muted/60 p-3">
                <div className="text-[10px] font-bold text-muted-foreground mb-1 flex items-center gap-1"><Scale className="h-3 w-3" /> شواهد</div>
                <pre className="code-panel whitespace-pre-wrap text-[11px]">{f.evidenceText}</pre>
              </div>
            )}
            {f.impact && (
              <div className="text-xs flex items-start gap-1.5 text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span><b>اثر احتمالی:</b> {f.impact}</span>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              {f.probableCauses.length > 0 && (
                <ListBlock icon={<AlertTriangle className="h-3.5 w-3.5" />} title="علت‌های محتمل" items={f.probableCauses} tone="amber" />
              )}
              {f.suggestedTests.length > 0 && (
                <ListBlock icon={<FlaskConical className="h-3.5 w-3.5" />} title="آزمایش پیشنهادی برای تأیید" items={f.suggestedTests} tone="teal" />
              )}
              {f.suggestedFix.length > 0 && (
                <ListBlock icon={<Wrench className="h-3.5 w-3.5" />} title="اقدام اصلاحی پیشنهادی" items={f.suggestedFix} tone="emerald" />
              )}
            </div>
            {f.limitations && (
              <div className="rounded-lg border-r-4 border-stone-400 bg-stone-50 p-3 text-xs leading-relaxed text-stone-600">
                <b>محدودیت نتیجه‌گیری:</b> {f.limitations}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* هوش مصنوعی — با رضایت صریح (سند ۷.۴) */}
      <Card className="fade-up border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BrainCircuit className="h-5 w-5 text-primary" /> توضیح هوشمند مبتنی بر شواهد
          </CardTitle>
          <CardDescription className="mt-1">
            مدل زبانی فقط نقش توضیح‌دهنده و پیشنهاددهنده دارد، نه منبع واقعیت. حقایق از داده‌های ساختاریافته استخراج می‌شوند و
            رمزها و اطلاعات حساس وارد مدل نمی‌شوند. ارسال اطلاعات به سرویس بیرونی نیازمند رضایت صریح شماست. (سند ۷.۴)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label className="flex items-start gap-2 text-xs cursor-pointer">
            <Checkbox checked={consent} onCheckedChange={(c) => setConsent(!!c)} className="mt-0.5" />
            <span>رضایت می‌دهم که خلاصه ساختاریافته یافته‌ها (بدون رمز و اطلاعات حساس) برای تولید توضیح به مدل زبانی ارسال شود.</span>
          </Label>
          <Button size="sm" onClick={aiExplain} disabled={aiLoading || !consent} className="gap-1">
            {aiLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            تولید خلاصه اجرایی
          </Button>
          {narrative && (
            <Collapsible defaultOpen>
              <CollapsibleContent>
                <div className="rounded-xl border bg-primary/5 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {narrative}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {!consent && (
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <EyeOff className="h-3 w-3" /> بدون رضایت، هیچ داده‌ای به سرویس بیرونی ارسال نمی‌شود.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ListBlock({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: "amber" | "teal" | "emerald" }) {
  const toneCls = tone === "amber" ? "bg-amber-50 border-amber-200" : tone === "teal" ? "bg-teal-50 border-teal-200" : "bg-emerald-50 border-emerald-200";
  return (
    <div className={cn("rounded-lg border p-2.5", toneCls)}>
      <div className="text-[10px] font-bold flex items-center gap-1 mb-1.5">{icon}{title}</div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-[11px] leading-relaxed flex items-start gap-1">
            <ChevronDown className="h-3 w-3 mt-0.5 shrink-0 -rotate-90 opacity-50" />{it}
          </li>
        ))}
      </ul>
    </div>
  );
}
