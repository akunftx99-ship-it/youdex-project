import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftRight,
  Bell,
  ChartColumnBig,
  CircleHelp,
  Crown,
  Home,
  Layers,
  Lock,
  Send,
  Target,
  TrendingUp,
  User,
  Users,
  Wallet,
  Zap,
  Gift,
  ListTodo,
  BrainCircuit,
} from "lucide-react";
import { formatArcPrice } from "@/components/app/arc-market-table";
import { TokenSearch } from "@/components/app/token-search";
import { ConnectWalletButton } from "@/components/app/connect-wallet-button";
import { ARC_HOT, ARC_TOP_VOLUME, type ArcToken } from "@/lib/arc-data";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Nav model
--------------------------------------------------------------------------- */

export type NavItem = {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: "hot";
  /** Present but intentionally not navigable yet. */
  locked?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

/**
 * Sidebar nav. Entries from the reference site that are out of scope
 * (Airdrop / Tasks / Quiz / Leaderboard / Referral) are deliberately absent.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Trading",
    items: [
      { label: "Dashboard", href: "/app", icon: Home },
      { label: "Markets", href: "/markets", icon: ChartColumnBig },
      { label: "Spot", href: "/trade", icon: ArrowLeftRight },
      { label: "Futures", icon: TrendingUp, locked: true },
      { label: "Fund", href: "/fund", icon: Wallet },
    ],
  },
  {
    label: "Earn",
    items: [
      { label: "Staking", icon: Layers, badge: "hot", locked: true },
      { label: "Rewards", icon: Gift, badge: "hot", locked: true },
      { label: "Agent Trade", icon: BrainCircuit, locked: true },
    ],
  },
];

/* ---------------------------------------------------------------------------
   Atoms
--------------------------------------------------------------------------- */

export function BrandRow() {
  return (
    <div className="relative z-10 flex h-[64px] shrink-0 items-center border-b border-white/10 px-6">
      <Link href="/app" className="flex items-center transition-transform active:scale-95">
        {/*
          Raster wordmark with the source JPEG's dark plate cut out (alpha from
          luminance), so it sits on the shell's glass sidebar without a box.
        */}
        <Image
          src="/brand/logo.png"
          alt="YouDex"
          width={880}
          height={173}
          priority
          className="h-[32px] w-auto"
        />
      </Link>
    </div>
  );
}

function HotBadge() {
  return (
    <span className="ml-auto rounded-full border border-danger/25 bg-danger/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-danger">
      Hot
    </span>
  );
}

const ITEM_BASE =
  "group relative flex h-9 items-center gap-3 rounded-xl px-3 text-sm transition-all duration-200";

export function NavLink({ item, active }: { item: NavItem; active?: boolean }) {
  const Icon = item.icon;

  // Postponed destinations: present, visibly locked, cannot be clicked.
  if (item.locked) {
    return (
      <span
        role="link"
        aria-disabled="true"
        tabIndex={-1}
        title="Coming soon"
        className={cn(
          ITEM_BASE,
          "my-0.5 cursor-not-allowed border border-transparent text-muted-foreground opacity-45",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.label}</span>
        <Lock className="ml-auto h-3 w-3 shrink-0" aria-hidden="true" />
      </span>
    );
  }

  return (
    <Link
      href={item.href ?? "#"}
      aria-current={active ? "page" : undefined}
      data-status={active ? "active" : undefined}
      className={cn(
        ITEM_BASE,
        "my-0.5 border",
        active
          ? "border-primary/35 bg-primary/15 font-semibold text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_12px_rgba(74,222,128,0.18)]"
          : "border-transparent font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
      )}
    >
      {active ? (
        <span className="absolute left-1 h-4 w-1 rounded-full bg-primary shadow-[0_0_8px_rgba(74,222,128,0.9)]" />
      ) : null}
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
          active && "text-primary",
        )}
      />
      <span className="truncate">{item.label}</span>
      {item.badge === "hot" && !active ? <HotBadge /> : null}
    </Link>
  );
}

/** Out-of-scope entries kept only as inert labels (never rendered in the sidebar). */
export const OUT_OF_SCOPE_ICONS = { Target, ListTodo, BrainCircuit, Crown, Users, Send };

