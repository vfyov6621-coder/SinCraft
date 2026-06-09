import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Static export: no images from external domains needed
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
