import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { useAuthStore } from './store/auth'
import { Toaster } from './components/ui/toaster'
import { useInitializeTheme } from './hooks/use-theme'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

// Pages
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DashboardPage from './pages/DashboardPage'
import UsersPage from './pages/UsersPage'
import TeamsPage from './pages/TeamsPage'
import CustomersPage from './pages/CustomersPage'
import MembersPage from './pages/MembersPage'
import ProjectsPage from './pages/ProjectsPage'
import SettingsPage from './pages/SettingsPage'
import Layout from './components/Layout'

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
