export { default } from 'next-auth/middleware'

export const config = {
  // Protect everything except auth routes and Next.js internals
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login|register).*)'],
}
