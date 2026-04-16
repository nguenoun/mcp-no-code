'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TemplateCategory } from '@mcpbuilder/shared'
import { TemplateGrid } from '@/components/templates/template-grid'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CredentialSelector } from '@/components/credential-selector/CredentialSelector'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateServerFromTemplate, useTemplate, useTemplates } from '@/hooks/use-templates'
import { useDefaultWorkspace } from '@/hooks/use-workspace'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const maybeApiError = error as { error?: { message?: string } }
    if (maybeApiError.error?.message) return maybeApiError.error.message
  }
  return 'Une erreur inattendue est survenue.'
}

export default function TemplatesPage() {
  const router = useRouter()
  const { workspaceId } = useDefaultWorkspace()
  const { data: templates } = useTemplates()
  const [category, setCategory] = useState<'all' | TemplateCategory>('all')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const { data: selectedTemplate } = useTemplate(selectedTemplateId)
  const createFromTemplate = useCreateServerFromTemplate(workspaceId ?? '')

  const [serverName, setServerName] = useState('')
  const [credentialId, setCredentialId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (selectedTemplate) {
      setServerName(`${selectedTemplate.name} MCP Server`)
    }
  }, [selectedTemplate])

  async function handleCreate() {
    if (!workspaceId || !selectedTemplateId || !serverName.trim()) return
    setActionError(null)
    try {
      const created = await createFromTemplate.mutateAsync({
        templateId: selectedTemplateId,
        serverName: serverName.trim(),
        credentialId: credentialId ?? undefined,
      })
      router.push(`/servers/${created.id}`)
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  if (!workspaceId) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">Creer rapidement un nouveau serveur MCP a partir d&apos;un template.</p>
      </div>

      <TemplateGrid
        templates={templates ?? []}
        selectedCategory={category}
        onCategoryChange={setCategory}
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={setSelectedTemplateId}
        onStartFromScratch={() => router.push('/servers/new')}
      />

      {selectedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle>Configuration rapide</CardTitle>
            <CardDescription>{selectedTemplate.name} - {selectedTemplate.tools.length} tools inclus</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="serverName">Nom du serveur</Label>
              <Input id="serverName" value={serverName} onChange={(e) => setServerName(e.target.value)} />
            </div>

            {selectedTemplate.authType !== 'NONE' && (
              <div className="space-y-2">
                <Label>Credential ({selectedTemplate.authType})</Label>
                <CredentialSelector workspaceId={workspaceId} value={credentialId} onChange={setCredentialId} />
              </div>
            )}

            <Button onClick={handleCreate} disabled={!serverName.trim() || createFromTemplate.isPending}>
              Creer depuis le template
            </Button>
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
