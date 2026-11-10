import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cursor/identity.ts imports .js paths that map to .ts sources
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
