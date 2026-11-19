import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Seller-supplied product images can come from any https host.
  images: { unoptimized: true },
  webpack: (config) => {
    // Solana libraries reference Node built-ins that don't exist in the browser.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, os: false, crypto: false };
    return config;
  },
};

export default nextConfig;
