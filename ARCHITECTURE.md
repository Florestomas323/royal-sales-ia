# Arquitectura — Royal Sales IA

Este documento describe la arquitectura técnica de Royal Sales IA: el frontend, la capa de Firebase, el modelo de datos, la estrategia multi-tenant y el flujo de negocio previsto.

---

## 1. Visión general

Royal Sales IA es una aplicación **Next.js 16 (App Router)** renderizada mayoritariamente en el cliente para las áreas de datos en vivo, con **Firebase** como backend (Authentication + Cloud Firestore). El diseño sigue tres reglas:

1. **Tipos primero.** `types/index.ts` es la fuente única de verdad del dominio. Cualquier fuente de datos (mock o Firestore) devuelve exactamente esas formas.
2. **La UI no conoce el origen de los datos.** Los componentes consumen hooks (`useLeads`, `useClients`, ...) o props; migrar de mock a Firestore no cambia el render.
3. **Seguridad en el backend, no en la UI.** El guard de rutas es una conveniencia de UX; la autoridad real son Firebase Auth + Firestore Security Rules.

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js (Vercel)                      │
│                                                           │
│   app/(app)/*  ──consume──▶  hooks realtime (lib/firebase)│
│        │                              │                   │
│   RequireAuth (guard cliente)         │ onSnapshot        │
│        │                              ▼                   │
│   AuthProvider ──────────────▶  Firebase SDK (cliente)    │
└─────────────────────────────────────│─────────────────────┘
                                       ▼
                         ┌──────────────────────────┐
                         │        Firebase           │
                         │  Authentication           │
                         │  Cloud Firestore + Rules  │
                         └──────────────────────────┘
```

---

## 2. Frontend

| Área | Detalle |
| --- | --- |
| Router | Next.js App Router. Grupo `(app)` = área autenticada; `login/` = pública. |
| Layout raíz | `app/layout.tsx` monta `AuthProvider`, `TooltipProvider`, `Toaster`, fuentes y metadata (incluye Open Graph y manifiesto PWA). |
| Shell | `components/shell/` — sidebar con navegación por secciones (`nav-config.ts`), top-bar, búsqueda global, diálogos de creación. |
| Patrón "Live" | Cada módulo con datos reales tiene un contenedor cliente `*-live.tsx` que se suscribe a Firestore y pasa los datos a componentes de presentación por props. |
| Estado | Local por componente + suscripciones realtime. No hay store global; el realtime de Firestore es la fuente de estado compartido. |
| Estilos | Tailwind v4 con design tokens en `app/globals.css`. Marca azul royal sobre tema oscuro. |

---

## 3. Firebase

### 3.1 Authentication

- Proveedores: **Email/Password** y **Google** (`signInWithPopup`).
- `lib/firebase/auth-context.tsx`: `AuthProvider` + `useAuth()` (`user`, `loading`, `signIn`, `signUp`, `signInWithGoogle`, `signOut`).
- `components/auth/require-auth.tsx`: guard que redirige a `/login` sin sesión.
- Limitación conocida: la sesión del **SDK web** no está disponible en el middleware de Next, por lo que la protección de rutas es del lado cliente. La protección real de datos es responsabilidad de las Security Rules.

### 3.2 Firestore

- `lib/firebase/client.ts`: inicializa la app y exporta `auth` y `db`.
- Capas de datos:
  - `leads.ts` → colección `leads` (`useLeads`, `createLead`, `updateLeadStage`).
  - `collections.ts` → colecciones `clients`, `users`, `campaigns` (seeder genérico + hooks + creadores).
  - `seed.ts` → seed idempotente de `leads`.
- **Seed explícito:** `seed.ts` ya no se ejecuta solo; se invoca desde las herramientas de super admin y solo fuera de producción (o con `NEXT_PUBLIC_ENABLE_DEMO_SEED=true`). Ver `MULTITENANT.md`.

---

## 4. Modelo de datos

Todas las interfaces viven en `types/index.ts`. Colecciones actuales de Firestore (document id = campo `id`):

### `leads`
```
id, workspaceId, leadType (sales|recruiting), name, phone, email,
source (Platform), campaignId, campaignName,
score, temperature (hot|warm|cold),
stage (new_lead|contact|contacted|interested|appointment|follow_up|sale),
assignedToId  → users.id,
clientId      → clients.id,
potentialValue, createdAt, lastContactAt, nextFollowUpAt, nextAction,
attribution { platform, campaign, adSet, ad, creative,
              externalCampaignId?, externalAdSetId?, externalAdId?, externalCreativeId?, clickId? }
isDemo?
```

### `clients`
```
id, workspaceId, name, industry, logoColor, status (active|onboarding|paused),
adSpend, leads, appointments, sales, revenue
```

### `users` (miembros del equipo — NO es Firebase Auth)
```
id, workspaceId, authUid (uid de Firebase Auth | null), name, email, role (super_admin|client_admin|manager|sales_rep|viewer),
avatarColor, status (active|invited|inactive),
assignedLeads, appointments, sales
```

### `campaigns`
```
id, workspaceId, campaignType (sales|recruiting), name, platform (Platform), status (active|paused|learning|ended),
spend, leads, cpl, appointments, sales, revenue, roas,
clientId → clients.id, externalId?
```

### `workspaces`
```
id, name, plan, logoColor, status (active|suspended), createdAt, ownerEmail?
```

### `memberships` (document id = Firebase Auth UID)
```
workspaceId (null para super_admin), role, userId → users.id, email, createdAt
```

### Definidas en el modelo, aún no como colección (mock/roadmap)
`WorkspaceIntegration`, `Appointment`, `Activity`, `AIInsight`, `Kpi`, `FunnelStep`, `PlatformMetrics`, `Notification`.

### Relaciones

```
Workspace (roadmap)
   └── Client ──┬── Campaign ──┐
               │                ├──▶ Lead ──┬── Activity (roadmap)
               │                            ├── Appointment (roadmap)
User (team) ───┴── assignedTo ──▶ Lead      └── Sale (deriva de stage = "sale")
```

- Un **Client** agrupa **Campaigns** y **Leads**.
- Una **Campaign** origina **Leads** (atribución en `lead.attribution`).
- Un **User** (vendedor) tiene **Leads** asignados vía `assignedToId`.
- El avance de venta se modela hoy como `lead.stage`; **Appointments**, **Activities** y **Sales** como colecciones propias son roadmap.

---

## 5. Multi-tenancy

**Estado: implementado.** Detalle completo en [`MULTITENANT.md`](./MULTITENANT.md).

- **Workspace** = distribuidor (tenant). **Client** = cuenta comercial dentro del workspace. El aislamiento es siempre por `workspaceId`.
- `memberships/{authUid}` vincula Firebase Auth con un workspace y un rol; `users/{id}` es el perfil de equipo (puede existir antes del registro, `authUid: null`).
- `WorkspaceProvider` resuelve membership → perfil → workspace tras el login y expone `useWorkspace()` (`currentUser`, `currentWorkspace`, `workspaceId`, `role`, `isSuperAdmin`, `selectWorkspace`).
- Todas las consultas de `leads`, `clients`, `users`, `campaigns` filtran por `workspaceId` en Firestore (y por `assignedToId` para `sales_rep`).
- `firestore.rules` (versionado) es la autoridad: `super_admin` global; `client_admin`/`manager` dentro de su workspace; `sales_rep` solo sus leads; `viewer` solo lectura. Cualquier colección no declarada está cerrada.
- Documentos legacy sin `workspaceId` se migran desde **Configuración → Super admin** (no destructivo).

## 5b. Ventas y Reclutamiento (Fase 2)

Un mismo CRM, dos tipos de prospecto claramente separados. El tipo vive en
`Lead.leadType` (`"sales" | "recruiting"`) y es un **filtro de Firestore**, no
un filtro en memoria: la lista y los embudos consultan `where("leadType", "==", …)`.
`leadType` nunca interviene en autorización — el aislamiento sigue siendo
exclusivamente por `workspaceId` (+ `assignedToId` para `sales_rep`).

### Decisión de compatibilidad
Los prospectos creados antes de esta fase pueden no tener `leadType`. Se
tratan como **ventas** (`lib/leads.ts → leadTypeOf`): todos los registros
previos eran prospectos comerciales y no existe ningún campo que permita
inferir otra cosa. El valor solo se escribe en Firestore desde
**Configuración → Super admin → Normalización Fase 2** (idempotente, por
workspace, no toca ningún otro campo). Mientras no se normalicen, esos leads
aparecen en "Todos" pero no en la pestaña "Ventas" ni en el embudo de ventas.

### Pipelines
| | Ventas (`SalesStage`) | Reclutamiento (`RecruitingStage`) |
| --- | --- | --- |
| Etapas | `new_lead` Nuevo · `contact` Contactar · `contacted` Contactado · `interested` Interesado · `appointment` Demostración agendada · `follow_up` Seguimiento · `sale` Venta · `not_interested` No interesado | `rec_new` Nuevo candidato · `rec_contact` Contactar · `rec_contacted` Contactado · `rec_qualified` Calificado · `rec_interview` Entrevista · `rec_orientation` Orientación · `rec_follow_up` Seguimiento · `rec_hired` Incorporado · `rec_disqualified` No calificado |
| Ganado / perdido | `sale` / `not_interested` | `rec_hired` / `rec_disqualified` |

Las siete claves originales de ventas se conservan (solo cambian etiquetas), por
lo que **ningún lead existente necesita migración de etapa**. Si un lead tiene
una etapa del otro embudo (p. ej. tras cambiar de tipo), se muestra en la
primera columna sin escribir nada (`displayStage`); al cambiar el tipo desde la
ficha, la etapa se reinicia a la inicial del nuevo embudo.

### Fuentes
`Platform` cubre Meta, Facebook, Instagram, TikTok, Google, YouTube, Indeed,
WhatsApp, Sitio web, Landing page, Referido, Manual, Otro (+ `organic` legacy).
`SOURCES_BY_LEAD_TYPE` define qué se ofrece por tipo: **Indeed solo para
reclutamiento**.

### Atribución (modelo preparado, sin APIs)
`Lead.attribution` guarda: `platform, campaign, adSet, ad, creative` y, cuando
existen, `externalCampaignId, externalAdSetId, externalAdId,
externalCreativeId, clickId, utmSource, utmMedium, utmCampaign, utmContent,
utmTerm, landingPage, referrer`. Nunca se inventan ids: los conectores futuros
(Meta primero) los rellenarán.

### Campañas
`Campaign.objective: "sales" | "recruiting"` (Clientes / Candidatos).
`campaignType` (Fase 1) se sigue escribiendo por compatibilidad y se lee vía
`campaignObjective()`. El futuro Campaign Builder está tipado en
`CampaignDraft` (objetivo, canal, ubicación, presupuesto, destino, creativo).

### Indeed — dónde se conectará
- **Fuente:** `Platform: "indeed"` (solo reclutamiento) + `IntegrationProvider: "indeed"`.
- **Candidatos:** `Lead.recruiting` (`jobTitle, city, state, employmentPreference,
  hasVehicle, interviewDate, orientationDate, hiredAt, indeedJobId, indeedCandidateId`).
  Un candidato de Indeed se identifica por `source === "indeed"` y/o
  `recruiting.indeedCandidateId`.
- **Campañas / Sponsored Jobs:** `Campaign` con `platform: "indeed"`,
  `objective: "recruiting"`, `externalId` = id del job.
- **Métricas:** `computeRecruitingMetrics(leads, spend)` ya expone costo por
  candidato / entrevista / incorporación; devuelven `null` hasta que exista
  inversión real por canal.
- **Pendiente para la fase Indeed:** OAuth Employer, Job Sync, Candidate Sync
  (webhook → `leads` con `leadType: "recruiting"`, `source: "indeed"`), credenciales
  solo en servidor, colección `integrations` con reglas propias.

### Actividades (preparado)
`Activity` (`lib/types`) admite `call, whatsapp, email, note, stage_change,
appointment, demo, interview, orientation, hired, sale`. Aún no se persiste;
cuando exista la colección `activities` llevará `workspaceId` y reglas propias.

## 6. Flujo de negocio (visión futura)

El pipeline extremo a extremo que la arquitectura debe soportar:

```
Content
  → Campaign        (Meta / TikTok / Google)
  → Lead            (Lead Ads / formularios / entrada manual)
  → CRM             (scoring, asignación, temperatura)
  → Contact         (WhatsApp / llamada / email)
  → Follow-up       (secuencias, recordatorios)
  → Appointment     (agenda / calendario)
  → Sale            (cierre, ingreso)
  → Attribution     (qué campaña/ad originó el ingreso)
  → Conversion Event(reenvío a Meta CAPI / TikTok Events)
  → AI Optimization (reasignar presupuesto, sugerir siguiente acción)
```

Cada flecha es una integración o servicio futuro. El modelo de datos ya guarda la atribución en el lead para cerrar el bucle **Sale → Attribution → Conversion Event**.

---

## 7. Estrategia de datos: operativo vs. analítico

- **Firestore = datos operativos.** Realtime, CRUD de baja latencia para leads, pipeline, clientes, equipo y campañas. Es la base transaccional de la app.
- **Capa analítica (roadmap, p. ej. BigQuery).** Para métricas publicitarias, reporting avanzado y agregaciones pesadas se añadirá una capa analítica separada, alimentada desde Firestore (export/stream). Firestore no debe usarse para analítica a gran escala; separar ambas responsabilidades mantiene el rendimiento y el costo bajo control.

---

## 8. Integraciones futuras (no implementadas)

Todas requieren credenciales **solo de servidor** y autorización explícita antes de construirse:

| Integración | Propósito |
| --- | --- |
| Meta Marketing / Lead Ads / Conversions API | Ingesta de leads y reenvío de conversiones |
| TikTok Marketing / Events API | Ingesta de leads y eventos |
| WhatsApp Business Platform | Conversaciones y seguimiento |
| Proveedor de IA (p. ej. OpenAI) | Media buyer, sales assistant, insights |
| Capa analítica (BigQuery) | Reporting publicitario avanzado |

Los secretos de estas integraciones **nunca** van en el frontend ni en variables `NEXT_PUBLIC_*`; van en el servidor (Route Handlers / funciones) y fuera del control de versiones.

---

## 9. Decisiones y deuda técnica

- `next.config.mjs` tiene `typescript.ignoreBuildErrors: true`. El typecheck está limpio hoy (`pnpm exec tsc --noEmit` pasa); considerar poner el flag en `false` para que los errores de tipo bloqueen el build.
- `images.unoptimized: true` está activo (compatibilidad con la preview de v0). Revisar al optimizar para producción.
- Guard de rutas del lado cliente (limitación del SDK web). Las Security Rules son la salvaguarda real.
- Bootstrap del primer `super_admin` es manual en la consola (documentado en `MULTITENANT.md`). Cuando exista backend (Admin SDK) conviene moverlo a custom claims.
- Overview, Analytics, Integrations y Settings siguen leyendo de `lib/mock-data`.
