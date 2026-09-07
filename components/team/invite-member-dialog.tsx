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
import { SeatLimitError, createUser, useUsers } from "@/lib/firebase/collections"
import { useCan, useWorkspace } from "@/lib/firebase/workspace-context"
import { describeError } from "@/lib/firebase/errors"
import { ROLE_LABELS } from "@/lib/constants"
import { ASSIGNABLE_ROLES } from "@/lib/team"
import { SEAT_LIMIT, hasFreeSeat, isSeatRole, normalizeSeats, seatCount, seatsFromMembers } from "@/lib/seats"
import { t } from "@/lib/i18n"
import type { UserRole } from "@/types"

// super_admin is never assignable from the UI (bootstrapped manually, see MULTITENANT.md).
// Distribuidor / Asistente / Telemarketing. `viewer` is legacy and `super_admin`
// is global: neither is something a workspace can invite.
const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((value) => [value, ROLE_LABELS[value]] as [UserRole, string])

export function InviteMemberDialog() {
  const { workspaceId, currentWorkspace } = useWorkspace()
  const { canManageTeam } = useCan()
  const { users } = useUsers()
  // Seats come from the ledger when it exists; a legacy workspace without one
  // is counted from its team, which is exactly what the first operation will
  // write. The server enforces the limit either way; this only informs.
  const seats = currentWorkspace?.seats
    ? normalizeSeats(currentWorkspace.seats)
    : seatsFromMembers(users.filter((u) => u.workspaceId === workspaceId))
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
      if (err instanceof SeatLimitError) {
        toast.error(t.team.seats.limitReached, { description: t.team.inviteSeatFull(ROLE_LABELS[err.role]) })
      } else {
        toast.error(t.team.inviteError, { description: describeError(err).message })
      }
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
                  {/* Without a render function Base UI prints the raw value,
                      so the trigger would read "sales_rep". */}
                  <SelectValue>{(v: string) => ROLE_LABELS[v as UserRole] ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value} disabled={!isSeatRole(value) || !hasFreeSeat(seats, value)}>
                      {label}
                      {isSeatRole(value) && ` · ${t.team.seats.usage(seatCount(seats, value), SEAT_LIMIT)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* The seat count for the chosen role, visible without opening
                  the list: the server enforces it, this just says so early. */}
              {isSeatRole(role) && (
                <p className="text-xs text-muted-foreground tabular-nums" data-testid="seat-usage">
                  {hasFreeSeat(seats, role)
                    ? t.team.seats.usage(seatCount(seats, role), SEAT_LIMIT)
                    : t.team.seats.full(ROLE_LABELS[role])}
                </p>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t.common.cancel}
            </DialogClose>
            <Button type="submit" disabled={submitting || !workspaceId || !isSeatRole(role) || !hasFreeSeat(seats, role)}>
              {submitting ? t.common.sending : t.team.send}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
