'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Globe, Pencil, FileText, ChevronRight, Loader2, AlertCircle, Plus, Trash2, Cloud, Monitor, Github, Sparkles, FileCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useImportFromUrl, useImportFromContent } from '@/hooks/use-import'
import { useDefaultWorkspace } from '@/hooks/use-workspace'
import { useCreateServer, useRuntimeConfig } from '@/hooks/use-servers'
import {
  useAnalyzeGithubRepoStandalone,
  type CandidateTool,
  type GithubAnalyzeResult,
} from '@/hooks/use-github-import'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { ParsedOpenAPIResult, ParsedTool } from '@mcpbuilder/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

type Source = 'openapi' | 'manual' | 'template' | 'github'

type GithubSelectedTool = CandidateTool & { selected: boolean }
type OpenAPITab = 'url' | 'file' | 'paste'
type Step = 1 | 2 | 3

interface ToolEdit {
  name: string
  description: string
}

interface ManualTool {
  name: string
  description: string
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  httpUrl: string
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
const BLANK_TOOL: ManualTool = { name: '', description: '', httpMethod: 'GET', httpUrl: '' }

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

// ─── RuntimeModeSelector ─────────────────────────────────────────────────────

type RuntimeMode = 'LOCAL' | 'CLOUDFLARE'

function RuntimeModeSelector({
  value,
  onChange,
  cloudflareConfigured,
}: {
  value: RuntimeMode
  onChange: (v: RuntimeMode) => void
  cloudflareConfigured: boolean
}) {
  const options: Array<{
    mode: RuntimeMode
    icon: React.ReactNode
    label: string
    desc: string
    badge?: string
  }> = [
    {
      mode: 'CLOUDFLARE',
      icon: <Cloud className="h-5 w-5" />,
      label: '☁️ Cloudflare Workers',
      desc: 'Hébergé sur le réseau edge global Cloudflare, disponible en quelques secondes',
      badge: 'Recommandé',
    },
    {
      mode: 'LOCAL',
      icon: <Monitor className="h-5 w-5" />,
      label: '💻 Local',
      desc: 'Hébergé sur nos serveurs, pour le développement',
    },
  ]

  return (
    <div className="space-y-3">
      <Label>Mode d&apos;hébergement</Label>
      <div className="grid grid-cols-1 gap-2">
        {options.map((opt) => (
          <label
            key={opt.mode}
            htmlFor={`runtime-${opt.mode}`}
            className={cn(
              'flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors',
              value === opt.mode
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40',
            )}
          >
            <RadioGroup value={value} onValueChange={(v) => onChange(v as RuntimeMode)}>
              <RadioGroupItem value={opt.mode} id={`runtime-${opt.mode}`} className="shrink-0" />
            </RadioGroup>
            <div className={cn('text-muted-foreground', value === opt.mode && 'text-primary')}>
              {opt.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-medium text-sm">{opt.label}</div>
                {opt.badge && (
                  <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
                    {opt.badge}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {value === 'CLOUDFLARE' && !cloudflareConfigured && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          <div>
            Les credentials Cloudflare ne sont pas configurés.{' '}
            <a
              href="https://developers.cloudflare.com/workers/get-started/guide/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              Voir la documentation de configuration
            </a>
          </div>
        </div>
      )}
    </div>
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

// ─── Confidence badge (shared with Step2GithubTools) ─────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-green-100 text-green-700',
  PUT: 'bg-orange-100 text-orange-700',
  PATCH: 'bg-yellow-100 text-yellow-700',
  DELETE: 'bg-red-100 text-red-700',
}

function InlineMethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-mono text-xs font-semibold rounded px-1.5 py-0.5 shrink-0',
        METHOD_COLORS[method] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {method}
    </span>
  )
}

function ConfidenceBadge({ confidence }: { confidence: CandidateTool['confidence'] }) {
  if (confidence === 'high')
    return <span className="text-xs rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700">Fiable</span>
  if (confidence === 'medium')
    return <span className="text-xs rounded px-1.5 py-0.5 bg-blue-100 text-blue-700">Inféré</span>
  return <span className="text-xs rounded px-1.5 py-0.5 bg-amber-100 text-amber-700">Incertain</span>
}

// ─── Step1Source ──────────────────────────────────────────────────────────────

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
  // GitHub-specific
  githubRepoUrl,
  onGithubRepoUrlChange,
  githubBranch,
  onGithubBranchChange,
  githubBaseUrl,
  onGithubBaseUrlChange,
  githubToken,
  onGithubTokenChange,
  onGithubAnalyze,
  githubIsLoading,
  githubError,
  githubHasParsed,
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
  githubRepoUrl: string
  onGithubRepoUrlChange: (v: string) => void
  githubBranch: string
  onGithubBranchChange: (v: string) => void
  githubBaseUrl: string
  onGithubBaseUrlChange: (v: string) => void
  githubToken: string
  onGithubTokenChange: (v: string) => void
  onGithubAnalyze: () => void
  githubIsLoading: boolean
  githubError: string | null
  githubHasParsed: boolean
}) {
  const sourceOptions: Array<{ value: Source; icon: React.ReactNode; label: string; desc: string }> = [
    {
      value: 'github',
      icon: <Github className="h-5 w-5" />,
      label: 'Importer depuis GitHub',
      desc: 'Analyser un repo GitHub pour extraire les endpoints API automatiquement',
    },
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

  const githubUrlValid = githubRepoUrl.trim().startsWith('https://github.com/')

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

      {source === 'github' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gh-repo">URL du repository *</Label>
            <Input
              id="gh-repo"
              value={githubRepoUrl}
              onChange={(e) => onGithubRepoUrlChange(e.target.value)}
              placeholder="https://github.com/owner/repo"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="gh-branch">Branche</Label>
              <Input
                id="gh-branch"
                value={githubBranch}
                onChange={(e) => onGithubBranchChange(e.target.value)}
                placeholder="main"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gh-baseurl">URL de base de l&apos;API</Label>
              <Input
                id="gh-baseurl"
                value={githubBaseUrl}
                onChange={(e) => onGithubBaseUrlChange(e.target.value)}
                placeholder="https://api.example.com"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gh-token">Token GitHub</Label>
            <Input
              id="gh-token"
              type="password"
              value={githubToken}
              onChange={(e) => onGithubTokenChange(e.target.value)}
              placeholder="ghp_… (optionnel, pour les repos privés)"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Non stocké — utilisé uniquement pour cette analyse.
            </p>
          </div>

          {githubError && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{githubError}</span>
            </div>
          )}

          <Button
            onClick={onGithubAnalyze}
            disabled={githubIsLoading || !githubUrlValid}
            className="w-full"
          >
            {githubIsLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyse en cours…
              </>
            ) : (
              <>
                <Github className="h-4 w-4 mr-2" />
                Analyser le repository
              </>
            )}
          </Button>

          {githubHasParsed && (
            <Button onClick={onNext} className="w-full" variant="default">
              Configurer les tools
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      )}

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

      {source === 'manual' && (
        <Button className="w-full" onClick={onNext}>
          Continuer
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      )}

      {source === 'template' && (
        <Button className="w-full" onClick={onNext}>
          Voir les templates
          <ChevronRight className="h-4 w-4 ml-2" />
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

// ─── Step 2 — Configure tools (OpenAPI) ──────────────────────────────────────

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

// ─── Step 2 — Configure tools (Manual) ───────────────────────────────────────

function Step2ManualTools({
  tools,
  onToolsChange,
  onNext,
  onBack,
}: {
  tools: ManualTool[]
  onToolsChange: (tools: ManualTool[]) => void
  onNext: () => void
  onBack: () => void
}) {
  const [form, setForm] = useState<ManualTool>({ ...BLANK_TOOL })
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(true)

  const isFormValid = form.name.trim() !== '' && form.description.trim() !== '' && form.httpUrl.trim() !== ''

  const handleSave = () => {
    if (!isFormValid) return
    if (editingIndex !== null) {
      const updated = [...tools]
      updated[editingIndex] = form
      onToolsChange(updated)
      setEditingIndex(null)
    } else {
      onToolsChange([...tools, form])
    }
    setForm({ ...BLANK_TOOL })
    setShowForm(false)
  }

  const handleEdit = (i: number) => {
    setForm({ ...tools[i]! })
    setEditingIndex(i)
    setShowForm(true)
  }

  const handleDelete = (i: number) => {
    onToolsChange(tools.filter((_, idx) => idx !== i))
    if (editingIndex === i) {
      setEditingIndex(null)
      setForm({ ...BLANK_TOOL })
      setShowForm(tools.length <= 1)
    }
  }

  const handleCancelForm = () => {
    setForm({ ...BLANK_TOOL })
    setEditingIndex(null)
    setShowForm(false)
  }

  return (
    <div className="space-y-4">
      {tools.length > 0 && (
        <ScrollArea className="max-h-[280px] pr-3">
          <div className="space-y-2">
            {tools.map((tool, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-lg border p-3 transition-colors',
                  editingIndex === i ? 'border-primary/40 bg-primary/5' : 'border-border',
                )}
              >
                <div className="flex items-center gap-3">
                  <MethodBadge method={tool.httpMethod} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-medium truncate">{tool.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{tool.httpUrl}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleEdit(i)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {showForm ? (
        <div className="rounded-lg border border-primary/30 bg-muted/20 p-4 space-y-3">
          <p className="text-sm font-medium">
            {editingIndex !== null ? 'Modifier le tool' : 'Nouveau tool'}
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1">
              <Label className="text-xs">Méthode</Label>
              <Select
                value={form.httpMethod}
                onValueChange={(v) => setForm((f) => ({ ...f, httpMethod: v as ManualTool['httpMethod'] }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HTTP_METHODS.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs font-mono">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">URL</Label>
              <Input
                placeholder="https://api.example.com/endpoint"
                value={form.httpUrl}
                onChange={(e) => setForm((f) => ({ ...f, httpUrl: e.target.value }))}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nom du tool</Label>
            <Input
              placeholder="get_user, create_payment…"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input
              placeholder="Récupère les informations d'un utilisateur par son ID"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex gap-2 pt-1">
            {tools.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleCancelForm} className="flex-1">
                Annuler
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={!isFormValid} className="flex-1">
              {editingIndex !== null ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => { setEditingIndex(null); setForm({ ...BLANK_TOOL }); setShowForm(true) }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Ajouter un tool
        </Button>
      )}

      <Separator />

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Retour
        </Button>
        <Button onClick={onNext} disabled={tools.length === 0} className="flex-1">
          Suivant
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 2 — Configure tools (GitHub) ───────────────────────────────────────

function Step2GithubTools({
  tools,
  onToolsChange,
  baseUrl,
  onBaseUrlChange,
  source,
  onNext,
  onBack,
}: {
  tools: GithubSelectedTool[]
  onToolsChange: (tools: GithubSelectedTool[]) => void
  baseUrl: string
  onBaseUrlChange: (v: string) => void
  source: 'openapi' | 'ai'
  onNext: () => void
  onBack: () => void
}) {
  const selectedCount = tools.filter((t) => t.selected).length

  const toggleAll = () => {
    const allSelected = tools.every((t) => t.selected)
    onToolsChange(tools.map((t) => ({ ...t, selected: !allSelected })))
  }

  const toggleOne = (idx: number) => {
    onToolsChange(tools.map((t, i) => (i === idx ? { ...t, selected: !t.selected } : t)))
  }

  const handleBaseUrlChange = (newBase: string) => {
    const oldBase = baseUrl.replace(/\/$/, '')
    const newNormalized = newBase.replace(/\/$/, '')
    onBaseUrlChange(newBase)
    if (!oldBase) return
    onToolsChange(
      tools.map((t) => ({
        ...t,
        httpUrl: t.httpUrl.startsWith(oldBase)
          ? newNormalized + t.httpUrl.slice(oldBase.length)
          : t.httpUrl,
      })),
    )
  }

  return (
    <div className="space-y-4">
      {/* Source banner */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium',
          source === 'openapi'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-purple-50 text-purple-700 border border-purple-200',
        )}
      >
        {source === 'openapi' ? (
          <FileCode className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
        )}
        {source === 'openapi'
          ? 'Spec OpenAPI détectée dans le repository'
          : 'Endpoints extraits par IA depuis le README'}
      </div>

      {/* Base URL override */}
      <div className="space-y-1.5">
        <Label htmlFor="gh-review-baseurl" className="text-xs">
          URL de base
        </Label>
        <Input
          id="gh-review-baseurl"
          value={baseUrl}
          onChange={(e) => handleBaseUrlChange(e.target.value)}
          placeholder="https://api.example.com"
          className="h-8 text-xs font-mono"
        />
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {selectedCount} / {tools.length} outil{tools.length !== 1 ? 's' : ''} sélectionné{selectedCount !== 1 ? 's' : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          {tools.every((t) => t.selected) ? 'Tout désélectionner' : 'Tout sélectionner'}
        </Button>
      </div>

      <ScrollArea className="h-[340px] pr-3">
        <div className="space-y-1.5">
          {tools.map((tool, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => toggleOne(idx)}
              className={cn(
                'w-full text-left rounded-md border px-3 py-2.5 transition-colors',
                tool.selected
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-transparent bg-muted/40 opacity-60',
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center',
                    tool.selected ? 'bg-primary border-primary' : 'border-muted-foreground/40',
                  )}
                >
                  {tool.selected && <Check className="h-3 w-3 text-primary-foreground" />}
                </span>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <InlineMethodBadge method={tool.httpMethod} />
                    <span className="text-sm font-medium truncate">{tool.name}</span>
                    <ConfidenceBadge confidence={tool.confidence} />
                  </div>
                  {tool.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{tool.description}</p>
                  )}
                  <code className="text-xs font-mono text-muted-foreground truncate block">
                    {tool.httpUrl}
                  </code>
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>

      <Separator />

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Retour
        </Button>
        <Button onClick={onNext} disabled={selectedCount === 0} className="flex-1">
          Suivant
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 3 — Name the server (OpenAPI) ──────────────────────────────────────

function Step3Name({
  tools,
  selectedIds,
  edits,
  baseUrl,
  serverName,
  onServerNameChange,
  serverDescription,
  onServerDescriptionChange,
  runtimeMode,
  onRuntimeModeChange,
  cloudflareConfigured,
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
  runtimeMode: RuntimeMode
  onRuntimeModeChange: (v: RuntimeMode) => void
  cloudflareConfigured: boolean
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

        <RuntimeModeSelector
          value={runtimeMode}
          onChange={onRuntimeModeChange}
          cloudflareConfigured={cloudflareConfigured}
        />
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

// ─── Step 3 — Name the server (Manual) ───────────────────────────────────────

function Step3NameManual({
  manualTools,
  serverName,
  onServerNameChange,
  serverDescription,
  onServerDescriptionChange,
  runtimeMode,
  onRuntimeModeChange,
  cloudflareConfigured,
  onSubmit,
  onBack,
  isSubmitting,
}: {
  manualTools: ManualTool[]
  serverName: string
  onServerNameChange: (v: string) => void
  serverDescription: string
  onServerDescriptionChange: (v: string) => void
  runtimeMode: RuntimeMode
  onRuntimeModeChange: (v: RuntimeMode) => void
  cloudflareConfigured: boolean
  onSubmit: () => void
  onBack: () => void
  isSubmitting: boolean
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="server-name-manual">Nom du serveur MCP</Label>
          <Input
            id="server-name-manual"
            placeholder="Mon serveur MCP"
            value={serverName}
            onChange={(e) => onServerNameChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="server-desc-manual">
            Description{' '}
            <span className="text-muted-foreground font-normal">(optionnel)</span>
          </Label>
          <Textarea
            id="server-desc-manual"
            placeholder="Description de votre serveur MCP…"
            value={serverDescription}
            onChange={(e) => onServerDescriptionChange(e.target.value)}
            className="min-h-[80px]"
          />
        </div>

        <RuntimeModeSelector
          value={runtimeMode}
          onChange={onRuntimeModeChange}
          cloudflareConfigured={cloudflareConfigured}
        />
      </div>

      <Separator />

      <div className="rounded-lg bg-muted/50 p-4 space-y-3">
        <p className="text-sm font-medium">Récapitulatif</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Tools configurés</dt>
          <dd>{manualTools.length}</dd>
        </dl>

        <div className="flex flex-wrap gap-1 mt-2">
          {manualTools.slice(0, 8).map((tool, i) => (
            <div key={i} className="flex items-center gap-1">
              <MethodBadge method={tool.httpMethod} />
              <span className="text-xs font-mono">{tool.name}</span>
            </div>
          ))}
          {manualTools.length > 8 && (
            <span className="text-xs text-muted-foreground">
              +{manualTools.length - 8} autres…
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
  const { workspaceId } = useDefaultWorkspace()

  const [step, setStep] = useState<Step>(1)
  const [source, setSource] = useState<Source>('github')
  const [openApiTab, setOpenApiTab] = useState<OpenAPITab>('url')
  const [urlInput, setUrlInput] = useState('')
  const [contentInput, setContentInput] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedResult, setParsedResult] = useState<ParsedOpenAPIResult | null>(null)

  // OpenAPI tool state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [edits, setEdits] = useState<Record<number, ToolEdit>>({})

  // Manual tool state
  const [manualTools, setManualTools] = useState<ManualTool[]>([])

  // GitHub source state
  const [githubRepoUrl, setGithubRepoUrl] = useState('')
  const [githubBranch, setGithubBranch] = useState('')
  const [githubBaseUrlInput, setGithubBaseUrlInput] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [githubError, setGithubError] = useState<string | null>(null)
  const [githubResult, setGithubResult] = useState<GithubAnalyzeResult | null>(null)
  const [githubTools, setGithubTools] = useState<GithubSelectedTool[]>([])
  const [githubReviewBaseUrl, setGithubReviewBaseUrl] = useState('')

  const [serverName, setServerName] = useState('')
  const [serverDescription, setServerDescription] = useState('')
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>('LOCAL')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const importFromUrl = useImportFromUrl()
  const importFromContent = useImportFromContent()
  const analyzeGithub = useAnalyzeGithubRepoStandalone()
  const createServer = useCreateServer(workspaceId ?? '')
  const { data: runtimeConfig } = useRuntimeConfig()

  // Pre-select the default mode from server config
  React.useEffect(() => {
    if (runtimeConfig) {
      setRuntimeMode(runtimeConfig.defaultRuntimeMode)
    }
  }, [runtimeConfig])

  const isLoading = importFromUrl.isPending || importFromContent.isPending
  const githubIsLoading = analyzeGithub.isPending

  // ─── Analyze (OpenAPI) ────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    setParseError(null)
    try {
      let result: ParsedOpenAPIResult
      if (openApiTab === 'url') {
        result = await importFromUrl.mutateAsync({ url: urlInput.trim(), workspaceId: workspaceId ?? '' })
      } else {
        result = await importFromContent.mutateAsync({ content: contentInput, workspaceId: workspaceId ?? '' })
      }

      setParsedResult(result)

      const allIds = new Set(result.tools.map((_, i) => i))
      setSelectedIds(allIds)
      const initialEdits: Record<number, ToolEdit> = {}
      result.tools.forEach((t, i) => {
        initialEdits[i] = { name: t.suggestedName, description: t.suggestedDescription }
      })
      setEdits(initialEdits)

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

  // ─── Analyze (GitHub) ─────────────────────────────────────────────────────────

  const handleGithubAnalyze = useCallback(async () => {
    setGithubError(null)
    try {
      const result = await analyzeGithub.mutateAsync({
        repoUrl: githubRepoUrl.trim(),
        ...(githubBranch.trim() && { branch: githubBranch.trim() }),
        ...(githubBaseUrlInput.trim() && { baseUrl: githubBaseUrlInput.trim() }),
        ...(githubToken.trim() && { githubToken: githubToken.trim() }),
      })
      setGithubResult(result)
      setGithubReviewBaseUrl(result.baseUrl)
      setGithubTools(result.tools.map((t) => ({ ...t, selected: t.confidence !== 'low' })))
      if (!serverName) setServerName(result.title)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ??
        (err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'analyse.')
      setGithubError(msg)
    }
  }, [analyzeGithub, githubRepoUrl, githubBranch, githubBaseUrlInput, githubToken, serverName])

  // ─── Submit (GitHub) ──────────────────────────────────────────────────────────

  const handleSubmitGithub = useCallback(async () => {
    if (!workspaceId) return
    setIsSubmitting(true)
    setSubmitError(null)
    let createdServerId: string | null = null
    try {
      const server = await createServer.mutateAsync({
        name: serverName,
        runtimeMode,
        ...(serverDescription.trim() && { description: serverDescription.trim() }),
      })
      createdServerId = server.id

      const selected = githubTools
        .filter((t) => t.selected)
        .map((t) => ({
          name: t.name,
          description: t.description,
          httpMethod: t.httpMethod,
          httpUrl: t.httpUrl,
          parametersSchema: t.parametersSchema,
          headersConfig: [],
          isEnabled: true,
        }))

      if (selected.length > 0) {
        await apiClient.post(`/api/v1/servers/${server.id}/import/confirm`, { tools: selected })
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Une erreur inattendue est survenue lors de la création du serveur'
      if (!createdServerId) {
        setSubmitError(msg)
        setIsSubmitting(false)
        return
      }
      console.error('[MCPBuilder] Erreur lors de l\'import des tools GitHub :', msg)
    } finally {
      setIsSubmitting(false)
    }
    router.push(`/app/servers/${createdServerId}`)
  }, [githubTools, serverName, serverDescription, runtimeMode, workspaceId, router, createServer])

  // ─── Toggle tool selection (OpenAPI) ─────────────────────────────────────────

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

  // ─── Submit (OpenAPI) ─────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!parsedResult || !workspaceId) return
    setIsSubmitting(true)
    setSubmitError(null)
    let createdServerId: string | null = null
    try {
      const server = await createServer.mutateAsync({
        name: serverName,
        runtimeMode,
        ...(serverDescription.trim() && { description: serverDescription.trim() }),
      })
      createdServerId = server.id

      const toolPayloads = [...selectedIds].map((i) => ({
        name: edits[i]?.name ?? parsedResult.tools[i]!.suggestedName,
        description: edits[i]?.description ?? parsedResult.tools[i]!.suggestedDescription,
        httpMethod: parsedResult.tools[i]!.httpMethod as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        httpUrl: parsedResult.baseUrl
          ? `${parsedResult.baseUrl.replace(/\/$/, '')}${parsedResult.tools[i]!.httpPath}`
          : parsedResult.tools[i]!.httpPath,
        parametersSchema: parsedResult.tools[i]!.parametersSchema,
        headersConfig: [],
        isEnabled: true,
      }))

      for (let i = 0; i < toolPayloads.length; i++) {
        const isLast = i === toolPayloads.length - 1
        const url = `/api/v1/servers/${server.id}/tools${isLast ? '' : '?skipDeploy=true'}`
        await apiClient.post(url, toolPayloads[i])
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Une erreur inattendue est survenue lors de la création du serveur'
      if (!createdServerId) {
        // Échec avant même la création du serveur → on reste sur la page
        setSubmitError(msg)
        setIsSubmitting(false)
        return
      }
      // Le serveur a été créé mais un tool a échoué → on redirige quand même
      console.error('[MCPBuilder] Erreur lors de l\'ajout des tools :', msg)
    } finally {
      setIsSubmitting(false)
    }
    router.push(`/app/servers/${createdServerId}`)
  }, [parsedResult, selectedIds, edits, serverName, serverDescription, runtimeMode, workspaceId, router, createServer])

  // ─── Submit (Manual) ──────────────────────────────────────────────────────────

  const handleSubmitManual = useCallback(async () => {
    if (!workspaceId) return
    setIsSubmitting(true)
    setSubmitError(null)
    let createdServerId: string | null = null
    try {
      const server = await createServer.mutateAsync({
        name: serverName,
        runtimeMode,
        ...(serverDescription.trim() && { description: serverDescription.trim() }),
      })
      createdServerId = server.id

      for (let i = 0; i < manualTools.length; i++) {
        const isLast = i === manualTools.length - 1
        const url = `/api/v1/servers/${server.id}/tools${isLast ? '' : '?skipDeploy=true'}`
        await apiClient.post(url, {
          name: manualTools[i]!.name,
          description: manualTools[i]!.description,
          httpMethod: manualTools[i]!.httpMethod,
          httpUrl: manualTools[i]!.httpUrl,
          parametersSchema: {},
          headersConfig: [],
          isEnabled: true,
        })
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Une erreur inattendue est survenue lors de la création du serveur'
      if (!createdServerId) {
        // Échec avant même la création du serveur → on reste sur la page
        setSubmitError(msg)
        setIsSubmitting(false)
        return
      }
      // Le serveur a été créé mais un tool a échoué → on redirige quand même
      console.error('[MCPBuilder] Erreur lors de l\'ajout des tools :', msg)
    } finally {
      setIsSubmitting(false)
    }
    router.push(`/app/servers/${createdServerId}`)
  }, [manualTools, serverName, serverDescription, runtimeMode, workspaceId, router, createServer])

  // ─── Render ─────────────────────────────────────────────────────────────────

  const stepTitles: Record<Step, { title: string; description: string }> = {
    1: { title: 'Nouvelle source', description: 'Choisissez comment créer votre serveur MCP' },
    2: source === 'manual'
      ? { title: 'Configurer les tools', description: 'Ajoutez les tools de votre serveur MCP' }
      : source === 'github'
        ? {
            title: 'Outils détectés',
            description: `${githubResult?.tools.length ?? 0} outil${(githubResult?.tools.length ?? 0) !== 1 ? 's' : ''} détecté${(githubResult?.tools.length ?? 0) !== 1 ? 's' : ''} — sélectionnez ceux à importer`,
          }
        : {
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
              onNext={() => source === 'template' ? router.push('/app/templates') : setStep(2)}
              hasParsed={!!parsedResult}
              githubRepoUrl={githubRepoUrl}
              onGithubRepoUrlChange={setGithubRepoUrl}
              githubBranch={githubBranch}
              onGithubBranchChange={setGithubBranch}
              githubBaseUrl={githubBaseUrlInput}
              onGithubBaseUrlChange={setGithubBaseUrlInput}
              githubToken={githubToken}
              onGithubTokenChange={setGithubToken}
              onGithubAnalyze={handleGithubAnalyze}
              githubIsLoading={githubIsLoading}
              githubError={githubError}
              githubHasParsed={!!githubResult}
            />
          )}

          {step === 1 && isLoading && (
            <div className="mt-4">
              <ToolsSkeleton />
            </div>
          )}

          {step === 2 && source === 'openapi' && parsedResult && (
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

          {step === 2 && source === 'manual' && (
            <Step2ManualTools
              tools={manualTools}
              onToolsChange={setManualTools}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}

          {step === 2 && source === 'github' && githubResult && (
            <Step2GithubTools
              tools={githubTools}
              onToolsChange={setGithubTools}
              baseUrl={githubReviewBaseUrl}
              onBaseUrlChange={setGithubReviewBaseUrl}
              source={githubResult.source}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && source === 'openapi' && parsedResult && (
            <Step3Name
              tools={parsedResult.tools}
              selectedIds={selectedIds}
              edits={edits}
              baseUrl={parsedResult.baseUrl}
              serverName={serverName}
              onServerNameChange={setServerName}
              serverDescription={serverDescription}
              onServerDescriptionChange={setServerDescription}
              runtimeMode={runtimeMode}
              onRuntimeModeChange={setRuntimeMode}
              cloudflareConfigured={runtimeConfig?.cloudflareConfigured ?? false}
              onSubmit={handleSubmit}
              onBack={() => setStep(2)}
              isSubmitting={isSubmitting}
            />
          )}

          {step === 3 && source === 'manual' && (
            <Step3NameManual
              manualTools={manualTools}
              serverName={serverName}
              onServerNameChange={setServerName}
              serverDescription={serverDescription}
              onServerDescriptionChange={setServerDescription}
              runtimeMode={runtimeMode}
              onRuntimeModeChange={setRuntimeMode}
              cloudflareConfigured={runtimeConfig?.cloudflareConfigured ?? false}
              onSubmit={handleSubmitManual}
              onBack={() => setStep(2)}
              isSubmitting={isSubmitting}
            />
          )}

          {step === 3 && source === 'github' && (
            <Step3NameManual
              manualTools={githubTools
                .filter((t) => t.selected)
                .map((t) => ({
                  name: t.name,
                  description: t.description,
                  httpMethod: t.httpMethod,
                  httpUrl: t.httpUrl,
                }))}
              serverName={serverName}
              onServerNameChange={setServerName}
              serverDescription={serverDescription}
              onServerDescriptionChange={setServerDescription}
              runtimeMode={runtimeMode}
              onRuntimeModeChange={setRuntimeMode}
              cloudflareConfigured={runtimeConfig?.cloudflareConfigured ?? false}
              onSubmit={handleSubmitGithub}
              onBack={() => setStep(2)}
              isSubmitting={isSubmitting}
            />
          )}

          {step === 3 && submitError && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
