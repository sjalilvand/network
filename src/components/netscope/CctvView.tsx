"use client";

// NetScope — صفحه ۵: دوربین‌ها و ضبط‌کننده‌ها (سند بخش ۶)
// تفکیک ۵ وضعیت مستقل + پوشش ۷ سناریو + حفاظت از محتوا

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNetscopeData, fa, SimBadge } from "./shared";
import { cn } from "@/lib/utils";
import {
  Cctv, HardDrive, ShieldCheck, ShieldAlert, Eye, EyeOff, CircleDot,
  Video, CircleOff, CircleCheck, HelpCircle, ListChecks,
} from "lucide-react";

interface CctvApi {
  recorders: RecorderRow[];
  cameras: CameraRow[];
  scenarioCoverage: { key: string; label: string; keys: string[] }[];
}
interface RecorderRow {
  id: string; rtype: string; vendor: string | null; model: string | null; firmware: string | null;
  channelCount: number; poeInternal: boolean; storageInfo: string; deviceName: string;
  status: string; isSimulated: boolean; ip: string | null;
  channels: { channelNo: number; online: string; recording: string; lastVerified: string | null; cameraName: string | null; cameraVendor: string | null; cameraModel: string | null }[];
}
interface CameraRow {
  id: string; identityKey: string; name: string; vendor: string | null; model: string | null;
  firmware: string | null; serial: string | null; onvifSupport: boolean; poeStatus: string | null;
  switchPort: string | null; ip: string | null; status: string; recorderName: string | null;
  channelNo: number | null; isSimulated: boolean; behindNvrPoe: boolean; behindRadio: boolean;
  states: {
    networkResponds: boolean; serviceResponds: boolean; streamReceivable: boolean;
    nvrReportsOnline: boolean; recordingActive: boolean; recordingState: string;
  };
}

// وضعیت‌های مستقل — سند ۶.۴
function StateChip({ ok, label, unknown, note }: { ok: boolean; label: string; unknown?: boolean; note?: string }) {
  if (unknown) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-stone-500" title={note}>
        <HelpCircle className="h-3.5 w-3.5" /> {label}: بررسی نشده
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-1.5 text-[11px]", ok ? "text-emerald-700" : "text-rose-600")} title={note}>
      {ok ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleOff className="h-3.5 w-3.5" />}
      {label}: {ok ? "بله" : "خیر"}
    </div>
  );
}

