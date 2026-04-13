'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Check, Globe, Pencil, FileText, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useImportFromUrl, useImportFromContent } from '@/hooks/use-import'
import { cn } from '@/lib/utils'
import type { ParsedOpenAPIResult, ParsedTool } from '@mcpbuilder/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

type Source = 'openapi' | 'manual' | 'template'
type OpenAPITab = 'url' | 'file' | 'paste'
type Step = 1 | 2 | 3

interface ToolEdit {
  name: string
  description: string
}

// ─── HTTP method badge helper ─────────────────────────────────────────────────

type HttpVariant = 'get' | 'post' | 'put' | 'patch' | 'delete'

function MethodBadge({ method }: { method: string }) {
  const lower = method.toLowerCase() as HttpVariant
  const variants: Record<HttpVariant, string> = {
    get: 'get',
    post: 'post',
    put: 'put',
    patch: 'patch',
    delete: 'delete',
  }
  return (
    <Badge variant={(variants[lower] ?? 'secondary') as HttpVariant} className="font-mono text-xs uppercase w-16 justify-center">
      {method}
    </Badge>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { n: 1 as Step, label: 'Source' },
    { n: 2 as Step, label: 'Tools' },
    { n: 3 as Step, label: 'Nommer' },
  ]

  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                s.n < current
                  ? 'border-primary bg-primary text-primary-foreground'
                  : s.n === current
                    ? 'border-primary bg-background text-primary'
                    : 'border-muted-foreground/30 bg-background text-muted-foreground/50',
              )}
            >
              {s.n < current ? <Check className="h-4 w-4" /> : s.n}
            </div>
            <span
              className={cn(
                'text-sm font-medium hidden sm:block',
                s.n === current ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className="mx-3 h-4 w-4 text-muted-foreground/40 shrink-0" />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Step 1 — Source ──────────────────────────────────────────────────────────

function Step1Source({
  source,
  onSourceChange,
  openApiTab,
  onTabChange,
  urlInput,
  onUrlChange,
  contentInput,
  onContentChange,
  onAnalyze,
  isLoading,
  error,
  onNext,
  hasParsed,
}: {
  source: Source
  onSourceChange: (s: Source) => void
  openApiTab: OpenAPITab
  onTabChange: (t: OpenAPITab) => void
  urlInput: string
  onUrlChange: (v: string) => void
  contentInput: string
  onContentChange: (v: string) => void
  onAnalyze: () => void
  isLoading: boolean
  error: string | null
  onNext: () => void
  hasParsed: boolean
}) {
  const sourceOptions: Array<{ value: Source; icon: React.ReactNode; label: string; desc: string }> = [
    {
      value: 'openapi',
      icon: <Globe className="h-5 w-5" />,
      label: 'Importer OpenAPI',
      desc: 'Depuis une URL, un fichier ou du JSON/YAML',
    },
    {
      value: 'manual',
      icon: <Pencil className="h-5 w-5" />,
      label: 'Créer manuellement',
      desc: 'Configurer chaque tool un par un',
    },
    {
      value: 'template',
      icon: <FileText className="h-5 w-5" />,
      label: 'Depuis un template',
      desc: 'GitHub, Notion, Stripe et plus encore',
    },
  ]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => onContentChange(ev.target?.result as string)
    reader.readAsText(file)
  }

  return (
    <div className="space-y-6">
      <RadioGroup
        value={source}
        onValueChange={(v) => onSourceChange(v as Source)}
        className="grid grid-cols-1 gap-3"
      >
        {sourceOptions.map((opt) => (
          <label
            key={opt.value}
            htmlFor={`source-${opt.value}`}
            className={cn(
              'flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors',
              source === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40',
            )}
          >
            <RadioGroupItem value={opt.value} id={`source-${opt.value}`} className="shrink-0" />
            <div className={cn('text-muted-foreground', source === opt.value && 'text-primary')}>
              {opt.icon}
            </div>
            <div>
              <div className="font-medium text-sm">{opt.label}</div>
              <div className="text-xs text-muted-foreground">{opt.desc}</div>
            </div>
          </label>
        ))}
      </RadioGroup>

      {source === 'openapi' && (
        <div className="space-y-4">
          <Tabs value={openApiTab} onValueChange={(v) => onTabChange(v as OpenAPITab)}>
            <TabsList className="w-full">
              <TabsTrigger value="url" className="flex-1">URL</TabsTrigger>
              <TabsTrigger value="file" className="flex-1">Fichier</TabsTrigger>
              <TabsTrigger value="paste" className="flex-1">JSON / YAML</TabsTrigger>
            </TabsList>

            <TabsContent value="url" className="space-y-2">
              <Label htmlFor="spec-url">URL de la spec OpenAPI</Label>
              <Input
                id="spec-url"
                type="url"
                placeholder="https://api.example.com/openapi.json"
                value={urlInput}
                onChange={(e) => onUrlChange(e.target.value)}
                className={cn(error && 'border-destructive')}
              />
              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p>{error}</p>
                    <p className="text-muted-foreground mt-1">
                      Vérifiez que l&apos;URL est en HTTPS, publiquement accessible et retourne un JSON/YAML valide.
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="file" className="space-y-2">
              <Label htmlFor="spec-file">Fichier OpenAPI (.json, .yaml, .yml)</Label>
              <Input
                id="spec-file"
                type="file"
                accept=".json,.yaml,.yml"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
              {contentInput && (
                <p className="text-xs text-muted-foreground">
                  Fichier chargé — {(contentInput.length / 1024).toFixed(1)} KB
                </p>
              )}
              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="paste" className="space-y-2">
              <Label htmlFor="spec-content">Contenu JSON ou YAML</Label>
              <Textarea
                id="spec-content"
                placeholder={'{\n  "openapi": "3.0.0",\n  ...\n}'}
                value={contentInput}
                onChange={(e) => onContentChange(e.target.value)}
                className={cn('font-mono text-xs min-h-[200px]', error && 'border-destructive')}
              />
              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p>{error}</p>
                    <p className="text-muted-foreground mt-1">
                      Assurez-vous que le contenu est un JSON/YAML valide contenant un champ{' '}
                      <code className="font-mono bg-muted px-1 rounded">openapi</code> ou{' '}
                      <code className="font-mono bg-muted px-1 rounded">swagger</code>.
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <Button
            onClick={onAnalyze}
            disabled={
              isLoading ||
              (openApiTab === 'url' ? !urlInput.trim() : !contentInput.trim())
            }
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyse en cours…
              </>
            ) : (
              'Analyser'
            )}
          </Button>

          {hasParsed && (
            <Button onClick={onNext} className="w-full" variant="default">
              Configurer les tools
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      )}

      {source !== 'openapi' && (
        <Button className="w-full" disabled>
          Bientôt disponible
        </Button>
      )}
    </div>
  )
}

// ─── Skeleton loader for tools list ───────────────────────────────────────────

function ToolsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-md border">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 flex-1 rounded" />
        </div>
      ))}
    </div>
  )
}

