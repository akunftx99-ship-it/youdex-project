import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Not `output: "standalone"` (the template default): standalone output makes
   * `next start` unsupported — Next warns and points at
   * `.next/standalone/server.js`, which then needs `.next/static` and `public`
   * copied alongside it or every asset 404s. This project is served locally by
   * `npm start`, so the default output keeps that command correct.
   */
  /**
   * The dev server is reached two ways: localhost:3210 and a Cloudflare quick
   * tunnel. Next 16 blocks cross-origin HMR/dev-resource requests by default,
   * which kills the websocket and leaves every client effect dead on arrival.
   */
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "conventions-beneficial-bringing-garlic.trycloudflare.com",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
