import type { NextConfig } from 'next';

/**
 * `APP_ORIGIN` is the canonical public origin (e.g. https://commissions.example.com).
 * Server Actions are the only mutation surface in this application, so pinning
 * their accepted origin is what stops a third-party page from invoking one with
 * the visitor's cookie attached.
 *
 * Vercel also exposes `VERCEL_PROJECT_PRODUCTION_URL` and, per deployment,
 * `VERCEL_URL`; including both keeps preview deployments working without
 * loosening the production origin.
 */
function allowedOrigins(): string[] {
  const origins = new Set<string>();

  const canonical = process.env.APP_ORIGIN?.trim();
  if (canonical) {
    try {
      origins.add(new URL(canonical).host);
    } catch {
      throw new Error(`APP_ORIGIN is not a valid URL: ${canonical}`);
    }
  }

  for (const host of [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]) {
    if (host?.trim()) origins.add(host.trim());
  }

  return [...origins];
}

const origins = allowedOrigins();

// Next.js already rejects a Server Action whose Origin does not match its Host,
// so an empty list is the strict default rather than a hole. `allowedOrigins`
// exists for the case where a proxy rewrites Host — which is why a deployment
// behind a custom domain should still set APP_ORIGIN.
if (process.env.NODE_ENV === 'production' && origins.length === 0) {
  console.warn(
    '[config] APP_ORIGIN is not set. Server Actions will accept same-origin requests only. ' +
      'Set it if this deployment sits behind a proxy or custom domain (see docs/DEPLOYMENT.md).',
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['pg', 'argon2'],
  // Financial records: never let a CDN or proxy cache an authenticated page.
  experimental: {
    // server actions are the only mutation surface; keep payloads small
    serverActions: {
      bodySizeLimit: '1mb',
      ...(origins.length > 0 ? { allowedOrigins: origins } : {}),
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          {
            // Everything the app needs is same-origin except the font files.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "img-src 'self' data:",
              "font-src 'self' data:",
              // Next.js injects inline bootstrap/flight scripts and styles.
              "script-src 'self' 'unsafe-inline'" +
                (process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"),
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
        ],
      },
      {
        // Signed-in pages carry one agent's financial data; no shared cache
        // may ever hold a copy.
        source: '/((?!_next/static|_next/image|icon.svg).*)',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
