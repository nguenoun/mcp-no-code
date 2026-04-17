'use client'

import * as React from 'react'
import {
  Github,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Sparkles,
  FileCode,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  useAnalyzeGithubRepo,
  useConfirmGithubImport,
  type CandidateTool,
  type GithubAnalyzeResult,
} from '@/hooks/use-github-import'
import type { ToolFormData } from '@/hooks/use-tools'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'form' | 'analyzing' | 'review' | 'done'

type SelectedTool = CandidateTool & { selected: boolean }

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: CandidateTool['confidence'] }) {
  if (confidence === 'high') {
    return (
      <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">
        Fiable
      </Badge>
    )
  }
  if (confidence === 'medium') {
    return (
      <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 border-blue-200">
        Inféré
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 border-amber-200">
      Incertain
    </Badge>
  )
}

// ─── Method badge ─────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-green-100 text-green-700',
  PUT: 'bg-orange-100 text-orange-700',
  PATCH: 'bg-yellow-100 text-yellow-700',
  DELETE: 'bg-red-100 text-red-700',
}

function MethodBadge({ method }: { method: string }) {
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

// ─── Step 1 — Form ────────────────────────────────────────────────────────────

function FormStep({
  serverId,
  onResult,
}: {
  serverId: string
  onResult: (result: GithubAnalyzeResult) => void
}) {
  const analyze = useAnalyzeGithubRepo(serverId)

  const [repoUrl, setRepoUrl] = React.useState('')
  const [branch, setBranch] = React.useState('')
  const [baseUrl, setBaseUrl] = React.useState('')
  const [token, setToken] = React.useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await analyze.mutateAsync({
      repoUrl: repoUrl.trim(),
      branch: branch.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      githubToken: token.trim() || undefined,
    })
    onResult(result)
  }

  const errorMsg = analyze.isError
    ? ((analyze.error as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message ??
      (analyze.error instanceof Error ? analyze.error.message : 'Une erreur est survenue.'))
    : null

  const isValid = repoUrl.trim().startsWith('https://github.com/')

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="gh-repo">URL du repository *</Label>
        <Input
          id="gh-repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
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
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gh-baseurl">URL de base de l&apos;API</Label>
          <Input
            id="gh-baseurl"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
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
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_… (optionnel, pour les repos privés)"
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          Non stocké — utilisé uniquement pour cette analyse.
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <DialogFooter>
        <Button type="submit" disabled={!isValid || analyze.isPending} className="w-full">
          {analyze.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyse en cours…</>
          ) : (
            <><Github className="h-4 w-4 mr-2" />Analyser le repository</>
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ─── Step 2 — Review ──────────────────────────────────────────────────────────

function ReviewStep({
  serverId,
  result,
  onBack,
  onDone,
}: {
  serverId: string
  result: GithubAnalyzeResult
  onBack: () => void
  onDone: (count: number) => void
}) {
  const confirm = useConfirmGithubImport(serverId)

  const [tools, setTools] = React.useState<SelectedTool[]>(() =>
    result.tools.map((t) => ({ ...t, selected: t.confidence !== 'low' })),
  )
  const [baseUrl, setBaseUrl] = React.useState(result.baseUrl)

  const selectedCount = tools.filter((t) => t.selected).length

  const toggleAll = () => {
    const allSelected = tools.every((t) => t.selected)
    setTools((prev) => prev.map((t) => ({ ...t, selected: !allSelected })))
  }

  const toggleOne = (idx: number) => {
    setTools((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, selected: !t.selected } : t)),
    )
  }

  // When baseUrl changes, update all httpUrls that were auto-generated
  const handleBaseUrlChange = (newBase: string) => {
    const oldBase = baseUrl.replace(/\/$/, '')
    const newNormalized = newBase.replace(/\/$/, '')
    setBaseUrl(newBase)
    if (!oldBase) return
    setTools((prev) =>
      prev.map((t) => ({
        ...t,
        httpUrl: t.httpUrl.startsWith(oldBase)
          ? newNormalized + t.httpUrl.slice(oldBase.length)
          : t.httpUrl,
      })),
    )
  }

  const handleConfirm = async () => {
    const selected = tools
      .filter((t) => t.selected)
      .map(
        (t): ToolFormData => ({
          name: t.name,
          description: t.description,
          httpMethod: t.httpMethod,
          httpUrl: t.httpUrl,
          parametersSchema: t.parametersSchema,
          headersConfig: [],
          isEnabled: true,
        }),
      )
    if (selected.length === 0) return
    const res = await confirm.mutateAsync(selected)
    onDone(res.created)
  }

  const errorMsg = confirm.isError
    ? ((confirm.error as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message ??
      'Une erreur est survenue lors de la création des tools.')
    : null

  return (
    <div className="space-y-4">

      {/* Source banner */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium',
          result.source === 'openapi'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-purple-50 text-purple-700 border border-purple-200',
        )}
      >
        {result.source === 'openapi' ? (
          <FileCode className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
        )}
        {result.source === 'openapi'
          ? `Spec OpenAPI détectée — ${result.title}`
          : `Analysé par IA à partir du README — ${result.title}`}
      </div>

      {/* Base URL override */}
      <div className="space-y-1.5">
        <Label htmlFor="review-baseurl" className="text-xs">
          URL de base
        </Label>
        <Input
          id="review-baseurl"
          value={baseUrl}
          onChange={(e) => handleBaseUrlChange(e.target.value)}
          placeholder="https://api.example.com"
          className="h-8 text-xs font-mono"
        />
      </div>

      <Separator />

      {/* Tool list */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {selectedCount} / {tools.length} outil{tools.length !== 1 ? 's' : ''} sélectionné
          {selectedCount !== 1 ? 's' : ''}
        </p>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={toggleAll}>
          {tools.every((t) => t.selected) ? 'Tout décocher' : 'Tout cocher'}
        </Button>
      </div>

      <ScrollArea className="max-h-[320px] pr-1">
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
                {/* Checkbox */}
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
                    <MethodBadge method={tool.httpMethod} />
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

      {errorMsg && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <DialogFooter className="gap-2 flex-col sm:flex-row">
        <Button variant="outline" onClick={onBack} disabled={confirm.isPending}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Retour
        </Button>
        <Button
          className="flex-1"
          onClick={handleConfirm}
          disabled={selectedCount === 0 || confirm.isPending}
        >
          {confirm.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Création…</>
          ) : (
            `Importer ${selectedCount} outil${selectedCount !== 1 ? 's' : ''}`
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}

// ─── Step 3 — Done ────────────────────────────────────────────────────────────

function DoneStep({ created, onClose }: { created: number; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="rounded-full bg-emerald-100 p-3">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      </div>
      <div>
        <p className="font-semibold text-lg">Import réussi</p>
        <p className="text-sm text-muted-foreground mt-1">
          {created} outil{created !== 1 ? 's ont été créés' : ' a été créé'} dans votre serveur.
        </p>
      </div>
      <Button onClick={onClose} className="w-full max-w-[200px]">
        Fermer
      </Button>
    </div>
  )
}

// ─── GithubImportDialog ───────────────────────────────────────────────────────

export function GithubImportDialog({
  serverId,
  open,
  onOpenChange,
}: {
  serverId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [step, setStep] = React.useState<Step>('form')
  const [analyzeResult, setAnalyzeResult] = React.useState<GithubAnalyzeResult | null>(null)
  const [createdCount, setCreatedCount] = React.useState(0)

  const handleClose = () => {
    onOpenChange(false)
    // Reset after animation
    setTimeout(() => {
      setStep('form')
      setAnalyzeResult(null)
      setCreatedCount(0)
    }, 300)
  }

  const handleResult = (result: GithubAnalyzeResult) => {
    setAnalyzeResult(result)
    setStep('review')
  }

  const handleDone = (count: number) => {
    setCreatedCount(count)
    setStep('done')
  }

  const titles: Record<Step, string> = {
    form: 'Importer depuis GitHub',
    analyzing: 'Analyse en cours…',
    review: 'Outils détectés',
    done: '',
  }

  const descriptions: Record<Step, string> = {
    form: 'Fournissez un repository GitHub pour générer automatiquement les tools MCP.',
    analyzing: '',
    review: 'Sélectionnez les outils à importer dans votre serveur.',
    done: '',
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {step !== 'done' && (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              {titles[step]}
            </DialogTitle>
            {descriptions[step] && (
              <DialogDescription>{descriptions[step]}</DialogDescription>
            )}
          </DialogHeader>
        )}

        {step === 'form' && (
          <FormStep serverId={serverId} onResult={handleResult} />
        )}

        {step === 'review' && analyzeResult && (
          <ReviewStep
            serverId={serverId}
            result={analyzeResult}
            onBack={() => setStep('form')}
            onDone={handleDone}
          />
        )}

        {step === 'done' && (
          <DoneStep created={createdCount} onClose={handleClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}
