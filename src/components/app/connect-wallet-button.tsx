"use client";

/**
 * The wallet button in the top bar.
 *
 * Three states, because a swap flow has three:
 *   - no wallet   -> "Connect Wallet", opens Privy's login modal
 *   - connected   -> the short address, opens a panel with disconnect + a
 *                    shortcut to fund the account
 *   - nothing yet -> disabled-looking during Privy's own hydration so we never
 *                    flash "Connect Wallet" at someone who is already logged in
 *
 * Privy is optional (it renders children without an app id), so `ready` guards
 * against acting before the client is up.
 */
import { useState, useRef, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Wallet, ChevronDown, LogOut, Copy, Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

export function ConnectWalletButton({ compact = false }: { compact?: boolean }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const address = wallets.find((w) => w.walletClientType === "privy")?.address ?? wallets[0]?.address;

  const size = compact ? "h-8 text-xs" : "h-9 text-sm";

  if (!ready) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex w-[132px] items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 font-semibold opacity-40",
          size,
        )}
      >
        <Wallet className="h-4 w-4" />
      </span>
    );
  }

  if (!authenticated || !address) {
    return (
      <button
        type="button"
        onClick={() => login()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground shadow-[0_0_16px_rgba(0,255,30,0.25)] transition-all hover:bg-primary/90 active:scale-95",
          compact ? "px-3" : "px-4",
          size,
        )}
      >
        <Wallet className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        Connect Wallet
      </button>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 font-mono font-semibold transition-all hover:border-primary/40 hover:bg-white/[0.07]",
          size,
        )}
      >
        <span className="h-2 w-2 rounded-full bg-success" />
        {short(address)}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open ? (
        <div
          role="menu"
          className="home-glass absolute right-0 top-full z-50 mt-1.5 w-[220px] rounded-xl p-1.5"
          style={{ position: "absolute" }}
        >
          <div className="border-b border-white/10 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Connected</p>
            <p className="truncate font-mono text-[11px]">{address}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy address"}
          </button>
          <Link
            href="/fund"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <Wallet className="h-3.5 w-3.5" />
            Deposit funds
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-danger transition-colors hover:bg-danger/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
