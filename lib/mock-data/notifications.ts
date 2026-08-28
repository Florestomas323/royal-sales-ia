import type { Notification, Period } from "@/types"
import { minutesAgo, hoursAgo } from "./time"

export const notifications: Notification[] = [
  {
    id: "n-1",
    tone: "success",
    title: "New hot lead assigned",
    body: "Sofia Marchetti (score 94) routed to you from Meta — Summer Glow.",
    read: false,
    createdAt: minutesAgo(4),
  },
  {
    id: "n-2",
    tone: "warning",
    title: "Follow-up overdue",
    body: "Daniel Osei has been waiting 2 days without a reply.",
    read: false,
    createdAt: minutesAgo(38),
  },
  {
    id: "n-3",
    tone: "info",
    title: "Appointment confirmed",
    body: "Priya Nair booked a consultation for tomorrow at 3:00 PM.",
    read: false,
    createdAt: hoursAgo(2),
  },
  {
    id: "n-4",
    tone: "danger",
    title: "Campaign CPL spiking",
    body: "TikTok — Glow Up Challenge CPL rose 41% in the last 24h.",
    read: true,
    createdAt: hoursAgo(5),
  },
  {
    id: "n-5",
    tone: "success",
    title: "Sale closed",
    body: "Marcus Bennett converted — $4,200 added to revenue.",
    read: true,
    createdAt: hoursAgo(9),
  },
]

export const periods: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
]
