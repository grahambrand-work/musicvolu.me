import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Coolify builds the site with Nixpacks; "standalone" keeps the image small.
  output: "standalone",
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
