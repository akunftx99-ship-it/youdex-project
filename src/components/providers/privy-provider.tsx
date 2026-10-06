"use client";

import { PrivyProvider } from "@privy-io/react-auth";

/**
 * Privy needs a client identifier, and only that. `NEXT_PUBLIC_PRIVY_APP_ID` is
 * inlined into the browser bundle by design; the matching app secret lives in
 * `.env.local` without the NEXT_PUBLIC_ prefix so it stays server-side.
 * Never add the secret to this provider.
 */
export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    // Render children anyway so a missing key cannot blank the whole app.
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#00ff1e",
          logo: undefined,
          walletChainType: "ethereum-only",
        },
        loginMethods: ["email", "google", "wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
