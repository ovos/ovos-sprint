import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import { ErrorFallback } from './components/ErrorFallback'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { useAuthStore } from './store/auth'
import { Toaster } from './components/ui/toaster'
import { useInitializeTheme } from './hooks/use-theme'
import { PageLoader } from './components/PageLoader'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

// Layout is eagerly loaded (shared shell for all authenticated routes)
import Layout from './components/Layout'

// Pages are lazy-loaded for route-based code splitting
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const TeamsPage = lazy(() => import('./pages/TeamsPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
const MembersPage = lazy(() => import('./pages/MembersPage'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token)

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function ProjectManagerRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)

  // Allow admin and project_manager roles
  if (user?.role !== 'admin' && user?.role !== 'project_manager') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function App() {
  const { token, fetchUser } = useAuthStore()
  useInitializeTheme()

  useEffect(() => {
    if (token) {
      fetchUser()
    }
  }, [token, fetchUser])

  const content = (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
      <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route
            path="users"
            element={
              <AdminRoute>
                <UsersPage />
              </AdminRoute>
            }
          />
          <Route
            path="teams"
            element={
              <AdminRoute>
                <TeamsPage />
              </AdminRoute>
            }
          />
          <Route
            path="customers"
            element={
              <ProjectManagerRoute>
                <CustomersPage />
              </ProjectManagerRoute>
            }
          />
          <Route
            path="members"
            element={
              <AdminRoute>
                <MembersPage />
              </AdminRoute>
            }
          />
          <Route
            path="projects"
            element={
              <ProjectManagerRoute>
                <ProjectsPage />
              </ProjectManagerRoute>
            }
          />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      </ErrorBoundary>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  )

  if (GOOGLE_CLIENT_ID) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        {content}
      </GoogleOAuthProvider>
    )
  }

  return content
}

export default App
