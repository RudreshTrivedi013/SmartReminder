import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { useWsStore } from '@/stores/wsStore'
import { useSummaryStore } from '@/stores/summaryStore'
import { TASKS_KEY } from './useTasks'
import { ACTIVITIES_KEY } from './useActivities'
import type { DaySummary } from '@/types/api'

const API_URL = import.meta.env.VITE_API_URL as string ?? 'http://localhost:8000'
const WS_URL = API_URL.replace(/^http/, 'ws')

const INVALIDATING_EVENTS = new Set(['task_created', 'task_updated', 'task_deleted', 'task_action'])

export function useWebSocket() {
  const { accessToken, isAuthenticated } = useAuthStore()
  const { setSocket, setStatus } = useWsStore()
  const { setPendingSummary } = useSummaryStore()
  const queryClient = useQueryClient()
  const reconnectDelay = useRef(1000)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

  const connect = useCallback(() => {
    if (!accessToken || !isAuthenticated) return

    setStatus('connecting')
    const ws = new WebSocket(`${WS_URL}/ws?token=${accessToken}`)
    socketRef.current = ws
    setSocket(ws)

    ws.onopen = () => {
      setStatus('connected')
      reconnectDelay.current = 1000
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as { event?: string; summary?: DaySummary }

        if (data.event && INVALIDATING_EVENTS.has(data.event)) {
          queryClient.invalidateQueries({ queryKey: TASKS_KEY })
        }

        // When the Celery worker publishes a summary_ready event via Redis
        // pub/sub it lands here. Store it so SummaryPage can display the
        // drawer without a round-trip API call.
        if (data.event === 'summary_ready' && data.summary) {
          setPendingSummary(data.summary as DaySummary)
        }
      } catch {
        // ignore non-JSON messages
      }
    }

    ws.onclose = () => {
      if (socketRef.current !== ws) return

      setStatus('reconnecting')
      setSocket(null)
      if (!isAuthenticated) return

      // Ping the server on WS close. If the WS closed because the token expired,
      // this HTTP request will get a 401, triggering the Axios interceptor to
      // seamlessly refresh the token and update the store (which will automatically
      // re-trigger this hook with the fresh token).
      import('@/api/axios').then(({ api }) => {
        api.get('/auth/me').catch(() => {})
      })

      timeoutRef.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000)
        connect()
      }, reconnectDelay.current)
    }

    ws.onerror = () => {
      if (socketRef.current === ws) ws.close()
    }
  }, [accessToken, isAuthenticated, queryClient, setSocket, setStatus, setPendingSummary])

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      connect()
    } else {
      socketRef.current?.close()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setStatus('disconnected')
    }

    return () => {
      socketRef.current?.close()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [isAuthenticated, accessToken, connect, setStatus])

  // Listen for messages from the Service Worker (e.g. checkin logged in background)
  useEffect(() => {
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'CHECKIN_LOGGED') {
        // Invalidate today's stats to refresh dashboard
        queryClient.invalidateQueries({ queryKey: ['todayStats'] })
        queryClient.invalidateQueries({ queryKey: TASKS_KEY })
        queryClient.invalidateQueries({ queryKey: ACTIVITIES_KEY })
      }
    }
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage)
    }
    
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage)
      }
    }
  }, [queryClient])
}
