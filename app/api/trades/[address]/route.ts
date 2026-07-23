import { NextResponse } from "next/server";
import { getTrades, isLaunchpadConfigured } from "@/lib/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { address: string } }) {
  if (!isLaunchpadConfigured) {
    return NextResponse.json({ trades: [], configured: false });
  }
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  try {
    const trades = await getTrades(params.address, limit);
    return NextResponse.json(
      { trades, configured: true },
      { headers: { "Cache-Control": "s-maxage=3, stale-while-revalidate=10" } }
    );
  } catch (err) {
    console.error("GET /api/trades failed", err);
    return NextResponse.json({ trades: [], error: "rpc_error" }, { status: 502 });
  }
}
