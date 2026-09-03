# Royal Sales IA

**Royal Sales IA** es una plataforma SaaS de marketing, CRM, ventas, automatización e inteligencia artificial. Conecta la publicidad con los prospectos, los vendedores, las conversaciones, las citas, las ventas y la atribución en un único command center, con la IA como capa transversal de optimización.

> Estado: el producto está en desarrollo activo. La autenticación y los módulos de **Leads**, **Pipeline**, **Clients**, **Team** y **Campaigns** ya usan datos reales en Firestore. El resto de módulos son visuales/roadmap (ver [Módulos: datos reales vs. mock](#módulos-datos-reales-vs-mock)).

---

## 1. Tabla de contenido

- [Stack tecnológico](#2-stack-tecnológico)
- [Arquitectura general](#3-arquitectura-general)
- [Instalar dependencias](#4-instalar-dependencias)
- [Ejecutar localmente](#5-ejecutar-localmente)
- [Configurar Firebase](#6-configurar-firebase)
- [Variables de entorno](#7-variables-de-entorno)
- [Cómo funciona Authentication](#8-cómo-funciona-authentication)
- [Cómo funciona Firestore](#9-cómo-funciona-firestore)
- [Módulos: datos reales vs. mock](#módulos-datos-reales-vs-mock)
- [Desplegar en Vercel](#11-desplegar-en-vercel)
- [Roadmap inmediato](#12-roadmap-inmediato)

---

## 2. Stack tecnológico

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS v4 |
| Componentes UI | shadcn/ui + Base UI |
| Iconos | lucide-react |
| Gráficos | Recharts |
| Notificaciones | Sonner |
| Auth | Firebase Authentication (email/password + Google) |
| Base de datos | Cloud Firestore (realtime) |
| Hosting | Vercel |

---

## 3. Arquitectura general

Aplicación **Next.js App Router** con una separación estricta entre UI, datos y backend. Detalle completo en [`ARCHITECTURE.md`](./ARCHITECTURE.md).

```
app/                     Rutas (App Router)
  (app)/                 Área autenticada (protegida por RequireAuth)
    page.tsx             Command Center (Overview)
    leads/  pipeline/    Módulos con datos reales de Firestore
    clients/ team/ campaigns/
    ...                  Módulos roadmap (media-buyer, content-lab, inbox, etc.)
  login/                 Pantalla de acceso pública
  layout.tsx             Layout raíz + metadata + AuthProvider
  manifest.ts            Manifiesto PWA

components/
  auth/                  AuthForm, RequireAuth (guard de rutas)
  <módulo>/              Componentes por módulo (leads/, pipeline/, ...)
  shared/                BrandMark, PageHeader, badges, avatares
  shell/                 Sidebar, top-bar, búsqueda global, diálogos
  ui/                    Primitivas shadcn/ui

lib/
  firebase/              Cliente, contexto de auth, capas de datos y seed
  mock-data/             Datos demo tipados (módulos aún no migrados)
  constants.ts format.ts utils.ts

types/                   Modelo de dominio (fuente única de verdad)
hooks/                   Hooks reutilizables (use-mobile)
public/                  Marca, iconos, imagen Open Graph
```

**Principio clave:** las interfaces de `types/index.ts` son la fuente única de verdad. La misma forma de datos la sirve tanto `lib/mock-data` como `lib/firebase`, así que migrar un módulo de mock a Firestore no cambia la UI, solo la fuente de datos.

---

## 4. Instalar dependencias

Requisitos: **Node.js 18+** y **pnpm**.

```bash
pnpm install
```

---

## 5. Ejecutar localmente

```bash
pnpm dev
```

La app queda disponible en `http://localhost:3000`. Al abrirla te redirige a `/login`; los datos demo ya **no** se siembran automáticamente: se hace desde Configuración → Super admin (solo fuera de producción). Ver `MULTITENANT.md`.

Scripts disponibles:

| Script | Descripción |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo con HMR |
| `pnpm build` | Build de producción |
| `pnpm start` | Sirve el build de producción |

---

## 6. Configurar Firebase

El repositorio incluye una **configuración web de desarrollo por defecto** (proyecto `royal-sales-ia`) para que la app arranque sin configuración. Para tu propio entorno:

1. Crea un proyecto en la [Consola de Firebase](https://console.firebase.google.com).
2. **Authentication → Sign-in method:** habilita **Google** y/o **Email/Password** y pulsa **Guardar**.
3. **Firestore Database → Crear base de datos** (modo producción).
4. **Firestore → Rules:** publica las reglas mínimas (ver abajo).
5. **Project settings → General → Your apps → Web app:** copia los valores del SDK a tu `.env.local` (ver [Variables de entorno](#7-variables-de-entorno)).

### Reglas de seguridad de Firestore

Las reglas viven versionadas en [`firestore.rules`](./firestore.rules) (multi-tenant por `workspaceId` y por rol). Publícalas en **Firestore → Rules** (pegar y Publish) o con `firebase deploy --only firestore:rules`. Los índices compuestos necesarios están en [`firestore.indexes.json`](./firestore.indexes.json).

Después de publicarlas, crea el primer `super_admin` y migra los datos existentes siguiendo [`MULTITENANT.md`](./MULTITENANT.md). **No debilites estas reglas para desarrollar.**

---

## 7. Variables de entorno

Copia `.env.example` a `.env.local` y rellena los valores de tu proyecto Firebase:

```bash
cp .env.example .env.local
```

| Variable | Descripción |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | API key web del proyecto |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Dominio de autenticación |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ID del proyecto |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Bucket de Storage |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID de mensajería |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID |
| `NEXT_PUBLIC_ENABLE_DEMO_SEED` | Opcional. `true` solo en staging para permitir sembrar datos demo. Nunca en producción. |
| `META_APP_ID` | Server only. Id de la app de Meta (ver `META.md`). |
| `META_APP_SECRET` | **Server only.** Firma de webhooks de Meta. |
| `META_WEBHOOK_VERIFY_TOKEN` | **Server only.** Token de verificación del webhook; el mismo valor se pega en Meta for Developers. |

Los valores `NEXT_PUBLIC_FIREBASE_*` son **config web pública** (seguros de exponer en el cliente). La seguridad real la imponen Firebase Auth + Firestore Security Rules, no el ocultamiento de estas claves.

**Nunca** pongas en el frontend ni versiones: service accounts, private keys, Firebase Admin key, ni tokens de Meta / TikTok / WhatsApp / OpenAI. Esas credenciales van solo en el servidor (roadmap) y nunca se committean.

---

## 8. Cómo funciona Authentication

- `lib/firebase/auth-context.tsx` expone un `AuthProvider` (montado en `app/layout.tsx`) y el hook `useAuth()` con `user`, `loading`, `signIn`, `signUp`, `signInWithGoogle` y `signOut`.
- `components/auth/auth-form.tsx` implementa login y registro con email/password más "Continuar con Google", con mensajes de error en español.
- `components/auth/require-auth.tsx` es el guard: envuelve el layout del grupo `(app)` y redirige a `/login` si no hay sesión, mostrando un splash mientras `loading` es `true`.
- El cierre de sesión vive en el sidebar (`app-sidebar.tsx`) y usa `signOut()` seguido de redirección a `/login`.

> La protección de rutas es **del lado del cliente** (el SDK web de Firebase no expone la sesión al middleware de Next). La seguridad real de los datos la garantizan las Firestore Security Rules.

---

## 9. Cómo funciona Firestore

- `lib/firebase/client.ts` inicializa la app y exporta `auth` y `db` (singletons seguros para HMR).
- `lib/firebase/leads.ts` — colección `leads`: hook realtime `useLeads()` (`onSnapshot`), `createLead()` y `updateLeadStage()` (persiste el drag & drop del pipeline).
- `lib/firebase/collections.ts` — capa genérica para `clients`, `users` y `campaigns`: seeder idempotente `seedCollectionIfEmpty()`, hooks `useClients()` / `useUsers()` / `useCampaigns()`, el lookup `useUsersMap()` y las funciones `createClient()` / `createUser()` / `createCampaign()`.
- `lib/firebase/seed.ts` — siembra idempotente de `leads` preservando los ids demo (`l1..l14`).

**Seed automático:** la primera vez que la app corre contra una colección vacía, sube el dataset demo **preservando los ids originales** (`c1..`, `u1..`, `cmp1..`, `l1..`) para que las referencias cruzadas entre documentos (lead → `clientId` / `assignedToId` / `campaignId`) sigan resolviendo. Es idempotente: si ya existe algún documento, no hace nada.

---

## Módulos: datos reales vs. mock

| Módulo | Ruta | Fuente de datos |
| --- | --- | --- |
| Leads | `/leads` | **Firestore (realtime)** |
| Pipeline | `/pipeline` | **Firestore (realtime + drag & drop)** |
| Clients | `/clients` | **Firestore (realtime)** |
| Team | `/team` | **Firestore (realtime)** |
| Campaigns | `/campaigns` | **Firestore (realtime)** |
| Command Center (Overview) | `/` | Mock (`lib/mock-data`) |
| Analytics | `/analytics` | Mock |
| Integrations | `/integrations`, `/integrations/meta` | Real (estados); conexión Meta pendiente — ver `META.md` |
| Settings | `/settings` | Mock / local |
| AI Media Buyer | `/media-buyer` | Roadmap (placeholder visual) |
| Content Lab | `/content-lab` | Roadmap |
| Inbox | `/inbox` | Roadmap |
| Calendar | `/calendar` | Roadmap |
| Reports | `/reports` | Roadmap |
| Automations | `/automations` | Roadmap |

---

## 11. Desplegar en Vercel

1. Sube el repositorio a GitHub (ver instrucciones al final de esta tarea o en el chat).
2. En [Vercel](https://vercel.com), **Add New → Project** e importa el repo.
3. Framework preset: **Next.js** (autodetectado). Sin overrides de build.
4. En **Settings → Environment Variables**, añade las seis variables `NEXT_PUBLIC_FIREBASE_*`.
5. **Deploy.**
6. En Firebase → **Authentication → Settings → Authorized domains**, añade el dominio de Vercel (`tu-proyecto.vercel.app`) para que el login con Google funcione en producción.

---

## 12. Roadmap inmediato

1. **Overview en tiempo real** — calcular KPIs, funnel y gráficos del Command Center desde los datos reales de Firestore.
2. **Multi-tenancy** — aislar los datos por `workspaceId` y endurecer las Security Rules por rol.
3. **Migrar Analytics** a datos reales.
4. **Integraciones (autorización previa requerida):** Meta Ads / Lead Ads / CAPI, TikTok Ads / Events, WhatsApp Business, y la capa de IA (media buyer, sales assistant).
5. **Capa analítica** (p. ej. BigQuery) para reporting publicitario avanzado.

Las decisiones de arquitectura y las reglas para continuar el desarrollo con Claude Code están en [`ARCHITECTURE.md`](./ARCHITECTURE.md) y [`CLAUDE.md`](./CLAUDE.md).
