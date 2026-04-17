import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Navbar ───────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="font-bold text-base tracking-tight">
              MCPBuilder
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/#features" className="hover:text-foreground transition-colors">
                Features
              </Link>
              <Link href="/#how-it-works" className="hover:text-foreground transition-colors">
                How it works
              </Link>
              <Link href="/docs" className="hover:text-foreground transition-colors">
                Docs
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Get started free</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────────────────────────── */}
      <main className="flex-1">{children}</main>

      {/* ── Footer ───────────────────────────────────────────────────────────────── */}
      <footer className="border-t bg-muted/30">
        <div className="container max-w-6xl mx-auto px-4 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1 space-y-3">
              <p className="font-bold text-sm">MCPBuilder</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Build and deploy MCP servers without writing a single line of code.
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/#features" className="hover:text-foreground transition-colors">Features</Link></li>
                <li><Link href="/#how-it-works" className="hover:text-foreground transition-colors">How it works</Link></li>
                <li><Link href="/register" className="hover:text-foreground transition-colors">Get started</Link></li>
              </ul>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Developers</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/docs" className="hover:text-foreground transition-colors">Documentation</Link></li>
                <li><Link href="/docs/getting-started" className="hover:text-foreground transition-colors">Quick start</Link></li>
                <li><Link href="/docs/api-reference" className="hover:text-foreground transition-colors">API reference</Link></li>
              </ul>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Legal</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} MCPBuilder. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
