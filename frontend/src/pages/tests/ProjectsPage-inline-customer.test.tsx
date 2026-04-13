import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@/tests/utils'
import userEvent from '@testing-library/user-event'

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => {
  const motionDiv = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => {
    // Filter out framer-motion-specific props
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

// Mock the API client
const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/api/client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

// Mock the auth store – admin by default (can create customers)
let mockUser: {
  id: number
  email: string
  role: 'admin' | 'project_manager' | 'user'
  createdAt: string
} = {
  id: 1,
  email: 'admin@test.com',
  role: 'admin',
  createdAt: '2024-01-01',
}

vi.mock('@/store/auth', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = {
      token: 'mock-token',
      user: mockUser,
      isLoading: false,
      fetchUser: vi.fn(),
    }
    return typeof selector === 'function' ? selector(state) : state
  }),
}))

// Mock google oauth
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

// ── Test Data ──────────────────────────────────────────────────────────────

const mockCustomers = [
  {
    id: 1,
    name: 'Acme Corp',
    icon: '🏢',
    managerId: null,
    createdAt: '2024-01-01',
  },
  {
    id: 2,
    name: 'Globex',
    icon: null,
    managerId: null,
    createdAt: '2024-01-02',
  },
]

const mockProjects = [
  {
    id: 1,
    customerId: 1,
    customer: mockCustomers[0],
    name: 'Website Redesign',
    status: 'confirmed' as const,
    managerId: null,
    createdAt: '2024-01-01',
  },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

async function openProjectDialog() {
  const user = userEvent.setup()
  const createBtn = screen.getByRole('button', { name: /create project/i })
  await user.click(createBtn)
  return user
}

async function openCustomerCombobox(user: ReturnType<typeof userEvent.setup>) {
  // The customer combobox trigger contains "Select a customer" text.
  // We target it specifically because the Status Select also has role="combobox".
  const triggerBtn = screen.getByText('Select a customer').closest('button')!
  await user.click(triggerBtn)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ProjectsPage – Inline Customer Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = {
      id: 1,
      email: 'admin@test.com',
      role: 'admin',
      createdAt: '2024-01-01',
    }

    // Default API responses
    mockGet.mockImplementation((url: string) => {
      if (url === '/projects') return Promise.resolve({ data: mockProjects })
      if (url === '/customers') return Promise.resolve({ data: mockCustomers })
      return Promise.resolve({ data: [] })
    })
    mockPost.mockImplementation((url: string, data: unknown) => {
      if (url === '/customers') {
        const customerData = data as { name: string; icon: string | null }
        return Promise.resolve({
          data: {
            id: 99,
            name: customerData.name,
            icon: customerData.icon,
            managerId: null,
            createdAt: '2024-01-03',
          },
        })
      }
      if (url === '/projects') {
        return Promise.resolve({ data: { id: 10, ...(data as Record<string, unknown>) } })
      }
      return Promise.resolve({ data: {} })
    })
  })

  afterEach(() => {
    cleanup()
  })

  // ── Feature: "+ New Customer" button visibility ────────────────────────

  it('shows "+ New Customer" option in the customer combobox dropdown for admin users', async () => {
    render(await import('../ProjectsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
    })

    const user = await openProjectDialog()
    await openCustomerCombobox(user)

    await waitFor(() => {
      expect(screen.getByText(/\+ New Customer/i)).toBeInTheDocument()
    })
  })

  it('shows "+ New Customer" option for project_manager users', async () => {
    mockUser = {
      id: 2,
      email: 'pm@test.com',
      role: 'project_manager',
      createdAt: '2024-01-01',
    }

    render(await import('../ProjectsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
    })

    const user = await openProjectDialog()
    await openCustomerCombobox(user)

    await waitFor(() => {
      expect(screen.getByText(/\+ New Customer/i)).toBeInTheDocument()
    })
  })

  it('does NOT show "+ New Customer" option for regular users', async () => {
    mockUser = {
      id: 3,
      email: 'user@test.com',
      role: 'user',
      createdAt: '2024-01-01',
    }

    render(await import('../ProjectsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
    })

    const user = await openProjectDialog()
    await openCustomerCombobox(user)

    await waitFor(() => {
      expect(screen.queryByText(/\+ New Customer/i)).not.toBeInTheDocument()
    })
  })

  // ── Feature: Inline creation form ──────────────────────────────────────

  it('clicking "+ New Customer" switches to inline creation form with name and icon fields', async () => {
    render(await import('../ProjectsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
    })

    const user = await openProjectDialog()
    await openCustomerCombobox(user)

    await waitFor(() => {
      expect(screen.getByText(/\+ New Customer/i)).toBeInTheDocument()
    })

    await user.click(screen.getByText(/\+ New Customer/i))

    // Should show inline form fields
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/customer name/i)).toBeInTheDocument()
      expect(
        screen.getByPlaceholderText(/emoji/i)
      ).toBeInTheDocument()
    })

    // Should show Create and Cancel buttons within the inline form
    // There are two "Create" buttons (dialog footer + inline form), so we find by test id
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    expect(cancelButton).toBeInTheDocument()
    // The inline Create button co-exists with the dialog's Create button
    const createButtons = screen.getAllByRole('button', { name: /^create$/i })
    expect(createButtons.length).toBeGreaterThanOrEqual(2)

    // Search input should be hidden since we're in create mode
    expect(screen.queryByPlaceholderText(/search customers/i)).not.toBeInTheDocument()
  })

  it('Cancel button returns to the search/select mode', async () => {
    render(await import('../ProjectsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
    })

    const user = await openProjectDialog()
    await openCustomerCombobox(user)

    await waitFor(() => {
      expect(screen.getByText(/\+ New Customer/i)).toBeInTheDocument()
    })

    // Enter create mode
    await user.click(screen.getByText(/\+ New Customer/i))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/customer name/i)).toBeInTheDocument()
    })

    // Click Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Should be back to search mode
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search customers/i)).toBeInTheDocument()
      expect(
        screen.queryByPlaceholderText(/customer name/i)
      ).not.toBeInTheDocument()
    })
  })

  // ── Feature: Customer creation submission ──────────────────────────────

  it('creates a customer with name and icon, then auto-selects it', async () => {
    render(await import('../ProjectsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
    })

    const user = await openProjectDialog()
    await openCustomerCombobox(user)

    await waitFor(() => {
      expect(screen.getByText(/\+ New Customer/i)).toBeInTheDocument()
    })

    // Enter create mode
    await user.click(screen.getByText(/\+ New Customer/i))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/customer name/i)).toBeInTheDocument()
    })

    // Fill in the form
    await user.type(screen.getByPlaceholderText(/customer name/i), 'New Startup')
    await user.type(screen.getByPlaceholderText(/emoji/i), '🚀')

    // Submit via the inline Create button
    await user.click(screen.getByTestId('create-customer-inline'))

    // Should have called POST /customers with correct data
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/customers', {
        name: 'New Startup',
        icon: '🚀',
      })
    })
  })

  it('creates a customer with name only (icon is optional)', async () => {
    render(await import('../ProjectsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
    })

    const user = await openProjectDialog()
    await openCustomerCombobox(user)

    await waitFor(() => {
      expect(screen.getByText(/\+ New Customer/i)).toBeInTheDocument()
    })

    await user.click(screen.getByText(/\+ New Customer/i))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/customer name/i)).toBeInTheDocument()
    })

    // Fill in only the name
    await user.type(screen.getByPlaceholderText(/customer name/i), 'Bare Inc')

    // Submit via the inline Create button
    await user.click(screen.getByTestId('create-customer-inline'))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/customers', {
        name: 'Bare Inc',
        icon: null,
      })
    })
  })

  it('does not submit when customer name is empty', async () => {
    render(await import('../ProjectsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
    })

    const user = await openProjectDialog()
    await openCustomerCombobox(user)

    await waitFor(() => {
      expect(screen.getByText(/\+ New Customer/i)).toBeInTheDocument()
    })

    await user.click(screen.getByText(/\+ New Customer/i))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/customer name/i)).toBeInTheDocument()
    })

    // Try to submit without filling the name
    await user.click(screen.getByTestId('create-customer-inline'))

    // Should NOT have called POST /customers
    expect(mockPost).not.toHaveBeenCalledWith(
      '/customers',
      expect.anything()
    )
  })

  // ── Feature: Empty state shows inline creation option ──────────────────

  it('shows "+ New Customer" in the empty customers state instead of "go to Customers page" message', async () => {
    // Return empty customers list
    mockGet.mockImplementation((url: string) => {
      if (url === '/projects') return Promise.resolve({ data: mockProjects })
      if (url === '/customers') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })

    render(await import('../ProjectsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
    })

    const user = await openProjectDialog()
    await openCustomerCombobox(user)

    // Should NOT show the old "Create one first in the Customers page" message
    await waitFor(() => {
      expect(
        screen.queryByText(/create one first in the customers page/i)
      ).not.toBeInTheDocument()
    })

    // Should still offer "+ New Customer" action
    expect(screen.getByText(/\+ New Customer/i)).toBeInTheDocument()
  })

  // ── Feature: Form resets on popover close ──────────────────────────────

  it('resets inline creation form state when the popover closes', async () => {
    render(await import('../ProjectsPage').then((m) => <m.default />))

    await waitFor(() => {
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
    })

    const user = await openProjectDialog()
    await openCustomerCombobox(user)

    await waitFor(() => {
      expect(screen.getByText(/\+ New Customer/i)).toBeInTheDocument()
    })

    // Enter create mode and type something
    await user.click(screen.getByText(/\+ New Customer/i))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/customer name/i)).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText(/customer name/i), 'Partial Entry')

    // Close the popover by pressing Escape
    await user.keyboard('{Escape}')

    // Re-open the combobox
    await openCustomerCombobox(user)

    // Should be back in search mode, not create mode
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search customers/i)).toBeInTheDocument()
    })

    // The old partial entry should be gone
    expect(screen.queryByDisplayValue('Partial Entry')).not.toBeInTheDocument()
  })
})
