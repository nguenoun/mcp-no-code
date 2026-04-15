'use client'

import * as React from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Info, Plus, Trash2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { McpTool } from '@mcpbuilder/shared'
import type { ToolFormData } from '@/hooks/use-tools'

// ─── Zod schema (mirrors backend) ────────────────────────────────────────────

const TOOL_NAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/

const parameterSchema = z.object({
  name: z.string().min(1, 'Required'),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string().max(200).default(''),
  required: z.boolean().default(false),
})

const headerSchema = z.object({
  key: z.string().min(1, 'Required').max(256),
  value: z.string().max(2048),
  isSecret: z.boolean().default(false),
})

const toolFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(64, 'Max 64 characters')
    .regex(
      TOOL_NAME_REGEX,
      'Alphanumeric and hyphens only, cannot start or end with a hyphen',
    ),
  description: z.string().max(500, 'Max 500 characters').default(''),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  httpUrl: z.string().min(1, 'URL is required').max(2048),
  isRelativeUrl: z.boolean().default(false),
  parameters: z.array(parameterSchema).default([]),
  rawSchema: z.string().default('{}'),
  useRawSchema: z.boolean().default(false),
  headersConfig: z.array(headerSchema).default([]),
  isEnabled: z.boolean().default(true),
})

type ToolFormValues = z.infer<typeof toolFormSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

type HttpMethod = (typeof HTTP_METHODS)[number]

const METHOD_BADGE_VARIANT: Record<HttpMethod, string> = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  PATCH: 'patch',
  DELETE: 'delete',
}

const PARAM_TYPES = ['string', 'number', 'boolean', 'array', 'object'] as const

