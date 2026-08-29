import type { Notification, Period } from "@/types"
import { minutesAgo, hoursAgo } from "./time"

export const notifications: Notification[] = [
  {
    id: "n-1",
    tone: "success",
    title: "Nuevo prospecto caliente asignado",
    body: "Sofia Marchetti (puntaje 94) te fue asignada desde Meta — Summer Glow.",
    read: false,
    createdAt: minutesAgo(4),
  },
  {
    id: "n-2",
    tone: "warning",
    title: "Seguimiento atrasado",
    body: "Daniel Osei lleva 2 días esperando respuesta.",
    read: false,
    createdAt: minutesAgo(38),
  },
  {
    id: "n-3",
    tone: "info",
    title: "Cita confirmada",
    body: "Priya Nair agendó una consulta para mañana a las 3:00 p. m.",
    read: false,
    createdAt: hoursAgo(2),
  },
  {
    id: "n-4",
    tone: "danger",
    title: "El CPL de una campaña se está disparando",
    body: "El CPL de TikTok — Glow Up Challenge subió 41 % en las últimas 24 h.",
    read: true,
    createdAt: hoursAgo(5),
  },
  {
    id: "n-5",
    tone: "success",
    title: "Venta cerrada",
    body: "Marcus Bennett convirtió: $4,200 sumados a los ingresos.",
    read: true,
    createdAt: hoursAgo(9),
  },
]

export const periods: { value: Period; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "custom", label: "Rango personalizado" },
]
