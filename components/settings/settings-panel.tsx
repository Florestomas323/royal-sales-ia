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
import { UserAvatar } from "@/components/shared/user-avatar"
import { SuperAdminTools } from "@/components/settings/super-admin-tools"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { t } from "@/lib/i18n"

function saved() {
  toast.success(t.settings.savedTitle, { description: t.settings.savedDescription })
}

const notifications = t.settings.notifications.items

export function SettingsPanel() {
  const { currentUser, currentWorkspace, isSuperAdmin } = useWorkspace()
  const workspaceName = currentWorkspace?.name ?? ""
  const workspacePlan = currentWorkspace?.plan ?? "—"

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
                  <FieldDescription>{t.settings.workspace.nameDescription}</FieldDescription>
                </FieldContent>
                <Input id="ws-name" key={workspaceName} defaultValue={workspaceName} className="sm:max-w-xs" />
              </Field>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="ws-plan">{t.settings.workspace.planLabel}</FieldLabel>
                  <FieldDescription>{t.settings.workspace.planDescription}</FieldDescription>
                </FieldContent>
                <div className="flex items-center">
                  <Badge variant="secondary" className="capitalize">{workspacePlan}</Badge>
                </div>
              </Field>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="ws-currency">
                    {t.settings.workspace.currencyLabel}
                  </FieldLabel>
                  <FieldDescription>{t.settings.workspace.currencyDescription}</FieldDescription>
                </FieldContent>
                <Input id="ws-currency" defaultValue="USD ($)" className="sm:max-w-xs" />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button onClick={saved}>{t.common.saveChanges}</Button>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="profile">
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.profile.title}</CardTitle>
            <CardDescription>{t.settings.profile.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="flex items-center gap-4">
                <UserAvatar name={currentUser.name} color={currentUser.avatarColor} className="size-14" />
                <Button variant="outline" size="sm" onClick={saved}>
                  {t.settings.profile.changePhoto}
                </Button>
              </div>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="name">{t.settings.profile.nameLabel}</FieldLabel>
                </FieldContent>
                <Input id="name" key={currentUser.name} defaultValue={currentUser.name} className="sm:max-w-xs" />
              </Field>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="email">{t.settings.profile.emailLabel}</FieldLabel>
                </FieldContent>
                <Input id="email" type="email" key={currentUser.email} defaultValue={currentUser.email} className="sm:max-w-xs" />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button onClick={saved}>{t.common.saveChanges}</Button>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="notifications">
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.notifications.title}</CardTitle>
            <CardDescription>{t.settings.notifications.description}</CardDescription>
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
            <CardTitle>{t.settings.billing.title}</CardTitle>
            <CardDescription>{t.settings.billing.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium capitalize">
                  {t.settings.billing.plan(workspacePlan)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.settings.billing.billedAnnually}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={saved}>
                {t.settings.billing.managePlan}
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{t.settings.billing.cardEnding}</span>
                <span className="text-xs text-muted-foreground">
                  {t.settings.billing.cardExpires}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={saved}>
                {t.settings.billing.update}
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
