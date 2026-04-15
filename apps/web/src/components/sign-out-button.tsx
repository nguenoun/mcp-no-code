'use client'

import { signOut } from 'next-auth/react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={() => signOut({ callbackUrl: '/login' })}
      aria-label="Se déconnecter"
    >
      <LogOut className="h-3.5 w-3.5" />
    </Button>
  )
}
