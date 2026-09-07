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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { UserAvatar } from "@/components/shared/user-avatar"
import { SuperAdminTools } from "@/components/settings/super-admin-tools"
import { useCan, useWorkspace } from "@/lib/firebase/workspace-context"
import { AVATAR_COLORS, updateOwnProfile } from "@/lib/firebase/collections"
import { updateWorkspaceSettings } from "@/lib/firebase/workspaces"
import { describeError } from "@/lib/firebase/errors"
import { cn } from "@/lib/utils"
import {
  TIMEZONES, hasSettingsErrors, isDirty, normalizeSettings, toDraft, validateSettings,
  type WorkspaceSettingsDraft, type WorkspaceSettingsErrors,
} from "@/lib/workspace-settings"
import { t } from "@/lib/i18n"
import type { Workspace } from "@/types"

/** Sentinel for "no timezone chosen": Select cannot hold an empty value. */
const NO_TIMEZONE = "__none__"

/** "Ciudad de México (America/Mexico_City)" reads better than the raw id. */
function timezoneLabel(tz: string): string {
  return `${tz.split("/")[1]?.replace(/_/g, " ") ?? tz} (${tz})`
}

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
          workspace={currentWorkspace ?? null}
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
  workspace,
  plan,
  canEdit,
}: {
  workspaceId: string | null
  workspace: Workspace | null
  plan: string
  canEdit: boolean
}) {
  const original = toDraft(workspace)
  const [draft, setDraft] = useState<WorkspaceSettingsDraft>(original)
  const [errors, setErrors] = useState<WorkspaceSettingsErrors>({})
  const [saving, setSaving] = useState(false)

  // Follow the live workspace document (and workspace switching).
  useEffect(() => setDraft(toDraft(workspace)), [workspace])

  const editable = canEdit && Boolean(workspaceId)
  const dirty = isDirty(draft, original)
  const set = (patch: Partial<WorkspaceSettingsDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setErrors({})
  }

  async function handleSave() {
    if (!workspaceId || !dirty) return
    const problems = validateSettings(draft)
    if (hasSettingsErrors(problems)) {
      setErrors(problems)
      return
    }
    setSaving(true)
    try {
      await updateWorkspaceSettings(workspaceId, normalizeSettings(draft))
      toast.success(t.settings.savedTitle, { description: t.settings.workspace.saved })
    } catch (err) {
      // Rules deny a manager or viewer, and the network can fail: the toast
      // only ever appears after Firestore really accepted the write.
      toast.error(t.settings.saveError, { description: describeError(err).message })
      setDraft(toDraft(workspace))
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
          <Field orientation="responsive" data-invalid={errors.name || undefined}>
            <FieldContent>
              <FieldLabel htmlFor="ws-name">{t.settings.workspace.nameLabel}</FieldLabel>
              <FieldDescription>
                {editable ? t.settings.workspace.nameDescription : t.settings.workspace.readOnly}
              </FieldDescription>
            </FieldContent>
            <div className="flex flex-col gap-1 sm:max-w-xs sm:min-w-0 sm:flex-1">
              <Input
                id="ws-name"
                value={draft.name}
                disabled={!editable || saving}
                onChange={(e) => set({ name: e.target.value })}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
              {errors.name && <FieldError>{t.settings.workspace.nameRequired}</FieldError>}
            </div>
          </Field>

          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel htmlFor="ws-phone">{t.settings.workspace.phoneLabel}</FieldLabel>
              <FieldDescription>{t.settings.workspace.contactDescription}</FieldDescription>
            </FieldContent>
            <Input
              id="ws-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t.settings.workspace.phonePlaceholder}
              value={draft.phone}
              disabled={!editable || saving}
              onChange={(e) => set({ phone: e.target.value })}
              className="h-11 text-base sm:h-9 sm:max-w-xs sm:text-sm"
            />
          </Field>

          <Field orientation="responsive" data-invalid={errors.ownerEmail || undefined}>
            <FieldContent>
              <FieldLabel htmlFor="ws-email">{t.settings.workspace.emailLabel}</FieldLabel>
            </FieldContent>
            <div className="flex flex-col gap-1 sm:max-w-xs sm:min-w-0 sm:flex-1">
              <Input
                id="ws-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t.settings.workspace.emailPlaceholder}
                value={draft.ownerEmail}
                disabled={!editable || saving}
                onChange={(e) => set({ ownerEmail: e.target.value })}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
              {errors.ownerEmail && <FieldError>{t.settings.workspace.emailInvalid}</FieldError>}
            </div>
          </Field>

          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel htmlFor="ws-city">{t.settings.workspace.cityLabel}</FieldLabel>
            </FieldContent>
            <Input
              id="ws-city"
              autoComplete="address-level2"
              value={draft.city}
              disabled={!editable || saving}
              onChange={(e) => set({ city: e.target.value })}
              className="h-11 text-base sm:h-9 sm:max-w-xs sm:text-sm"
            />
          </Field>

          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel htmlFor="ws-state">{t.settings.workspace.stateLabel}</FieldLabel>
            </FieldContent>
            <Input
              id="ws-state"
              autoComplete="address-level1"
              value={draft.state}
              disabled={!editable || saving}
              onChange={(e) => set({ state: e.target.value })}
              className="h-11 text-base sm:h-9 sm:max-w-xs sm:text-sm"
            />
          </Field>

          <Field orientation="responsive" data-invalid={errors.timezone || undefined}>
            <FieldContent>
              <FieldLabel>{t.settings.workspace.timezoneLabel}</FieldLabel>
              <FieldDescription>{t.settings.workspace.timezoneDescription}</FieldDescription>
            </FieldContent>
            <div className="flex flex-col gap-1 sm:max-w-xs sm:min-w-0 sm:flex-1">
              <Select
                value={draft.timezone || NO_TIMEZONE}
                onValueChange={(v) => set({ timezone: v === NO_TIMEZONE ? "" : (v ?? "") })}
                disabled={!editable || saving}
              >
                <SelectTrigger className="h-11 w-full sm:h-9">
                  {/* Without a render function Base UI would print the raw
                      value, so the zone id would leak into the trigger. */}
                  <SelectValue>
                    {(v: string) =>
                      v === NO_TIMEZONE ? t.settings.workspace.timezonePlaceholder : timezoneLabel(v)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[60svh]">
                  <SelectItem value={NO_TIMEZONE}>
                    {t.settings.workspace.timezonePlaceholder}
                  </SelectItem>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {timezoneLabel(tz)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.timezone && <FieldError>{t.settings.workspace.timezoneInvalid}</FieldError>}
            </div>
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
          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="h-11 w-full sm:h-9 sm:w-auto"
          >
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
