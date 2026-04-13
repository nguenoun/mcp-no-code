import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Authentication',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between bg-primary p-10 text-primary-foreground">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <span className="text-2xl font-bold">MCPBuilder</span>
        </Link>
        <blockquote className="space-y-2">
          <p className="text-lg">
            &ldquo;Build and host MCP servers without writing a single line of code.&rdquo;
          </p>
        </blockquote>
      </div>

      {/* Right panel — form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile logo */}
          <Link href="/" className="flex lg:hidden justify-center font-bold text-2xl mb-8">
            MCPBuilder
          </Link>
          {children}
        </div>
      </div>
    </div>
  )
}
