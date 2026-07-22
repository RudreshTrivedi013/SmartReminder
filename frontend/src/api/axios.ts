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

// --- Refresh token queue to prevent parallel refresh storms ---
let isRefreshing = false
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

    if (isRefreshing) {
      // Queue this request while a refresh is already in flight
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      })
        .then((token) => {
          originalRequest.headers = originalRequest.headers ?? {}
          originalRequest.headers.Authorization = `Bearer ${token}`
          originalRequest._retry = true
          return api(originalRequest)
        })
        .catch((err) => Promise.reject(err))
    }

    originalRequest._retry = true
    isRefreshing = true

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
      processQueue(null, newAccessToken)
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
      return api(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default api