function MiniTicker() {
  // Top two ARC pairs by 24h volume, straight from the DexScreener snapshot.
  const rows = ARC_HOT.slice(0, 2).map((t) => ({
    pair: t.pair,
    price: formatArcPrice(t.price),
    change: t.change.h24,
  }));
  return (
    <div className="mx-1 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      {rows.map((row) => (
        <div key={`${row.pair}-${row.price}`} className="flex items-center justify-between py-1">
          <span className="text-[11px] font-medium text-muted-foreground">{row.pair}</span>
          <span className="font-mono text-[11px] font-semibold text-foreground">{row.price}</span>
          <span
            className={cn(
              "font-mono text-[10px] font-semibold",
              row.change >= 0 ? "text-primary" : "text-danger",
            )}
          >
            {row.change >= 0 ? "+" : ""}
            {row.change.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function Sidebar({ current }: { current: string }) {
  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 hidden w-[240px] flex-col overflow-hidden border-r border-white/10 bg-[#090d14]/95 shadow-[4px_0_24px_rgba(0,0,0,0.4)] backdrop-blur-2xl lg:flex xl:w-[260px]">
      <BrandRow />

      <div className="no-scrollbar relative z-10 flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-[#4a5568]">
              {group.label}
            </p>
            <div className="space-y-[1px]">
              {group.items.map((item) => (
                <NavLink key={item.label} item={item} active={item.href === current} />
              ))}
            </div>
          </div>
        ))}

        <div className="mt-2 shrink-0">
          <MiniTicker />
        </div>
      </div>

      <div className="relative z-10 border-t border-white/10 p-3">
        <Link
          href="/app"
          className={cn(ITEM_BASE, "border border-transparent font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground")}
        >
          <Bell className="h-4 w-4 shrink-0" />
          <span className="truncate">Notifications</span>
          <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            1
          </span>
        </Link>
        <span
          role="link"
          aria-disabled="true"
          title="Coming soon"
          className={cn(ITEM_BASE, "cursor-not-allowed border border-transparent text-muted-foreground opacity-45")}
        >
          <CircleHelp className="h-4 w-4 shrink-0" />
          <span className="truncate">Support</span>
        </span>
        <span
          role="link"
          aria-disabled="true"
          title="Coming soon"
          className={cn(ITEM_BASE, "cursor-not-allowed border border-transparent text-muted-foreground opacity-45")}
        >
          <User className="h-4 w-4 shrink-0" />
          <span className="truncate">Profile</span>
        </span>
      </div>
    </aside>
  );
}

export function TopBar({
  title,
  ticker = ARC_TOP_VOLUME[0],
}: {
  title: string;
  /** ARC token shown in the header ticker; defaults to the top-volume pair. */
  ticker?: ArcToken;
}) {
  const livePrice = formatArcPrice(ticker.price);
  const liveChange = ticker.change.h24;
  return (
    <header className="fixed left-[240px] right-0 top-0 z-30 hidden h-[64px] shrink-0 items-center gap-4 border-b border-white/10 bg-[#090d14]/80 px-8 backdrop-blur-2xl lg:flex xl:left-[260px]">
      <div className="flex shrink-0 items-center gap-3">
        <h1 className="font-heading text-base font-bold tracking-tight text-foreground">{title}</h1>
        <span className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <span className="font-mono text-xs text-muted-foreground">{ticker.pair}</span>
          <span className="font-mono text-xs font-semibold text-foreground">{livePrice}</span>
          <span
            className={cn(
              "font-mono text-[11px] font-semibold",
              liveChange >= 0 ? "text-primary" : "text-danger",
            )}
          >
            {liveChange >= 0 ? "+" : ""}
            {liveChange.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="flex-1" />

      <TokenSearch />

      <ConnectWalletButton />

      <Link
        href="/app"
        aria-label="1 unread notification"
        className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] transition-all hover:border-primary/40 hover:bg-white/[0.07]"
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          1
        </span>
      </Link>

      <span
        role="button"
        aria-disabled="true"
        title="Coming soon"
        className="grid h-9 w-9 cursor-not-allowed place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-muted-foreground opacity-60"
      >
        <User className="h-4 w-4" />
      </span>
    </header>
  );
}

/** Shell wrapper: sidebar + top bar + scrollable content region. */
export function AppShell({
  current,
  title,
  children,
}: {
  current: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar current={current} />
      <TopBar title={title} />
      {/*
        `overflow-x-clip`, not `overflow-x-hidden`: a `hidden` on one axis makes
        the browser compute the other axis as `auto`, which turned this <main>
        into a scroll container. Combined with `overscroll-y-contain` that
        swallowed every wheel event, so the page would not scroll with a mouse.
        `clip` trims horizontal overflow without creating a scroll container.
      */}
      <main className="min-h-screen overflow-x-clip pb-16 lg:pb-0 lg:pl-[240px] lg:pt-[64px] xl:pl-[260px]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-heading text-sm font-bold tracking-tight">{title}</span>
          </div>
          <ConnectWalletButton compact />
        </div>
        {children}
      </main>
    </div>
  );
}
