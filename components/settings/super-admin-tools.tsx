"use client"

import * as React from "react"
import { toast } from "sonner"
import { Building2, DatabaseZap, FlaskConical, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { createWorkspace } from "@/lib/firebase/workspaces"
import {
  MIGRATABLE_COLLECTIONS,
  migrateLegacyDocuments,
  scanLegacyDocuments,
  type MigrationScan,
} from "@/lib/firebase/admin-tools"
import { isDemoSeedEnabled, seedDemoWorkspace } from "@/lib/firebase/seed"
import { describeError } from "@/lib/firebase/errors"
import { t } from "@/lib/i18n"

const COLLECTION_LABELS: Record<(typeof MIGRATABLE_COLLECTIONS)[number], string> = {
  clients: "Clientes",
  users: "Equipo",
  campaigns: "Campañas",
  leads: "Prospectos",
}

export function SuperAdminTools() {
  const { isSuperAdmin, workspaces, workspaceId, currentWorkspace } = useWorkspace()

  if (!isSuperAdmin) return null

  return (
    <div className="flex flex-col gap-6">
      <WorkspacesCard workspaces={workspaces} />
      <MigrationCard workspaceId={workspaceId} workspaceName={currentWorkspace?.name ?? null} />
      <SeedCard workspaceId={workspaceId} workspaceName={currentWorkspace?.name ?? null} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function WorkspacesCard({ workspaces }: { workspaces: { id: string; name: string; plan: string; status: string; logoColor: string }[] }) {
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const name = (data.get("name") as string)?.trim()
    const ownerEmail = (data.get("ownerEmail") as string)?.trim()
    if (!name) return
    setSubmitting(true)
    try {
      await createWorkspace({ name, ownerEmail: ownerEmail || undefined })
      toast.success(t.superAdmin.workspaceCreated, { description: name })
      form.reset()
    } catch (err) {
      toast.error(describeError(err).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4" />
          {t.superAdmin.workspacesTitle}
        </CardTitle>
        <CardDescription>{t.superAdmin.workspacesDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y rounded-lg border">
          {workspaces.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">—</li>
          )}
          {workspaces.map((ws) => (
            <li key={ws.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="size-3 rounded-sm" style={{ backgroundColor: ws.logoColor }} aria-hidden="true" />
              <span className="flex-1 truncate text-sm font-medium">{ws.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{ws.id}</span>
              <Badge variant="outline" className="capitalize">{ws.plan}</Badge>
            </li>
          ))}
        </ul>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border p-4">
          <p className="text-sm font-medium">{t.superAdmin.newWorkspace}</p>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ws-new-name">{t.superAdmin.workspaceName}</FieldLabel>
                <Input id="ws-new-name" name="name" placeholder={t.superAdmin.workspaceNamePlaceholder} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="ws-new-owner">{t.superAdmin.ownerEmail}</FieldLabel>
                <Input id="ws-new-owner" name="ownerEmail" type="email" placeholder="admin@distribuidor.com" />
              </Field>
            </div>
          </FieldGroup>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={submitting}>
              <Plus data-icon="inline-start" />
              {submitting ? t.common.creating : t.superAdmin.createWorkspace}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */

function MigrationCard({ workspaceId, workspaceName }: { workspaceId: string | null; workspaceName: string | null }) {
  const [scan, setScan] = React.useState<MigrationScan | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function handleScan() {
    setBusy(true)
    try {
      const result = await scanLegacyDocuments()
      setScan(result)
      if (result.total === 0) toast.info(t.superAdmin.migrationNothing)
    } catch (err) {
      toast.error(describeError(err).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleMigrate() {
    if (!scan || !workspaceId) return
    setBusy(true)
    try {
      const n = await migrateLegacyDocuments(scan, workspaceId)
      toast.success(t.superAdmin.migrationDone(n))
      setScan(null)
    } catch (err) {
      toast.error(describeError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseZap className="size-4" />
          {t.superAdmin.migrationTitle}
        </CardTitle>
        <CardDescription>{t.superAdmin.migrationDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {scan && (
          <ul className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
            {MIGRATABLE_COLLECTIONS.map((name) => (
              <li key={name} className="flex justify-between">
                <span>{t.superAdmin.pending(COLLECTION_LABELS[name], scan.pending[name].length)}</span>
              </li>
            ))}
          </ul>
        )}
        {!workspaceId && (
          <p className="text-sm text-muted-foreground">{t.superAdmin.migrationNeedsWorkspace}</p>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleScan} disabled={busy}>
          {t.superAdmin.migrationScan}
        </Button>
        <Button
          size="sm"
          onClick={handleMigrate}
          disabled={busy || !scan || scan.total === 0 || !workspaceId}
          title={workspaceName ?? undefined}
        >
          {t.superAdmin.migrationRun(scan?.total ?? 0)}
        </Button>
      </CardFooter>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */

function SeedCard({ workspaceId, workspaceName }: { workspaceId: string | null; workspaceName: string | null }) {
  const [busy, setBusy] = React.useState(false)
  const enabled = isDemoSeedEnabled()

  async function handleSeed() {
    if (!workspaceId) return
    setBusy(true)
    try {
      const result = await seedDemoWorkspace(workspaceId)
      if (result.seeded) toast.success(t.superAdmin.seedDone, { description: `${result.count} documentos · ${workspaceName ?? workspaceId}` })
      else if (result.reason === "disabled") toast.error(t.superAdmin.seedDisabled)
      else toast.info(t.superAdmin.seedExists)
    } catch (err) {
      toast.error(describeError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4" />
          {t.superAdmin.seedTitle}
        </CardTitle>
        <CardDescription>{t.superAdmin.seedDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {!enabled && <p className="text-sm text-muted-foreground">{t.superAdmin.seedDisabled}</p>}
        {enabled && !workspaceId && (
          <p className="text-sm text-muted-foreground">{t.superAdmin.migrationNeedsWorkspace}</p>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="outline" size="sm" onClick={handleSeed} disabled={busy || !enabled || !workspaceId}>
          {t.superAdmin.seedRun}
        </Button>
      </CardFooter>
    </Card>
  )
}
