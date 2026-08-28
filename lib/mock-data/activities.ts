import type { Activity } from '@/types'
import { daysAgo, hoursAgo, minutesAgo } from './time'

/** Activity timelines keyed by lead id. */
export const activitiesByLead: Record<string, Activity[]> = {
  l1: [
    {
      id: 'a1',
      leadId: 'l1',
      type: 'lead_received',
      title: 'Lead received',
      description: 'Submitted the lead form from Meta — "Healthy Cooking".',
      actor: 'System',
      timestamp: minutesAgo(8),
    },
  ],
  l3: [
    {
      id: 'a2',
      leadId: 'l3',
      type: 'lead_received',
      title: 'Lead received',
      description: 'Submitted from Meta — Transformation Challenge.',
      actor: 'System',
      timestamp: daysAgo(1),
    },
    {
      id: 'a3',
      leadId: 'l3',
      type: 'whatsapp',
      title: 'WhatsApp sent',
      description: 'First contact message delivered and read.',
      actor: 'María López',
      timestamp: hoursAgo(20),
    },
    {
      id: 'a4',
      leadId: 'l3',
      type: 'call',
      title: 'Call completed',
      description: '6 min call — qualified budget and timeline.',
      actor: 'María López',
      timestamp: hoursAgo(8),
    },
    {
      id: 'a5',
      leadId: 'l3',
      type: 'appointment',
      title: 'Appointment booked',
      description: 'Discovery session scheduled for tomorrow 5:00 PM.',
      actor: 'María López',
      timestamp: hoursAgo(6),
    },
    {
      id: 'a6',
      leadId: 'l3',
      type: 'stage_change',
      title: 'Stage changed',
      description: 'Moved from Interested to Appointment.',
      actor: 'María López',
      timestamp: hoursAgo(6),
    },
  ],
  l7: [
    {
      id: 'a7',
      leadId: 'l7',
      type: 'lead_received',
      title: 'Lead received',
      description: 'Submitted from TikTok — Recipes UGC.',
      actor: 'System',
      timestamp: daysAgo(4),
    },
    {
      id: 'a8',
      leadId: 'l7',
      type: 'whatsapp',
      title: 'WhatsApp sent',
      description: 'Follow-up sequence step 1 delivered.',
      actor: 'Diego Torres',
      timestamp: daysAgo(4),
    },
    {
      id: 'a9',
      leadId: 'l7',
      type: 'appointment',
      title: 'Appointment completed',
      description: 'Demo session held — strong intent.',
      actor: 'Diego Torres',
      timestamp: daysAgo(2),
    },
    {
      id: 'a10',
      leadId: 'l7',
      type: 'sale',
      title: 'Sale closed',
      description: 'Annual plan purchased — €4,800.',
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
        title: 'Lead received',
        description: 'Lead entered the workspace and is awaiting first contact.',
        actor: 'System',
        timestamp: minutesAgo(30),
      },
    ]
  )
}
