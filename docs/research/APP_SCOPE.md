# Engagement Scope — YouDex (clone of youdex.app/app)

## Source
- Original: `https://www.youdex.app/app` (authenticated)
- Clone target: `/home/ubuntu/kiedex-clone`, port **3210**
- Brand rename: **YouDex → YouDex** (all user-visible strings, metadata, alt text, email addresses, social handle)

## IN SCOPE — build these
| Route | Page |
|---|---|
| `/login` | Sign in |
| `/signup` | Create account |
| `/forgot-password` | Reset password |
| `/app` | Dashboard |
| `/markets` | Markets (4 tabs: Favorites / Spot / Futures / Discover) |
| `/trade` | Spot trading terminal |
| `/fund` | Fund / assets overview |

## OUT OF SCOPE — do NOT build, do NOT link
Airdrop · Tasks · Quiz · Leaderboard · Community · **Referral**

## POSTPONED — visible in sidebar but NOT clickable
**Futures · Staking · Rewards**
- Rendered as locked nav items: `aria-disabled="true"`, `cursor-not-allowed`, reduced opacity, `title="Coming soon"`
- No href, no router navigation, no route files created

## Explicit exclusions
- **The ETH-staking promo banner on the Dashboard is NOT built** (owner decision — leave it out entirely).
- No ARC token data yet (deferred to a later step).

## Sidebar structure (original)
```
[logo] YouDex            [MAINNET pill]
TRADING
  Dashboard   /app        (house icon)
  Markets     /markets    (chart-column)
  Spot        /trade      (arrow-left-right)
  Futures     LOCKED      (trending-up)
  Fund        /fund       (wallet)
EARN
  Airdrop     OUT OF SCOPE (target)
  Staking     LOCKED (layers)   [+ Hot badge]
  Rewards     LOCKED            [+ Hot badge]
  Tasks       OUT OF SCOPE      [+ Hot badge]
  Quiz        OUT OF SCOPE      [+ Hot badge]
COMMUNITY
  Leaderboard OUT OF SCOPE (crown)
  Referral    OUT OF SCOPE (users)
[mini ticker card] BTC/USDT · ETH/USDT
Notifications (badge 1) · Support · Profile
```

## Sidebar chrome (exact, from live DOM)
- `aside`: `hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-[240px] xl:w-[260px] z-40 bg-[#090d14]/95 backdrop-blur-2xl border-r border-white/10 overflow-hidden shadow-[4px_0_24px_rgba(0,0,0,0.4)]`
- Brand row: `flex items-center justify-between px-6 h-[64px] border-b border-white/10 shrink-0 relative z-10`
  - logo `h-[28px] w-auto` (src `/logo.svg`)
  - Mainnet pill: `text-[9px] font-bold uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5 leading-none shadow-[0_0_8px_rgba(74,222,128,0.2)]`
- Nav scroll area: `relative flex-1 overflow-y-auto no-scrollbar py-4 flex flex-col gap-4 z-10 px-3`
- Group label: `mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-[#4a5568]`
- Nav item (idle): `group relative flex items-center gap-3 h-9 text-sm transition-all duration-200 rounded-xl px-3 my-0.5 text-muted-foreground font-medium hover:text-foreground hover:bg-white/[0.06] border border-transparent`
- Nav item (ACTIVE): `bg-primary/15 text-primary font-semibold border border-primary/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_12px_rgba(74,222,128,0.18)]` + left bar `absolute left-1 w-1 h-4 bg-primary rounded-full shadow-[0_0_8px_rgba(74,222,128,0.9)]`
- Icons: lucide `h-4 w-4 shrink-0`, `group-hover:scale-110` transition

## Header chrome (exact)
- `hidden lg:flex items-center gap-4 h-[64px] px-8 border-b border-white/10 bg-[#090d14]/80 backdrop-blur-2xl fixed top-0 left-[240px] xl:left-[260px] right-0 z-30 shrink-0`
- Left: page title `font-display font-bold text-base text-foreground tracking-tight`, divider `w-px h-4 bg-white/10`, live BTC pill: `flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-full px-3 py-1` with pulsing dot `h-1.5 w-1.5 rounded-full bg-primary animate-pulse`, mono values `text-xs font-mono`
- Right: search `h-9 w-60 rounded-xl px-3 bg-white/[0.04] border border-white/10` + `⌘K` chip `text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-mono`; Deposit `h-9 px-4 rounded-xl bg-primary text-primary-foreground font-semibold shadow-[0_0_16px_rgba(74,222,128,0.25)] active:scale-95`; bell `h-9 w-9 rounded-xl bg-white/[0.04] border border-white/10` with red badge; avatar button
- Main scroll container: `flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain lg:pb-0`

