import {
  LayoutDashboard,
  Megaphone,
  BrainCircuit,
  Sparkles,
  Users,
  GitBranch,
  Inbox,
  Calendar,
  BarChart3,
  FileText,
  Workflow,
  Building2,
  UsersRound,
  Plug,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { t } from '@/lib/i18n'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const navSections: NavSection[] = [
  {
    label: t.nav.sections.overview,
    items: [{ label: t.nav.items.commandCenter, href: '/', icon: LayoutDashboard }],
  },
  {
    label: t.nav.sections.marketing,
    items: [
      { label: t.nav.items.campaigns, href: '/campaigns', icon: Megaphone },
      { label: t.nav.items.mediaBuyer, href: '/media-buyer', icon: BrainCircuit },
      { label: t.nav.items.contentLab, href: '/content-lab', icon: Sparkles },
    ],
  },
  {
    label: t.nav.sections.sales,
    items: [
      { label: t.nav.items.leads, href: '/leads', icon: Users },
      { label: t.nav.items.pipeline, href: '/pipeline', icon: GitBranch },
      { label: t.nav.items.inbox, href: '/inbox', icon: Inbox },
      { label: t.nav.items.calendar, href: '/calendar', icon: Calendar },
    ],
  },
  {
    label: t.nav.sections.intelligence,
    items: [
      { label: t.nav.items.analytics, href: '/analytics', icon: BarChart3 },
      { label: t.nav.items.reports, href: '/reports', icon: FileText },
    ],
  },
  {
    label: t.nav.sections.automation,
    items: [{ label: t.nav.items.automations, href: '/automations', icon: Workflow }],
  },
  {
    label: t.nav.sections.management,
    items: [
      { label: t.nav.items.clients, href: '/clients', icon: Building2 },
      { label: t.nav.items.team, href: '/team', icon: UsersRound },
    ],
  },
  {
    label: t.nav.sections.system,
    items: [
      { label: t.nav.items.integrations, href: '/integrations', icon: Plug },
      { label: t.nav.items.settings, href: '/settings', icon: Settings },
    ],
  },
]
