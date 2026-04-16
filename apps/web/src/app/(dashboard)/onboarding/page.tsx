'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import confetti from 'canvas-confetti'
import { CheckCircle2, Copy, KeyRound, Rocket, Sparkles, Wand2 } from 'lucide-react'
import type { TemplateCategory } from '@mcpbuilder/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { CredentialSelector } from '@/components/credential-selector/CredentialSelector'
import { TemplateGrid } from '@/components/templates/template-grid'
import { useCreateCredential, useTestCredential } from '@/hooks/use-credentials'
import { useMe, usePatchMe } from '@/hooks/use-me'
import { useCreateServerFromTemplate, useTemplate, useTemplates } from '@/hooks/use-templates'
import { useDefaultWorkspace } from '@/hooks/use-workspace'

type Step = 1 | 2 | 3 | 4

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const maybeApiError = error as { error?: { message?: string } }
    if (maybeApiError.error?.message) return maybeApiError.error.message
  }
  return 'Une erreur inattendue est survenue.'
}

export default function OnboardingPage() {
  const router = useRouter()
  const { workspaceId } = useDefaultWorkspace()
  const { data: me } = useMe()
  const { data: templates } = useTemplates()
  const patchMe = usePatchMe()

  const [step, setStep] = useState<Step>(1)
  const [category, setCategory] = useState<'all' | TemplateCategory>('all')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const { data: selectedTemplate } = useTemplate(selectedTemplateId)

  const [serverName, setServerName] = useState('')
  const [credentialId, setCredentialId] = useState<string | null>(null)
  const [newCredentialName, setNewCredentialName] = useState('')
  const [newCredentialValue, setNewCredentialValue] = useState('')
  const [newCredentialId, setNewCredentialId] = useState<string | null>(null)
  const [testUrl, setTestUrl] = useState('')
  const [createdServerId, setCreatedServerId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const createCredential = useCreateCredential(workspaceId ?? '')
  const testCredential = useTestCredential(workspaceId ?? '')
  const createFromTemplate = useCreateServerFromTemplate(workspaceId ?? '')

  const mcpUrl = useMemo(
    () =>
      createdServerId
        ? `${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'}/mcp/${createdServerId}/sse`
        : '',
    [createdServerId],
  )

  useEffect(() => {
    if (me?.hasCompletedOnboarding) {
      router.replace('/')
    }
  }, [me?.hasCompletedOnboarding, router])

  useEffect(() => {
    if (selectedTemplate && !serverName) {
      setServerName(`${selectedTemplate.name} MCP Server`)
      setTestUrl(selectedTemplate.baseUrl)
    }
  }, [selectedTemplate, serverName])

  useEffect(() => {
    if (step === 4) {
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } })
    }
  }, [step])

  async function handleCreateCredential() {
    if (!workspaceId || !selectedTemplate || !newCredentialName || !newCredentialValue) return
    setActionError(null)
    try {
      const created = await createCredential.mutateAsync({
        name: newCredentialName,
        type: selectedTemplate.authType === 'API_KEY' ? 'API_KEY' : 'BEARER',
        value: newCredentialValue,
      })
      setCredentialId(created.id)
      setNewCredentialId(created.id)
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  async function handleTestConnection() {
    const targetCredentialId = credentialId ?? newCredentialId
    if (!workspaceId || !targetCredentialId || !testUrl) return
    setActionError(null)
    try {
      await testCredential.mutateAsync({ credentialId: targetCredentialId, url: testUrl })
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  async function handleCreateServer() {
    if (!workspaceId || !selectedTemplateId || !serverName.trim()) return
    setActionError(null)
    try {
      const created = await createFromTemplate.mutateAsync({
        templateId: selectedTemplateId,
        serverName: serverName.trim(),
        credentialId: credentialId ?? undefined,
      })
      await patchMe.mutateAsync({ hasCompletedOnboarding: true })
      setCreatedServerId(created.id)
      setStep(4)
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  if (!workspaceId) return null

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Onboarding MCPBuilder</h1>
        <p className="text-sm text-muted-foreground mt-1">Etape {step} sur 4</p>
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Bienvenue</CardTitle>
            <CardDescription>Un serveur MCP relie vos outils a Claude et autres assistants IA.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card><CardContent className="pt-6"><Sparkles className="h-5 w-5 mb-2" /><p className="text-sm">Exposez vos APIs en tools LLM utilisables en langage naturel.</p></CardContent></Card>
              <Card><CardContent className="pt-6"><Wand2 className="h-5 w-5 mb-2" /><p className="text-sm">Demarrez en minutes avec des templates pre-configures.</p></CardContent></Card>
              <Card><CardContent className="pt-6"><Rocket className="h-5 w-5 mb-2" /><p className="text-sm">Hebergez et utilisez votre endpoint MCP en SSE sans coder.</p></CardContent></Card>
            </div>
            <Button onClick={() => setStep(2)}>Commencer</Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Choisir un point de depart</CardTitle>
            <CardDescription>Selectionnez un template ou partez de zero.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TemplateGrid
              templates={templates ?? []}
              selectedCategory={category}
              onCategoryChange={setCategory}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
              onStartFromScratch={() => router.push('/servers/new')}
            />
            <div className="flex justify-end">
              <Button onClick={() => setStep(3)} disabled={!selectedTemplateId}>
                Continuer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Configuration rapide</CardTitle>
            <CardDescription>Nommez le serveur, connectez un credential et testez la connexion.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="server-name">Nom du serveur</Label>
              <Input id="server-name" value={serverName} onChange={(e) => setServerName(e.target.value)} />
            </div>

            {selectedTemplate && selectedTemplate.authType !== 'NONE' && (
              <div className="space-y-3 rounded-md border p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Credential</p>
                  <p className="text-xs text-muted-foreground">
                    Type requis: {selectedTemplate.authType}.{' '}
                    {selectedTemplate.authHelpUrl && (
                      <a href={selectedTemplate.authHelpUrl} target="_blank" className="underline" rel="noreferrer">
                        Trouver votre API key/token
                      </a>
                    )}
                  </p>
                </div>

                <CredentialSelector
                  workspaceId={workspaceId}
                  value={credentialId}
                  onChange={setCredentialId}
                />

                <Separator />
                <p className="text-xs text-muted-foreground">Ou creer rapidement un credential:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input
                    placeholder="Nom du credential"
                    value={newCredentialName}
                    onChange={(e) => setNewCredentialName(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="API key / token"
                    value={newCredentialValue}
                    onChange={(e) => setNewCredentialValue(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleCreateCredential}
                  disabled={!newCredentialName || !newCredentialValue || createCredential.isPending}
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  Creer le credential
                </Button>
              </div>
            )}

            <div className="rounded-md border p-4 space-y-2">
              <Label htmlFor="test-url">Test de connexion</Label>
              <Input id="test-url" value={testUrl} onChange={(e) => setTestUrl(e.target.value)} />
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={!(credentialId ?? newCredentialId) || !testUrl || testCredential.isPending}
              >
                Tester la connexion
              </Button>
              {testCredential.data && (
                <p className="text-xs text-muted-foreground">
                  {testCredential.data.ok ? 'Connexion OK' : `Echec: ${testCredential.data.error ?? 'inconnu'}`}
                </p>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Retour</Button>
              <Button
                onClick={handleCreateServer}
                disabled={!serverName.trim() || createFromTemplate.isPending}
              >
                Creer le serveur
              </Button>
            </div>
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600" /> Serveur cree avec succes</CardTitle>
            <CardDescription>Votre endpoint MCP est pret.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">URL MCP</p>
              <p className="font-mono text-sm break-all">{mcpUrl}</p>
            </div>
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">Claude Desktop - configuration</p>
              <pre className="text-xs bg-muted p-2 rounded-md overflow-auto">{`{
  "mcpServers": {
    "${serverName || 'mcpbuilder'}": {
      "url": "${mcpUrl}",
      "transport": "sse"
    }
  }
}`}</pre>
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(mcpUrl)}>
                <Copy className="h-4 w-4 mr-2" />
                Copier URL
              </Button>
            </div>
            <Button onClick={() => router.push('/')}>Aller au dashboard</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
