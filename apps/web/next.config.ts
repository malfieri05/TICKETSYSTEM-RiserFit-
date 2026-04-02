import type { NextConfig } from "next";
import path from "path";

// `next dev` runs with cwd `apps/web`; monorepo root is two levels up.
const monorepoRoot = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  turbopack: {
    root: monorepoRoot,
  },
  async redirects() {
    return [
      {
        source: "/admin/reporting",
        destination: "/dashboard",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
