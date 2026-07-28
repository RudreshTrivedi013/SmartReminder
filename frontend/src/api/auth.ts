import api from './axios'
import type { LoginRequest, SignupRequest, TokenResponse, User, UserUpdate } from '@/types/api'

export const authApi = {
  signup: (data: SignupRequest) =>
    api.post<TokenResponse>('/auth/signup', data).then((r) => r.data),

  login: (data: LoginRequest) =>
    api.post<TokenResponse>('/auth/login', data).then((r) => r.data),

  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refresh_token: refreshToken }),

  refresh: (refreshToken: string) =>
    api.post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken }).then((r) => r.data),

  me: () => api.get<User>('/auth/me').then((r) => r.data),

  // Fetch the current user with an explicit token instead of reading from the
  // store.  Used during login/signup so a newly-issued access token is sent
  // directly without triggering the 401-interceptor refresh race that can
  // occur when an old stale token is still in the store at that moment.
  meWithToken: (token: string) =>
    api
      .get<User>('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.data),

  updateMe: (data: UserUpdate) => api.patch<User>('/auth/me', data).then((r) => r.data),
}
