import type { AIInsight, FunnelStep, Kpi, LeadQuality } from '@/types'

export const kpis: Kpi[] = [
  { id: 'spend', label: 'Ad Spend', value: 25330, previousValue: 22100, format: 'currency', invertedTrend: true },
  { id: 'leads', label: 'Leads', value: 127, previousValue: 104, format: 'number' },
  { id: 'cpl', label: 'Cost per Lead', value: 199, previousValue: 212, format: 'currency', invertedTrend: true },
  { id: 'contacted', label: 'Contacted', value: 84, previousValue: 79, format: 'number' },
  { id: 'appointments', label: 'Appointments', value: 31, previousValue: 26, format: 'number' },
  { id: 'sales', label: 'Sales', value: 9, previousValue: 7, format: 'number' },
  { id: 'revenue', label: 'Revenue', value: 54400, previousValue: 41200, format: 'currency' },
  { id: 'cps', label: 'Cost per Sale', value: 2814, previousValue: 3157, format: 'currency', invertedTrend: true },
]

export const funnel: FunnelStep[] = [
  { stage: 'Leads', count: 127, conversion: 100 },
  { stage: 'Contacted', count: 84, conversion: 66 },
  { stage: 'Appointments', count: 31, conversion: 24 },
  { stage: 'Shows', count: 22, conversion: 17 },
  { stage: 'Sales', count: 9, conversion: 7 },
]

export const leadQuality: LeadQuality = {
  score: 82,
  label: 'Excellent',
  responseRate: 71,
  appointmentRate: 37,
  showRate: 71,
  closeRate: 41,
}

export const aiInsights: AIInsight[] = [
  {
    id: 'ai1',
    type: 'performance',
    priority: 'high',
    title: 'Meta is converting despite fewer leads',
    explanation:
      'Meta produced 34% fewer leads than TikTok this week, but generated 2.1× more closed sales. Lead quality on Meta lookalikes is outperforming.',
    suggestedAction: 'Shift 15% of TikTok prospecting budget into the Meta lookalike ad set.',
    actionLabel: 'View Campaign',
    actionHref: '/campaigns',
  },
  {
    id: 'ai2',
    type: 'opportunity',
    priority: 'medium',
    title: 'Healthy Cooking has your best Lead Quality Score',
    explanation:
      'The Healthy Cooking client sits at an 82/100 quality score with a 41% close rate — well above the 24% workspace average.',
    suggestedAction: 'Replicate the Recipes UGC creative angle across FitLife.',
    actionLabel: 'View Campaign',
    actionHref: '/campaigns',
  },
  {
    id: 'ai3',
    type: 'action',
    priority: 'high',
    title: '12 new leads are still uncontacted',
    explanation:
      '12 leads received in the last 24h have no first touch yet. Leads contacted within 10 minutes are 4× more likely to convert.',
    suggestedAction: 'Assign and contact these leads now to protect conversion rate.',
    actionLabel: 'View Leads',
    actionHref: '/leads',
  },
  {
    id: 'ai4',
    type: 'warning',
    priority: 'medium',
    title: 'Contact rate dropped 8% this week',
    explanation:
      'Your team contact rate fell from 74% to 66%. Most of the drop is concentrated in leads assigned after 6 PM.',
    suggestedAction: 'Review after-hours routing rules and rebalance evening assignments.',
    actionLabel: 'Review',
    actionHref: '/team',
  },
]
