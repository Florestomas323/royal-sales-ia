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
import { ROLE_LABELS } from "@/lib/constants"
import type { UserRole } from "@/types"

const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [UserRole, string][]

export function InviteMemberDialog() {
  const [open, setOpen] = React.useState(false)
  const [role, setRole] = React.useState<UserRole>("sales_rep")
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = (form.get("name") as string)?.trim()
    const email = (form.get("email") as string)?.trim()
    if (!name || !email) return

    setSubmitting(true)
    try {
      await createUser({ name, email, role })
      toast.success("Invitación enviada", {
        description: `${name} se añadió al equipo como ${ROLE_LABELS[role]}.`,
      })
      setOpen(false)
      setRole("sales_rep")
    } catch {
      toast.error("No se pudo invitar al miembro. Inténtalo de nuevo.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <UserPlus data-icon="inline-start" />
            Invite member
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar miembro</DialogTitle>
          <DialogDescription>
            Añade a alguien a tu equipo de ventas. Entrará como invitado hasta que acepte.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="member-name">Nombre completo</FieldLabel>
              <Input id="member-name" name="name" placeholder="e.g. Diego Torres" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="member-email">Email</FieldLabel>
              <Input
                id="member-email"
                name="email"
                type="email"
                placeholder="name@royalagency.com"
                required
              />
            </Field>
            <Field>
              <FieldLabel>Rol</FieldLabel>
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
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enviando…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