// ─── Step 2 — Configure tools ─────────────────────────────────────────────────

function Step2Tools({
  tools,
  selectedIds,
  edits,
  onToggle,
  onToggleAll,
  onEditChange,
  onNext,
  onBack,
}: {
  tools: ParsedTool[]
  selectedIds: Set<number>
  edits: Record<number, ToolEdit>
  onToggle: (i: number) => void
  onToggleAll: () => void
  onEditChange: (i: number, field: 'name' | 'description', value: string) => void
  onNext: () => void
  onBack: () => void
}) {
  const allSelected = selectedIds.size === tools.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {selectedIds.size} / {tools.length} tool{tools.length !== 1 ? 's' : ''} sélectionné{selectedIds.size !== 1 ? 's' : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={onToggleAll}>
          {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </Button>
      </div>

      <ScrollArea className="h-[420px] pr-3">
        <div className="space-y-2">
          {tools.map((tool, i) => {
            const edit = edits[i] ?? { name: tool.suggestedName, description: tool.suggestedDescription }
            const isSelected = selectedIds.has(i)

            return (
              <div
                key={i}
                className={cn(
                  'rounded-lg border p-3 transition-colors',
                  isSelected ? 'border-primary/40 bg-primary/5' : 'border-border opacity-60',
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggle(i)}
                    className="mt-0.5 shrink-0"
                  />
                  <MethodBadge method={tool.httpMethod} />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-muted-foreground truncate font-mono">
                        {tool.httpPath}
                      </code>
                    </div>

                    {isSelected ? (
                      <>
                        <Input
                          value={edit.name}
                          onChange={(e) => onEditChange(i, 'name', e.target.value)}
                          placeholder="Nom du tool"
                          className="h-7 text-xs font-mono"
                        />
                        <Input
                          value={edit.description}
                          onChange={(e) => onEditChange(i, 'description', e.target.value)}
                          placeholder="Description"
                          className="h-7 text-xs"
                        />
                      </>
                    ) : (
                      <p className="text-xs font-mono text-muted-foreground truncate">
                        {edit.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <Separator />

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Retour
        </Button>
        <Button onClick={onNext} disabled={selectedIds.size === 0} className="flex-1">
          Suivant
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 3 — Name the server ─────────────────────────────────────────────────

function Step3Name({
  tools,
  selectedIds,
  edits,
  baseUrl,
  serverName,
  onServerNameChange,
  serverDescription,
  onServerDescriptionChange,
  onSubmit,
  onBack,
  isSubmitting,
}: {
  tools: ParsedTool[]
  selectedIds: Set<number>
  edits: Record<number, ToolEdit>
  baseUrl: string
  serverName: string
  onServerNameChange: (v: string) => void
  serverDescription: string
  onServerDescriptionChange: (v: string) => void
  onSubmit: () => void
  onBack: () => void
  isSubmitting: boolean
}) {
  const selectedTools = [...selectedIds].map((i) => ({
    tool: tools[i]!,
    edit: edits[i] ?? { name: tools[i]!.suggestedName, description: tools[i]!.suggestedDescription },
  }))

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="server-name">Nom du serveur MCP</Label>
          <Input
            id="server-name"
            placeholder="Mon API Stripe"
            value={serverName}
            onChange={(e) => onServerNameChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="server-desc">
            Description{' '}
            <span className="text-muted-foreground font-normal">(optionnel)</span>
          </Label>
          <Textarea
            id="server-desc"
            placeholder="Serveur MCP pour l'API Stripe — paiements, clients, abonnements…"
            value={serverDescription}
            onChange={(e) => onServerDescriptionChange(e.target.value)}
            className="min-h-[80px]"
          />
        </div>
      </div>

      <Separator />

      <div className="rounded-lg bg-muted/50 p-4 space-y-3">
        <p className="text-sm font-medium">Récapitulatif</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Base URL</dt>
          <dd className="font-mono text-xs truncate">{baseUrl || '—'}</dd>
          <dt className="text-muted-foreground">Tools sélectionnés</dt>
          <dd>{selectedIds.size}</dd>
        </dl>

        <div className="flex flex-wrap gap-1 mt-2">
          {selectedTools.slice(0, 8).map(({ tool, edit }, i) => (
            <div key={i} className="flex items-center gap-1">
              <MethodBadge method={tool.httpMethod} />
              <span className="text-xs font-mono">{edit.name}</span>
            </div>
          ))}
          {selectedIds.size > 8 && (
            <span className="text-xs text-muted-foreground">
              +{selectedIds.size - 8} autres…
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Retour
        </Button>
        <Button
          onClick={onSubmit}
          disabled={!serverName.trim() || isSubmitting}
          className="flex-1"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Création…
            </>
          ) : (
            'Créer le serveur MCP'
          )}
        </Button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NewServerPage() {
  const router = useRouter()
  const { data: session } = useSession()

  // TODO: replace with real workspaceId from session/context
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId ?? 'placeholder'

  const [step, setStep] = useState<Step>(1)
  const [source, setSource] = useState<Source>('openapi')
  const [openApiTab, setOpenApiTab] = useState<OpenAPITab>('url')
  const [urlInput, setUrlInput] = useState('')
  const [contentInput, setContentInput] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedResult, setParsedResult] = useState<ParsedOpenAPIResult | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [edits, setEdits] = useState<Record<number, ToolEdit>>({})

  const [serverName, setServerName] = useState('')
  const [serverDescription, setServerDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const importFromUrl = useImportFromUrl()
  const importFromContent = useImportFromContent()

  const isLoading = importFromUrl.isPending || importFromContent.isPending

  // ─── Analyze ────────────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    setParseError(null)
    try {
      let result: ParsedOpenAPIResult
      if (openApiTab === 'url') {
        result = await importFromUrl.mutateAsync({ url: urlInput.trim(), workspaceId })
      } else {
        result = await importFromContent.mutateAsync({ content: contentInput, workspaceId })
      }

      setParsedResult(result)

      // Pre-select all tools, pre-populate edits with suggested values
      const allIds = new Set(result.tools.map((_, i) => i))
      setSelectedIds(allIds)
      const initialEdits: Record<number, ToolEdit> = {}
      result.tools.forEach((t, i) => {
        initialEdits[i] = { name: t.suggestedName, description: t.suggestedDescription }
      })
      setEdits(initialEdits)

      // Pre-fill server name from spec title
      if (!serverName) setServerName(result.title)
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'error' in err
            ? String((err as { error: { message: string } }).error.message)
            : 'Une erreur inattendue s\'est produite'
      setParseError(msg)
    }
  }, [openApiTab, urlInput, contentInput, workspaceId, importFromUrl, importFromContent, serverName])

  // ─── Toggle tool selection ───────────────────────────────────────────────────

  const handleToggle = useCallback((i: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }, [])

  const handleToggleAll = useCallback(() => {
    if (!parsedResult) return
    setSelectedIds((prev) =>
      prev.size === parsedResult.tools.length
        ? new Set()
        : new Set(parsedResult.tools.map((_, i) => i)),
    )
  }, [parsedResult])

  const handleEditChange = useCallback(
    (i: number, field: 'name' | 'description', value: string) => {
      setEdits((prev) => ({ ...prev, [i]: { ...prev[i]!, [field]: value } }))
    },
    [],
  )

  // ─── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!parsedResult) return
    setIsSubmitting(true)
    try {
      const selectedTools = [...selectedIds].map((i) => ({
        name: edits[i]?.name ?? parsedResult.tools[i]!.suggestedName,
        description: edits[i]?.description ?? parsedResult.tools[i]!.suggestedDescription,
        httpMethod: parsedResult.tools[i]!.httpMethod,
        httpUrl: `${parsedResult.baseUrl}${parsedResult.tools[i]!.httpPath}`,
        parametersSchema: parsedResult.tools[i]!.parametersSchema,
      }))

      // TODO: POST /api/v1/workspaces/:workspaceId/servers once the route is implemented
      console.log('Creating MCP server:', {
        name: serverName,
        description: serverDescription,
        workspaceId,
        tools: selectedTools,
      })

      router.push('/dashboard')
    } finally {
      setIsSubmitting(false)
    }
  }, [parsedResult, selectedIds, edits, serverName, serverDescription, workspaceId, router])

  // ─── Render ─────────────────────────────────────────────────────────────────

  const stepTitles: Record<Step, { title: string; description: string }> = {
    1: { title: 'Nouvelle source', description: 'Choisissez comment créer votre serveur MCP' },
    2: {
      title: 'Configurer les tools',
      description: `${parsedResult?.tools.length ?? 0} tools détectés — sélectionnez et personnalisez`,
    },
    3: { title: 'Nommer le serveur', description: 'Dernière étape avant de créer votre serveur' },
  }

  const { title, description } = stepTitles[step]

  return (
    <div className="max-w-2xl mx-auto">
      <StepIndicator current={step} />

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <Step1Source
              source={source}
              onSourceChange={setSource}
              openApiTab={openApiTab}
              onTabChange={setOpenApiTab}
              urlInput={urlInput}
              onUrlChange={setUrlInput}
              contentInput={contentInput}
              onContentChange={setContentInput}
              onAnalyze={handleAnalyze}
              isLoading={isLoading}
              error={parseError}
              onNext={() => setStep(2)}
              hasParsed={!!parsedResult}
            />
          )}

          {step === 1 && isLoading && (
            <div className="mt-4">
              <ToolsSkeleton />
            </div>
          )}

          {step === 2 && parsedResult && (
            <Step2Tools
              tools={parsedResult.tools}
              selectedIds={selectedIds}
              edits={edits}
              onToggle={handleToggle}
              onToggleAll={handleToggleAll}
              onEditChange={handleEditChange}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && parsedResult && (
            <Step3Name
              tools={parsedResult.tools}
              selectedIds={selectedIds}
              edits={edits}
              baseUrl={parsedResult.baseUrl}
              serverName={serverName}
              onServerNameChange={setServerName}
              serverDescription={serverDescription}
              onServerDescriptionChange={setServerDescription}
              onSubmit={handleSubmit}
              onBack={() => setStep(2)}
              isSubmitting={isSubmitting}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
