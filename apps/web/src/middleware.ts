import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') ?? ''

  // ── Subdomain routing (production) ──────────────────────────────────────────
  //
  // app.website.com  → rewrites internally to /app/...
  // docs.website.com → rewrites internally to /docs/...
  //
  // In development (localhost), access /app/* and /docs/* directly.

  const isAppSubdomain = host.startsWith('app.')
  const isDocsSubdomain = host.startsWith('docs.')

  if (isDocsSubdomain) {
    const url = request.nextUrl.clone()
    url.pathname = `/docs${pathname === '/' ? '' : pathname}`
    return NextResponse.rewrite(url)
  }

  if (isAppSubdomain) {
    const appPath = `/app${pathname === '/' ? '' : pathname}`
    const token = await getToken({ req: request, secret: process.env['NEXTAUTH_SECRET'] })

    if (!token) {
      // Redirect to login on the main domain
      const loginUrl = request.nextUrl.clone()
      loginUrl.hostname = host.replace(/^app\./, '')
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }

    const url = request.nextUrl.clone()
    url.pathname = appPath
    return NextResponse.rewrite(url)
  }

  // ── Path-based auth protection for /app/* ───────────────────────────────────
  //
  // Used in development (localhost) and when not behind a subdomain proxy.

  if (pathname.startsWith('/app')) {
    const token = await getToken({ req: request, secret: process.env['NEXTAUTH_SECRET'] })

    if (!token) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  // Run on all paths except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
