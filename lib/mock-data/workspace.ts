import type { User, Workspace } from '@/types'

export const workspaces: Workspace[] = [
  { id: 'ws1', name: 'Royal Agency', plan: 'Scale', logoColor: 'var(--chart-1)' },
  { id: 'ws2', name: 'Nova Growth Co.', plan: 'Growth', logoColor: 'var(--chart-4)' },
]

export const currentWorkspace = workspaces[0]

export const users: User[] = [
  {
    id: 'u1',
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
