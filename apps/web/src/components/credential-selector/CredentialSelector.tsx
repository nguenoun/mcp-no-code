'use client'

import * as React from 'react'
import { KeyRound, Unlink } from 'lucide-react'
import { CredentialType } from '@mcpbuilder/shared'
import { useCredentials, type SafeCredential } from '@/hooks/use-credentials'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<CredentialType, string> = {
  [CredentialType.API_KEY]: 'API Key',
  [CredentialType.BEARER]: 'Bearer',
  [CredentialType.BASIC_AUTH]: 'Basic',
}

const TYPE_VARIANT: Record<CredentialType, string> = {
  [CredentialType.API_KEY]: 'bg-violet-100 text-violet-700',
  [CredentialType.BEARER]: 'bg-blue-100 text-blue-700',
  [CredentialType.BASIC_AUTH]: 'bg-amber-100 text-amber-700',
}

// Sentinel value used by the Select to represent "no credential"
const NO_CREDENTIAL = '__none__'

// ─── CredentialSelector ───────────────────────────────────────────────────────

export interface CredentialSelectorProps {
  workspaceId: string
  /** Currently selected credential ID, or null if none */
  value: string | null
  /** Called with the new credential ID, or null to detach */
  onChange: (credentialId: string | null) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}

export function CredentialSelector({
  workspaceId,
  value,
  onChange,
  disabled = false,
  className,
  placeholder = 'Aucun credential',
}: CredentialSelectorProps) {
  const { data: credentials, isLoading } = useCredentials(workspaceId)

  const selected = credentials?.find((c) => c.id === value) ?? null

  function handleChange(v: string) {
    onChange(v === NO_CREDENTIAL ? null : v)
  }

  return (
    <Select
      value={value ?? NO_CREDENTIAL}
      onValueChange={handleChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={cn('w-full', className)}>
        {selected ? (
          <CredentialOption credential={selected} />
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Unlink className="h-3.5 w-3.5" />
            <span className="text-sm">{placeholder}</span>
          </div>
        )}
      </SelectTrigger>

      <SelectContent>
        {/* Detach option */}
        <SelectItem value={NO_CREDENTIAL}>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Unlink className="h-3.5 w-3.5" />
            <span>{placeholder}</span>
          </div>
        </SelectItem>

        {credentials && credentials.length > 0 && (
          <>
            <div className="mx-2 my-1 h-px bg-border" />
            {credentials.map((cred) => (
              <SelectItem key={cred.id} value={cred.id}>
                <CredentialOption credential={cred} />
              </SelectItem>
            ))}
          </>
        )}

        {isLoading && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">Chargement…</div>
        )}

        {!isLoading && credentials?.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            <KeyRound className="inline h-3.5 w-3.5 mr-1" />
            Aucun credential disponible
          </div>
        )}
      </SelectContent>
    </Select>
  )
}

// ─── CredentialOption ─────────────────────────────────────────────────────────

function CredentialOption({ credential }: { credential: SafeCredential }) {
  return (
    <div className="flex items-center gap-2">
      <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm">{credential.name}</span>
      <span
        className={cn(
          'ml-auto inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-xs font-medium',
          TYPE_VARIANT[credential.type],
        )}
      >
        {TYPE_LABEL[credential.type]}
      </span>
    </div>
  )
}
