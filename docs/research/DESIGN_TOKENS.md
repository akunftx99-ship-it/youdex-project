# YouDex Design Tokens (extracted from https://www.youdex.app)

## Fonts (Google Fonts)
- **Body/UI:** `DM Sans` (400,500,600,700) — `--font-sans`
- **Headings:** `Space Grotesk` (400,500,600,700) — `--font-heading`
- **Mono:** `JetBrains Mono` (400,500,700) — `--font-mono`

Load: `https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap`

## Color tokens (dark theme — site is dark-only)
```
--radius: .5rem;
--shell:               #0b0d10;
--background:          #121417;
--foreground:          #f8fafc;
--card:                #181b20;
--card-foreground:     #f8fafc;
--elevated:            #23272e;
--popover:             #181b20;
--popover-foreground:  #f8fafc;
--primary:             #00ff1e;   /* NEON GREEN */
--primary-foreground:  #121417;
--primary-hover:       #00cc18;
--primary-glow:        #00ff1e61;
--accent:              #2c313a;
--accent-foreground:   #f8fafc;
--secondary:           #23272e;
--secondary-foreground:#f8fafc;
--muted:               #23272e;
--muted-foreground:    #7588a3;
--success:             #00ff1e;
--danger:              #ef4444;
--destructive:         #ef4444;
--warning:             #e7b008;
--border:              #282c34;
--input:               #282c34;
--ring:                #00ff1e;
--chart-1: #00ff1e; --chart-2: #5865f2; --chart-3: #ef4444; --chart-4: #e7b008; --chart-5: #00cc18;
--sidebar: #181b20; --sidebar-primary: #00ff1e; --sidebar-accent: #23272e; --sidebar-border: #282c34;
```

## Type scale (computed)
- h1 page: 44px/50.6 Space Grotesk 700, tracking -1.1px (hero)
- h1 card: 30px Space Grotesk 700, tracking -0.75px
- h2 section: 24px/32 Space Grotesk 600, tracking -0.6px
- h2 aside hero: 36px/45 Space Grotesk 700, tracking -0.9px
- body: 14px DM Sans; muted = #7588a3
- small/label: 12px DM Sans 500
- badge: 10px, uppercase, tracking-widest (0.1em)

## Layout
- Global page max-width: `1200px` (`max-w-[1200px] mx-auto px-4 sm:px-6`)
- Auth split: aside `hidden lg:flex lg:w-[44%] xl:w-[42%]`, main flex-1; aside padding `p-10 xl:p-14`; border-r border-border
- Auth card: `w-full max-w-[420px] home-glass p-6 sm:p-8 rounded-2xl shadow-xl`
- Input: h48, radius 12px, padding `4px 12px 4px 40px` (icon left at 40px), font 14px
- Button primary: h-12 (48px), rounded-full, bg #00ff1e, color #121417, 14px/600

## Glass system (`.home-glass*`) — copy verbatim from styles.css
```
.home-glass{backdrop-filter:blur(18px) saturate(180%) brightness(1.04);
  background:linear-gradient(158deg,#ffffff14,#ffffff08 40%,#fff0),#1014186b;
  border:1px solid #ffffff1f; overflow:hidden;
  box-shadow:inset 0 1px #ffffff29,inset 0 -1px #0000004d,0 8px 32px -4px rgba(0,0,0,.6)}
.home-glass:before{content:"";position:absolute;top:-1px;left:-5%;width:110%;height:45%;
  background:radial-gradient(80% 60% at 50% 0,#ffffff24,#ffffff0d 40%,#ffffff03,#0000);pointer-events:none;z-index:1}
.home-glass:hover{background:linear-gradient(158deg,#ffffff1f,#ffffff0a 40%,#fff0),#14181e85;border-color:#ffffff2e}
.home-glass-nav{backdrop-filter:blur(18px) saturate(180%) brightness(1.05);
  background:linear-gradient(158deg,#ffffff24,#ffffff0d,#ffffff03),#0e121661;
  border:1px solid #ffffff29;border-radius:9999px;overflow:hidden;
  box-shadow:inset 0 1px #fff3,inset 0 -1px #0000004d,0 8px 32px -4px rgba(0,0,0,.6)}
.home-glass-nav:before{...radial-gradient(90% 55% at 50% 0,#ffffff2e,...)}
.home-glass-lite{backdrop-filter:blur(20px) saturate(160%) brightness(1.05);
  background:linear-gradient(158deg,#ffffff12,#ffffff05 60%,#0000),#14181c61;
  border:1px solid #ffffff1a;overflow:hidden;
  box-shadow:inset 0 1px #ffffff2e,inset 0 -1px #0003,0 4px 12px -2px #00000059}
.home-glass-pill{...} .home-glass-row{...} .home-glass-interactive{...}
```

## Loader (brand mark)
```
.youdex-loader-diamond / .youdex-boot-diamond{
  background:#141c18f0;border:1px solid #00ff1e33;border-radius:1.15rem;
  width:4rem;height:4rem;display:grid;place-items:center;position:relative;transform:rotate(45deg);
  box-shadow:inset 0 1px #ffffff0d,0 10px 28px #00000042}
bars container: transform:rotate(-45deg);display:flex;align-items:flex-end;gap:5px;height:1.75rem
.youdex-loader-bar{background:var(--primary);width:5px;border-radius:9999px;transform-origin:bottom;
  animation:.85s cubic-bezier(.45,0,.55,1) infinite youdex-loader-bar}
@keyframes youdex-loader-bar{0%,to{opacity:.45;transform:scaleY(.42)}50%{opacity:1;transform:scaleY(1)}}
label: 11px, 600, uppercase, letter-spacing .06em, color #94a3b8e6
heights: 10px / 18px / 14px / 10px with 0s/.13s/.26s/.39s delays
```

## Brand assets
- `/logo.svg` (1296x551, green #00ff1e K + wordmark "iedex")
- `/logo-mark.svg` (401x551, K mark only)

## Global decorative filters (from index.html body, copy verbatim)
SVG defs with `#liquid-glass-filter` and `#liquid-glass-pill-filter` (feTurbulence/feDisplacementMap/feSpecularLighting).
Used by `.liquid-glass` classes for pill/glass surfaces.
