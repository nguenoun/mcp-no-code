'use client'

/**
 * Page de consentement OAuth — /app/oauth/authorize
 *
 * Reçoit les paramètres OAuth de C2 (redirect depuis /mcp/:serverId/authorize).
 * Affiche le nom de l'app, du serveur, les scopes demandés et l'email de
 * l'utilisateur connecté, avec deux boutons Refuser / Autoriser.
 *
 * F1 — parsing des searchParams + guard auth
 * F2 — fetch serveur + oauth apps (skeleton pendant le chargement)
 * F3 — UI de consentement
 * F4 — actions Allow (POST /consent) / Deny (redirect direct)
 */

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, ShieldCheck } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ServerMeta = { id: string; name: string }
type OAuthAppMeta = { id: string; clientId: string; name: string; redirectUris: string[] }

type ApiResponse<T> = { success: true; data: T }
type ApiError = { error?: { code?: string; message?: string }; message?: string }

// ─── Scope descriptions (FR) ─────────────────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  read: 'Lire les ressources du serveur',
  write: 'Modifier les ressources du serveur',
  'tools:read': 'Lister les outils disponibles',
  'tools:call': 'Exécuter les outils du serveur',
  '*': 'Accès complet au serveur',
}

function scopeLabel(s: string): string {
  return SCOPE_LABELS[s] ?? s
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ConsentSkeleton() {
  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-4">
          <Skeleton className="mx-auto mb-4 w-12 h-12 rounded-full" />
          <Skeleton className="h-6 w-52 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto mt-2" />
        </CardHeader>
        <Separator />
        <CardContent className="pt-5 pb-3 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-5/6" />
        </CardContent>
        <Separator />
        <CardContent className="py-3">
          <Skeleton className="h-4 w-56 mx-auto" />
        </CardContent>
        <CardFooter className="flex gap-3 pt-2 pb-5">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 flex-1" />
        </CardFooter>
      </Card>
    </div>
  )
}

// ─── Erreur paramètre manquant ────────────────────────────────────────────────

