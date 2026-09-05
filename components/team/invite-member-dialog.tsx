"use client"

import * as React from "react"
import { toast } from "sonner"
import { UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createUser } from "@/lib/firebase/collections"
import { useCan, useWorkspace } from "@/lib/firebase/workspace-context"
import { describeError } from "@/lib/firebase/errors"
import { ROLE_LABELS } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { UserRole } from "@/types"

// super_admin is never assignable from the UI (bootstrapped manually, see MULTITENANT.md).
const ROLE_OPTIONS = (Object.entries(ROLE_LABELS) as [UserRole, string][]).filter(
  ([value]) => value !== "super_admin",
)

export function InviteMemberDialog() {
  const { workspaceId } = useWorkspace()
  const { canManageTeam } = useCan()
  const [open, setOpen] = React.useState(false)
  const [role, setRole] = React.useState<UserRole>("sales_rep")
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = (form.get("name") as string)?.trim()
    const email = (form.get("email") as string)?.trim()
    if (!name || !email) return
    if (!workspaceId) {
      toast.error(t.common.selectWorkspaceFirst)
      return
    }

    setSubmitting(true)
    try {
      await createUser({ workspaceId, name, email, role })
      toast.success(t.team.invitedTitle, {
        description: t.team.invitedDescription(name, ROLE_LABELS[role]),
      })
      setOpen(false)
      setRole("sales_rep")
    } catch (err) {
      toast.error(t.team.inviteError, { description: describeError(err).message })
    } finally {
      setSubmitting(false)
    }
  }

  // Roles without permission never see the trigger; Rules reject them anyway.
  if (!canManageTeam) return null
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <UserPlus data-icon="inline-start" />
            {t.team.invite}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.team.dialogTitle}</DialogTitle>
          <DialogDescription>{t.team.dialogDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="member-name">{t.team.nameLabel}</FieldLabel>
              <Input
                id="member-name"
                name="name"
                placeholder={t.team.namePlaceholder}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="member-email">{t.team.emailLabel}</FieldLabel>
              <Input
                id="member-email"
                name="email"
                type="email"
                placeholder={t.team.emailPlaceholder}
                required
              />
            </Field>
            <Field>
              <FieldLabel>{t.team.roleLabel}</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t.common.cancel}
            </DialogClose>
            <Button type="submit" disabled={submitting || !workspaceId}>
              {submitting ? t.common.sending : t.team.send}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
