import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

const envApiUrl = import.meta.env.VITE_API_URL as string | undefined
const fallbackApiUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000'
const API_URL = envApiUrl || fallbackApiUrl

console.debug('[API] configured baseURL:', API_URL)

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// --- Request interceptor: attach Bearer token ---
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// --- Shared single-flight refresh lock ---
// Both the 401 interceptor and the proactive useTokenRefresh hook call
// refreshAccessToken(). A single in-flight promise ensures only one
// /auth/refresh request is active at a time — the second caller simply
// awaits the same promise, preventing refresh-token-rotation from
// blocklisting a token that is still in use by a parallel request.
let refreshPromise: Promise<string> | null = null

/**
 * Refresh the access token using the refresh token stored in localStorage.
 * Returns the new access token, or throws if the refresh fails.
 *
 * Safe to call from multiple places concurrently — only one network request
 * will be made; all callers share the same in-flight promise.
 */
export async function refreshAccessToken(): Promise<string> {
  // If a refresh is already in flight, piggyback on it.
  if (refreshPromise) return refreshPromise

  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) {
    throw new Error('No refresh token available')
  }

  refreshPromise = (async () => {
    try {
      const { data } = await axios.post(`${API_URL}/auth/refresh`, {
        refresh_token: refreshToken,
      })
      const newAccessToken: string = data.access_token
      const newRefreshToken: string = data.refresh_token

      useAuthStore.getState().setAccessToken(newAccessToken)
      if (newRefreshToken) {
        localStorage.setItem('refresh_token', newRefreshToken)
      }
      api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`
      console.debug('[Auth] Token refreshed proactively/reactively')
      return newAccessToken
    } catch (err) {
      // Clear auth only if the refresh itself failed (not a network blip
      // that the caller can retry).
      throw err
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// --- Queued requests waiting for a refresh ---
let failedQueue: Array<{ resolve: (value: string) => void; reject: (reason?: unknown) => void }> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error)
    } else {
      p.resolve(token as string)
    }
  })
  failedQueue = []
}

// --- Response interceptor: handle 401 with automatic token refresh ---
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Don't intercept refresh calls themselves (would cause an infinite loop)
    // or requests that have already been retried once.
    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      (originalRequest.url as string | undefined)?.includes('/auth/refresh')
    ) {
      return Promise.reject(error)
    }

    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // If a refresh is already in flight (from the proactive hook or another
    // 401), queue this request to be retried once the refresh completes.
    if (refreshPromise) {
      return refreshPromise
        .then((token) => {
          originalRequest.headers = originalRequest.headers ?? {}
          originalRequest.headers.Authorization = `Bearer ${token}`
          originalRequest._retry = true
          return api(originalRequest)
        })
        .catch((err) => Promise.reject(err))
    }

    originalRequest._retry = true

    try {
      const newAccessToken = await refreshAccessToken()
      processQueue(null, newAccessToken)
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
      return api(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
      return Promise.reject(refreshError)
    }
  },
)

export default api