export function CctvView() {
  const { data, loading } = useNetscopeData<CctvApi>("/api/netscope/cctv");
  const [tab, setTab] = useState("cameras");

  if (loading && !data) return <div className="p-4 space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>;
  if (!data) return <div className="p-6 text-center text-muted-foreground">خطا در دریافت اطلاعات</div>;

  return (
    <div className="space-y-4">
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cctv className="h-5 w-5 text-primary" /> تحلیل مستقل شبکه نظارت تصویری
          </CardTitle>
          <CardDescription className="mt-1">
            وضعیت‌های «پاسخ شبکه»، «سرویس دوربین»، «جریان تصویر»، «آنلاین NVR» و «ضبط فعال» مستقل‌اند؛
            صرف باز بودن پورت یا پاسخ Ping به معنی «ضبط سالم» نیست. (سند بخش ۶.۴)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {data.scenarioCoverage.map((s) => (
              <Badge key={s.key} variant="outline" className="text-[10px] bg-secondary/60">
                <ListChecks className="h-3 w-3 ml-1" /> {s.label} ({fa(s.keys.length)})
              </Badge>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-xs leading-relaxed flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
            <span>
              <b>حفاظت از محتوا (سند ۶.۵):</b> دریافت تصویر، صدا یا فایل ضبط‌شده پیش‌فرض نیست؛ لینک‌های جریان حاوی اطلاعات ورود در گزارش افشا نمی‌شوند و بررسی جریان فقط با اجازه صریح کاربر انجام می‌شود.
            </span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cameras">دوربین‌ها ({fa(data.cameras.length)})</TabsTrigger>
          <TabsTrigger value="recorders">ضبط‌کننده‌ها ({fa(data.recorders.length)})</TabsTrigger>
        </TabsList>

        {/* ── موجودی دوربین‌ها (سند ۶.۱) ── */}
        <TabsContent value="cameras" className="mt-3 grid gap-3 md:grid-cols-2">
          {data.cameras.map((c) => (
            <Card key={c.id} className="fade-up">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Cctv className={cn("h-5 w-5", c.states.recordingActive ? "text-emerald-600" : c.states.nvrReportsOnline ? "text-amber-500" : "text-rose-500")} />
                    <div>
                      <div className="font-semibold text-sm">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.vendor} {c.model} • FW <span className="ltr-inline font-mono">{c.firmware || "؟"}</span>
                      </div>
                    </div>
                  </div>
                  <SimBadge isSimulated={c.isSimulated} />
                </div>

                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {c.ip && <Badge variant="secondary" className="font-mono ltr-inline">{c.ip}</Badge>}
                  {c.onvifSupport && <Badge variant="outline" className="text-[10px]">ONVIF</Badge>}
                  {c.recorderName && <Badge variant="outline" className="text-[10px]">کانال {fa(c.channelNo || 0)} — {c.recorderName}</Badge>}
                  {c.behindNvrPoe && <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-300">پشت PoE داخلی NVR</Badge>}
                  {c.behindRadio && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300">پشت لینک رادیویی</Badge>}
                  {c.serial && <Badge variant="secondary" className="font-mono ltr-inline text-[10px]">S/N: {c.serial}</Badge>}
                </div>

                <div className="rounded-lg border p-2.5 space-y-1">
                  <div className="text-[10px] font-bold text-muted-foreground mb-1">۵ وضعیت مستقل (سند ۶.۴)</div>
                  <StateChip ok={c.states.networkResponds} label="دستگاه در شبکه پاسخ می‌دهد"
                    note={c.behindNvrPoe ? "پشت شبکه داخلی NVR است — عدم مشاهده مستقیم طبیعی و به‌معنی خرابی نیست (سند ۶.۳)" : undefined} />
                  <StateChip ok={c.states.serviceResponds} label="سرویس دوربین پاسخ می‌دهد" />
                  <StateChip ok={false} unknown label="جریان تصویر قابل دریافت" note="به‌صورت پیش‌فرض بررسی نمی‌شود (حفاظت از محتوا — سند ۶.۵)" />
                  <StateChip ok={c.states.nvrReportsOnline} label="NVR دوربین را آنلاین گزارش می‌کند" />
                  <StateChip ok={c.states.recordingActive} label="ضبط واقعاً فعال است"
                    note={c.states.recordingState === "inactive" ? "وضعیت ضبط از API ضبط‌کننده — نه از باز بودن پورت" : undefined} />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── موجودی ضبط‌کننده‌ها (سند ۶.۲) ── */}
        <TabsContent value="recorders" className="mt-3 space-y-3">
          {data.recorders.map((r) => (
            <Card key={r.id} className="fade-up">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">{r.deviceName}</CardTitle>
                      <CardDescription>
                        {r.rtype} • {r.vendor} {r.model} • FW <span className="ltr-inline font-mono">{r.firmware || "؟"}</span>
                        {r.ip && <> • <span className="ltr-inline font-mono">{r.ip}</span></>}
                        {r.poeInternal && " • دارای شبکه داخلی PoE"}
                      </CardDescription>
                    </div>
                  </div>
                  <SimBadge isSimulated={r.isSimulated} />
                </div>
              </CardHeader>
              <CardContent>
                {r.storageInfo && (
                  <div className="mb-3 rounded-lg bg-muted/50 p-2.5 text-xs flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" /> {r.storageInfo}
                  </div>
                )}
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/70">
                      <tr>
                        <th className="px-3 py-2 text-right font-semibold">کانال</th>
                        <th className="px-3 py-2 text-right font-semibold">دوربین</th>
                        <th className="px-3 py-2 text-right font-semibold">آنلاین NVR</th>
                        <th className="px-3 py-2 text-right font-semibold">وضعیت ضبط</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {r.channels.sort((a, b) => a.channelNo - b.channelNo).map((ch) => (
                        <tr key={ch.channelNo} className="hover:bg-accent/30">
                          <td className="px-3 py-2 font-bold">{fa(ch.channelNo)}</td>
                          <td className="px-3 py-2">
                            {ch.cameraName || <span className="text-muted-foreground">خالی</span>}
                            {ch.cameraModel && <span className="text-muted-foreground"> — {ch.cameraVendor} {ch.cameraModel}</span>}
                          </td>
                          <td className="px-3 py-2">
                            {ch.online === "online" ? <Badge className="bg-emerald-600 text-white text-[10px]">آنلاین</Badge>
                              : ch.online === "offline" ? <Badge variant="destructive" className="text-[10px]">آفلاین</Badge>
                              : <Badge variant="secondary" className="text-[10px]">نامشخص</Badge>}
                          </td>
                          <td className="px-3 py-2">
                            {ch.recording === "active" ? <Badge className="bg-teal-600 text-white text-[10px]">در حال ضبط</Badge>
                              : ch.recording === "inactive" ? <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-300">غیرفعال</Badge>
                              : <Badge variant="secondary" className="text-[10px]">نامشخص</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
