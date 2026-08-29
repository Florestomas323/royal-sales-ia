# CLAUDE.md — Contexto principal para Claude Code

Este archivo es el contexto de referencia al abrir el repositorio con Claude Code. Léelo antes de proponer o hacer cambios.

---

## NOMBRE

**Royal Sales IA**

## MISIÓN

Construir un sistema operativo de marketing y ventas que conecte publicidad, prospectos, vendedores, conversaciones, citas, ventas, atribución e inteligencia artificial en un único command center.

## PRINCIPIO CENTRAL

```
CONTENT
  → CAMPAIGN
  → LEAD
  → CRM
  → CONTACT
  → FOLLOW-UP
  → APPOINTMENT
  → SALE
  → ATTRIBUTION
  → AI OPTIMIZATION
```

Cada decisión técnica debe acercar el producto a soportar este flujo de extremo a extremo.

---

## REGLAS PARA CLAUDE

1. **No** cambiar la identidad visual sin autorización.
2. **No** reemplazar Firebase.
3. **No** introducir Supabase (ni Neon u otro backend).
4. **No** modificar arquitectura crítica sin explicar primero la razón.
5. Mantener **TypeScript**.
6. Mantener **componentes reutilizables**.
7. Mantener el **aislamiento multi-tenant** como dirección de diseño.
8. **Nunca** colocar secretos en el frontend.
9. Mantener las **Firestore Security Rules** (no debilitarlas para desarrollar).
10. Evitar **refactors masivos** innecesarios; priorizar estabilidad.
11. Antes de instalar dependencias nuevas, comprobar si realmente son necesarias.
12. **No** conectar servicios externos sin autorización.
13. Preservar la compatibilidad con **Vercel**.
14. Documentar las decisiones arquitectónicas importantes (en `ARCHITECTURE.md`).
15. Priorizar **seguridad, mantenibilidad y escalabilidad**.

---

## ESTADO POR ÁREA

### IMPLEMENTADO
- Firebase Authentication (email/password + Google) con guard de rutas.
- Firestore realtime para: **Leads**, **Pipeline** (con drag & drop persistente), **Clients**, **Team**, **Campaigns**.
- Seed idempotente de datos demo preservando ids.
- Marca completa: icono de app, favicon, apple-touch-icon, manifiesto PWA, imagen Open Graph.
- Config de Firebase por variables de entorno (`NEXT_PUBLIC_FIREBASE_*`) con fallback de desarrollo.

### EN DESARROLLO
- Migración de módulos restantes de mock a Firestore.
- Multi-tenancy (aún sin `workspaceId` en las colecciones).

### MOCK (usan `lib/mock-data`)
- Command Center / Overview (`/`)
- Analytics (`/analytics`)
- Integrations (`/integrations`)
- Settings (`/settings`)

### ROADMAP (placeholder visual, sin backend)
- AI Media Buyer (`/media-buyer`)
- Content Lab (`/content-lab`)
- Inbox (`/inbox`)
- Calendar (`/calendar`)
- Reports (`/reports`)
- Automations (`/automations`)

---

## NO CONSTRUIR TODAVÍA (requiere autorización explícita)

Meta Marketing / Lead Ads / Conversions API · TikTok Marketing / Lead Generation / Events API · WhatsApp Business Platform · OpenAI · AI Media Buyer · AI Sales Assistant · Content Lab · Trend Radar · Autopilot · Billing.

Solo dejar la arquitectura preparada para incorporarlos después. Los secretos de estas integraciones van **solo en el servidor**, nunca en el frontend ni versionados.

---

## MAPA DEL CÓDIGO (dónde tocar)

| Necesitas... | Ve a... |
| --- | --- |
| Cambiar el modelo de datos | `types/index.ts` (fuente única de verdad) |
| Lógica de auth | `lib/firebase/auth-context.tsx`, `components/auth/` |
| Datos de Leads | `lib/firebase/leads.ts` |
| Datos de Clients/Team/Campaigns | `lib/firebase/collections.ts` |
| Seed de datos demo | `lib/firebase/seed.ts`, `lib/firebase/collections.ts` |
| Config de Firebase | `lib/firebase/client.ts` (+ `.env.example`) |
| Navegación / sidebar | `components/shell/nav-config.ts` |
| Datos aún mock | `lib/mock-data/` |
| UI de un módulo | `components/<módulo>/` |
| Primitivas UI | `components/ui/` (shadcn) — reutilizar, no reinventar |

**Patrón "Live":** para conectar un módulo mock a Firestore, replica el patrón existente — un contenedor cliente `*-live.tsx` que se suscribe con un hook realtime y pasa datos por props a los componentes de presentación (ver `components/leads/leads-live.tsx` o `components/campaigns/campaigns-live.tsx`).

---

## COMANDOS

```bash
pnpm install          # instalar dependencias
pnpm dev              # desarrollo (localhost:3000)
pnpm build            # build de producción
pnpm exec tsc --noEmit  # typecheck (debe pasar sin errores)
```

Antes de dar por terminado un cambio: `pnpm exec tsc --noEmit` debe pasar.

Detalles completos en `README.md` (setup y despliegue) y `ARCHITECTURE.md` (diseño técnico, modelo de datos, multi-tenancy y deuda técnica).
