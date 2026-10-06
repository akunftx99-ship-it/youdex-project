import { PrivyAuthProvider } from "@/components/providers/privy-provider";
import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "YouDex — ARC Spot Exchange",
  description:
    "Spot trading on YouDex. Trade ARC-network tokens with live prices, volume and market data.",
  authors: [{ name: "YouDex" }],
  applicationName: "YouDex",
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/brand/logo-mark.svg", type: "image/svg+xml" }],
    apple: [{ url: "/brand/logo-mark.svg" }],
  },
  openGraph: {
    title: "YouDex — ARC Spot Exchange",
    description:
      "Spot trading on YouDex. Trade ARC-network tokens with live prices, volume and market data.",
    type: "website",
    siteName: "YouDex",
  },
  twitter: {
    card: "summary",
    site: "@YouDexApp",
    title: "YouDex — ARC Spot Exchange",
    description:
      "Spot trading on YouDex. Trade ARC-network tokens with live prices, volume and market data.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0D0D12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${dmSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        {/* Liquid-glass SVG filters — same displacement/specular pipeline as the
            live site, used by the branded pill surfaces. */}
        <svg
          aria-hidden="true"
          focusable="false"
          style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
        >
          <defs>
            <filter
              id="liquid-glass-filter"
              x="-5%"
              y="-5%"
              width="110%"
              height="110%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.018 0.024"
                numOctaves="2"
                seed="8"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="8"
                xChannelSelector="R"
                yChannelSelector="G"
                result="displaced"
              />
              <feGaussianBlur in="displaced" stdDeviation="0.4" result="blurred" />
              <feSpecularLighting
                in="noise"
                surfaceScale="4"
                specularConstant="0.9"
                specularExponent="80"
                lightingColor="white"
                result="specLight"
              >
                <feDistantLight azimuth="225" elevation="65" />
              </feSpecularLighting>
              <feComposite in="specLight" in2="blurred" operator="in" result="clippedSpec" />
              <feBlend in="blurred" in2="clippedSpec" mode="screen" />
            </filter>
            <filter
              id="liquid-glass-pill-filter"
              x="-5%"
              y="-5%"
              width="110%"
              height="110%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.022 0.03"
                numOctaves="2"
                seed="12"
                result="noise"
              />
              <feSpecularLighting
                in="noise"
                surfaceScale="3"
                specularConstant="1"
                specularExponent="110"
                lightingColor="white"
                result="specLight"
              >
                <feDistantLight azimuth="220" elevation="70" />
              </feSpecularLighting>
              <feComposite in="specLight" in2="SourceGraphic" operator="in" result="clippedSpec" />
              <feBlend in="SourceGraphic" in2="clippedSpec" mode="screen" />
            </filter>
          </defs>
        </svg>
        <PrivyAuthProvider>{children}</PrivyAuthProvider>
        <section
          aria-label="Notifications alt+T"
          tabIndex={-1}
          aria-live="polite"
          aria-relevant="additions text"
          aria-atomic="false"
        />
      </body>
    </html>
  );
}
