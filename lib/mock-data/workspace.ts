import type { User, Workspace } from '@/types'

/** Workspace id used by every demo record. Seeds re-map it to the target workspace. */
export const DEMO_WORKSPACE_ID = 'ws-demo'

export const workspaces: Workspace[] = [
  {
    id: DEMO_WORKSPACE_ID,
    name: 'Royal Agency (demo)',
    plan: 'Scale',
    logoColor: 'var(--chart-1)',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ws2',
    name: 'Nova Growth Co. (demo)',
    plan: 'Growth',
    logoColor: 'var(--chart-4)',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
]

export const currentWorkspace = workspaces[0]

export const users: User[] = [
  {
    id: 'u1',
    workspaceId: DEMO_WORKSPACE_ID,
    authUid: null,
    isDemo: true,
    name: 'Carlos Mendez',
    email: 'carlos@royalagency.com',
    role: 'super_admin',
    avatarColor: 'var(--chart-1)',
    status: 'active',
    assignedLeads: 0,
    appointments: 0,
    sales: 0,
  },
  {
    id: 'u2',
    workspaceId: DEMO_WORKSPACE_ID,
    authUid: null,
    isDemo: true,
    name: 'María López',
    email: 'maria@royalagency.com',
    role: 'manager',
    avatarColor: 'var(--chart-4)',
    status: 'active',
    assignedLeads: 42,
    appointments: 14,
    sales: 5,
  },
  {
    id: 'u3',
    workspaceId: DEMO_WORKSPACE_ID,
    authUid: null,
    isDemo: true,
    name: 'Diego Torres',
    email: 'diego@royalagency.com',
    role: 'sales_rep',
    avatarColor: 'var(--chart-2)',
    status: 'active',
    assignedLeads: 38,
    appointments: 11,
    sales: 4,
  },
  {
    id: 'u4',
    workspaceId: DEMO_WORKSPACE_ID,
    authUid: null,
    isDemo: true,
    name: 'Ana Ruiz',
    email: 'ana@royalagency.com',
    role: 'sales_rep',
    avatarColor: 'var(--chart-5)',
    status: 'active',
    assignedLeads: 31,
    appointments: 9,
    sales: 3,
  },
  {
    id: 'u5',
    workspaceId: DEMO_WORKSPACE_ID,
    authUid: null,
    isDemo: true,
    name: 'Javier Soto',
    email: 'javier@royalagency.com',
    role: 'sales_rep',
    avatarColor: 'var(--chart-3)',
    status: 'invited',
    assignedLeads: 0,
    appointments: 0,
    sales: 0,
  },
  {
    id: 'u6',
    workspaceId: DEMO_WORKSPACE_ID,
    authUid: null,
    isDemo: true,
    name: 'Lucía Fernández',
    email: 'lucia@royalagency.com',
    role: 'viewer',
    avatarColor: 'var(--warning)',
    status: 'inactive',
    assignedLeads: 0,
    appointments: 0,
    sales: 0,
  },
]

export const currentUser = users[0]
