import { useState, useEffect } from 'react'
import { Bell, X, AlertTriangle } from 'lucide-react'
import { registerPushSubscription } from '@/lib/sw-registration'
import { useDeviceStore } from '@/stores/deviceStore'

export function NotificationPermission() {
  const [showBanner, setShowBanner] = useState(false)
  const [reason, setReason] = useState<'no_permission' | 'no_device' | 'denied'>('no_permission')
  const { deviceId } = useDeviceStore()

  useEffect(() => {
    if (!('Notification' in window)) return

    if (Notification.permission === 'default') {
      // User hasn't been asked yet.
      setReason('no_permission')
      setShowBanner(true)
      return
    }

    if (Notification.permission === 'granted' && !deviceId) {
      // Permission was previously granted but device registration failed
      // (e.g., network error, VAPID key change). Show a more specific banner.
      setReason('no_device')
      setShowBanner(true)
      return
    }

    if (Notification.permission === 'denied') {
      setReason('denied')
      setShowBanner(true)
      return
    }

    // Permission granted AND device is registered — all good.
    setShowBanner(false)
  }, [deviceId])

  const handleRequestPermission = async () => {
    try {
      await registerPushSubscription()
      setShowBanner(false)
    } catch (err) {
      console.error('[NotificationPermission] Failed to register:', err)
    }
  }

  if (!showBanner) return null

  const isNoDevice = reason === 'no_device'

  return (
    <div className="bg-primary/10 border-b border-primary/20 text-text-primary px-4 py-3 select-none flex items-center justify-between gap-4 animate-fade-in relative z-30">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isNoDevice ? 'bg-warning/20 text-warning' : 'bg-primary/20 text-primary'}`}>
          {isNoDevice ? <AlertTriangle size={18} /> : <Bell size={18} />}
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">
            {isNoDevice ? 'Push Registration Incomplete' : reason === 'denied' ? 'Notifications Blocked' : 'Enable Push Notifications'}
          </p>
          <p className="text-xs text-text-secondary">
            {isNoDevice
              ? 'Permission is granted but this device is not registered. Click to re-register.'
              : reason === 'denied'
              ? 'Notifications are blocked by your browser. Please enable them in your browser settings to receive alerts.'
              : 'Get instant reminders for task deadlines and schedules even when the app is closed.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {reason !== 'denied' && (
          <button
            onClick={handleRequestPermission}
            className="btn-primary py-1.5 px-4 text-xs font-semibold"
          >
            {isNoDevice ? 'Re-register' : 'Enable'}
          </button>
        )}
        <button
          onClick={() => setShowBanner(false)}
          className="text-text-secondary hover:text-text-primary p-1.5 rounded-md hover:bg-white/5 transition-all"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
