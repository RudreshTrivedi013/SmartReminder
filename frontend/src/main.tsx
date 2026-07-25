import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { idbGetToken, idbClearToken, useAuthStore } from './stores/authStore'
import { useSummaryStore } from './stores/summaryStore'
import { authApi } from './api/auth'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Listen for messages from the service worker (e.g. summary_ready push clicks)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SUMMARY_READY' && event.data.summary) {
      useSummaryStore.getState().setPendingSummary(event.data.summary)
    }

    if (event.data?.type === 'CHECKIN_LOGGED') {
      queryClient.invalidateQueries({ queryKey: ['checkinReminders'] })
    }
  })
}

// Initialize auth from IndexedDB before rendering so ProtectedRoute doesn't flicker
async function initApp() {
  const token = await idbGetToken()
  if (token) {
    try {
      useAuthStore.getState().setAccessToken(token)
      // Attempt to fetch user to fully hydrate auth state.
      const user = await authApi.me()
      useAuthStore.getState().setAuth(token, user)
    } catch {
      // Token is expired or invalid — wipe ALL stale state so the user
      // lands on a clean login/signup page without a corrupted auth context.
      // This prevents the Axios interceptor from attaching a bad token to
      // login/signup requests and triggering a false "Network Error".
      localStorage.removeItem('refresh_token')
      await idbClearToken()
      useAuthStore.getState().clearAuth()
    }
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                background: '#1a1a24',
                color: '#f1f5f9',
                border: '1px solid #2a2a3a',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: {
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#1a1a24',
                },
              },
              error: {
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#1a1a24',
                },
              },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  )
}

initApp()
