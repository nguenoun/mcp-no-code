'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Eye, EyeOff, CheckCircle2, XCircle, Loader2, KeyRound } from 'lucide-react'
import { CredentialType } from '@mcpbuilder/shared'
import {
  useCredentials,
  useCreateCredential,
  useDeleteCredential,
  useTestCredential,
  type CreateCredentialInput,
  type SafeCredential,
} from '@/hooks/use-credentials'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useDefaultWorkspace } from '@/hooks/use-workspace'

// ─── Constants ────────────────────────────────────────────────────────────────

const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  [CredentialType.API_KEY]: 'API Key',
  [CredentialType.BEARER]: 'Bearer Token',
  [CredentialType.BASIC_AUTH]: 'Basic Auth',
}

const CREDENTIAL_TYPE_BADGE: Record<CredentialType, string> = {
  [CredentialType.API_KEY]: 'bg-violet-100 text-violet-700',
  [CredentialType.BEARER]: 'bg-blue-100 text-blue-700',
  [CredentialType.BASIC_AUTH]: 'bg-amber-100 text-amber-700',
}

// ─── Form schema ──────────────────────────────────────────────────────────────

const credentialFormSchema = z.discriminatedUnion('type', [
  z.object({
    name: z.string().min(1, 'Required').max(100),
    type: z.literal('API_KEY'),
    value: z.string().min(1, 'API key is required'),
  }),
  z.object({
    name: z.string().min(1, 'Required').max(100),
    type: z.literal('BEARER'),
    value: z.string().min(1, 'Token is required'),
  }),
  z.object({
    name: z.string().min(1, 'Required').max(100),
    type: z.literal('BASIC_AUTH'),
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
  }),
])

type CredentialFormValues = z.infer<typeof credentialFormSchema>

// ─── PasswordInput ────────────────────────────────────────────────────────────

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = React.useState(false)
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className={cn('pr-10', props.className)} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ─── CreateCredentialDialog ───────────────────────────────────────────────────

interface CreateCredentialDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
}

function CreateCredentialDialog({ open, onOpenChange, workspaceId }: CreateCredentialDialogProps) {
  const createMutation = useCreateCredential(workspaceId)
  const testMutation = useTestCredential(workspaceId)
  const [createdId, setCreatedId] = React.useState<string | null>(null)
  const [testUrl, setTestUrl] = React.useState('')
  const [testResult, setTestResult] = React.useState<{
    ok: boolean
    error: string | null
    latencyMs: number
  } | null>(null)

  const form = useForm<CredentialFormValues>({
    resolver: zodResolver(credentialFormSchema),
    defaultValues: { name: '', type: 'API_KEY', value: '' },
  })

  const selectedType = form.watch('type')

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) {
      form.reset({ name: '', type: 'API_KEY', value: '' })
      setCreatedId(null)
      setTestUrl('')
      setTestResult(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(values: CredentialFormValues) {
    let payload: CreateCredentialInput
    if (values.type === 'BASIC_AUTH') {
      payload = {
        name: values.name,
        type: 'BASIC_AUTH',
        value: { username: values.username, password: values.password },
      }
    } else {
      payload = { name: values.name, type: values.type, value: values.value }
    }
    const created = await createMutation.mutateAsync(payload)
    setCreatedId(created.id)
  }

  async function handleTest() {
    if (!createdId || !testUrl) return
    setTestResult(null)
    const result = await testMutation.mutateAsync({ credentialId: createdId, url: testUrl })
    setTestResult({ ok: result.ok, error: result.error, latencyMs: result.latencyMs })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau credential</DialogTitle>
        </DialogHeader>

        {!createdId ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom</FormLabel>
                    <FormControl>
                      <Input placeholder="Mon API Key production" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Type */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v)
                        // Reset value fields on type change
                        form.reset({ name: form.getValues('name'), type: v as CredentialFormValues['type'] })
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="API_KEY">API Key</SelectItem>
                        <SelectItem value="BEARER">Bearer Token</SelectItem>
                        <SelectItem value="BASIC_AUTH">Basic Auth</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Value fields — depend on type */}
              {(selectedType === 'API_KEY' || selectedType === 'BEARER') && (
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {selectedType === 'API_KEY' ? 'Clé API' : 'Token Bearer'}
                      </FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder={selectedType === 'API_KEY' ? 'sk-...' : 'eyJ...'}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedType === 'BASIC_AUTH' && (
                <>
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom d&apos;utilisateur</FormLabel>
                        <FormControl>
                          <Input placeholder="alice" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mot de passe</FormLabel>
                        <FormControl>
                          <PasswordInput placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={form.formState.isSubmitting}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sauvegarde…</>
                  ) : (
                    'Sauvegarder'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          /* Test section — shown after successful creation */
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Credential sauvegardé avec succès.
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium">Tester le credential (optionnel)</p>
              <p className="text-xs text-muted-foreground">
                Entrez une URL pour vérifier que le credential est accepté par l&apos;API cible.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="https://api.example.com/me"
                  value={testUrl}
                  onChange={(e) => {
                    setTestUrl(e.target.value)
                    setTestResult(null)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={!testUrl || testMutation.isPending}
                >
                  {testMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Tester'
                  )}
                </Button>
              </div>

              {testResult && (
                <div
                  className={cn(
                    'flex items-start gap-2 rounded-md border p-3 text-sm',
                    testResult.ok
                      ? 'border-green-200 bg-green-50 text-green-800'
                      : 'border-red-200 bg-red-50 text-red-800',
                  )}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">
                      {testResult.ok ? '✓ Credential valide' : '✗ Échec'}
                    </p>
                    {testResult.error && (
                      <p className="mt-0.5 text-xs opacity-80">{testResult.error}</p>
                    )}
                    <p className="mt-0.5 text-xs opacity-60">{testResult.latencyMs} ms</p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Fermer</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── CredentialRow ────────────────────────────────────────────────────────────

function CredentialRow({
  credential,
  onDelete,
  isDeleting,
}: {
  credential: SafeCredential
  onDelete: () => void
  isDeleting: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{credential.name}</p>
          <p className="text-xs text-muted-foreground">
            Créé le {new Date(credential.createdAt).toLocaleDateString('fr-FR')}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            CREDENTIAL_TYPE_BADGE[credential.type],
          )}
        >
          {CREDENTIAL_TYPE_LABELS[credential.type]}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label="Supprimer"
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CredentialsPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const { workspaceId, isLoading: isWorkspaceLoading } = useDefaultWorkspace()
  const safeWorkspaceId = workspaceId ?? ''

  const { data: credentials, isLoading } = useCredentials(safeWorkspaceId)
  const deleteMutation = useDeleteCredential(safeWorkspaceId)

  async function handleDelete(id: string) {
    if (!workspaceId) return
    setDeletingId(id)
    try {
      await deleteMutation.mutateAsync(id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Credentials</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stockage chiffré (AES-256-GCM) — les valeurs ne sont jamais exposées en clair.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} disabled={!workspaceId || isWorkspaceLoading}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau credential
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : !credentials || credentials.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-12 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="font-medium text-sm">Aucun credential</p>
          <p className="text-xs text-muted-foreground mt-1">
            Ajoutez un credential pour authentifier vos serveurs MCP sur des APIs protégées.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => (
            <CredentialRow
              key={cred.id}
              credential={cred}
              onDelete={() => handleDelete(cred.id)}
              isDeleting={deletingId === cred.id}
            />
          ))}
        </div>
      )}

      <CreateCredentialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={safeWorkspaceId}
      />
    </div>
  )
}
