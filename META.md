# Meta — Fase 1 (preparación, sin conexión real)

Estado: **preparado, NO conectado.** No hay OAuth ni llamadas a la Graph API.
Existe el endpoint de webhooks (verificado y firmado) pero todavía no persiste
nada — ver §"Webhook Lead Ads — Fase 1".

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

---

## Webhook Lead Ads — Fase 1

**OAuth todavía NO está implementado.** Esta fase solo entrega el endpoint
público que Meta necesita para verificar y entregar eventos.

| | |
| --- | --- |
| Callback | `https://<dominio-de-producción>/api/meta/webhook` (funciona en cualquier dominio; no hay nada hardcodeado) |
| Object | `Page` |
| Field (futuro) | `leadgen` — la suscripción de la página se hará manualmente en Meta for Developers después de verificar el callback |
| Runtime | Node.js (Route Handler `app/api/meta/webhook/route.ts`) |

### Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Alcance | Uso |
| --- | --- | --- |
| `META_APP_ID` | server | Id de la app. Aún no se usa en código; se documenta para OAuth |
| `META_APP_SECRET` | **server only** | HMAC de `X-Hub-Signature-256` |
| `META_WEBHOOK_VERIFY_TOKEN` | **server only** | Debe ser el MISMO valor que pegues en Meta → Webhooks → Page → Token de verificación |

Ninguna lleva `NEXT_PUBLIC_`. Nunca aparecen en el bundle del navegador ni en logs.
Si falta `META_APP_SECRET` o `META_WEBHOOK_VERIFY_TOKEN`, el endpoint responde
`503 Webhook not configured` (no un 200 silencioso).

### GET — verificación

1. Lee `hub.mode`, `hub.verify_token`, `hub.challenge`.
2. Si `hub.mode == "subscribe"` y el token coincide con `META_WEBHOOK_VERIFY_TOKEN`
   → responde `200` con **exactamente** `hub.challenge` como texto plano.
3. En cualquier otro caso → `403`.

### POST — recepción

1. Lee el **raw body** (`request.text()`) antes de parsear.
2. Valida `X-Hub-Signature-256 = sha256=<hex>` contra
   `HMAC_SHA256(META_APP_SECRET, raw_body)` con comparación en tiempo constante
   (`lib/meta/signature.ts`). Firma ausente o inválida → `401`.
3. Parsea defensivamente (`lib/meta/types.ts → parseMetaWebhook`): solo
   `object == "page"`, recorre `entry[].changes[]`, extrae `field == "leadgen"`
   e ignora el resto. Un payload malformado nunca rompe el endpoint.
4. Por cada leadgen ejecuta `handleLeadgenEvent` (`lib/meta/processor.ts`):
   - sin `leadgen_id` → `unresolved (missing_ids)`
   - ya procesado → `duplicate` (idempotencia por `leadgen_id`)
   - sin `ad_id` / `adgroup_id` / `form_id` → `unresolved (missing_ids)`
   - con ids → `resolveOwner()` vía **link explícito de campaña**; sin link → `unresolved (no_link)`
   - **Nunca** se crea un prospecto sin propietario resuelto. Nunca por `page_id`,
     nunca por nombre de campaña, nunca en el workspace del navegador ni del super admin.
5. Responde `200` rápido con un resumen `{ received, leadgen, resolved, unresolved, duplicate }`.

Logs: solo `field`, ids enmascarados (`123456…`) y el resultado. Nunca tokens,
secretos, teléfonos, correos ni el payload completo.

### Lo que falta para persistir (bloqueado a propósito)

El repositorio **no tiene Firebase Admin SDK** ni service account. Escribir en
Firestore desde este endpoint con el SDK de cliente sería una petición sin
usuario autenticado: las reglas la rechazarían y sería el modelo de seguridad
equivocado. Por eso el procesador actual es `createLogOnlyProcessor()`:

- idempotencia solo en memoria del proceso (protege reintentos inmediatos en
  una instancia caliente; **no es durable** entre instancias/deploys);
- `resolveOwner()` devuelve siempre `null` → todo leadgen termina `unresolved`;
- no se crea ningún prospecto.

Para la fase siguiente hace falta, en este orden:

1. Dependencia `firebase-admin`.
2. Service account del proyecto Firebase (JSON) en Vercel como
   `FIREBASE_SERVICE_ACCOUNT_JSON` (server only).
3. `lib/firebase/admin.ts` con inicialización única.
4. `createFirestoreProcessor(adminDb)` sobre colecciones **server-only**
   (cerradas a clientes por el `match /{document=**}` actual, sin cambiar reglas):
   - `processedMetaLeads/{leadgenId}` — idempotencia durable
   - `metaCampaignLinks/{id}` — `{ workspaceId, metaCampaignId, metaAdId,
     metaAdsetId, metaFormId, metaPageId, campaignId, campaignObjective,
     assignedToId?, createdAt, updatedAt }`
   - `metaWebhookEvents/{autoId}` — eventos `unresolved` para revisión del super admin
5. Descarga del lead (`GET /{leadgen_id}`) con page access token → requiere OAuth.
