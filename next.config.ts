import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["192.168.29.241"],
  // The webpack hook below is production-only (dev runs Turbopack). Declaring
  // the default resolve extensions here keeps Next from warning that a webpack
  // config exists without a Turbopack counterpart.
  turbopack: {
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
  // These must stay outside the bundle: web-tree-sitter ships WASM files it
  // loads from disk at runtime, which webpack cannot parse as modules.
  serverExternalPackages: ["web-tree-sitter", "tree-sitter-wasms", "pg"],
  // The grammar/prelude WASM files are read with fs at runtime, so they are
  // invisible to the bundler and to build-time file tracing. Include them
  // explicitly so they exist in the deployed function's node_modules.
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/web-tree-sitter/tree-sitter.wasm",
      "./node_modules/tree-sitter-wasms/out/**/*.wasm",
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // serverExternalPackages only externalizes exact package requests, so
      // subpath imports (tree-sitter.wasm, package.json) still get resolved by
      // webpack and fail to compile. Keep them as runtime CommonJS requires.
      config.externals.push(
        (
          { request }: { request?: string },
          callback: (err?: Error | null, result?: string) => void
        ) => {
          if (
            typeof request === "string" &&
            /^(web-tree-sitter|tree-sitter-wasms)\//.test(request)
          ) {
            return callback(null, `commonjs ${request}`);
          }

          return callback();
        }
      );
    }

    return config;
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
