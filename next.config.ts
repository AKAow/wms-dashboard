import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages (next-on-pages)
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
    },
  },
};

export default nextConfig;
