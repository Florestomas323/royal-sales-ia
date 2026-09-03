"use client"

import { useMemo } from "react"
import type { ConnectionStatus, MetaConnection } from "@/types"

/**
 * Meta connection state for a workspace.
 *
 * FASE 1 (this phase): there is no OAuth, no server, no `integrations`
 * collection and no rules for it, so this hook deliberately returns
 * "not_connected" without touching Firestore. It exists so every screen
 * already reads the connection through ONE place.
 *
 * FASE OAuth (next): replace the body with an `onSnapshot` on
 * `integrations/{workspaceId}_meta` (rules: read for workspace members,
 * write only from the server) and keep the return shape unchanged.
 */
export interface MetaConnectionState {
  status: ConnectionStatus
  connection: MetaConnection | null
  loading: boolean
}

export function useMetaConnection(workspaceId: string | null): MetaConnectionState {
  return useMemo(
    () => ({ stat/us: "not_connected", connection: null, loading: false }),
    // The workspace is part of the contract so the OAuth phase can subscribe per workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId],
  )
}

/**
 * Prerequisites that must be true before "Conectar Meta" can do anything real.
 * Shown to admins on the management screen; none of them is done from the app.
 */
export const META_PREREQUISITES = [
  "Verificación de negocio de Impact Enterprises en Meta Business Manager.",
  "App de Meta con permisos ads_read, leads_retrieval, pages_manage_metadata y pages_show_list aprobados.",
  "Backend con almacenamiento de tokens del lado servidor (nunca en el navegador).",
  "URL de callback OAuth y endpoint de webhooks con verificación de firma.",
] as const
