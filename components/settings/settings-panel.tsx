"use client"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
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
  FieldTitle,
} from "@/components/ui/field"
import { currentUser, currentWorkspace } from "@/lib/mock-data"
import { UserAvatar } from "@/components/shared/user-avatar"

function saved() {
  toast.success("Changes saved", { description: "Your settings have been updated." })
}

const notifications = [
  { id: "new-lead", title: "New lead assigned", description: "Notify me when a lead is routed to me.", on: true },
  { id: "hot-lead", title: "Hot lead alerts", description: "Instant alerts for leads scoring 80+.", on: true },
  { id: "appointment", title: "Appointment booked", description: "When a lead books a call from any funnel.", on: true },
  { id: "cold", title: "Lead going cold", description: "When a hot lead has no activity for 24h.", on: false },
  { id: "digest", title: "Daily digest", description: "Morning summary of pipeline and priorities.", on: true },
]

export function SettingsPanel() {
  return (
    <Tabs defaultValue="workspace" className="gap-6">
      <TabsList>
        <TabsTrigger value="workspace">Workspace</TabsTrigger>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
      </TabsList>

      <TabsContent value="workspace">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>General information about your agency workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="ws-name">Workspace name</FieldLabel>
                  <FieldDescription>Displayed across the app and on client reports.</FieldDescription>
                </FieldContent>
                <Input id="ws-name" defaultValue={currentWorkspace.name} className="sm:max-w-xs" />
              </Field>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="ws-plan">Plan</FieldLabel>
                  <FieldDescription>Your current subscription tier.</FieldDescription>
                </FieldContent>
                <div className="flex items-center">
                  <Badge variant="secondary" className="capitalize">{currentWorkspace.plan}</Badge>
                </div>
              </Field>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="ws-currency">Default currency</FieldLabel>
                  <FieldDescription>Used for spend, revenue, and pipeline values.</FieldDescription>
                </FieldContent>
                <Input id="ws-currency" defaultValue="USD ($)" className="sm:max-w-xs" />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button onClick={saved}>Save changes</Button>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="profile">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Update your personal information.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="flex items-center gap-4">
                <UserAvatar name={currentUser.name} color={currentUser.avatarColor} className="size-14" />
                <Button variant="outline" size="sm" onClick={saved}>Change photo</Button>
              </div>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="name">Full name</FieldLabel>
                </FieldContent>
                <Input id="name" defaultValue={currentUser.name} className="sm:max-w-xs" />
              </Field>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                </FieldContent>
                <Input id="email" type="email" defaultValue={currentUser.email} className="sm:max-w-xs" />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button onClick={saved}>Save changes</Button>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="notifications">
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Choose what you want to be notified about.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {notifications.map((n) => (
                <Field key={n.id} orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>{n.title}</FieldTitle>
                    <FieldDescription>{n.description}</FieldDescription>
                  </FieldContent>
                  <Switch defaultChecked={n.on} onCheckedChange={saved} />
                </Field>
              ))}
            </FieldGroup>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="billing">
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>Manage your plan and payment method.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium capitalize">{currentWorkspace.plan} plan</span>
                <span className="text-xs text-muted-foreground">Billed annually &middot; renews Jan 2027</span>
              </div>
              <Button variant="outline" size="sm" onClick={saved}>Manage plan</Button>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Visa ending in 4242</span>
                <span className="text-xs text-muted-foreground">Expires 08 / 2028</span>
              </div>
              <Button variant="outline" size="sm" onClick={saved}>Update</Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
