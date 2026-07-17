import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { useWebSocket } from '@/hooks/useWebSocket'
import { NotificationPermission } from '@/components/notifications/NotificationPermission'
import { useDeviceStore } from '@/stores/deviceStore'
import { devicesApi } from '@/api/devices'
import { initServiceWorker } from '@/lib/sw-registration'
import { HourlyReminderPanel } from '@/components/notifications/HourlyReminderPanel'
import { TaskCreateModal } from '@/components/tasks/TaskCreateModal'

const PING_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  useWebSocket()
  const { deviceId } = useDeviceStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [isHourlyReminderOpen, setIsHourlyReminderOpen] = useState(false)
  const [reminderId, setReminderId] = useState<string | undefined>(undefined)
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false)

  // Handle URL params for notification-driven panels.
  useEffect(() => {
    const shouldOpenCheckin = searchParams.get('checkin') === '1'
    const newReminderId = searchParams.get('reminderId') ?? undefined
    const shouldOpenAddTask = searchParams.get('addTask') === '1'

    if (shouldOpenCheckin || newReminderId) {
      setReminderId(newReminderId)
      setIsHourlyReminderOpen(true)
    }
    if (shouldOpenAddTask) {
      setIsCreateTaskOpen(true)
    }
    if (shouldOpenCheckin || newReminderId || shouldOpenAddTask) {
      setSearchParams((prev) => {
        prev.delete('checkin')
        prev.delete('reminderId')
        prev.delete('addTask')
        return prev
      }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Handle SW messages for check-in panel
  useEffect(() => {
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'OPEN_CHECKIN_PANEL') {
        setReminderId(event.data.reminderId ?? undefined)
        setIsHourlyReminderOpen(true)
      }
      if (event.data && event.data.type === 'OPEN_ADD_TASK_MODAL') {
        setIsCreateTaskOpen(true)
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
  }, [])

  // Auto-register the Service Worker and push subscription on every
  // authenticated page load. If permission was already granted in a previous
  // session this runs silently and ensures the device is always registered.
  useEffect(() => {
    initServiceWorker().catch(() => {
      // Silently ignore — the NotificationPermission banner handles the UX.
    })
  }, [])

  // Auto-ping the registered device every 5 minutes while the app is open.
  // This keeps `last_active_at` fresh so the backend can target the active
  // device for notifications (and prune stale subscriptions via GoneException).
  useEffect(() => {
    if (!deviceId) return

    const ping = () => {
      devicesApi.ping(deviceId).catch(() => {
        // Silently ignore ping failures — they're non-critical heartbeats.
      })
    }

    // Ping immediately on mount so we don't wait 5 minutes for the first update.
    ping()

    const interval = setInterval(ping, PING_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [deviceId])

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        <NotificationPermission />
        <div className="max-w-[1200px] mx-auto px-4 py-6 pb-24 md:pb-6">
          {children}
        </div>
      </main>
      <BottomNav />

      {/* Global Modals/Overlays */}
      <AnimatePresence>
        {isHourlyReminderOpen && (
          <HourlyReminderPanel
            onClose={() => {
              setIsHourlyReminderOpen(false)
              setReminderId(undefined)
            }}
            reminderId={reminderId}
          />
        )}
      </AnimatePresence>
      <TaskCreateModal open={isCreateTaskOpen} onClose={() => setIsCreateTaskOpen(false)} />
    </div>
  )
}
