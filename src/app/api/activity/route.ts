// GET /api/activity?address=0x… — a user's Stax plan activity (AI invests and
// Autopilot runs), newest first, from Stax's own transaction log. Public chain
// facts, no auth — rate limited per IP.
import type { NextRequest } from "next/server";
import { isAddress } from "viem";
import { activityFromLog } from "@/lib/server/txLog";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { badRequest, tooManyRequests, serverError } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = rateLimit(`activity:${clientIp(req)}`, 30, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(address)) return badRequest("A valid wallet address is required.");

  try {
    const activity = await activityFromLog(address);
    return Response.json(
      { activity: activity.map((a) => ({ ...a, blockNumber: Number(a.blockNumber) })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return serverError("activity", err);
  }
}
