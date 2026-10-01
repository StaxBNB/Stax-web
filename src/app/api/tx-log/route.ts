// POST /api/tx-log { txHash } — record a transaction the app just sent into
// Stax's own transaction log. The trigger lives in lib/aa.ts (every sponsored
// UserOp). Only the hash is accepted: lib/server/txLog.ts re-derives every field
// from the on-chain receipt, so a caller can't log anything the chain didn't do.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { recordTx } from "@/lib/server/txLog";
import { verifyRequest } from "@/lib/server/privyAuth";
import { rateLimit } from "@/lib/server/rateLimit";
import { unauthorized, badRequest, tooManyRequests, serverError } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

const Body = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid tx hash.") });

export async function POST(req: NextRequest) {
  // Signed-in users only, rate limited: each call costs RPC reads + a DB write.
  const user = await verifyRequest(req);
  if (!user) return unauthorized();
  const limit = rateLimit(`tx-log:${user.userId}`, 60, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return badRequest("Invalid request body.");
  }

  try {
    const rows = await recordTx(body.txHash as `0x${string}`);
    return Response.json({ recorded: rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return serverError("tx-log", err);
  }
}
