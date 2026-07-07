import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { useWsStore } from '@/stores/wsStore'
import { registerPushSubscription, unregisterServiceWorker } from '@/lib/sw-registration'
import { useQueryClient } from '@tanstack/react-query'
import { parseApiError } from '@/lib/utils'
import toast from 'react-hot-toast'

export function useAuth() {
  const { setAuth, clearAuth } = useAuthStore()
  const { socket } = useWsStore()
  const queryClient = useQueryClient()

  const login = async (email: string, password: string) => {
    const tokens = await authApi.login({ email, password })
    localStorage.setItem('refresh_token', tokens.refresh_token)
    useAuthStore.getState().setAccessToken(tokens.access_token)
    
    const user = await authApi.me()
    setAuth(tokens.access_token, user)
    // Run asynchronously so the browser permission prompt doesn't block login
    registerPushSubscription().catch(console.error)
    return user
  }

  const signup = async (email: string, password: string, timezone: string) => {
    const tokens = await authApi.signup({ email, password, timezone })
    localStorage.setItem('refresh_token', tokens.refresh_token)
    useAuthStore.getState().setAccessToken(tokens.access_token)
    
    const user = await authApi.me()
    setAuth(tokens.access_token, user)
    // Run asynchronously so the browser permission prompt doesn't block signup
    registerPushSubscription().catch(console.error)
    return user
  }

  const logout = async () => {
    const refreshToken = localStorage.getItem('refresh_token')
    try {
      if (refreshToken) await authApi.logout(refreshToken)
    } catch (err) {
      console.warn('Logout API call failed:', parseApiError(err))
    }
    socket?.close()
    await unregisterServiceWorker()
    queryClient.clear()
    clearAuth()
    toast.success('Signed out successfully')
  }

  return { login, signup, logout }
}
