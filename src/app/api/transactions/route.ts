// GET /api/transactions?address=0x… — a wallet's transactions, newest first, from
// Stax's own transaction log (lib/server/txLog.ts). No explorer API: every row is
// re-derived from its on-chain receipt and carries the tx hash as proof. Public
// chain facts, so no auth — rate limited per IP.
import type { NextRequest } from "next/server";
import { isAddress } from "viem";
import { listWalletTx } from "@/lib/server/txLog";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { badRequest, tooManyRequests, serverError } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = rateLimit(`transactions:${clientIp(req)}`, 30, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(address)) return badRequest("A valid wallet address is required.");

  try {
    const transactions = await listWalletTx(address);
    // Not CDN-cached: a new trade must show up on the very next refetch.
    return Response.json({ transactions, source: "stax-log" }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return serverError("transactions", err);
  }
}
