import { NextResponse } from "next/server";
import { listTokenSummaries, isLaunchpadConfigured } from "@/lib/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  if (!isLaunchpadConfigured) {
    return NextResponse.json({ tokens: [], configured: false });
  }
  const { searchParams } = new URL(req.url);
  const offset = BigInt(searchParams.get("offset") ?? "0");
  const limit = BigInt(Math.min(Number(searchParams.get("limit") ?? "60"), 100));
  try {
    const tokens = await listTokenSummaries(offset, limit);
    return NextResponse.json(
      { tokens, configured: true },
      { headers: { "Cache-Control": "s-maxage=5, stale-while-revalidate=15" } }
    );
  } catch (err) {
    console.error("GET /api/tokens failed", err);
    return NextResponse.json({ tokens: [], configured: true, error: "rpc_error" }, { status: 502 });
  }
}
