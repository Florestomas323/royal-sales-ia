/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Type errors must fail the deploy. The repo is clean; keeping this off
    // meant a broken build could still ship to production.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  /**
   * firebase-admin must NOT be bundled by Turbopack.
   *
   * Its dependency chain is firebase-admin → jwks-rsa (CommonJS) → jose 6
   * (ESM-only). When the bundler rewrites those modules, the CJS `require`
   * inside jwks-rsa ends up loading an ES module and Node throws
   * ERR_REQUIRE_ESM at runtime. Marking the package as external makes Node
   * resolve it straight from node_modules, where `require(esm)` is handled
   * natively (Node >= 20.19 / >= 22.12 — see "engines" in package.json).
   *
   * Listing the root package covers its subpaths (firebase-admin/app,
   * /auth, /firestore) and its transitive deps, so jose and jwks-rsa do not
   * need to be listed separately.
   */
  serverExternalPackages: ['firebase-admin'],
}

export default nextConfig
