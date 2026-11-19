import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Files in public/media never change (a new version gets a new name), so browsers can keep them.
  async headers() {
    return [{ source: "/media/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
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
