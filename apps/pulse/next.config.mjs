/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pacifica-hack/sdk'],
  webpack: (config, { isServer, webpack }) => {
    // The `@pacifica-hack/sdk` barrel re-exports `signing-hardware.ts` and
    // `rest-deposit.ts`, which statically import `node:child_process` and
    // `node:crypto`. Those modules are never executed in the browser
    // dashboard (Pulse only uses REST reads + WebSocket), but webpack
    // still tries to bundle them for the client chunk. Stub them out via
    // IgnorePlugin so the build succeeds without touching the SDK package.
    if (!isServer) {
      config.plugins = config.plugins ?? [];
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^node:(child_process|crypto|fs|net|tls|os|path)$/,
        }),
      );
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        child_process: false,
        crypto: false,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};
export default nextConfig;
