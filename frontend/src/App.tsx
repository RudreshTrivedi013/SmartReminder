import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import LoginPage from '@/pages/LoginPage'
import SignupPage from '@/pages/SignupPage'
import DashboardPage from '@/pages/DashboardPage'
import TasksPage from '@/pages/TasksPage'
import VoicePage from '@/pages/VoicePage'
import SummaryPage from '@/pages/SummaryPage'
import SettingsPage from '@/pages/SettingsPage'
import { useAuthStore } from '@/stores/authStore'
import { useTokenRefresh } from '@/hooks/useTokenRefresh'

interface ProtectedRouteProps {
  children: React.ReactElement
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useAuthStore()

  // Proactively refresh the access token before it expires so the user is
  // never silently logged out when the tab is inactive.
  useTokenRefresh()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <Routes>
      {/* Public Pages */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Protected Dashboard/Features */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <TasksPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/voice"
        element={
          <ProtectedRoute>
            <VoicePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/summary"
        element={
          <ProtectedRoute>
            <SummaryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      {/* Redirect fallbacks */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
