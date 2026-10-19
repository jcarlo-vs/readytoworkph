import type { NextConfig } from "next";

// What the browser may load. `connect-src 'self'` matters most: even if someone slipped a script into
// the page, it couldn't send a visitor's login to another site. Google is for sign-in; R2 serves
// private photos and resume previews through short-lived links.
// ponytail: inline scripts are allowed because Next adds its own; switch to nonces if that ever matters.
const GOOGLE = "https://accounts.google.com/gsi/";
const R2 = "https://*.r2.cloudflarestorage.com";
const CF_ANALYTICS = "https://static.cloudflareinsights.com"; // Cloudflare adds its visitor analytics to every page
const PADDLE = "https://*.paddle.com"; // checkout: Paddle.js from its CDN, the payment form in a frame
const TURNSTILE = "https://challenges.cloudflare.com"; // Cloudflare's "I'm human" check on sign-up, login, contact
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${GOOGLE}client ${CF_ANALYTICS} https://cdn.paddle.com ${TURNSTILE}${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline' ${GOOGLE}style`,
  `img-src 'self' data: blob: ${R2}${process.env.NODE_ENV === "development" ? " http://localhost:4000" : ""}`,
  "font-src 'self'",
  `connect-src 'self' ${GOOGLE} https://cloudflareinsights.com ${PADDLE} ${process.env.NODE_ENV === "development" ? "http://localhost:4000 ws:" : ""}`,
  `frame-src ${GOOGLE} ${R2} ${PADDLE} ${TURNSTILE}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // In development the backend runs separately on port 4000; send /api there so the site and API share
  // one address, as on the live site (where the Worker does this), and login cookies just work.
  async rewrites() {
    return process.env.NODE_ENV === "development" ? [{ source: "/api/:path*", destination: "http://localhost:4000/api/:path*" }] : [];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: CSP },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://buy.paddle.com\" \"https://sandbox-buy.paddle.com\")" },
        // Google's sign-in popup needs to talk back to this page.
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      ],
    }];
  },
  /* config options here */
  // Off on purpose: with Cache Components, Next keeps visited pages alive (forms, open modals and
  // fetched data come back stale). This app loads its data in the browser, so fresh pages are right.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
