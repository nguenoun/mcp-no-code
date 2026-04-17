import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowLeft } from 'lucide-react'

const DOC_SECTIONS = [
  {
    title: 'Getting started',
    items: [
      { href: '/docs', label: 'Overview' },
      { href: '/docs/getting-started', label: 'Quick start' },
    ],
  },
  {
    title: 'Features',
    items: [
      { href: '/docs/features/openapi-import', label: 'OpenAPI import' },
      { href: '/docs/features/manual-tools', label: 'Manual tools' },
      { href: '/docs/features/templates', label: 'Templates' },
      { href: '/docs/features/credentials', label: 'Credentials' },
    ],
  },
  {
    title: 'Deployment',
    items: [
      { href: '/docs/deployment/cloudflare', label: 'Cloudflare Workers' },
      { href: '/docs/deployment/local', label: 'Local runtime' },
    ],
  },
  {
    title: 'Integration',
    items: [
      { href: '/docs/integration/claude-desktop', label: 'Claude Desktop' },
      { href: '/docs/integration/claude-api', label: 'Claude API' },
      { href: '/docs/api-reference', label: 'API reference' },
    ],
  },
]

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
              <Link href="/">
                <ArrowLeft className="h-3.5 w-3.5" />
                MCPBuilder
              </Link>
            </Button>
            <span className="text-muted-foreground/40 text-sm">/</span>
            <span className="text-sm font-semibold">Docs</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 container max-w-7xl mx-auto px-4">
        {/* ── Sidebar ─────────────────────────────────────────────────────────────── */}
        <aside className="hidden lg:block w-56 shrink-0 py-8 pr-8">
          <ScrollArea className="h-[calc(100vh-3.5rem-4rem)]">
            <nav className="space-y-6">
              {DOC_SECTIONS.map((section) => (
                <div key={section.title}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {section.title}
                  </p>
                  <ul className="space-y-1">
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className="block text-sm text-muted-foreground hover:text-foreground transition-colors py-1 rounded px-2 hover:bg-muted/50"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* ── Main ────────────────────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 py-8 lg:pl-8 lg:border-l">
          <div className="max-w-3xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
