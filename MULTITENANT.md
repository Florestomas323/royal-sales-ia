# Multi-tenancy — Royal Sales IA

Fase: **aislamiento por workspace**. Este documento registra las decisiones,
el modelo de identidad, la migración de datos existentes y los pasos manuales
que hay que ejecutar en Firebase.

---

## 1. Decisión: Workspace es la entidad superior; Client vive dentro

| Entidad | Qué es | Frontera de seguridad |
| --- | --- | --- |
| **Workspace** | Un distribuidor (o agencia). Tenant. | **Sí** — todo se filtra y se protege por `workspaceId`. |
| **Client** | Cuenta comercial *dentro* de un workspace: marca, línea de negocio o sub-distribuidor para la que se corren campañas. | **No** — `clientId` es solo organización interna. |

Por qué no "Client = distribuidor":

1. La UI existente ya trata `Client` como *lo que agrupa campañas y leads* y le
   calcula ROAS/CPL. Eso sigue siendo útil dentro de un distribuidor (por
   ejemplo "Ventas" vs "Reclutamiento", o dos zonas).
2. Un distribuidor que crece puede tener varias cuentas; si `Client` fuera el
   tenant habría que rehacer el modelo cuando eso pase.
3. Las Security Rules necesitan **un solo campo** para aislar. Es `workspaceId`.
   `clientId` se mantiene por compatibilidad y para reporting, nunca para
   autorización.

En la práctica hoy: **un workspace por distribuidor, con (al menos) un client
que representa al propio distribuidor**.

---

## 2. Modelo de identidad

```
Firebase Auth (uid, email, emailVerified)
        │
        ▼ 1:1  memberships/{uid}      ← lo lee Security Rules en cada request
        │        { workspaceId, role, userId, email, createdAt }
        │
        ▼ 1:1  users/{userId}         ← perfil de equipo que ve la UI
                 { workspaceId, authUid, name, email, role, status, ... }
```

- `users` **no** es Firebase Auth. Un perfil puede existir antes de que la
  persona tenga cuenta (`status: "invited"`, `authUid: null`).
- `memberships/{uid}` es el vínculo. Existe porque las reglas solo pueden hacer
  `get()` por ruta conocida y lo único que conocen es `request.auth.uid`.
- El id de `users` no cambia nunca: los leads apuntan a él (`assignedToId`).

### Flujo de invitación

1. Un admin crea el perfil desde **Equipo → Invitar** (`users`, `authUid: null`).
2. La persona entra con **ese mismo correo** (Google o email/contraseña).
3. `WorkspaceProvider` no encuentra `memberships/{uid}` → busca un `users` con
   ese email y `authUid == null`.
4. Si el correo está **verificado**, escribe en un batch
   `memberships/{uid}` + `users.authUid = uid`. Las reglas validan cada campo
   contra la invitación (mismo workspace, mismo rol, nunca `super_admin`).
5. Si no está verificado, ve la pantalla "Verifica tu correo" (con reenvío).
   Google ya llega verificado; email/contraseña recibe el correo al registrarse.

### Estados que maneja la app (sin romper la UI)

| Estado | Pantalla |
| --- | --- |
| `no_membership` | "Tu cuenta aún no tiene workspace" + cerrar sesión |
| `unverified_email` | "Verifica tu correo" + reenviar + "ya lo verifiqué" |
| `error` (permission-denied, etc.) | Mensaje + detalle técnico + reintentar |
| Error en una suscripción de datos | `DataErrorState` visible en el módulo |

---

## 3. Bootstrap del primer super admin (manual, una sola vez)

Las reglas no permiten crear un `super_admin` desde la app. Hazlo en la
consola de Firebase:

1. **Authentication** → copia el **UID** de tu cuenta (`florestomas323@gmail.com`).
2. **Firestore → colección `memberships`** → documento con **ID = ese UID**:
   ```
   workspaceId: null
   role:        "super_admin"
   userId:      "<mismo UID>"
   email:       "florestomas323@gmail.com"
   createdAt:   "2026-09-02T00:00:00.000Z"
   ```
3. (Opcional, para que salga tu nombre) **colección `users`** → documento con
   **ID = ese UID**:
   ```
   workspaceId: ""      (el super admin no pertenece a ninguno)
   authUid:     "<UID>"
   name:        "Tomás Flores"
   email:       "florestomas323@gmail.com"
   role:        "super_admin"
   avatarColor: "var(--chart-1)"
   status:      "active"
   assignedLeads: 0, appointments: 0, sales: 0
   ```
4. Publica `firestore.rules` (Firestore → Rules → pegar → Publish).
5. Entra a la app → **Configuración → Super admin** → crea el primer workspace.

---

## 4. Migración de datos existentes (no destructiva)

Los documentos creados antes de esta fase no tienen `workspaceId`. Con las
reglas nuevas **solo el super admin puede leerlos**; para el resto son
invisibles (no se borran).

Pasos:

1. Publica las reglas y entra como super admin.
2. **Configuración → Super admin → Workspaces** → crea el workspace destino
   (por ejemplo "Yellow Group" o "Andrés Characo").
3. Selecciónalo en el **selector del sidebar** (no "Todos los workspaces").
4. **Migración → Escanear** → verás cuántos documentos hay sin `workspaceId`
   por colección.
5. **Asignar N documentos al workspace activo**. Solo añade campos:
   - `workspaceId`
   - `leads.leadType = "sales"` si falta
   - `campaigns.campaignType = "sales"` si falta
   - `users.authUid = null` si falta
