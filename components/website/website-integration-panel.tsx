"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Globe, KeyRound, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PlatformMark } from "@/components/shared/platform-badge"
import { useWebsiteIntegration, useWebsiteIntegrationActions } from "@/lib/integrations/website"
import { useCan, useWorkspace } from "@/lib/firebase/workspace-context"
import { normalizeDomain } from "@/lib/website-leads"
import { formatRelativeTime } from "@/lib/format"
import { t } from "@/lib/i18n"

const w = t.integrations.website

/**
 * Configuration of the workspace's website integration.
 *
 * The plain key is shown exactly once, right after it is generated, and lives
 * only in component state until the page is left. What Firestore keeps is a
 * hash, so this screen can never show an existing key again — only rotate it.
 */
export function WebsiteIntegrationPanel() {
  const { workspaceId } = useWorkspace()
  const { canManageWorkspace } = useCan()
  const { integration, loading } = useWebsiteIntegration(workspaceId)
  const { run, busy } = useWebsiteIntegrationActions(workspaceId)
  const [domain, setDomain] = useState("")
  const [domainError, setDomainError] = useState(false)
  const [plainKey, setPlainKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { setDomain(integration?.domain ?? "") }, [integration?.domain])

  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/website/leads` : "/api/website/leads"

  async function handleSave() {
    if (!normalizeDomain(domain)) { setDomainError(true); return }
    setDomainError(false)
    try {
      const { plainKey: key } = await run("save", domain)
      if (key) setPlainKey(key)
      toast.success(w.saved)
    } catch (err) {
      toast.error(w.error, { description: err instanceof Error ? err.message : undefined })
    }
  }

  async function handleRotate() {
    if (!window.confirm(w.rotateConfirm)) return
    try {
      const { plainKey: key } = await run("rotate")
      if (key) setPlainKey(key)
      toast.success(w.rotated)
    } catch (err) {
      toast.error(w.error, { description: err instanceof Error ? err.message : undefined })
    }
  }

  async function handleToggle() {
    const next = integration?.status === "connected" ? "disable" : "enable"
    try {
      await run(next)
      toast.success(next === "disable" ? w.disabled : w.enabled)
    } catch (err) {
      toast.error(w.error, { description: err instanceof Error ? err.message : undefined })
    }
  }

  async function copyKey() {
    if (!plainKey) return
    await navigator.clipboard.writeText(plainKey)
    setCopied(true)
    toast.success(w.copied)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!workspaceId) {
    return <p className="text-sm text-muted-foreground">{w.selectWorkspace}</p>
  }

  const connected = integration?.status === "connected"

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <PlatformMark platform="web" className="size-10 rounded-lg" />
            <div className="min-w-0 flex-1">
              <CardTitle className="flex flex-wrap items-center gap-2">
                {w.title}
                {integration && (
                  <Badge variant={connected ? "default" : "secondary"}>
                    {connected ? w.statusConnected : w.statusDisabled}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-pretty">{w.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!canManageWorkspace && (
            <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">{w.onlyAdmins}</p>
          )}
          <FieldGroup>
            <Field data-invalid={domainError || undefined}>
              <FieldLabel htmlFor="web-domain">{w.domainLabel}</FieldLabel>
              <Input
                id="web-domain"
                value={domain}
                placeholder={w.domainPlaceholder}
                disabled={!canManageWorkspace || busy || loading}
                inputMode="url"
                autoCapitalize="none"
                onChange={(e) => { setDomain(e.target.value); setDomainError(false) }}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
              {domainError && <FieldError>{w.domainInvalid}</FieldError>}
            </Field>
          </FieldGroup>

          {integration && (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{w.keyPrefixLabel}</dt>
                <dd className="font-mono">{integration.keyPrefix}…</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{w.lastReceived}</dt>
                <dd>{integration.lastReceivedAt ? formatRelativeTime(integration.lastReceivedAt) : w.never}</dd>
              </div>
            </dl>
          )}

          {canManageWorkspace && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button onClick={handleSave} disabled={busy || loading} className="h-11 sm:h-9">
                {busy ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Globe className="size-4" data-icon="inline-start" />}
                {busy ? w.saving : integration ? t.common.saveChanges : w.save}
              </Button>
              {integration && (
                <>
                  <Button variant="outline" onClick={handleRotate} disabled={busy} className="h-11 sm:h-9">
                    <RefreshCw className="size-4" data-icon="inline-start" />
                    {w.rotate}
                  </Button>
                  <Button variant="outline" onClick={handleToggle} disabled={busy} className="h-11 sm:h-9">
                    {connected ? w.disable : w.enable}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {plainKey && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4" />
              {w.keyTitle}
            </CardTitle>
            <CardDescription className="text-pretty">{w.keyOnce}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <code className="block overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-sm">{plainKey}</code>
            <Button onClick={copyKey} className="h-11 w-full sm:h-9 sm:w-auto">
              {copied ? <Check className="size-4" data-icon="inline-start" /> : <Copy className="size-4" data-icon="inline-start" />}
              {w.copy}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{w.howTitle}</CardTitle>
          <CardDescription className="text-pretty">{w.howBody}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{w.endpoint}</p>
            <code className="block overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs">POST {endpoint}</code>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{w.exampleTitle}</p>
            <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed">{`fetch("${endpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Integration-Key": "TU_CLAVE",
  },
  body: JSON.stringify({
    name: "María Pérez",
    phone: "+1 682 381 1576",
    email: "maria@correo.com",
    type: "sales",
    form: "contacto",
    pageUrl: location.href,
    utmSource: "google",
  }),
})`}</pre>
          </div>
          <FieldDescription className="text-pretty">{w.fields}</FieldDescription>
          <FieldDescription className="text-pretty">{w.dedup}</FieldDescription>
        </CardContent>
      </Card>
    </div>
  )
}
