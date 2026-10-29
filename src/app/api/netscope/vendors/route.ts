// NetScope — فاز ۲: API فهرست راهنماهای سازندگان (پلاگین‌محور — سند ۳.۳)

import { json } from "@/lib/netscope/api-helpers";
import { VENDOR_GUIDES } from "@/lib/netscope/vendors";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ vendors: VENDOR_GUIDES });
}
