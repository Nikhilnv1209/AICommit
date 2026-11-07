import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["192.168.29.241"],
  // These packages load WASM from disk at runtime, so they must stay outside
  // the bundle. lib/ast-parser resolves their paths with Node's own resolver,
  // which keeps webpack from rewriting them into module ids.
  serverExternalPackages: ["web-tree-sitter", "tree-sitter-wasms", "pg"],
  // The grammar files are read with fs at runtime, so build-time file tracing
  // cannot see them. Ship them explicitly with the serverless function.
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/web-tree-sitter/tree-sitter.wasm",
      "./node_modules/tree-sitter-wasms/out/**/*.wasm",
      "./node_modules/tree-sitter-wasms/package.json",
    ],
  },
  images: {
    remotePatterns: [
      { hostname: "raw.githubusercontent.com" },
      { hostname: "avatars.githubusercontent.com" },
      { hostname: "img.clerk.com" }
    ],
  },
  eslint:{
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
