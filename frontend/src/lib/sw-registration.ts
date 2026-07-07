import { devicesApi } from '@/api/devices'
import { useDeviceStore } from '@/stores/deviceStore'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

/**
 * Full push subscription flow: register SW → request permission → subscribe → POST /devices.
 * Called when the user actively clicks "Enable Push".
 */
export async function registerPushSubscription(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[SW] Push notifications not supported in this browser')
    return
  }

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string
  if (!vapidKey || vapidKey === 'your_vapid_public_key_here') {
    console.warn('[SW] VITE_VAPID_PUBLIC_KEY not configured')
    return
  }

  const registration = await navigator.serviceWorker.register('/sw.js')
  await registration.update()
  await navigator.serviceWorker.ready

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    console.warn('[SW] Notification permission denied')
    return
  }

  await _subscribeAndRegister(registration, vapidKey)
}

/**
 * Silent auto-init called on every authenticated page load.
 *
 * - If the SW is not yet registered, registers it.
 * - If permission is already 'granted', creates (or refreshes) the push
 *   subscription and registers the device with the backend.
 * - Does NOT prompt for permission — use registerPushSubscription() for that.
 */
export async function initServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return
  }

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string
  if (!vapidKey || vapidKey === 'your_vapid_public_key_here') {
    return
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await registration.update()
    await navigator.serviceWorker.ready

    // Only proceed silently if permission is already granted.
    // If it's 'default' the NotificationPermission banner will ask.
    if (Notification.permission !== 'granted') {
      return
    }

    await _subscribeAndRegister(registration, vapidKey)
  } catch (err) {
    // Non-fatal — do not crash the app on SW errors.
    console.warn('[SW] initServiceWorker failed silently:', err)
  }
}

/**
 * Internal helper: subscribe to push and POST the subscription to /devices.
 */
async function _subscribeAndRegister(
  registration: ServiceWorkerRegistration,
  vapidKey: string,
): Promise<void> {
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as any,
    })
    console.info('[SW] New push subscription created')
  } else {
    console.info('[SW] Existing push subscription found')
  }

  // Register with backend and store the device ID for auto-ping.
  const device = await devicesApi.register(JSON.stringify(subscription), true)
  useDeviceStore.getState().setDeviceId(device.id)
  console.info('[SW] Device registered with backend — id:', device.id)
}

export async function unregisterServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((r) => r.unregister()))
  useDeviceStore.getState().clearDevice()
}
