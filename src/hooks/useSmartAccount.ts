"use client";

// Resolves the user's smart-account (ERC-4337) address — the address that
// actually holds funds and executes invests, NOT the Privy EOA owner.
// This is the address we show, fund, and read balances for.
//
// The address is derived once per owner and cached in react-query (it never
// changes for a given owner), so every screen after the first gets it
// synchronously. Deriving it per component made each screen mount with
// address = null, which disabled the balance/activity queries and flashed
// "$0.00" / "Nothing yet" until the derivation finished.
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSmartAccountClient } from "@/lib/aa";
import { asViemProvider } from "@/lib/provider";
import { useDemo } from "@/components/demo/DemoProvider";
import { useActiveWallet } from "@/hooks/useActiveWallet";

export function useSmartAccount() {
  const demo = useDemo();
  const wallet = useActiveWallet();

  // Privy's useWallets() hands back a fresh wallet object on many internal
  // updates; key the derivation on the STABLE owner address and read the latest
  // wallet object through a ref.
  const ownerAddress = wallet?.address;
  const walletRef = useRef(wallet);
  useEffect(() => {
    walletRef.current = wallet;
  });

  const query = useQuery({
    queryKey: ["smart-account", ownerAddress],
    enabled: !demo && Boolean(ownerAddress),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
    queryFn: async () => {
      const w = walletRef.current;
      if (!w) throw new Error("No account found. Please sign in again.");
      const provider = asViemProvider(await w.getEthereumProvider());
      const { account } = await getSmartAccountClient(provider);
      return account.address as `0x${string}`;
    },
  });

  if (demo) return { address: demo.address, loading: false, error: null };
  return {
    address: query.data ?? null,
    // Loading until the address is known (incl. while Privy hands us the wallet),
    // so screens show a skeleton instead of an empty "$0.00" state.
    loading: !query.data && !query.error,
    error: query.error ? (query.error instanceof Error ? query.error.message : "Couldn't load your account.") : null,
  };
}