function buildJsonSchema(params: ToolFormValues['parameters']): Record<string, unknown> {
  if (params.length === 0) return {}

  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const p of params) {
    properties[p.name] = {
      type: p.type,
      ...(p.description ? { description: p.description } : {}),
    }
    if (p.required) required.push(p.name)
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

function toolToFormValues(tool: McpTool): Partial<ToolFormValues> {
  const schema = (tool.parametersSchema as Record<string, unknown>) ?? {}
  const properties = (schema.properties as Record<string, { type: string; description?: string }>) ?? {}
  const requiredList = (schema.required as string[]) ?? []

  const parameters = Object.entries(properties).map(([name, def]) => ({
    name,
    type: (def.type as ToolFormValues['parameters'][number]['type']) ?? 'string',
    description: def.description ?? '',
    required: requiredList.includes(name),
  }))

  const headers = ((tool.headersConfig as Array<{ key: string; value: string; isSecret: boolean }>) ?? []).map((h) => ({
    key: h.key,
    value: h.value,
    isSecret: h.isSecret,
  }))

  return {
    name: tool.name,
    description: tool.description ?? '',
    httpMethod: tool.httpMethod as HttpMethod,
    httpUrl: tool.httpUrl,
    isRelativeUrl: tool.httpUrl.startsWith('/'),
    parameters,
    rawSchema: JSON.stringify(schema, null, 2),
    useRawSchema: false,
    headersConfig: headers,
    isEnabled: tool.isEnabled,
  }
}

function formValuesToToolData(values: ToolFormValues): ToolFormData {
  let parametersSchema: Record<string, unknown>

  if (values.useRawSchema) {
    try {
      parametersSchema = JSON.parse(values.rawSchema)
    } catch {
      parametersSchema = {}
    }
  } else {
    parametersSchema = buildJsonSchema(values.parameters)
  }

  return {
    name: values.name,
    description: values.description,
    httpMethod: values.httpMethod,
    httpUrl: values.httpUrl,
    parametersSchema,
    headersConfig: values.headersConfig,
    isEnabled: values.isEnabled,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-foreground border-b pb-2 mb-4">{children}</h3>
  )
}

interface ParameterBuilderProps {
  parameters: ToolFormValues['parameters']
  onAdd: () => void
  onRemove: (index: number) => void
  onMove: (from: number, to: number) => void
  onChange: (index: number, field: keyof ToolFormValues['parameters'][number], value: unknown) => void
  generatedSchema: Record<string, unknown>
  useRaw: boolean
  rawSchema: string
  onToggleRaw: (v: boolean) => void
  onRawChange: (v: string) => void
  rawError: string | null
}

function ParameterBuilder({
  parameters,
  onAdd,
  onRemove,
  onMove,
  onChange,
  generatedSchema,
  useRaw,
  rawSchema,
  onToggleRaw,
  onRawChange,
  rawError,
}: ParameterBuilderProps) {
  const [schemaOpen, setSchemaOpen] = React.useState(false)

  return (
    <div className="space-y-4">
      {/* Raw / builder toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {useRaw ? 'JSON Schema manuel' : `${parameters.length} paramètre(s)`}
        </span>
        <div className="flex items-center gap-2 text-sm">
          <span className={cn(!useRaw && 'text-primary font-medium')}>Constructeur</span>
          <Switch checked={useRaw} onCheckedChange={onToggleRaw} />
          <span className={cn(useRaw && 'text-primary font-medium')}>JSON Schema</span>
        </div>
      </div>

      {useRaw ? (
        <div className="space-y-1">
          <Textarea
            className="font-mono text-xs h-48 resize-y"
            value={rawSchema}
            onChange={(e) => onRawChange(e.target.value)}
            placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
            spellCheck={false}
          />
          {rawError && <p className="text-xs text-destructive">{rawError}</p>}
        </div>
      ) : (
        <>
          {/* Parameter list */}
          <div className="space-y-2">
            {parameters.map((param, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[auto_1fr_1fr_1fr_auto_auto] gap-2 items-center rounded-md border p-2"
              >
                {/* Drag handle (visual only) */}
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />

                {/* Name */}
                <Input
                  placeholder="nom"
                  value={param.name}
                  onChange={(e) => onChange(idx, 'name', e.target.value)}
                  className="h-8 text-sm"
                />

                {/* Type */}
                <Select
                  value={param.type}
                  onValueChange={(v) => onChange(idx, 'type', v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARAM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Description */}
                <Input
                  placeholder="description"
                  value={param.description}
                  onChange={(e) => onChange(idx, 'description', e.target.value)}
                  className="h-8 text-sm"
                />

                {/* Required toggle */}
                <div className="flex items-center gap-1">
                  <Switch
                    checked={param.required}
                    onCheckedChange={(v) => onChange(idx, 'required', v)}
                    className="scale-75"
                  />
                  <span className="text-xs text-muted-foreground">req.</span>
                </div>

                {/* Remove */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Move buttons (shown only when >1 param) */}
          {parameters.length > 1 && (
            <div className="text-xs text-muted-foreground">
              Utilisez les boutons ↑↓ pour réordonner — ou glissez-déposez.
            </div>
          )}

          <Button type="button" variant="outline" size="sm" onClick={onAdd} className="w-full">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Ajouter un paramètre
          </Button>

          {/* Generated schema preview */}
          {parameters.length > 0 && (
            <div className="rounded-md border bg-muted/30">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium"
                onClick={() => setSchemaOpen((o) => !o)}
              >
                <span>Aperçu JSON Schema généré</span>
                {schemaOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {schemaOpen && (
                <pre className="px-3 pb-3 text-xs font-mono overflow-auto max-h-48 text-muted-foreground">
                  {JSON.stringify(generatedSchema, null, 2)}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface ToolEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tool?: McpTool
  onSave: (data: ToolFormData) => Promise<void>
}

export function ToolEditorModal({ open, onOpenChange, tool, onSave }: ToolEditorModalProps) {
  const isEditing = Boolean(tool)

  const form = useForm<ToolFormValues>({
    resolver: zodResolver(toolFormSchema),
    defaultValues: tool
      ? (toolToFormValues(tool) as ToolFormValues)
      : {
          name: '',
          description: '',
          httpMethod: 'GET',
          httpUrl: '',
          isRelativeUrl: false,
          parameters: [],
          rawSchema: '{}',
          useRawSchema: false,
          headersConfig: [],
          isEnabled: true,
        },
  })

  // Reset form when tool changes or modal opens
  React.useEffect(() => {
    if (open) {
      form.reset(
        tool
          ? (toolToFormValues(tool) as ToolFormValues)
          : {
              name: '',
              description: '',
              httpMethod: 'GET',
              httpUrl: '',
              isRelativeUrl: false,
              parameters: [],
              rawSchema: '{}',
              useRawSchema: false,
              headersConfig: [],
              isEnabled: true,
            },
      )
    }
  }, [open, tool]) // eslint-disable-line react-hooks/exhaustive-deps

  const { fields: headerFields, append: appendHeader, remove: removeHeader } = useFieldArray({
    control: form.control,
    name: 'headersConfig',
  })

  const watchedName = form.watch('name')
  const watchedDescription = form.watch('description')
  const watchedMethod = form.watch('httpMethod')
  const watchedParameters = form.watch('parameters')
  const watchedUseRaw = form.watch('useRawSchema')
  const watchedRawSchema = form.watch('rawSchema')
  const watchedIsRelative = form.watch('isRelativeUrl')

  // Validate raw schema JSON
  const rawSchemaError = React.useMemo(() => {
    if (!watchedUseRaw) return null
    try {
      JSON.parse(watchedRawSchema)
      return null
    } catch {
      return 'JSON invalide'
    }
  }, [watchedUseRaw, watchedRawSchema])

  const generatedSchema = React.useMemo(
    () => buildJsonSchema(watchedParameters),
    [watchedParameters],
  )

  function handleParamAdd() {
    const current = form.getValues('parameters')
    form.setValue('parameters', [
      ...current,
      { name: '', type: 'string', description: '', required: false },
    ])
  }

  function handleParamRemove(idx: number) {
    const current = form.getValues('parameters')
    form.setValue('parameters', current.filter((_, i) => i !== idx))
  }

  function handleParamMove(from: number, to: number) {
    const current = [...form.getValues('parameters')]
    const [item] = current.splice(from, 1)
    current.splice(to, 0, item)
    form.setValue('parameters', current)
  }

  function handleParamChange(
    idx: number,
    field: keyof ToolFormValues['parameters'][number],
    value: unknown,
  ) {
    const current = [...form.getValues('parameters')]
    current[idx] = { ...current[idx], [field]: value }
    form.setValue('parameters', current)
  }

  async function onSubmit(values: ToolFormValues) {
    await onSave(formValuesToToolData(values))
    onOpenChange(false)
  }

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Modifier le tool' : 'Nouveau tool MCP'}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* ── Section 1 : Identité ─────────────────────────────────── */}
              <div>
                <SectionHeading>1 · Identité du tool</SectionHeading>
                <div className="space-y-4">
                  {/* Name */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom du tool</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="get-user-profile"
                            {...field}
                            onChange={(e) => {
                              // live normalisation hint (doesn't block typing)
                              field.onChange(e)
                            }}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Alphanumérique et tirets uniquement, max 64 caractères.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Description */}
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-1.5">
                          <FormLabel>Description</FormLabel>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              Cette description est lue par l&apos;IA pour comprendre quand utiliser
                              ce tool. Soyez précis et utilisez des verbes d&apos;action.
                            </TooltipContent>
                          </Tooltip>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {watchedDescription.length}/500
                          </span>
                        </div>
                        <FormControl>
                          <Textarea
                            placeholder="Récupère le profil complet d'un utilisateur à partir de son identifiant."
                            className="resize-none h-20"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* AI preview */}
                  {(watchedName || watchedDescription) && (
                    <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground mb-1 font-medium">
                        Comment l&apos;IA verra ce tool :
                      </p>
                      <p className="text-sm font-mono">
                        <span className="font-semibold">{watchedName || '…'}</span>
                        {watchedDescription && (
                          <span className="text-muted-foreground"> — {watchedDescription}</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section 2 : Requête HTTP ─────────────────────────────── */}
              <div>
                <SectionHeading>2 · Requête HTTP</SectionHeading>
                <div className="space-y-4">
                  {/* Method */}
                  <FormField
                    control={form.control}
                    name="httpMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Méthode</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-40">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    METHOD_BADGE_VARIANT[field.value as HttpMethod] as Parameters<
                                      typeof Badge
                                    >[0]['variant']
                                  }
                                  className="text-xs px-1.5 py-0"
                                >
                                  {field.value}
                                </Badge>
                              </div>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {HTTP_METHODS.map((m) => (
                              <SelectItem key={m} value={m}>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant={
                                      METHOD_BADGE_VARIANT[m] as Parameters<
                                        typeof Badge
                                      >[0]['variant']
                                    }
                                    className="text-xs px-1.5 py-0"
                                  >
                                    {m}
                                  </Badge>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* URL */}
                  <FormField
                    control={form.control}
                    name="httpUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={
                              watchedIsRelative
                                ? '/users/{userId}'
                                : 'https://api.exemple.com/users/{userId}'
                            }
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Relative URL toggle */}
                  <FormField
                    control={form.control}
                    name="isRelativeUrl"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div>
                          <FormLabel className="cursor-pointer">URL relative</FormLabel>
                          {field.value && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              La base URL du serveur sera préfixée automatiquement à l&apos;exécution.
                            </p>
                          )}
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* ── Section 3 : Paramètres ───────────────────────────────── */}
              <div>
                <SectionHeading>3 · Paramètres</SectionHeading>
                <ParameterBuilder
                  parameters={watchedParameters}
                  onAdd={handleParamAdd}
                  onRemove={handleParamRemove}
                  onMove={handleParamMove}
                  onChange={handleParamChange}
                  generatedSchema={generatedSchema}
                  useRaw={watchedUseRaw}
                  rawSchema={watchedRawSchema}
                  onToggleRaw={(v) => {
                    form.setValue('useRawSchema', v)
                    if (v) {
                      // Initialise raw from current generated schema
                      form.setValue('rawSchema', JSON.stringify(generatedSchema, null, 2))
                    }
                  }}
                  onRawChange={(v) => form.setValue('rawSchema', v)}
                  rawError={rawSchemaError}
                />
              </div>

              {/* ── Section 4 : Headers ──────────────────────────────────── */}
              <div>
                <SectionHeading>4 · Headers</SectionHeading>
                <div className="space-y-2">
                  {headerFields.length === 0 && (
                    <p className="text-sm text-muted-foreground">Aucun header configuré.</p>
                  )}
                  {headerFields.map((hf, idx) => {
                    const isSecret = form.watch(`headersConfig.${idx}.isSecret`)
                    return (
                      <div key={hf.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                        <FormField
                          control={form.control}
                          name={`headersConfig.${idx}.key`}
                          render={({ field }) => (
                            <Input placeholder="Authorization" className="h-8 text-sm" {...field} />
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`headersConfig.${idx}.value`}
                          render={({ field }) => (
                            <div className="relative">
                              <Input
                                placeholder={isSecret ? '••••••••' : 'Bearer {token}'}
                                type={isSecret ? 'password' : 'text'}
                                className="h-8 text-sm"
                                {...field}
                              />
                              {isSecret && (
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                  chiffré
                                </span>
                              )}
                            </div>
                          )}
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1">
                              <FormField
                                control={form.control}
                                name={`headersConfig.${idx}.isSecret`}
                                render={({ field }) => (
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    className="scale-75"
                                  />
                                )}
                              />
                              <span className="text-xs text-muted-foreground">secret</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-xs">
                            La valeur sera stockée chiffrée et masquée dans l&apos;interface.
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeHeader(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => appendHeader({ key: '', value: '', isSecret: false })}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Ajouter un header
                  </Button>
                </div>
              </div>

              {/* ── Footer ──────────────────────────────────────────────── */}
              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={form.formState.isSubmitting}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting || Boolean(rawSchemaError)}
                >
                  {form.formState.isSubmitting ? 'Sauvegarde…' : 'Sauvegarder le tool'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
