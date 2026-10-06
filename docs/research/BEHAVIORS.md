# Behaviors

## Global
- Site is dark-only. No theme toggle.
- Boot splash overlay (`#youdex-boot-splash`) shown while app loads; a full-screen page loader (`youdex-page-loader-bg`) appears on route changes. Bars animate with `youdex-loader-bar` keyframe (.85s cubic-bezier(.45,0,.55,1) infinite), 4 bars heights 10/18/14/10px, delays 0/.13/.26/.39s.
- No Lenis / smooth-scroll library detected.
- Notifications region `<section aria-label="Notifications alt+T">` mounted globally (toast host).

## Marketing header (`/`, `/about`, legal pages)
- `header` = `fixed inset-x-0 top-0 z-50 pt-4 sm:pt-5 pointer-events-none`
- Inner wrap: `max-w-[1200px] mx-auto px-4 sm:px-6 relative flex items-center justify-between gap-3 pointer-events-auto`
- Logo left (h-9), center nav is an absolutely-centered **pill floating nav** (`home-glass-nav`, rounded-full, height 42px, padding 4px 6px, gap 0.5, backdrop blur 18px), right: Login (ghost, h-36, px-16) + Sign Up (bg #00ff1e, h-36, px-24, rounded-full).
- Nav links: Services #services, Markets #live-market, Whitepaper #whitepaper, Roadmap #roadmap, Blog #blog, FAQ #faq — 14px/600, color #7588a3, padding 6px 14px, rounded-full. Center nav hidden below xl.
- Header has NO scroll-triggered state change (stays fixed, transparent).

## Auth pages (`/login`, `/signup`, `/forgot-password`, `/app`)
- Layout: `lg:flex` split. Left `aside hidden lg:flex lg:w-[44%] xl:w-[42%] justify-between p-10 xl:p-14 border-r border-border overflow-hidden`
  - `div.absolute.inset-0.bg-gradient-to-br.from-primary/10.via-background.to-background`
  - glow: `absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl`
  - bottom hairline: `absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent`
  - Content: logo (h-9) top; middle block = badge + h2 + p + 4 feature rows; bottom = "Explore the platform →" pill (`home-glass` h-10 px-5 rounded-full)
- Right panel: `flex-1 flex items-center justify-center px-4 sm:px-8 py-10 sm:py-14`
- Mobile header on auth: `lg:hidden sticky top-0 z-10 h-14 px-4 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-md`

## Home page scroll behaviors
- Sections use scroll-reveal (opacity/translate) via IntersectionObserver-like entrance.
- "Why choose YouDex?" = scroll-driven step switcher `01 / 06` (auto-advances as you scroll through the section).
- "Our ecosystem" = horizontal carousel with Previous/Next buttons; 8 cards (Exchange / Staking / Wallet / KDX Token / Rewards / AI / Fund Transfer / API), duplicated for infinite loop, plus "Go to X" buttons.
- "How to get started" = step accordion 01-04 with an embedded signup mockup preview; buttons "Step 1..4".
- "Live market" = live ticker table (BTC/ETH/BNB/SOL/LTC/DOGE/TRX/SHIB) with sparkline column, 24h volume, live price, 24h change; 4 KPI cards (Global market cap / 24h volume / Altcoin index / Fear & greed) + market dominance bars (BTC/ETH/Alts).
- "Our partners" = infinite marquee rows of wordmarks (BASE, Marqel Capital, Kong, TradingView, Cloudflare, Elliptic, Fireblocks, Arbitrum, Optimism, TPC).
- "Latest blog" = dynamically loaded cards (client fetch) with "View all" → /blog.
- Whitepaper = tilted 3D book/cover card linking to /whitepaper.
