"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Info } from "lucide-react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { UserAvatar } from "@/components/shared/user-avatar"
import { SuperAdminTools } from "@/components/settings/super-admin-tools"
import { useCan, useWorkspace } from "@/lib/firebase/workspace-context"
import { AVATAR_COLORS, updateOwnProfile } from "@/lib/firebase/collections"
import { updateWorkspaceName } from "@/lib/firebase/workspaces"
import { describeError } from "@/lib/firebase/errors"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

/**
 * Settings.
 *
 * Only what actually persists in Firestore is editable here:
 *   - workspace name  → `workspaces/{id}.name` (super_admin / client_admin)
 *   - own profile     → `users/{id}.name` + `.avatarColor` (whitelisted by Rules)
 *
 * Currency, notification preferences and billing have no backing model, so
 * they are shown as read-only information instead of controls that would
 * report success without saving anything.
 */
export function SettingsPanel() {
  const { currentUser, currentWorkspace, workspaceId, profile, isSuperAdmin, refreshProfile } =
    useWorkspace()
  const { isClientAdmin } = useCan()

  return (
    <Tabs defaultValue={isSuperAdmin ? "super_admin" : "workspace"} className="gap-6">
      <TabsList>
        {isSuperAdmin && <TabsTrigger value="super_admin">{t.superAdmin.tab}</TabsTrigger>}
        <TabsTrigger value="workspace">{t.settings.tabs.workspace}</TabsTrigger>
        <TabsTrigger value="profile">{t.settings.tabs.profile}</TabsTrigger>
        <TabsTrigger value="notifications">{t.settings.tabs.notifications}</TabsTrigger>
        <TabsTrigger value="billing">{t.settings.tabs.billing}</TabsTrigger>
      </TabsList>

      {isSuperAdmin && (
        <TabsContent value="super_admin">
          <SuperAdminTools />
        </TabsContent>
      )}

      <TabsContent value="workspace">
        <WorkspaceCard
          workspaceId={workspaceId}
          name={currentWorkspace?.name ?? ""}
          plan={currentWorkspace?.plan ?? "—"}
          canEdit={isClientAdmin}
        />
      </TabsContent>

      <TabsContent value="profile">
        <ProfileCard
          userId={profile?.id ?? null}
          name={currentUser.name}
          email={currentUser.email}
          avatarColor={currentUser.avatarColor}
          onSaved={refreshProfile}
        />
      </TabsContent>

      <TabsContent value="notifications">
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.notifications.title}</CardTitle>
            <CardDescription>{t.settings.notifications.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Notice title={t.settings.notifications.unavailableTitle}>
              {t.settings.notifications.unavailableBody}
            </Notice>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="billing">
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.billing.title}</CardTitle>
            <CardDescription>{t.settings.billing.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <span className="text-sm font-medium capitalize">
                {t.settings.billing.plan(currentWorkspace?.plan ?? "—")}
              </span>
            </div>
            <Notice>{t.settings.billing.unavailableBody}</Notice>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

/* -------------------------------------------------------------------------- */

function WorkspaceCard({
  workspaceId,
  name,
  plan,
  canEdit,
}: {
  workspaceId: string | null
  name: string
  plan: string
  canEdit: boolean
}) {
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)

  // Follow the live workspace document (and workspace switching).
  useEffect(() => setValue(name), [name])

  const dirty = value.trim() !== name && value.trim().length > 0
  const editable = canEdit && Boolean(workspaceId)

  async function handleSave() {
    if (!workspaceId || !dirty) return
    setSaving(true)
    try {
      await updateWorkspaceName(workspaceId, value)
      toast.success(t.settings.savedTitle, { description: t.settings.workspace.nameSaved })
    } catch (err) {
      // The rename may be denied by Rules (manager/viewer): never fake success.
      toast.error(t.settings.saveError, { description: describeError(err).message })
      setValue(name)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.workspace.title}</CardTitle>
        <CardDescription>{t.settings.workspace.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel htmlFor="ws-name">{t.settings.workspace.nameLabel}</FieldLabel>
              <FieldDescription>
                {editable ? t.settings.workspace.nameDescription : t.settings.workspace.readOnly}
              </FieldDescription>
            </FieldContent>
            <Input
              id="ws-name"
              value={value}
              disabled={!editable || saving}
              onChange={(e) => setValue(e.target.value)}
              className="sm:max-w-xs"
            />
          </Field>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel>{t.settings.workspace.planLabel}</FieldLabel>
              <FieldDescription>{t.settings.workspace.planDescription}</FieldDescription>
            </FieldContent>
            <div className="flex items-center">
              <Badge variant="secondary" className="capitalize">
                {plan}
              </Badge>
            </div>
          </Field>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel>{t.settings.workspace.currencyLabel}</FieldLabel>
              <FieldDescription>{t.settings.workspace.currencyDescription}</FieldDescription>
            </FieldContent>
            <div className="flex items-center text-sm font-medium">
              {t.settings.workspace.currencyValue}
            </div>
          </Field>
        </FieldGroup>
        {!workspaceId && (
          <p className="mt-4 text-sm text-muted-foreground">{t.settings.workspace.noWorkspace}</p>
        )}
      </CardContent>
      {editable && (
        <CardFooter className="justify-end">
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? t.common.saving : t.common.saveChanges}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */

function ProfileCard({
  userId,
  name,
  email,
  avatarColor,
  onSaved,
}: {
  userId: string | null
  name: string
  email: string
  avatarColor: string
  onSaved: () => Promise<void>
}) {
  const [value, setValue] = useState(name)
  const [color, setColor] = useState(avatarColor)
  const [saving, setSaving] = useState(false)

  useEffect(() => setValue(name), [name])
  useEffect(() => setColor(avatarColor), [avatarColor])

  const dirty = (value.trim() !== name && value.trim().length > 0) || color !== avatarColor

  async function handleSave() {
    if (!userId || !dirty) return
    setSaving(true)
    try {
      await updateOwnProfile(userId, { name: value, avatarColor: color })
      await onSaved()
      toast.success(t.settings.savedTitle, { description: t.settings.profile.saved })
    } catch (err) {
      toast.error(t.settings.saveError, { description: describeError(err).message })
      setValue(name)
      setColor(avatarColor)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.profile.title}</CardTitle>
        <CardDescription>{t.settings.profile.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {!userId ? (
          <Notice>{t.settings.profile.noProfile}</Notice>
        ) : (
          <FieldGroup>
            <div className="flex items-center gap-4">
              <UserAvatar name={value || name} color={color} className="size-14" />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t.settings.profile.colorLabel}</span>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      aria-pressed={color === c}
                      onClick={() => setColor(c)}
                      disabled={saving}
                      className={cn(
                        "size-7 rounded-full border-2 transition-transform",
                        color === c ? "border-foreground scale-110" : "border-transparent",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {t.settings.profile.colorDescription}
                </span>
              </div>
            </div>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="name">{t.settings.profile.nameLabel}</FieldLabel>
              </FieldContent>
              <Input
                id="name"
                value={value}
                disabled={saving}
                onChange={(e) => setValue(e.target.value)}
                className="sm:max-w-xs"
              />
            </Field>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="email">{t.settings.profile.emailLabel}</FieldLabel>
                <FieldDescription>{t.settings.profile.emailReadOnly}</FieldDescription>
              </FieldContent>
              <Input id="email" type="email" value={email} readOnly disabled className="sm:max-w-xs" />
            </Field>
          </FieldGroup>
        )}
      </CardContent>
      {userId && (
        <CardFooter className="justify-end">
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? t.common.saving : t.common.saveChanges}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

function Notice({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        {title && <span className="font-medium text-foreground">{title}</span>}
        <span className="text-pretty">{children}</span>
      </div>
    </div>
  )
}
