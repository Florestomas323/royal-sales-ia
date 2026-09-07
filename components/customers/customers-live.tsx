"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, Mail, Phone, ShoppingBag } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { UserAvatar } from "@/components/shared/user-avatar"
import { useCustomerSales, useCustomers } from "@/lib/firebase/sales"
import { useUsers } from "@/lib/firebase/collections"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { confirmedCount, totalRevenue } from "@/lib/sales"
import { memberLabel } from "@/lib/team"
import { formatCurrency } from "@/lib/format"
import { t } from "@/lib/i18n"
import type { Customer } from "@/types"

const c = t.customers

/**
 * "Clientes finales" — the people who bought, kept apart from the `clients`
 * module, which holds commercial accounts.
 *
 * Cards on every size: a purchase history reads badly in a table on a phone,
 * and there is nothing here that needs columns.
 */
export function CustomersLive() {
  const { workspaceId, role, membership } = useWorkspace()
  // A rep must narrow the query to their own book: Rules are not filters, so
  // an unbounded listing would be denied outright rather than trimmed.
  const onlyMine = role === "sales_rep" ? (membership?.userId ?? "") : null
  const { customers, loading, error } = useCustomers(workspaceId, onlyMine)
  const [selected, setSelected] = useState<Customer | null>(null)

  if (selected) {
    return <CustomerDetail customer={selected} onBack={() => setSelected(null)} />
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-3 py-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {c.loadError}
        </CardContent>
      </Card>
    )
  }

  if (customers.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground text-pretty">
          {c.empty}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {customers.map((customer) => (
        <CustomerCard key={customer.id} customer={customer} onOpen={() => setSelected(customer)} />
      ))}
    </div>
  )
}

function CustomerCard({ customer, onOpen }: { customer: Customer; onOpen: () => void }) {
  const { users } = useUsers()
  const owner = users.find((u) => u.id === customer.assignedToId)

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 px-4 py-4">
        <button type="button" onClick={onOpen} className="flex items-start gap-3 text-left">
          <UserAvatar name={customer.name} color="var(--chart-3)" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">{customer.name}</p>
            {customer.phone && (
              <p className="truncate text-xs text-muted-foreground">{customer.phone}</p>
            )}
          </div>
        </button>
        <Badge variant="secondary" className="w-fit">
          {c.owner}: {owner ? memberLabel(owner) : c.unassigned}
        </Badge>
        <Button variant="outline" size="sm" className="h-11 sm:h-8" onClick={onOpen}>
          <ShoppingBag className="size-3.5" data-icon="inline-start" />
          {c.history}
        </Button>
      </CardContent>
    </Card>
  )
}

function CustomerDetail({ customer, onBack }: { customer: Customer; onBack: () => void }) {
  const { sales, loading, error } = useCustomerSales(customer)
  const { users } = useUsers()
  // Derived, never stored: no counter can drift out of date.
  const revenue = useMemo(() => totalRevenue(sales), [sales])
  const purchases = useMemo(() => confirmedCount(sales), [sales])
  const owner = users.find((u) => u.id === customer.assignedToId)

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" className="h-11 w-fit gap-1.5 sm:h-8" onClick={onBack}>
        <ChevronLeft className="size-4" />
        {c.title}
      </Button>

      <Card>
        <CardContent className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-start gap-3">
            <UserAvatar name={customer.name} color="var(--chart-3)" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold leading-tight">{customer.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {c.owner}: {owner ? memberLabel(owner) : c.unassigned}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {customer.phone && (
              <span className="flex items-center gap-2">
                <Phone className="size-3.5 shrink-0" />
                <span className="truncate">{customer.phone}</span>
              </span>
            )}
            {customer.email && (
              <span className="flex items-center gap-2">
                <Mail className="size-3.5 shrink-0" />
                <span className="truncate">{customer.email}</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t pt-3">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">{c.totalRevenue}</span>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatCurrency(revenue)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">{c.purchases}</span>
              <span className="font-mono text-sm font-semibold tabular-nums">{purchases}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{c.history}</p>
        {loading && <Skeleton className="h-20 w-full" />}
        {error && <p className="text-sm text-muted-foreground">{c.loadError}</p>}
        {!loading && !error && sales.length === 0 && (
          <p className="text-sm text-muted-foreground">{c.historyEmpty}</p>
        )}
        {sales.map((sale) => {
          // soldById is the historical credit and never changes, even after
          // the customer is reassigned to somebody else.
          const seller = users.find((u) => u.id === sale.soldById)
          return (
            <Card key={sale.id}>
              <CardContent className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate font-medium">{sale.product}</p>
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                    {formatCurrency(sale.amount)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(sale.soldAt).toLocaleDateString("es-MX")} · {c.soldBy}:{" "}
                  {seller ? memberLabel(seller) : c.unassigned}
                </p>
                {sale.notes && (
                  <p className="text-xs text-muted-foreground text-pretty">{sale.notes}</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
