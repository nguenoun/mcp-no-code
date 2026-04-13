export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-14 items-center gap-4">
          <span className="font-bold text-lg">MCPBuilder</span>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  )
}
