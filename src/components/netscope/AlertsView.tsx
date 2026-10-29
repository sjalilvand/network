"use client";

// NetScope — صفحه ۹: هشدارها، تاریخچه تغییرات و رکورد ممیزی (سند بخش ۱۲)
// تمام عملیات حساس ثبت و قابل ممیزی هستند

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNetscopeData, fa, faDate, SimBadge } from "./shared";
import { cn } from "@/lib/utils";
import { BellRing, History, FileClock, ScrollText, GitCommitHorizontal, TimerReset } from "lucide-react";

interface AuditApi {
  audit: { id: string; action: string; target: string; detail: string; actor: string; createdAt: string }[];
  attempts: { id: string; method: string; target: string; result: string; failureReason: string; trafficCost: string; notes: string; startedAt: string }[];
  evidence: {
    id: string; kind: string; sourceMethod: string; content: string; confidence: string;
    isSimulated: boolean; collectedAt: string; deviceKey: string | null; checklistKey: string | null;
    expiresAt: string | null;
  }[];
}

const RESULT_LABELS: Record<string, { label: string; cls: string }> = {
  success: { label: "موفق", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  failed: { label: "ناموفق", cls: "bg-rose-50 text-rose-700 border-rose-300" },
  partial: { label: "جزئی", cls: "bg-amber-50 text-amber-700 border-amber-300" },
  blocked: { label: "انسدادی", cls: "bg-orange-50 text-orange-700 border-orange-300" },
  running: { label: "در حال اجرا", cls: "bg-sky-50 text-sky-700 border-sky-300" },
};

export function AlertsView() {
  const { data, loading } = useNetscopeData<AuditApi>("/api/netscope/audit");
  const [tab, setTab] = useState("audit");

  if (loading && !data) return <div className="p-4 space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}</div>;

  return (
    <div className="space-y-4">
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScrollText className="h-5 w-5 text-primary" /> تاریخچه تغییرات و رکورد ممیزی
          </CardTitle>
          <CardDescription className="mt-1">
            تمام عملیات حساس ثبت و قابل ممیزی هستند؛ هر تلاش جمع‌آوری با علت شکست مشخص ثبت می‌شود و شواهد مدت اعتبار دارند. (سند ۱۲ و ۱۰)
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="audit" className="gap-1"><FileClock className="h-4 w-4" /> ممیزی</TabsTrigger>
          <TabsTrigger value="attempts" className="gap-1"><History className="h-4 w-4" /> تلاش‌های جمع‌آوری</TabsTrigger>
          <TabsTrigger value="evidence" className="gap-1"><GitCommitHorizontal className="h-4 w-4" /> شواهد</TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="mt-3">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[480px]">
                <div className="divide-y">
                  {(data?.audit || []).map((a) => (
                    <div key={a.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-accent/30">
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-teal-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{a.action}</div>
                        {a.detail && <div className="text-[11px] text-muted-foreground mt-0.5">{a.detail}</div>}
                      </div>
                      <div className="text-[10px] text-muted-foreground shrink-0 text-left">
                        {faDate(a.createdAt)}
                        <div>{a.actor}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attempts" className="mt-3">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[480px]">
                <div className="divide-y">
                  {(data?.attempts || []).map((t) => {
                    const r = RESULT_LABELS[t.result] || { label: t.result, cls: "" };
                    return (
                      <div key={t.id} className="px-4 py-2.5 hover:bg-accent/30">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={cn("text-[10px]", r.cls)}>{r.label}</Badge>
                          <span className="font-mono ltr-inline text-xs font-bold">{t.method}</span>
                          {t.target && <span className="font-mono ltr-inline text-[11px] text-muted-foreground">{t.target}</span>}
                          {t.trafficCost && <Badge variant="secondary" className="text-[10px]">ترافیک: {t.trafficCost === "low" ? "کم" : t.trafficCost === "medium" ? "متوسط" : "زیاد"}</Badge>}
                          <span className="text-[10px] text-muted-foreground">{faDate(t.startedAt)}</span>
                        </div>
                        {(t.failureReason || t.notes) && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {t.failureReason && <span className="text-rose-600 font-medium">علت شکست: {t.failureReason}</span>}
                            {t.failureReason && t.notes && " — "}
                            {t.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="mt-3">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[480px]">
                <div className="divide-y">
                  {(data?.evidence || []).map((e) => (
                    <div key={e.id} className="px-4 py-2.5 hover:bg-accent/30">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <Badge variant="outline" className="text-[10px]">{e.kind}</Badge>
                        <span className="font-mono ltr-inline text-[10px] text-muted-foreground">{e.sourceMethod}</span>
                        {e.deviceKey && <Badge variant="secondary" className="text-[10px] font-mono ltr-inline">{e.deviceKey}</Badge>}
                        {e.checklistKey && <Badge variant="outline" className="text-[10px]">{e.checklistKey}</Badge>}
                        <SimBadge isSimulated={e.isSimulated} />
                        {e.expiresAt && (
                          <Badge variant="outline" className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-300">
                            <TimerReset className="h-3 w-3 ml-0.5" /> انقضا: {faDate(e.expiresAt)}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">{faDate(e.collectedAt)}</span>
                      </div>
                      <pre className="code-panel whitespace-pre-wrap text-[11px] max-h-20 overflow-hidden">{e.content.slice(0, 300)}{e.content.length > 300 ? "..." : ""}</pre>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
