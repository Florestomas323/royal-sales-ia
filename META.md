# Meta — Fase 1 (preparación, sin conexión real)

Estado: **preparado, NO conectado.** No hay OAuth, ni Graph API, ni webhooks,
ni credenciales. Esta fase solo deja la interfaz y el modelo listos.

## Qué existe hoy

| Pieza | Archivo | Estado |
| --- | --- | --- |
| Catálogo de integraciones (qué ofrecemos y si está disponible) | `lib/integrations/catalog.ts` | Real (estático, no es mock) |
| Estado de conexión de Meta por workspace | `lib/integrations/meta.ts → useMetaConnection` | **Stub honesto**: devuelve `not_connected` sin tocar Firestore |
| Grid de integraciones | `components/integrations/integrations-grid.tsx` | Real. Ya no existe ningún "toggle" que finja conectar |
| Pantalla Administrar Meta | `/integrations/meta` · `components/integrations/meta-connection-panel.tsx` | Real. Todo lo inexistente muestra "Pendiente de conexión"; "Conectar Meta" está deshabilitado a propósito |
| Modelo `MetaConnection` y `MetaCampaignLink` | `types/index.ts` | Tipos listos, nada persistido |

Eliminado: `lib/mock-data/integrations.ts` (el estado "Conectado" ficticio).

## Estados que muestra la interfaz

- **Próximamente** — en el catálogo pero sin conector (TikTok, WhatsApp, Indeed, Google, Instagram, Facebook Pages).
- **No disponible** — no planificado para ese workspace/región (ninguno hoy).
- **No conectado** — el conector existe (Meta) pero este workspace no lo ha autorizado.
- **Conectado / Expirada / Error** — solo pueden salir de un documento de conexión escrito por el servidor. La UI no puede producirlos por sí misma.

## Regla de propiedad — "1 campaña = 1 workspace"

Una página de Facebook puede compartirse entre distribuidores (p. ej. *Cocina
con Propósito* la usan varios). Por eso **el propietario de un prospecto nunca
se deduce de la página**; se deduce de la campaña que lo generó:

```
Meta campaign id
  → meta_campaign_links/{metaCampaignId}   { workspaceId, objective, formIds[] }
  → workspaceId propietario
  → objective: sales | recruiting
  → lead creado en ESE workspace, en Ventas o en Reclutamiento
```

- Un `MetaCampaignLink` pertenece a un solo workspace. Tres campañas sobre la
  misma página → tres links → tres workspaces distintos → prospectos nunca
  mezclados.
- Ser `super_admin` no convierte al super admin en propietario: administra los
  links y las conexiones, pero el lead siempre aterriza en el workspace del link.
- Si llega un lead de un formulario/campaña sin link, **no** se asigna a nadie:
  queda en una cola de "sin asignar" para el super admin (se construirá con la
  fase de webhooks). Nunca se adivina el workspace.

## Flujo futuro de Lead Ads (no implementado)

```
Facebook/Instagram → Meta Lead Ads → Webhook (verificación de firma, 200 en <1 s, cola)
  → leadgen_id → GET /{leadgen_id} (token del lado servidor)
  → ad_id/campaign_id + form_id
  → buscar meta_campaign_links → workspaceId + objective
  → createLead({ workspaceId, leadType: objective, source: "meta", attribution: { externalCampaignId, externalAdSetId, externalAdId, externalCreativeId } })
  → Prospectos / Ventas   o   Prospectos / Reclutamiento
```

Requisito de la fase siguiente: reconciliación cada 15 min además del webhook
(Meta pierde eventos).

## Seguridad — decisiones ya tomadas

- Los tokens de Meta **nunca** irán al frontend ni a variables `NEXT_PUBLIC_*`.
  `MetaConnection.secretRef` es un puntero a un secreto del lado servidor; el
  documento visible en Firestore solo tendrá estado y nombres de activos.
- El flujo OAuth y el intercambio de tokens se harán en servidor (Route
  Handler / Cloud Function con Admin SDK), no en el navegador.
- La colección `integrations` y `meta_campaign_links` **no existen todavía** y
  las reglas actuales las mantienen cerradas (`match /{document=**}`). Se
  añadirán reglas explícitas cuando se creen: lectura para miembros del
  workspace, escritura solo desde servidor / super_admin.

## Orden de fases

1. **Fase 1 — Meta → Royal Sales IA** (siguiente): OAuth en servidor, selección
   de activos, suscripción Lead Ads, webhook + reconciliación, links de campaña.
2. **Fase 2 — Royal Sales IA → Meta**: crear/pausar campañas, presupuestos.
3. **Fase 3 — Media Buyer IA.**

## Requisitos externos (fuera de la app) antes de la Fase 1 real

1. Verificación de negocio de Impact Enterprises en Meta Business Manager.
2. App de Meta con `ads_read`, `leads_retrieval`, `pages_manage_metadata`,
   `pages_show_list` aprobados (App Review).
3. Backend para tokens (Firebase Admin + Secret Manager o equivalente).
4. URL de callback OAuth y endpoint de webhooks con verificación de firma.
