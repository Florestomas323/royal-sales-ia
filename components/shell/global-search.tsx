'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search, CornerDownLeft } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScoreBadge } from '@/components/shared/score-badge'
import { navSections } from './nav-config'
import { leads } from '@/lib/mock-data'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const navItems = navSections.flatMap((s) => s.items)

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const router = useRouter()

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const q = query.trim().toLowerCase()
  const pages = navItems.filter((i) => i.label.toLowerCase().includes(q))
  const leadResults = q
    ? leads
        .filter(
          (l) =>
            l.name.toLowerCase().includes(q) ||
            l.email.toLowerCase().includes(q),
        )
        .slice(0, 5)
    : []

  function go(href: string) {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground w-9 justify-center px-0 md:w-56 md:justify-between md:px-3"
      >
        <span className="flex items-center gap-2">
          <Search data-icon="inline-start" />
          <span className="hidden md:inline">{t.common.searchEllipsis}</span>
        </span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground md:inline">
          ⌘K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="overflow-hidden p-0 sm:max-w-lg"
        >
          <DialogTitle className="sr-only">{t.search.title}</DialogTitle>
          <DialogDescription className="sr-only">
            {t.search.description}
          </DialogDescription>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search.placeholder}
              className="h-12 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {pages.length > 0 && (
              <div className="mb-2">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {t.search.pages}
                </p>
                {pages.map((p) => (
                  <button
                    key={p.href}
                    onClick={() => go(p.href)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <p.icon className="size-4 text-muted-foreground" />
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            {leadResults.length > 0 && (
              <div>
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {t.search.leads}
                </p>
                {leadResults.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => go(`/leads/${l.id}`)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="flex flex-col items-start">
                      <span className="font-medium">{l.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.email}
                      </span>
                    </span>
                    <ScoreBadge score={l.score} temperature={l.temperature} />
                  </button>
                ))}
              </div>
            )}
            {pages.length === 0 && leadResults.length === 0 && (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                {t.search.noResults(query)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <CornerDownLeft className="size-3" /> {t.search.hint}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
