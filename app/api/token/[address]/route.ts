import { NextResponse } from "next/server";
import { getTokenSummary, isLaunchpadConfigured } from "@/lib/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { address: string } }) {
  if (!isLaunchpadConfigured) {
    return NextResponse.json({ token: null, configured: false });
  }
  try {
    const token = await getTokenSummary(params.address);
    if (!token) {
      return NextResponse.json({ token: null, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(
      { token, configured: true },
      { headers: { "Cache-Control": "s-maxage=3, stale-while-revalidate=10" } }
    );
  } catch (err) {
    console.error("GET /api/token failed", err);
    return NextResponse.json({ token: null, error: "rpc_error" }, { status: 502 });
  }
}
