// A normalized wallet transaction (in or out), shared by the /api/transactions
// route and the UI. Direction is relative to the user's wallet. Built from Stax's
// own transaction log (lib/server/txLog.ts); `hash` links to the block explorer.
export type WalletTxKind = "invest" | "autopilot" | "buy" | "sell" | "send" | "receive" | "other";

export interface WalletTx {
  hash: `0x${string}`;
  direction: "in" | "out";
  /** What the user did, when known (rows from the Stax tx log always set it). */
  kind?: WalletTxKind;
  /** Human title for app actions, e.g. "Bought Apple". Falls back to Sent/Received {symbol}. */
  label?: string;
  /** Symbol whose logo represents the row (e.g. the stock bought), if not `symbol`. */
  logo?: string;
  /** Our registry symbol when known (USDC, AAPL…), else the on-chain asset symbol. */
  symbol: string;
  /** Human amount of the asset moved. */
  amount: number;
  /** The other party (recipient if out, sender if in); "" for app actions. */
  counterparty: string;
  /** Token contract address ("" for native BNB or app actions). */
  tokenAddress: string;
  blockNumber: number;
  /** Unix seconds, when resolvable. */
  timestamp?: number;
}
