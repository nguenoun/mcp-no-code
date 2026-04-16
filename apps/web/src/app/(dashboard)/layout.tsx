import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { LayoutDashboard, Server, KeyRound, LayoutTemplate } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { SignOutButton } from '@/components/sign-out-button'

const NAV_ITEMS = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/servers/new', icon: Server, label: 'Serveurs' },
  { href: '/templates', icon: LayoutTemplate, label: 'Templates' },
  { href: '/workspace/credentials', icon: KeyRound, label: 'Credentials' },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 border-r flex flex-col bg-card">
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b">
          <span className="font-bold text-base tracking-tight">MCPBuilder</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t px-3 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">
              {session?.user?.name ?? session?.user?.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="container py-8 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  )
}
