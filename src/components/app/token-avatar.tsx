"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Token avatar.
 *
 * Tries the real logo DexScreener reports, then falls back to a deterministic
 * gradient badge generated from the token's address. DexScreener has no imagery
 * for most small ARC tokens — its own site renders a grey placeholder there — so
 * generating one keeps every row visually distinct instead of empty.
 */

/** FNV-1a over the address: stable across reloads, unique per token. */
function seedHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Monogram for the generated badge, 2–4 glyphs.
 *
 * Tickers up to 4 characters are shown whole (WETH, USDC, TIDE, SM) since that
 * is more useful than a truncation. Longer ones collapse to first-two + last-one
 * so near-identical names stay distinguishable — ARCMAN → ARN, ARCLIGHT → ART,
 * ASTOCK → ASK — instead of all becoming "ARC".
 */
export function tokenInitials(symbol: string): string {
  const s = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!s) return "??";
  if (s.length <= 4) return s;
  return s.slice(0, 2) + s.slice(-1);
}

/** Font size tuned so 2, 3 and 4 glyphs all fill the badge evenly. */
function initialFontSize(initials: string): number {
  if (initials.length <= 2) return 17;
  if (initials.length === 3) return 14;
  return 11.5;
}

export function TokenAvatar({
  symbol,
  address,
  image,
  size = 28,
  className,
}: {
  symbol: string;
  address?: string | null;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const gid = useId().replace(/:/g, "");
  const showImage = Boolean(image) && !failed;

  const h = seedHash(address || symbol || "arc");
  const hue = h % 360;
  const hue2 = (hue + 42) % 360;
  const initials = tokenInitials(symbol);

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/15",
        className,
      )}
      style={{ height: size, width: size }}
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image as string}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <svg viewBox="0 0 40 40" width={size} height={size} role="presentation">
          <defs>
            <linearGradient id={`g${gid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={`hsl(${hue} 74% 54%)`} />
              <stop offset="100%" stopColor={`hsl(${hue2} 80% 31%)`} />
            </linearGradient>
            <radialGradient id={`s${gid}`} cx="0.32" cy="0.24" r="0.85">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="40" height="40" fill={`url(#g${gid})`} />
          <rect width="40" height="40" fill={`url(#s${gid})`} />
          <circle cx="20" cy="20" r="18" fill="none" stroke="#ffffff" strokeOpacity="0.16" />
          <text
            x="20"
            y="21"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize={initialFontSize(initials)}
            fontWeight="700"
            fill="#ffffff"
            fillOpacity="0.96"
            letterSpacing="-0.5"
          >
            {initials}
          </text>
        </svg>
      )}
    </span>
  );
}
