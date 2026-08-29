import type { Activity } from '@/types'
import { daysAgo, hoursAgo, minutesAgo } from './time'

/** Activity timelines keyed by lead id. */
export const activitiesByLead: Record<string, Activity[]> = {
  l1: [
    {
      id: 'a1',
      leadId: 'l1',
      type: 'lead_received',
      title: 'Prospecto recibido',
      description: 'Envió el formulario de prospecto desde Meta — "Healthy Cooking".',
      actor: 'Sistema',
      timestamp: minutesAgo(8),
    },
  ],
  l3: [
    {
      id: 'a2',
      leadId: 'l3',
      type: 'lead_received',
      title: 'Prospecto recibido',
      description: 'Envió el formulario desde Meta — Transformation Challenge.',
      actor: 'Sistema',
      timestamp: daysAgo(1),
    },
    {
      id: 'a3',
      leadId: 'l3',
      type: 'whatsapp',
      title: 'WhatsApp enviado',
      description: 'Mensaje de primer contacto entregado y leído.',
      actor: 'María López',
      timestamp: hoursAgo(20),
    },
    {
      id: 'a4',
      leadId: 'l3',
      type: 'call',
      title: 'Llamada realizada',
      description: 'Llamada de 6 min: se calificó presupuesto y tiempos.',
      actor: 'María López',
      timestamp: hoursAgo(8),
    },
    {
      id: 'a5',
      leadId: 'l3',
      type: 'appointment',
      title: 'Cita agendada',
      description: 'Sesión de descubrimiento agendada para mañana a las 5:00 p. m.',
      actor: 'María López',
      timestamp: hoursAgo(6),
    },
    {
      id: 'a6',
      leadId: 'l3',
      type: 'stage_change',
      title: 'Cambio de etapa',
      description: 'Pasó de Interesado a Cita.',
      actor: 'María López',
      timestamp: hoursAgo(6),
    },
  ],
  l7: [
    {
      id: 'a7',
      leadId: 'l7',
      type: 'lead_received',
      title: 'Prospecto recibido',
      description: 'Envió el formulario desde TikTok — Recipes UGC.',
      actor: 'Sistema',
      timestamp: daysAgo(4),
    },
    {
      id: 'a8',
      leadId: 'l7',
      type: 'whatsapp',
      title: 'WhatsApp enviado',
      description: 'Paso 1 de la secuencia de seguimiento entregado.',
      actor: 'Diego Torres',
      timestamp: daysAgo(4),
    },
    {
      id: 'a9',
      leadId: 'l7',
      type: 'appointment',
      title: 'Cita realizada',
      description: 'Se realizó la demo: intención de compra alta.',
      actor: 'Diego Torres',
      timestamp: daysAgo(2),
    },
    {
      id: 'a10',
      leadId: 'l7',
      type: 'sale',
      title: 'Venta cerrada',
      description: 'Compró el plan anual: €4,800.',
      actor: 'Diego Torres',
      timestamp: daysAgo(1),
    },
  ],
}

export function getActivities(leadId: string): Activity[] {
  return (
    activitiesByLead[leadId] ?? [
      {
        id: `${leadId}-default`,
        leadId,
        type: 'lead_received',
        title: 'Prospecto recibido',
        description: 'El prospecto entró al workspace y espera su primer contacto.',
        actor: 'Sistema',
        timestamp: minutesAgo(30),
      },
    ]
  )
}
