"use client";

// NetScope — صفحه ۴: نقشه فیزیکی، منطقی و کاربردی (سند بخش ۵)
// خط پیوسته: تأییدشده | خط‌چین: استنباطی | خط کم‌رنگ/؟: نامشخص
// شواهد هر خط قابل مشاهده است (الزام ۵.۴)

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useNetscopeData, faDate, fa, LinkConfidenceBadge, emitRefresh } from "./shared";
import { patchJson } from "./shared";
import { useToast } from "@/hooks/use-toast";
import { Network, Info, Download, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type cytoscape from "cytoscape";

interface TopoApi {
  kind: string;
  nodes: { id: string; key: string; label: string; type: string; status: string; vendor: string | null; model: string | null; confidence: string; isSimulated: boolean }[];
  edges: {
    id: string; source: string; target: string; relation: string; srcPort: string | null; dstPort: string | null;
    vlan: number | null; sourceMethod: string; confidence: string; status: string;
    lastVerified: string | null; evidenceText: string; srcKey: string; dstKey: string;
  }[];
  evidence: { id: string; linkId: string | null; content: string; sourceMethod: string; confidence: string; collectedAt: string; isSimulated: boolean }[];
  networks: { id: string; cidr: string; name: string; vlanId: number | null; gateway: string | null; scopeApproved: boolean }[];
}

const NODE_COLORS: Record<string, string> = {
  router: "#0f766e", switch: "#0d9488", radio: "#b45309", ap: "#d97706",
  camera: "#7c3aed", nvr: "#5b21b6", server: "#15803d", pc: "#64748b",
  printer: "#94a3b8", unknown: "#a8a29e",
};
const NODE_LABELS: Record<string, string> = {
  router: "روتر", switch: "سوئیچ", radio: "رادیو", ap: "AP", camera: "دوربین",
  nvr: "NVR", server: "سرور", pc: "PC", printer: "چاپگر", unknown: "؟",
};

// توابع نگاشت استایل یال — خط پیوسته/خط‌چین/کم‌رنگ (سند ۵.۴)
function edgeLineStyle(ele: cytoscape.EdgeSingular): string {
  const conf = ele.data("conf");
  return conf === "verified" ? "solid" : conf === "inferred" ? "dashed" : "dotted";
}
function edgeLineColor(ele: cytoscape.EdgeSingular): string {
  const conf = ele.data("conf");
  return conf === "verified" ? "#059669" : conf === "inferred" ? "#d97706" : "#a8a29e";
}
function edgeLabel(ele: cytoscape.EdgeSingular): string {
  const rel = ele.data("rel") || "";
  const vlan = ele.data("vlan");
  let t = rel.replace("vlan-", "VLAN ").replace("-gateway", " ← Gateway");
  if (rel === "nvr-channel") t = "کانال NVR";
  if (rel === "radio-ptp") t = "لینک رادیویی";
  if (rel === "uplink") t = "لینک";
  if (vlan) t = `VLAN ${vlan}`;
  if (rel === "dhcp-dns-service") t = "DHCP/DNS";
  return t;
}

const EDGE_STYLE = {
  width: 2,
  "line-style": edgeLineStyle,
  "line-color": edgeLineColor,
  "target-arrow-color": "#64748b",
  "curve-style": "bezier",
  "font-size": 9,
  "font-family": "Vazirmatn, sans-serif",
  label: edgeLabel,
  "text-background-color": "#ffffff",
  "text-background-opacity": 0.85,
  "text-background-padding": 2,
  color: "#475569",
  "target-arrow-shape": "none",
};

export function MapView() {
  const [kind, setKind] = useState<"physical" | "logical" | "functional">("physical");
  const { data, loading, refresh } = useNetscopeData<TopoApi>(`/api/netscope/topology?kind=${kind}`, [kind]);
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [edgeDetail, setEdgeDetail] = useState<TopoApi["edges"][0] | null>(null);
  const [edgeEvidence, setEdgeEvidence] = useState<TopoApi["evidence"]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!data || !containerRef.current) return;
    let cy: cytoscape.Core;
    (async () => {
      const cytoscapeLib = (await import("cytoscape")).default;

      // عناصر نقشه
      const elements: cytoscape.ElementDefinition[] = [];
      const nodeIds = new Set<string>();
      for (const n of data.nodes) {
        elements.push({
          data: {
            id: n.id, label: n.label, ntype: n.type, status: n.status, isSim: n.isSimulated,
            color: NODE_COLORS[n.type] || "#a8a29e", typelabel: NODE_LABELS[n.type] || "؟",
          },
        });
        nodeIds.add(n.id);
      }
      for (const e of data.edges) {
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
        elements.push({
          data: {
            id: e.id, source: e.source, target: e.target,
            rel: e.relation, conf: e.confidence, vlan: e.vlan,
            srcPort: e.srcPort, dstPort: e.dstPort, method: e.sourceMethod,
          },
        });
      }

      cy = cytoscapeLib({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: "node",
            style: {
              "background-color": "data(color)",
              label: "data(label)",
              "font-size": 11,
              "font-family": "Vazirmatn, sans-serif",
              color: "#1e293b",
              "text-valign": "bottom",
              "text-margin-y": 6,
              width: 34, height: 34,
              "border-width": 2,
              "border-color": "#ffffff",
              "overlay-padding": 4,
            } as cytoscape.Css.Node,
          },
          {
            selector: "edge",
            style: EDGE_STYLE as unknown as cytoscape.Css.Edge,
          },
          {
            selector: "node[status = 'offline']",
            style: { opacity: 0.55, "border-color": "#f87171", "border-width": 2.5 } as cytoscape.Css.Node,
          },
        ],
        layout: {
          name: "cose", animate: false, padding: 30,
          nodeRepulsion: () => 12000, idealEdgeLength: () => 110,
          nodeOverlap: 20, gravity: 0.6, numIter: 800,
        } as cytoscape.LayoutOptions,
      });

      cy.on("tap", "edge", (evt) => {
        const edgeId = evt.target.id();
        const e = data.edges.find((x) => x.id === edgeId);
        if (e) {
          setEdgeDetail(e);
          setEdgeEvidence(data.evidence.filter((ev) => ev.linkId === edgeId));
        }
      });
      cy.on("tap", "node", (evt) => {
        const n = data.nodes.find((x) => x.id === evt.target.id());
        if (n) toast({ title: n.label, description: `${NODE_LABELS[n.type] || n.type} — ${n.status === "online" ? "آنلاین" : n.status === "offline" ? "آفلاین" : "نامشخص"}` });
      });
      cyRef.current = cy;
    })();
    return () => { if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; } };
  }, [data, toast]);

  const exportPng = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const blob = cy.png({ full: true, scale: 2, output: "blob" }) as unknown as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `netscope-map-${kind}.png`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "تصویر نقشه ذخیره شد", description: "خروجی PNG مطابق سند بخش ۱۵" });
  };

  const confirmEdge = async (linkId: string, verdict: "confirm" | "reject") => {
    try {
      await patchJson("/api/netscope/topology", { linkId, verdict });
      toast({ title: verdict === "confirm" ? "اتصال با تأیید کاربر ثبت شد" : "اتصال رد شد", description: "منبع: تأیید مستند کاربر (سند ۵.۱)" });
      setEdgeDetail(null); emitRefresh(); refresh();
    } catch (e) { toast({ title: "خطا", description: (e as Error).message, variant: "destructive" }); }
  };

  const edges = data?.edges || [];
  const stats = {
    verified: edges.filter((e) => e.confidence === "verified").length,
    inferred: edges.filter((e) => e.confidence === "inferred").length,
    unknown: edges.filter((e) => e.confidence === "unknown" || !e.confidence).length,
  };

  return (
    <div className="space-y-4">
      <Card className="fade-up">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Network className="h-5 w-5 text-primary" /> نقشه شبکه — نمایش جداگانه سه نوع رابطه
              </CardTitle>
              <CardDescription className="mt-1">
                خط پیوسته: تأییدشده | خط‌چین: استنباطی | خط کم‌رنگ: نامشخص — رنگ وضعیت مستقل از میزان اطمینان است. روی هر خط کلیک کنید تا شواهد آن را ببینید.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <TabsList>
                  <TabsTrigger value="physical">فیزیکی</TabsTrigger>
                  <TabsTrigger value="logical">منطقی</TabsTrigger>
                  <TabsTrigger value="functional">کاربردی</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button size="sm" variant="outline" onClick={exportPng} className="gap-1">
                <Download className="h-4 w-4" /> تصویر
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">── تأییدشده: {fa(stats.verified)}</Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">┄ استنباطی: {fa(stats.inferred)}</Badge>
            <Badge variant="outline" className="bg-stone-100 text-stone-600 border-stone-300">┈ نامشخص: {fa(stats.unknown)}</Badge>
          </div>
          <div className="rounded-xl border bg-white relative overflow-hidden" style={{ height: 520 }}>
            {loading && !data && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">در حال بارگذاری نقشه...</div>}
            {data && edges.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
                <Network className="h-8 w-8 opacity-30" />
                برای این نوع رابطه هنوز اتصالی ثبت نشده است.
              </div>
            )}
            <div ref={containerRef} className="w-full h-full" dir="ltr" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(NODE_COLORS).map(([t, c]) => (
              <span key={t} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} /> {NODE_LABELS[t]}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* شواهد هر خط (الزام سند ۵.۴) */}
      <Dialog open={!!edgeDetail} onOpenChange={(o) => !o && setEdgeDetail(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto custom-scrollbar">
          {edgeDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">جزئیات اتصال</DialogTitle>
                <DialogDescription>
                  <span className="ltr-inline font-mono">{edgeDetail.srcKey}</span> ⟵ <span className="ltr-inline font-mono">{edgeDetail.dstKey}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground">نوع رابطه</div>
                  <div className="text-xs font-medium">{edgeDetail.relation || "—"}</div>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground">منبع شناسایی</div>
                  <div className="text-xs font-medium ltr-inline">{edgeDetail.sourceMethod}</div>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground">پورت/رابط دو طرف</div>
                  <div className="text-xs font-medium ltr font-mono">{edgeDetail.srcPort || "—"} ↔ {edgeDetail.dstPort || "—"}</div>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground">آخرین تأیید</div>
                  <div className="text-xs font-medium">{faDate(edgeDetail.lastVerified)}</div>
                </div>
              </div>
              <div className="mt-2"><LinkConfidenceBadge confidence={edgeDetail.confidence} /></div>
              {edgeDetail.evidenceText && (
                <div className="mt-2 rounded-lg border-r-4 border-teal-500 bg-teal-50/50 p-3 text-xs leading-relaxed">
                  <b>توضیح و شواهد:</b> {edgeDetail.evidenceText}
                </div>
              )}
              {edgeEvidence.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-1"><Info className="h-3.5 w-3.5" /> رکوردهای شاهد</div>
                  {edgeEvidence.map((ev) => (
                    <div key={ev.id} className="rounded-md bg-muted/60 p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="ltr-inline text-[10px] text-muted-foreground">{ev.sourceMethod}</span>
                        <span className="text-[10px] text-muted-foreground">{faDate(ev.collectedAt)}</span>
                        {ev.isSimulated && <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-300">شبیه‌سازی</Badge>}
                      </div>
                      <pre className="code-panel whitespace-pre-wrap">{ev.content}</pre>
                    </div>
                  ))}
                </div>
              )}
              {edgeDetail.confidence !== "verified" && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => confirmEdge(edgeDetail.id, "confirm")}>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> تأیید مستند توسط من
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => confirmEdge(edgeDetail.id, "reject")}>
                    <XCircle className="h-4 w-4 text-rose-600" /> این اتصال اشتباه است
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
