// GET /api/vera-record[?user=0x…] — Vera's track record (global, or scoped to one
// user) from Stax's own transaction log, plus her IdentityRegistry reputation.
// Every recorded plan carries its tx hash, so each one is checkable on the
// explorer. Public, no auth — rate limited per IP.
import type { NextRequest } from "next/server";
import { isAddress } from "viem";
import { veraRecordFromLog } from "@/lib/server/txLog";
import { getReputationServer } from "@/lib/server/reputation";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { badRequest, tooManyRequests, serverError } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = rateLimit(`vera-record:${clientIp(req)}`, 30, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const user = req.nextUrl.searchParams.get("user");
  if (user && !isAddress(user)) return badRequest("user must be a valid address.");

  try {
    const [record, reputation] = await Promise.all([veraRecordFromLog(user ?? undefined), getReputationServer()]);
    return Response.json(
      {
        record: {
          ...record,
          recentRecommendations: record.recentRecommendations.map((r) => ({
            ...r,
            blockNumber: Number(r.blockNumber), // bigint -> JSON-safe
          })),
        },
        reputation: reputation === null ? null : reputation.toString(),
      },
      { headers: { "Cache-Control": user ? "no-store" : "public, s-maxage=15, stale-while-revalidate=60" } },
    );
  } catch (err) {
    return serverError("vera-record", err);
  }
}
