"use client";

// NetScope — صفحه ۳: دستگاه‌ها و رابط‌ها (سند بخش ۴)
// هویت ترکیبی، ادغام/جداسازی دستی، طبقه‌بندی چندشاهدی، شواهد هر دستگاه

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNetscopeData, postJson, patchJson, emitRefresh, fa, faDate, ConfidenceBadge, SimBadge, deviceTypeIcon, deviceTypeLabel } from "./shared";
import { useToast } from "@/hooks/use-toast";
import {
  Search, GitMerge, Split, BadgeCheck, MapPin, Plus, Eye, Server, Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DeviceRow {
  id: string; identityKey: string; hostname: string | null; vendor: string | null;
  model: string | null; type: string; roleEvidence: string; confidence: string;
  status: string; sensitivity: string; isSimulated: boolean; isMerged: boolean;
  mergedIntoId: string | null; firstSeen: string; lastSeen: string | null;
  notes: string; alertCount: number;
  interfaces: {
    id: string; name: string; mac: string | null; status: string; speed: string | null; mtu: number | null;
    ipAdds: { id: string; address: string; prefix: number | null; family: string; source: string }[];
  }[];
}
interface DevicesApi {
  devices: DeviceRow[];
  networks: { id: string; cidr: string; name: string; vlanId: number | null; scopeApproved: boolean }[];
  attempts: { id: string; method: string; target: string; result: string; failureReason: string; notes: string; startedAt: string }[];
}

export function DevicesView() {
  const { data, loading, refresh } = useNetscopeData<DevicesApi>("/api/netscope/devices");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [detail, setDetail] = useState<DeviceRow | null>(null);
  const [mergeDialog, setMergeDialog] = useState<DeviceRow | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [addDialog, setAddDialog] = useState(false);
  const { toast } = useToast();

  const devices = (data?.devices || []).filter((d) => {
    if (typeFilter !== "all" && d.type !== typeFilter) return false;
    if (!q.trim()) return true;
    const s = `${d.identityKey} ${d.hostname || ""} ${d.vendor || ""} ${d.model || ""} ${d.interfaces.flatMap((i) => i.ipAdds.map((x) => x.address)).join(" ")} ${d.interfaces.map((i) => i.mac || "").join(" ")}`;
    return s.toLowerCase().includes(q.toLowerCase());
  });

  const doMerge = async () => {
    if (!mergeDialog || !mergeTarget) return;
    try {
      await patchJson("/api/netscope/devices", { action: "merge", sourceId: mergeDialog.id, targetId: mergeTarget });
      toast({ title: "دستگاه‌ها ادغام شدند", description: "منشأ تصمیم دستی کاربر ثبت شد" });
      setMergeDialog(null); setMergeTarget("");
      setDetail(null); emitRefresh(); refresh();
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
  };

  const confirmIdentity = async (d: DeviceRow) => {
    try {
      await patchJson("/api/netscope/devices", { action: "confirm-identity", deviceId: d.id });
      toast({ title: "هویت دستگاه تأیید شد" });
      setDetail(null); emitRefresh(); refresh();
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
  };

  if (loading && !data) return <div className="p-4 space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>;

  return (
    <div className="space-y-4">
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">موجودی دستگاه‌ها و رابط‌ها</CardTitle>
              <CardDescription className="mt-1">
                هویت هر دستگاه ترکیبی است (MAC + نام + سابقه + تأیید کاربر) و فقط IP نیست. نوع دستگاه با چند شاهد تعیین شده است. (سند بخش ۴)
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAddDialog(true)} className="gap-1">
              <Plus className="h-4 w-4" /> افزودن دستی
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-56">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو براساس نام، IP، MAC..." className="pr-9" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه انواع</SelectItem>
                {["router", "switch", "radio", "ap", "camera", "nvr", "server", "pc", "printer", "unknown"].map((t) => (
                  <SelectItem key={t} value={t}>{deviceTypeLabel(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {devices.map((d) => (
          <button key={d.id} onClick={() => setDetail(d)} className="text-right">
            <Card className={cn("h-full hover:border-primary/50 transition-colors", d.isMerged && "opacity-50")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("shrink-0", d.status === "online" ? "text-emerald-600" : d.status === "offline" ? "text-rose-500" : "text-muted-foreground")}>
                      {deviceTypeIcon(d.type, "h-5 w-5")}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{d.hostname || d.identityKey}</div>
                      <div className="text-[11px] text-muted-foreground">{deviceTypeLabel(d.type)}{d.vendor ? ` • ${d.vendor}` : ""}{d.model ? ` ${d.model}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cn("h-2.5 w-2.5 rounded-full", d.status === "online" ? "bg-emerald-500" : d.status === "offline" ? "bg-rose-400" : "bg-stone-300")} />
                    <SimBadge isSimulated={d.isSimulated} />
                  </div>
                </div>
                <div className="mt-2 space-y-0.5">
                  {d.interfaces.slice(0, 2).map((i) => (
                    <div key={i.id} className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="ltr-inline font-mono">{i.ipAdds[0]?.address || "بدون IP"}</span>
                      {i.mac && <span className="ltr-inline font-mono">{i.mac}</span>}
                    </div>
                  ))}
                </div>
                {d.roleEvidence && (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground line-clamp-2 border-r-2 border-muted pr-2">{d.roleEvidence}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <ConfidenceBadge confidence={d.confidence} />
                  {d.alertCount > 0 && <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-300">{fa(d.alertCount)} هشدار فعال</Badge>}
                  {d.isMerged && <Badge variant="outline" className="text-[10px]">ادغام‌شده</Badge>}
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* جزئیات دستگاه */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                  {deviceTypeIcon(detail.type, "h-5 w-5")}
                  {detail.hostname || detail.identityKey}
                  <SimBadge isSimulated={detail.isSimulated} />
                </DialogTitle>
                <DialogDescription>
                  هویت ترکیبی: شناسه {detail.identityKey} | اولین مشاهده {faDate(detail.firstSeen)} | آخرین مشاهده {faDate(detail.lastSeen)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Field label="نوع" value={deviceTypeLabel(detail.type)} />
                  <Field label="سازنده/مدل" value={`${detail.vendor || "—"} ${detail.model || ""}`} />
                </div>
                {detail.roleEvidence && (
                  <div className="rounded-lg border-r-4 border-teal-500 bg-teal-50/50 p-3 text-xs leading-relaxed">
                    <b>استدلال طبقه‌بندی (چندشاهدی):</b> {detail.roleEvidence}
                  </div>
                )}
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-semibold mb-2">رابط‌ها و آدرس‌ها</div>
                  {detail.interfaces.length === 0 && <div className="text-xs text-muted-foreground">رابطی ثبت نشده</div>}
                  <div className="space-y-1.5">
                    {detail.interfaces.map((i) => (
                      <div key={i.id} className="rounded-md bg-muted/50 p-2 text-xs">
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="font-mono ltr-inline font-bold">{i.name}</span>
                          {i.mac && <span className="font-mono ltr-inline text-muted-foreground">{i.mac}</span>}
                          {i.speed && <span>{i.speed}</span>}
                          {i.mtu && <span>MTU {fa(i.mtu)}</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {i.ipAdds.map((a) => (
                            <Badge key={a.id} variant="secondary" className="text-[10px] font-mono ltr-inline">
                              {a.address}{a.prefix != null ? `/${a.prefix}` : ""} {a.family === "IPv6" ? "(v6)" : ""}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => confirmIdentity(detail)} className="gap-1">
                    <BadgeCheck className="h-4 w-4" /> تأیید هویت توسط من
                  </Button>
                  {!detail.isMerged && (
                    <Button size="sm" variant="outline" onClick={() => { setMergeTarget(""); setMergeDialog(detail); }} className="gap-1">
                      <GitMerge className="h-4 w-4" /> ادغام با دستگاه دیگر
                    </Button>
                  )}
                  {detail.isMerged && (
                    <Button size="sm" variant="outline" onClick={async () => {
                      await patchJson("/api/netscope/devices", { action: "unmerge", deviceId: detail.id });
                      toast({ title: "جداسازی انجام شد" }); setDetail(null); emitRefresh(); refresh();
                    }} className="gap-1">
                      <Split className="h-4 w-4" /> جداسازی از ادغام
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={async () => {
                    await patchJson("/api/netscope/devices", { action: "annotate", deviceId: detail.id, field: "location", value: prompt("موقعیت فیزیکی (ساختمان/اتاق/رک):") || "" });
                    toast({ title: "موقعیت ثبت شد", description: "منشأ: ورود دستی کاربر" }); emitRefresh(); refresh();
                  }} className="gap-1">
                    <MapPin className="h-4 w-4" /> ثبت موقعیت فیزیکی
                  </Button>
                </div>
                {detail.notes && <div className="text-xs text-muted-foreground rounded bg-muted/50 p-2">{detail.notes}</div>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* دیالوگ ادغام */}
      <Dialog open={!!mergeDialog} onOpenChange={setMergeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ادغام هویت دستگاه‌ها</DialogTitle>
            <DialogDescription>
              اگر دو رکورد در واقع یک دستگاه واحد باشند (مثلاً تغییر MAC)، آن‌ها را ادغام کنید. این تصمیم دستی ثبت و قابل برگشت است. (الزام سند ۴.۲)
            </DialogDescription>
          </DialogHeader>
          <Select value={mergeTarget} onValueChange={setMergeTarget}>
            <SelectTrigger><SelectValue placeholder="دستگاه مقصد را انتخاب کنید" /></SelectTrigger>
            <SelectContent>
              {(data?.devices || []).filter((d) => d.id !== mergeDialog?.id && !d.isMerged).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.hostname || d.identityKey} — {deviceTypeLabel(d.type)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMergeDialog(null)}>انصراف</Button>
            <Button onClick={doMerge} disabled={!mergeTarget}>ادغام</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* افزودن دستی */}
      <ManualAddDialog open={addDialog} onOpenChange={setAddDialog} onDone={() => { emitRefresh(); refresh(); }} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium mt-0.5">{value}</div>
    </div>
  );
}

function ManualAddDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [form, setForm] = useState({ hostname: "", ip: "", mac: "", type: "pc", vendor: "", model: "", notes: "" });
  const { toast } = useToast();
  const submit = async () => {
    try {
      await patchJson("/api/netscope/devices", { action: "manual-add", ...form });
      toast({ title: "دستگاه اضافه شد", description: "منشأ: افزودن دستی کاربر" });
      onOpenChange(false); onDone();
      setForm({ hostname: "", ip: "", mac: "", type: "pc", vendor: "", model: "", notes: "" });
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>افزودن دستی دستگاه</DialogTitle>
          <DialogDescription>مسیر جایگزین سند ۱.۱ برای دستگاه‌هایی که کشف خودکار آن‌ها ممکن نیست.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {([["hostname", "نام میزبان"], ["ip", "آدرس IP"], ["mac", "MAC"], ["vendor", "سازنده"], ["model", "مدل"]] as const).map(([k, label]) => (
            <div key={k}>
              <Label className="text-xs">{label}</Label>
              <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="h-8" dir={k === "hostname" ? "rtl" : "ltr"} />
            </div>
          ))}
          <div>
            <Label className="text-xs">نوع</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["pc", "server", "switch", "router", "camera", "nvr", "printer", "ap", "radio", "unknown"].map((t) => (
                  <SelectItem key={t} value={t}>{deviceTypeLabel(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>انصراف</Button>
            <Button size="sm" onClick={submit}>ثبت</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
