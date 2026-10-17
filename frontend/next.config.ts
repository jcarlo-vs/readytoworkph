import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
