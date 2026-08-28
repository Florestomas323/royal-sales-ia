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
    label: 'Overview',
    items: [{ label: 'Command Center', href: '/', icon: LayoutDashboard }],
  },
  {
    label: 'Marketing',
    items: [
      { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
      { label: 'AI Media Buyer', href: '/media-buyer', icon: BrainCircuit },
      { label: 'Content Lab', href: '/content-lab', icon: Sparkles },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Leads', href: '/leads', icon: Users, badge: '12' },
      { label: 'Pipeline', href: '/pipeline', icon: GitBranch },
      { label: 'Inbox', href: '/inbox', icon: Inbox },
      { label: 'Calendar', href: '/calendar', icon: Calendar },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'Analytics', href: '/analytics', icon: BarChart3 },
      { label: 'Reports', href: '/reports', icon: FileText },
    ],
  },
  {
    label: 'Automation',
    items: [{ label: 'Automations', href: '/automations', icon: Workflow }],
  },
  {
    label: 'Management',
    items: [
      { label: 'Clients', href: '/clients', icon: Building2 },
      { label: 'Team', href: '/team', icon: UsersRound },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Integrations', href: '/integrations', icon: Plug },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
]
