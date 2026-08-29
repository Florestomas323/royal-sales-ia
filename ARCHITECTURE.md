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
- **Seed idempotente:** siembra el dataset demo solo si la colección está vacía y **preserva los ids originales** para no romper referencias cruzadas.

---

## 4. Modelo de datos

Todas las interfaces viven en `types/index.ts`. Colecciones actuales de Firestore (document id = campo `id`):

### `leads`
```
id, name, phone, email,
source (Platform), campaignId, campaignName,
score, temperature (hot|warm|cold),
stage (new_lead|contact|contacted|interested|appointment|follow_up|sale),
assignedToId  → users.id,
clientId      → clients.id,
potentialValue, createdAt, lastContactAt, nextFollowUpAt, nextAction,
attribution { platform, campaign, adSet, ad, creative }
```

### `clients`
```
id, name, industry, logoColor, status (active|onboarding|paused),
adSpend, leads, appointments, sales, revenue
```

### `users` (miembros del equipo)
```
id, name, email, role (super_admin|client_admin|manager|sales_rep|viewer),
avatarColor, status (active|invited|inactive),
assignedLeads, appointments, sales
```

### `campaigns`
```
id, name, platform (Platform), status (active|paused|learning|ended),
spend, leads, cpl, appointments, sales, revenue, roas,
clientId → clients.id
```

### Definidas en el modelo, aún no como colección (mock/roadmap)
`Workspace`, `Appointment`, `Activity`, `AIInsight`, `Kpi`, `FunnelStep`, `PlatformMetrics`, `Notification`.

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

El objetivo es aislamiento por **workspace** (agencia/organización) con roles.

**Estado actual:** las colecciones son planas y globales; el aislamiento aún no está activo. El modelo ya contempla `Workspace` y `UserRole`.

**Dirección objetivo:**

1. Añadir `workspaceId` a cada documento (`leads`, `clients`, `users`, `campaigns`).
2. Resolver el `workspaceId` del usuario tras el login (documento de perfil o custom claims).
3. Filtrar todas las consultas por `workspaceId`.
4. Endurecer las Security Rules para exigir `resource.data.workspaceId == <workspace del usuario>` y validar el rol para escrituras sensibles.
5. Escalar los roles (`super_admin` global; `client_admin`/`manager`/`sales_rep`/`viewer` dentro del workspace).

> No debilitar las Security Rules para facilitar el desarrollo. El aislamiento se refuerza en el backend, no solo en la UI.

---

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
- Colecciones aún sin `workspaceId` (pendiente para multi-tenancy).
- Overview, Analytics, Integrations y Settings siguen leyendo de `lib/mock-data`.
