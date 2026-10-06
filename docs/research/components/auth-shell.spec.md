# AuthShell Specification

## Overview
- **Target file:** `src/components/auth/auth-shell.tsx` (exports `AuthShell`, `AuthAside`, `LOCKED_PAGES`, `LockedNavLink`)
- **Screenshots:** `docs/design-references/kiedex-login-desktop.png`, `kiedex-signup-desktop.png`
- **Interaction model:** static layout + form-level interactivity (client)

## DOM Structure
```
<div class="min-h-screen flex bg-background">          (lg+)
  <aside>  decor layers + logo + hero + features + cta
  <main class="flex-1 flex flex-col min-h-screen">
     <header class="lg:hidden ...">
     <div class="flex-1 flex items-center justify-center px-4 sm:px-8 py-10 sm:py-14">
        <div class="w-full max-w-[420px] home-glass p-6 sm:p-8 rounded-2xl shadow-xl">{children}</div>
     </div>
  </main>
</div>
```

## Computed Styles (exact)

### aside
- display: flex; flex-direction: column; justify-content: space-between
- width: 44% (lg) / 42% (xl); padding: 40px (lg) / 56px (xl → measured 56px)
- border-right: 1px solid #282c34; overflow: hidden
- hidden below lg (1024px)

### aside decor layers (exact, in order)
1. `absolute inset-0` → `background-image: linear-gradient(to bottom right, rgb(0 255 30 / 0.10), #121417 50%, #121417 100%)`
2. `absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl`
3. `absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent`

### logo
- `<img src="/brand/logo.svg" class="h-9 w-auto">` (36px tall)

### badge (Mainnet)
- font-size 10px; font-weight 600; text-transform uppercase; letter-spacing 0.1em
- color `var(--primary)`; background `rgb(0 255 30 / 0.10)`; border `1px solid rgb(0 255 30 / 0.20)`
- border-radius 9999px; padding 4px 12px; margin-bottom 20px
- leading lucide `Zap` at h-3 w-3

### hero h2
- font-family Space Grotesk; font-size 36px; line-height 45px; font-weight 700; letter-spacing -0.9px
- line 2 span: `color: var(--primary)`

### hero paragraph
- font-size 14px; line-height relaxed(1.625); color #7588a3; margin-top 16px; max-width `28rem`

### feature row
- `display:flex; align-items:center; gap:12px; font-size:14px; color:#7588a3` (stacked `space-y-3`)
- icon tile: `h-8 w-8 rounded-lg home-glass-lite flex items-center justify-center shrink-0`
- icon: lucide at `h-4 w-4 text-primary`

### bottom CTA "Explore the platform →"
- `inline-flex items-center gap-2 h-10 px-5 rounded-full home-glass text-sm font-medium text-foreground`
- hover: `hover:border-primary/40 hover:bg-primary/10 hover:text-primary`
- computed bg rgba(16,20,24,.42); border 1px solid rgba(255,255,255,.12)

### auth card
- `w-full max-w-[420px] home-glass p-6 sm:p-8 rounded-2xl shadow-xl`
- computed: bg rgba(16,20,24,.42), border 1px solid rgba(255,255,255,.12), radius 16px, padding 32px, width 420px

### mobile header
- `lg:hidden sticky top-0 z-10 h-14 px-4 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-md`
- shows logo-mark + "Home" link

## States & Behaviors
### Hover — glass surfaces
- `.home-glass:hover` → background lightens to `linear-gradient(158deg,#ffffff1f,#ffffff0a 40%,#fff0),#14181e85`, border-color `#ffffff2e`
- transition: `background .35s, box-shadow .35s, transform .3s cubic-bezier(.34,1.56,.64,1)`

### Locked nav (`LockedNavLink`)
- Renders `<span role="link" aria-disabled="true">` — no href, not focusable-by-tab order issues
- style: `opacity-45 cursor-not-allowed select-none`
- `title="Coming soon"`
- MUST NOT trigger `router.push` / anchor navigation

## Text Content (verbatim)
See PAGE_TOPOLOGY.md — Aside section.

## Responsive Behavior
- **Desktop (1440px):** split 42/58; aside full height, card centered in right pane
- **Tablet (1024px):** lg breakpoint → split active, aside 44%
- **Mobile (390px):** aside hidden entirely; mobile header (h-14, border-b, backdrop-blur) + form full width with `px-4 py-10`
- **Breakpoint:** 1024px (`lg`)
