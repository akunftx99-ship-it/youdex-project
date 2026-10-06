# Page Topology — youdex.app

## Purpose of this clone
Auth/onboarding surface. **In scope:** login, signup, forgot-password (+ `/app` redirecting to login).
**Explicitly OUT of scope (do NOT build):** airdrop, tasks, quiz, leaderboard, community.
**Stubbed (visible in nav but not clickable):** futures, staking, rewards.

## Routes to build
| Route | File | Notes |
|---|---|---|
| `/` | `src/app/page.tsx` | redirect → `/login` (auth-only clone) |
| `/login` | `src/app/login/page.tsx` | email+password, forgot link, Google, signup link |
| `/signup` | `src/app/signup/page.tsx` | username, email, password, confirm |
| `/forgot-password` | `src/app/forgot-password/page.tsx` | email reset form |
| `/app` | `src/app/app/page.tsx` | redirect → `/login` |

## Auth shell anatomy (shared by login/signup/forgot-password)
```
<div class="min-h-screen flex bg-background">          ← lg+ split
  <aside class="hidden lg:flex lg:w-[44%] xl:w-[42%] relative flex-col justify-between p-10 xl:p-14 border-r border-border overflow-hidden">
      gradient / glow / hairline decor divs (absolute)
      logo (h-9)
      middle: badge(Mainnet) + h2 + p + 4 feature rows
      bottom: "Explore the platform" pill
  </aside>
  <main class="flex-1 flex flex-col min-h-screen">
      <header class="lg:hidden sticky top-0 z-10 h-14 ...">  ← mobile only
      <div class="flex-1 flex items-center justify-center px-4 sm:px-8 py-10 sm:py-14">
         <div class="w-full max-w-[420px] home-glass p-6 sm:p-8 rounded-2xl shadow-xl"> FORM </div>
      </div>
  </main>
</div>
```

## Login card content (verbatim)
- h1 "Welcome back" (30px Space Grotesk 700)
- p "Sign in to your YouDex account" (14px #7588a3)
- label "Email" + input placeholder `you@example.com` (mail icon)
- label "Password" + input placeholder `Enter your password` (lock icon) + eye toggle
- link "Forgot password?" (right-aligned, primary)
- Turnstile widget (white box, checkbox "Verify you are human")
- button "Sign in" (disabled until email+password+turnstile)
- divider "OR"
- button "Continue with Google"
- p "New to YouDex? Create account"

## Signup card content (verbatim)
- h1 "Create your account"
- p "Start your crypto journey with YouDex"
- label "Username" placeholder `Choose a username` (user icon)
- label "Email" placeholder `you@gmail.com` + helper "Use your main Gmail address. Aliases are not allowed."
- label "Password" placeholder `Minimum 8 characters` + eye
- label "Confirm password" placeholder `Re-enter your password` + eye
- Turnstile
- button "Create account" (disabled until valid)
- divider "OR" + "Continue with Google"
- p "Already have an account? Sign in"

## Aside (left panel) content (verbatim)
- badge: ⚡ **Mainnet**
- h2 (36px): "Trade Smarter." + line-break + primary "Grow with YouDex."
- p: "Built for speed, security, and simplicity. Trade confidently with professional tools designed for every trader."
- 4 rows (icon tile h-8 w-8 rounded-lg home-glass-lite + lucide icon text-primary):
  - trending-up → "Spot & Futures Trading"
  - arrow-left-right → "Fast Deposits & Transfers"
  - shield → "Enterprise-Grade Security"
  - brain → "AI-Powered Trading Assistant"
- bottom: pill link "Explore the platform →"

## Locked destinations (must render, must NOT navigate)
`/futures`, `/staking`, `/rewards` — rendered as nav items with a disabled/locked state
(`cursor-not-allowed`, reduced opacity, `aria-disabled="true"`, no href, `title="Coming soon"`).
Handled by `LockedNavLink` in `src/components/auth/auth-shell.tsx`.