function InvalidRequest({
  message = "Paramètre manquant ou invalide dans la requête d'autorisation.",
}: {
  message?: string
}) {
  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <CardTitle>Requête invalide</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

// ─── Contenu principal (nécessite Suspense pour useSearchParams) ─────────────

function OAuthAuthorizeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isDenying, setIsDenying] = useState(false)

  // ── F1 — Parse searchParams ──────────────────────────────────────────────────

  const serverId = searchParams.get('server_id')
  const clientId = searchParams.get('client_id')
  const redirectUri = searchParams.get('redirect_uri')
  const scope = searchParams.get('scope') ?? ''
  const codeChallenge = searchParams.get('code_challenge')
  const state = searchParams.get('state') ?? ''

  const scopes = scope.split(' ').filter(Boolean)
  const paramsValid = Boolean(serverId && clientId && redirectUri && codeChallenge)

  // ── F1 — Auth guard (le middleware /app/* redirige déjà, défense en profondeur) ──

  useEffect(() => {
    if (status === 'unauthenticated') {
      const callbackUrl = encodeURIComponent(window.location.href)
      router.push(`/login?callbackUrl=${callbackUrl}`)
    }
  }, [status, router])

  // ── F2 — Fetch nom du serveur ────────────────────────────────────────────────

  const { data: serverData, isLoading: serverLoading } = useQuery<ServerMeta>({
    queryKey: ['server', serverId],
    queryFn: () =>
      apiClient
        .get<ApiResponse<ServerMeta>>(`/api/v1/servers/${serverId}`)
        .then((r) => r.data.data),
    enabled: paramsValid && status === 'authenticated',
    retry: 1,
  })

  // ── F2 — Fetch OAuth apps du serveur, filtre par clientId côté client ────────

  const { data: appsData, isLoading: appsLoading } = useQuery<OAuthAppMeta[]>({
    queryKey: ['oauth-apps', serverId],
    queryFn: () =>
      apiClient
        .get<ApiResponse<OAuthAppMeta[]>>(`/api/v1/servers/${serverId}/oauth/apps`)
        .then((r) => r.data.data),
    enabled: paramsValid && status === 'authenticated',
    retry: 1,
  })

  const oauthApp = appsData?.find((a) => a.clientId === clientId)

  // ── F4 — Mutation de consentement ────────────────────────────────────────────

  const consentMutation = useMutation<{ redirectUrl: string }, ApiError, boolean>({
    mutationFn: (approved) =>
      apiClient
        .post<ApiResponse<{ redirectUrl: string }>>('/api/v1/oauth/consent', {
          serverId,
          clientId,
          redirectUri,
          scopes,
          codeChallenge,
          state,
          approved,
        })
        .then((r) => r.data.data),
    onSuccess: ({ redirectUrl }) => {
      // Redirige le navigateur vers le client OAuth (peut être externe)
      window.location.href = redirectUrl
    },
  })

  // ── F4 — Refus : redirect direct sans appel serveur (immédiat) ───────────────

  const handleDeny = () => {
    if (!redirectUri) return
    setIsDenying(true)
    const params = new URLSearchParams({
      error: 'access_denied',
      error_description: 'The user denied access',
    })
    if (state) params.set('state', state)
    window.location.href = `${redirectUri}?${params.toString()}`
  }

  const handleAllow = () => consentMutation.mutate(true)

  // ── Render guards ─────────────────────────────────────────────────────────────

  if (status === 'loading' || status === 'unauthenticated') return <ConsentSkeleton />
  if (!paramsValid) return <InvalidRequest />

  const isDataLoading = serverLoading || appsLoading

  const errorMessage = consentMutation.isError
    ? ((consentMutation.error as ApiError)?.error?.message ??
       (consentMutation.error as ApiError)?.message ??
       'Une erreur est survenue. Veuillez réessayer.')
    : null

  // ── F3 — UI de consentement ───────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">

        {/* Header — nom de l'app + nom du serveur */}
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
          </div>

          {isDataLoading ? (
            <>
              <Skeleton className="h-6 w-52 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto mt-2" />
            </>
          ) : (
            <>
              <CardTitle className="text-xl">
                <span className="font-semibold">{oauthApp?.name ?? clientId}</span>
                <span className="text-muted-foreground font-normal"> demande l&apos;accès</span>
              </CardTitle>
              <CardDescription className="mt-1">
                à votre serveur{' '}
                <span className="font-semibold text-foreground">
                  {serverData?.name ?? serverId}
                </span>
              </CardDescription>
            </>
          )}
        </CardHeader>

        <Separator />

        {/* Scopes demandés */}
        <CardContent className="pt-5 pb-3">
          <p className="text-sm font-medium text-muted-foreground mb-3">
            Permissions demandées
          </p>

          {isDataLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-5/6" />
            </div>
          ) : scopes.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
              Accès de base (aucun scope spécifique)
            </div>
          ) : (
            <ul className="space-y-2">
              {scopes.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <span className="flex-1">{scopeLabel(s)}</span>
                  <Badge variant="outline" className="font-mono text-xs shrink-0">
                    {s}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>

        <Separator />

        {/* Email de l'utilisateur connecté */}
        <CardContent className="py-3">
          <p className="text-xs text-center text-muted-foreground">
            Connecté en tant que{' '}
            <span className="font-medium text-foreground">{session?.user?.email}</span>
          </p>
        </CardContent>

        {/* Erreur de la mutation (serveur down, client révoqué…) */}
        {errorMessage && (
          <>
            <Separator />
            <CardContent className="py-3">
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            </CardContent>
          </>
        )}

        {/* Actions */}
        <CardFooter className="flex gap-3 pt-2 pb-5">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDeny}
            disabled={isDenying || consentMutation.isPending}
          >
            {isDenying ? 'Redirection…' : 'Refuser'}
          </Button>
          <Button
            className="flex-1"
            onClick={handleAllow}
            disabled={isDataLoading || consentMutation.isPending || isDenying}
          >
            {consentMutation.isPending ? 'Autorisation…' : 'Autoriser'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────
// useSearchParams() nécessite une Suspense boundary dans Next.js App Router.

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={<ConsentSkeleton />}>
      <OAuthAuthorizeContent />
    </Suspense>
  )
}
