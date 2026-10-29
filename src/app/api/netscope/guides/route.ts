// NetScope — API راهنماها (سند بخش ۳)

import { json, err } from "@/lib/netscope/api-helpers";
import { GUIDES } from "@/lib/netscope/guides";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const guideKey = searchParams.get("key");
  if (guideKey) {
    const guide = GUIDES.find((g) => g.guideKey === guideKey);
    if (!guide) return err("راهنما یافت نشد", 404);
    return json({ guide });
  }
  return json({
    guides: GUIDES.map((g) => ({
      guideKey: g.guideKey, title: g.title, category: g.category,
      targetInfo: g.targetInfo, autoPossible: g.autoPossible,
      vendor: g.vendor || null, warning: g.warning || null,
      platforms: g.platforms.map((p) => p.platform),
    })),
  });
}
