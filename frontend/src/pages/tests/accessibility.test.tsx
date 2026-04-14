import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@/tests/utils'

// Mock framer-motion
vi.mock('framer-motion', () => {
  const motionDiv = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => {
    const filtered: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(props)) {
      if (!['initial', 'animate', 'transition', 'whileHover', 'whileTap'].includes(key)) {
        filtered[key] = value
      }
    }
    return <div {...filtered}>{children}</div>
  }
  return {
    motion: { div: motionDiv },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

// Mock API client
const mockGet = vi.fn()
vi.mock('@/api/client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

// Mock google oauth
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock auth store - admin user
vi.mock('@/store/auth', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = {
      token: 'mock-token',
      user: { id: 1, email: 'admin@test.com', role: 'admin', createdAt: '2024-01-01' },
      isLoading: false,
      fetchUser: vi.fn(),
    }
    return typeof selector === 'function' ? selector(state) : state
  }),
}))

const mockTeams = [
  { id: 1, name: 'Team Alpha', createdAt: '2024-01-01' },
]

const mockCustomers = [
  { id: 1, name: 'Acme Corp', icon: '🏢', managerId: 1, manager: { email: 'admin@test.com' }, createdAt: '2024-01-01' },
]

const mockProjects = [
  { id: 1, name: 'Website', customerId: 1, customer: mockCustomers[0], status: 'confirmed', managerId: 1, manager: { email: 'admin@test.com' }, createdAt: '2024-01-01' },
]

const mockMembers = [
  { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@test.com', userId: null, avatarUrl: null, workSchedule: '{"sun":false,"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false}', createdAt: '2024-01-01' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockGet.mockImplementation((url: string) => {
    if (url === '/teams') return Promise.resolve({ data: mockTeams })
    if (url === '/customers') return Promise.resolve({ data: mockCustomers })
    if (url === '/projects') return Promise.resolve({ data: mockProjects })
    if (url === '/members') return Promise.resolve({ data: mockMembers })
    if (url === '/users') return Promise.resolve({ data: [{ id: 1, email: 'admin@test.com', role: 'admin', createdAt: '2024-01-01' }] })
    return Promise.resolve({ data: [] })
  })
})

afterEach(() => {
  cleanup()
})

describe('Icon-only buttons have aria-labels', () => {
  it('TeamsPage action buttons have aria-labels', async () => {
    render(await import('../TeamsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /manage members/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit team/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete team/i })).toBeInTheDocument()
  })

  it('CustomersPage action buttons have aria-labels', async () => {
    render(await import('../CustomersPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /edit customer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete customer/i })).toBeInTheDocument()
  })

  it('ProjectsPage action buttons have aria-labels', async () => {
    render(await import('../ProjectsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Website')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /assign members/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit project/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete project/i })).toBeInTheDocument()
  })

  it('MembersPage action buttons have aria-labels', async () => {
    render(await import('../MembersPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /upload avatar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit member/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /manage teams/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete member/i })).toBeInTheDocument()
  })
})
