"use client"

import * as React from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"

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
import { createClient } from "@/lib/firebase/collections"
import type { ClientStatus } from "@/types"

const STATUS_OPTIONS: { value: ClientStatus; label: string }[] = [
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
]

export function AddClientDialog() {
  const [open, setOpen] = React.useState(false)
  const [status, setStatus] = React.useState<ClientStatus>("onboarding")
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = (form.get("name") as string)?.trim()
    const industry = (form.get("industry") as string)?.trim()
    if (!name) return

    setSubmitting(true)
    try {
      await createClient({ name, industry, status })
      toast.success("Cliente añadido", { description: `${name} se creó correctamente.` })
      setOpen(false)
      setStatus("onboarding")
    } catch {
      toast.error("No se pudo crear el cliente. Inténtalo de nuevo.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus data-icon="inline-start" />
            Add client
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Crea una cuenta para empezar a asignar campañas y leads. Se guarda en tiempo real.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="client-name">Nombre del cliente</FieldLabel>
              <Input id="client-name" name="name" placeholder="e.g. Healthy Cooking Co." required />
            </Field>
            <Field>
              <FieldLabel htmlFor="client-industry">Industria</FieldLabel>
              <Input id="client-industry" name="industry" placeholder="e.g. Food & Beverage" />
            </Field>
            <Field>
              <FieldLabel>Estado</FieldLabel>
              <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creando…" : "Create client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