6. Vuelve a **Escanear**: debe decir 0.

Si los datos existentes son solo el dataset demo antiguo (ids `c1…`, `u1…`,
`l1…`, `cmp1…`), también puedes borrarlos y sembrar de nuevo con la herramienta
de demo en un workspace de pruebas (los ids nuevos llevan prefijo del
workspace, p. ej. `wsId_l1`).

**Fallback temporal:** mientras migras, la app no rompe: las listas salen
vacías (no hay error) para los miembros, y el super admin ve todo.

---

## 5. Datos demo

- Ya **no** se siembra nada automáticamente al abrir la app.
- La siembra solo ocurre desde **Super admin → Datos demo**, y solo si
  `NODE_ENV !== "production"` o `NEXT_PUBLIC_ENABLE_DEMO_SEED=true`.
- Los documentos sembrados llevan `isDemo: true`; las listas lo indican con
  "Esta lista incluye registros demo". Los usuarios demo tienen correos
  `@demo.invalid` para que nadie pueda reclamarlos.
- Los módulos que aún leen de `lib/mock-data` muestran la insignia
  **"Datos de demostración"** en su cabecera.

### Inventario de `lib/mock-data` (pendiente de conectar a Firestore)

| Componente | Usa | Módulo |
| --- | --- | --- |
| `components/overview/ai-insights.tsx` | `aiInsights` | Command Center |
| `components/overview/conversion-funnel.tsx` | `funnel` | Command Center / Analytics |
| `components/overview/platform-performance.tsx` | `platformMetrics` | Command Center / Analytics |
| `components/overview/performance-chart.tsx` | `performanceTrend` | Command Center / Analytics |
| `components/analytics/revenue-chart.tsx` | `performanceTrend` | Analytics |
| `components/integrations/integrations-grid.tsx` | `integrations` | Integraciones |
| `components/shell/notifications-menu.tsx` | `notifications` | Shell (campana) |
| `components/shell/top-bar.tsx` | `periods` | Shell (selector de periodo; solo etiquetas) |

Ya **no** usan mock: sidebar, búsqueda global, ficha de lead (timeline),
settings (workspace/perfil), overview header, KPIs del Command Center y
"Prioridades de hoy" (Fase 2). Los widgets que siguen siendo mock van envueltos
en `MockWidget`, que les pone la insignia "Datos de demostración".

---

## 6. Reglas (resumen)

| Colección | super_admin | client_admin | manager | sales_rep | viewer |
| --- | --- | --- | --- | --- | --- |
| workspaces | todo | leer, editar nombre | leer | leer | leer |
| memberships | todo | leer/editar su ws (no → super_admin) | leer su ws | la suya | la suya |
| users | todo | CRUD en su ws | crear/editar en su ws | leer su ws | leer su ws |
| clients | todo | CRUD | crear/editar | leer | leer |
| campaigns | todo | CRUD | crear/editar | leer | leer |
| leads | todo | CRUD | CRUD | **solo los asignados** | leer |

`leads.create` exige `leadType ∈ {sales, recruiting}` y `campaigns.create` exige `objective ∈ {sales, recruiting}` (Fase 2). Son validaciones de forma: **no** participan en ninguna decisión de acceso.
| cualquier otra | — | — | — | — | — (cerrada) |

Invariantes que las reglas garantizan aunque el cliente esté manipulado:

- Nadie fuera de `super_admin` puede leer un documento de otro workspace.
- `workspaceId` es inmutable en updates.
- Nadie puede asignarse `super_admin` ni reclamar una invitación ajena
  (correo verificado + coincidencia exacta de workspace y rol).
- Un `sales_rep` no puede reasignar leads ni ver los de otros.

---

## 7. Índices compuestos

`firestore.indexes.json` (Firestore → Indexes → Composite → Create):

| Colección | Campos |
| --- | --- |
| `leads` | `workspaceId` ASC, `createdAt` DESC |
| `leads` | `workspaceId` ASC, `assignedToId` ASC, `createdAt` DESC |
| `leads` | `workspaceId` ASC, `leadType` ASC, `createdAt` DESC |
| `leads` | `workspaceId` ASC, `leadType` ASC, `assignedToId` ASC, `createdAt` DESC |
| `leads` | `leadType` ASC, `createdAt` DESC — solo para el super admin en "Todos los workspaces" |

Los conteos por tipo (`getCountFromServer`) usan solo igualdades y no requieren índice compuesto.

Las demás consultas usan una sola igualdad (`workspaceId ==`) y ordenan en
memoria, por lo que no necesitan índice compuesto. Si una consulta falla con
`failed-precondition`, la app muestra el error con el enlace de creación que
devuelve Firestore en el detalle.

---

## 8. Preparado para lo que sigue (sin construir todavía)

- `Lead.leadType` y `Campaign.campaignType`: `"sales" | "recruiting"`.
- `Platform` incluye `youtube` e `indeed`; `IntegrationProvider` lista todos
  los conectores previstos (Meta, Facebook, Instagram, WhatsApp, TikTok,
  Google Ads, YouTube, **Indeed**).
- `Attribution.externalCampaignId / externalAdSetId / externalAdId /
  externalCreativeId / clickId` para atribución plataforma-side.
- `WorkspaceIntegration` (tipo) para la futura colección `integrations`
  (por workspace y proveedor). Las credenciales irán **solo en servidor**.
- Indeed (reclutamiento) encaja como `Platform: "indeed"` + `leadType:
  "recruiting"` + un futuro `IntegrationProvider: "indeed"`; no requiere
  cambios de modelo cuando se integre.