## Dashboard content (verbatim values at capture)
- TOTAL BALANCE — `100.00 USDT` (value white bold, unit muted), info icon
- Today's PNL — `++0.00$ (+0.00%)` (green outlined pill)
- Buttons: `+ Deposit` (green), `Withdraw` (outline)
- Airdrop Journey card: title + `Live` indicator; `0 KDX` big, sub "KDX earned · Season 2";
  three stat tiles: `Vol $0` · `Referrals 0` · `Trades 0`; link `Full Season Details`
- Market tabs: Favorites · Hot (active) · Top Gainers · Top Losers · New Listings
- Table columns: `# | PAIR | PRICE | 24H CHANGE | CHART | TRADE`
- Hot rows (captured): ADA 0.268500 +7.18% · ATOM 1.8360 +4.50% · PEPE 0.00000445 +3.73% ·
  ARB 0.209500 +2.65% · SUI 1.2285 +2.25% · DOT 1.2410 +2.56% · ZEC 1,347.59 +0.95% · ETH 2,713.97 +0.41%
- Footer link: `View all markets`

## Markets page
- Tabs (button-driven, not URL): `Favorites | Spot | Futures | Discover`
  - pill style: `relative flex-1 h-9 text-xs font-semibold rounded-full transition-colors z-10`
  - active: `text-foreground font-bold`; idle: `text-muted-foreground`
- Section heading: `Your Favorites` / `Spot Pairs` / `Discover Pairs`
- Table: same 6 columns, ACTION column has `Trade` (green outline button)
- Spot pairs (19, captured): BTC 85,830.59 / ETH 2,715.00 / BNB 788.0000 / SOL 120.5700 / XRP 1.5053 /
  DOGE 0.095780 / ADA 0.268700 / AVAX 10.9870 / LINK 13.9630 / DOT 1.2410 / MATIC 0.379400 /
  LTC 70.3000 / ATOM 1.8350 / TRX 0.336400 / SHIB 0.00000590 / PEPE 0.00000444 / SUI 1.2296 /
  ARB 0.209700 / ZEC 1,348.44
- Favorites: BTC / ETH / SOL / DOGE

## Spot terminal (/trade)
- Pair strip: `BTC/USDT` + `Spot ▾` pill, price + change, `24H VOL $1514.69M`, `AVBL 100.00 USDT`
- Chart toolbar timeframes: `Intraday 1m 1min Live 5m 15m 1H 4H 1D` (15m active)
- Indicator pills: `MA EMA BOLL VOL MACD RSI` (MA + VOL active)
- Order book: `Price (USDT) | Qty (BTC)`, asks red / bids green with depth bars, mid price row, precision dropdown `0.01`
- Order form: `Buy | Sell` toggle (Buy active green), `Limit Order ▾`, Price input with `−/+` + `BBO`,
  Quantity with `−/+` + unit selector, percent slider `0% 25% 50% 75% 100%`,
  `Total — USDT`, `Oil fee — / 50 Oil`, `Avbl 100.00 USDT`, submit `Buy BTC`
- Bottom tabs: `Holdings (0)` (active) | `Open Orders (0)`

## Fund page
- `Estimated Total Value` `100.00 USDT` + `≈ $100.00`, eye toggle to hide balance
- `Today's PNL  +0.00$ (+0.00%)` green
- Buttons: `Deposit` (green, arrow icon) · `Transfer` (dark, swap icon) · `Send` (dark, send icon)
- Sub-cards: `SPOT 100.00 USDT — Spot equity` · `FUTURES 0.00 USDT — Futures equity`
- Allocation: green dot + `Spot 100%`
- PNL panel: empty state text `No trade activity in 7D`, green baseline, `+$0.00 / 7D`,
  range toggles `7D` (active green) `30D` `90D`
- Assets table: `ASSET | AMOUNT | VALUE | ACTION`
  - `USDT` (Spot + Futures) · `100.00` · `$100.00` · `—`
  - `Oil` (Platform fees) · `50` · `—` · `Get more`
- Header button: `History` (clock icon)
