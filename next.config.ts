import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next doesn't pick up unrelated lockfiles
  // higher up the directory tree.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
