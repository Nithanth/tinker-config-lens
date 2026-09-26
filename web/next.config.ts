import type { NextConfig } from "next";

// Static export: the app reads RunBundle JSON at build time and ships as
// plain HTML/JS — no backend, no API keys, deployable anywhere static.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
