import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages: edge runtime 사용
  // static export 대신 edge runtime으로 SSR 지원
};

export default nextConfig;
