'use client'

import type { ComponentType } from 'react'
import {
  Bot,
  Braces,
  Github,
  MessageSquare,
  NotebookPen,
  Sheet,
  Table,
  Wrench,
} from 'lucide-react'
import type { TemplateCategory } from '@mcpbuilder/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TemplateSummary } from '@/hooks/use-templates'
import { cn } from '@/lib/utils'

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  productivity: 'Productivite',
  developer: 'Developer',
  data: 'Data',
  communication: 'Communication',
}

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  NotebookPen,
  Github,
  Table,
  Sheet,
  MessageSquare,
  Wrench,
}

const CATEGORIES: Array<'all' | TemplateCategory> = ['all', 'productivity', 'developer', 'data', 'communication']

export function TemplateGrid({
  templates,
  selectedCategory,
  onCategoryChange,
  selectedTemplateId,
  onSelectTemplate,
  onStartFromScratch,
}: {
  templates: TemplateSummary[]
  selectedCategory: 'all' | TemplateCategory
  onCategoryChange: (value: 'all' | TemplateCategory) => void
  selectedTemplateId: string | null
  onSelectTemplate: (templateId: string) => void
  onStartFromScratch?: () => void
}) {
  const filtered = selectedCategory === 'all'
    ? templates
    : templates.filter((template) => template.category === selectedCategory)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <Button
            key={category}
            size="sm"
            variant={selectedCategory === category ? 'default' : 'outline'}
            onClick={() => onCategoryChange(category)}
          >
            {category === 'all' ? 'Tous' : CATEGORY_LABELS[category]}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((template) => {
          const Icon = ICONS[template.icon] ?? Bot
          const isSelected = selectedTemplateId === template.id
          const isPopular = template.id === 'notion' || template.id === 'github'

          return (
            <Card
              key={template.id}
              className={cn(
                'cursor-pointer transition-colors border',
                isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
              )}
              onClick={() => onSelectTemplate(template.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="h-8 w-8 rounded-md border flex items-center justify-center">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-2">
                    {isPopular && <Badge>Populaire</Badge>}
                    <Badge variant="secondary">{template.toolCount} tools</Badge>
                  </div>
                </div>
                <CardTitle className="text-base">{template.name}</CardTitle>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{CATEGORY_LABELS[template.category]}</span>
                  <span className="uppercase">{template.authType}</span>
                </div>
                <div className="mt-3 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                  Preview: outils preconfigures, schemas de parametres et endpoints inclus.
                </div>
              </CardContent>
            </Card>
          )
        })}

        {onStartFromScratch && (
          <Card className="border-dashed">
            <CardHeader>
              <div className="h-8 w-8 rounded-md border flex items-center justify-center">
                <Braces className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Partir de zero</CardTitle>
              <CardDescription>Creer un serveur MCP vide et ajouter vos tools manuellement.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline" onClick={onStartFromScratch}>
                Creer manuellement
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
