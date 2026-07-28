/**
 * Auth store with IndexedDB persistence for the access token.
 *
 * WHY IndexedDB (not localStorage):
 * Service workers cannot access localStorage — it's only available on the
 * main thread. IndexedDB is available in both the main thread AND service
 * workers, so storing the access token there lets the SW authenticate
 * in-notification "Done" / "Snooze" action buttons without an action_token.
 */
import { create } from 'zustand'
import type { User } from '@/types/api'

const IDB_NAME = 'smartreminder-db'
const IDB_STORE = 'auth'
const IDB_VERSION = 1

// ── IndexedDB helpers ──────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbSetToken(token: string): Promise<void> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(token, 'access_token')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Silently fail — IDB not critical for main-thread auth
  }
}

export async function idbGetToken(): Promise<string | null> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get('access_token')
      req.onsuccess = () => resolve((req.result as string) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function idbClearToken(): Promise<void> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).delete('access_token')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Silently fail
  }
}

// ── Zustand store ──────────────────────────────────────────────────────────

interface AuthState {
  accessToken: string | null
  user: User | null
  isAuthenticated: boolean

  setAuth: (accessToken: string, user: User) => void
  setAccessToken: (accessToken: string) => void

  // NEW: Update only the user object without affecting auth state.
  setUser: (user: User) => void

  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,

  setAuth: (accessToken, user) => {
    idbSetToken(accessToken)
    set({ accessToken, user, isAuthenticated: true })
  },

  setAccessToken: (accessToken) => {
    idbSetToken(accessToken)
    set({ accessToken, isAuthenticated: true })
  },

  // NEW
  setUser: (user) => {
    set({ user })
  },

  clearAuth: () => {
    localStorage.removeItem('refresh_token')
    idbClearToken()
    // Remove the default header that refreshAccessToken() sets so a stale
    // Bearer token cannot leak into the next login request.
    import('@/api/axios').then(({ api }) => {
      delete (api.defaults.headers.common as Record<string, unknown>)['Authorization']
    })
    set({ accessToken: null, user: null, isAuthenticated: false })
  },
}))