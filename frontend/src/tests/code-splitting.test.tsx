import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Suspense, lazy } from 'react'

// Mock the auth store to control authentication state
vi.mock('@/store/auth', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = {
      token: 'mock-token',
      user: { id: 1, email: 'admin@test.com', role: 'admin' as const, createdAt: '2024-01-01' },
      isLoading: false,
      fetchUser: vi.fn(),
    }
    return typeof selector === 'function' ? selector(state) : state
  }),
}))

// Mock google oauth to avoid env var issues
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

describe('Code Splitting', () => {
  afterEach(() => {
    cleanup()
  })

  describe('React.lazy page imports', () => {
    it('page modules are loadable via dynamic import', async () => {
      // Verify that all page modules can be dynamically imported
      // This catches broken import paths that would fail at runtime
      const pageModules = [
        () => import('@/pages/LoginPage'),
        () => import('@/pages/RegisterPage'),
        () => import('@/pages/ForgotPasswordPage'),
        () => import('@/pages/ResetPasswordPage'),
        () => import('@/pages/DashboardPage'),
        () => import('@/pages/UsersPage'),
        () => import('@/pages/TeamsPage'),
        () => import('@/pages/CustomersPage'),
        () => import('@/pages/MembersPage'),
        () => import('@/pages/ProjectsPage'),
        () => import('@/pages/SettingsPage'),
      ]

      for (const loadModule of pageModules) {
        const mod = await loadModule()
        // Each module should have a default export (the page component)
        expect(mod.default).toBeDefined()
        expect(typeof mod.default).toBe('function')
      }
    })
  })

  describe('Suspense fallback', () => {
    it('shows loading state while lazy component loads', async () => {
      // Create a lazy component that we can control
      let resolveComponent!: (value: { default: React.ComponentType }) => void
      const LazyComponent = lazy(
        () =>
          new Promise<{ default: React.ComponentType }>((resolve) => {
            resolveComponent = resolve
          })
      )

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
              <LazyComponent />
            </Suspense>
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Fallback should be visible while component is loading
      expect(screen.getByTestId('suspense-fallback')).toBeInTheDocument()

      // Resolve the lazy component
      resolveComponent({ default: () => <div data-testid="loaded-page">Page Content</div> })

      // After resolution, the actual component should render
      await waitFor(() => {
        expect(screen.getByTestId('loaded-page')).toBeInTheDocument()
      })
    })

    it('removes fallback after lazy component resolves', async () => {
      const LazyComponent = lazy(
        () =>
          Promise.resolve({
            default: () => <div data-testid="instant-page">Instant</div>,
          })
      )

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
              <LazyComponent />
            </Suspense>
          </MemoryRouter>
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('instant-page')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('suspense-fallback')).not.toBeInTheDocument()
    })
  })
})
