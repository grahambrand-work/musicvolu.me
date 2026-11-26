import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Files in public/media never change (a new version gets a new name), so browsers can keep them.
  async headers() {
    return [{ source: "/media/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
  // Uploaded covers can be up to 10 MB, plus the form's own wrapping.
  experimental: { proxyClientMaxBodySize: "11mb" },
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
