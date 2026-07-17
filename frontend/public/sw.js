// Push subscription background handler + client actions
// Served from public/sw.js to circumvent bundler compilation

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/**
 * Helper to fetch with the token from IndexedDB.
 * Since the user might interact with the notification when the app is closed,
 * we need to fetch the access_token from the same IndexedDB store used by authStore.ts.
 */
async function fetchWithAuth(url, options) {
  let token = null
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('smartreminder-db', 1)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    token = await new Promise((resolve, reject) => {
      const tx = db.transaction('auth', 'readonly')
      const req = tx.objectStore('auth').get('access_token')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch {
    // ignore IDB errors
  }

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  // fallback to action_token if access_token not found in IDB (e.g., cleared)
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else if (options.actionToken) {
    headers['Authorization'] = `Bearer ${options.actionToken}`
  }

  return fetch(url, { ...options, headers })
}

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()

    if (data.type === 'cancel') {
      // Close notifications matching the target tag
      event.waitUntil(
        self.registration.getNotifications({ tag: data.tag }).then((notifications) => {
          notifications.forEach((n) => n.close())
        })
      )
      return
    }

    if (data.type === 'reminder') {
      const options = {
        body: `Due: ${new Date(data.due_at).toLocaleTimeString()}`,
        tag: data.tag,
        icon: '/vite.svg',
        badge: '/vite.svg',
        actions: [
          { action: 'done', title: '✓ Done' },
          { action: 'snooze', title: '⏰ Snooze 10m' },
        ],
        requireInteraction: false,
        data: { task_id: data.task_id, due_at: data.due_at, action_token: data.action_token },
      }

      event.waitUntil(
        self.registration.showNotification(data.title, options)
      )
    }

    if (data.type === 'summary_ready') {
      const options = {
        body: data.body,
        tag: data.tag,
        icon: '/vite.svg',
        badge: '/vite.svg',
        requireInteraction: false,
        data: { summary: data.summary, url: '/summary' },
      }
      event.waitUntil(
        self.registration.showNotification(data.title, options)
      )
    }

    if (data.type === 'checkin') {
      const options = {
        body: 'What are you working on right now?',
        tag: data.tag,
        icon: '/vite.svg',
        badge: '/vite.svg',
        actions: [
          { action: 'productive', title: 'Productive' },
          { action: 'not_productive', title: 'Not productive' },
          { action: 'add_task', title: 'Add task' },
        ],
        requireInteraction: false,
        renotify: true,
        data: {
          action_token: data.action_token,
          reminder_id: data.reminder_id,
        },
      }
      event.waitUntil(
        self.registration.showNotification('Hourly Reminder', options)
      )
    }
  } catch (err) {
    console.error('Error handling background push notification:', err)
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { task_id, action_token, summary, url } = event.notification.data || {}

  // If this is the summary notification, open the summary page.
  if (url === '/summary') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        // Find an open dashboard/app tab
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // We use postMessage to pass the summary payload to the running app.
            client.postMessage({ type: 'SUMMARY_READY', summary })
            return client.focus().then((c) => c.navigate('/summary'))
          }
        }
        // No open tabs, open a new one to the summary page. The app will fetch the latest
        // summary if the store is empty, or the push was missed, which is fine.
        if (clients.openWindow) {
          return clients.openWindow('/summary')
        }
      })
    )
    return
  }

  // Handle in-notification action buttons for reminders
  // Use relative path to avoid hardcoded http://localhost:8000
  // Since the SW is served from the frontend, we derive the API URL (assuming same origin proxy, or fallback)
  // For this setup, we'll use the VITE_API_URL if possible, but SW doesn't have process.env.
  // We'll use /api as a generic base and assume Vite proxy handles it, or fallback to localhost:8000.
  // In a real prod environment, this would be injected during build time, but we'll use a dynamic approach.
  const apiBaseUrl = self.location.hostname === 'localhost' ? 'http://localhost:8000' : 'https://smartreminder-production-9096.up.railway.app';

  if (event.action === 'done') {
    event.waitUntil(
      fetchWithAuth(`${apiBaseUrl}/tasks/${task_id}/action`, {
        method: 'POST',
        actionToken: action_token,
        body: JSON.stringify({
          action: 'done',
          client_timestamp: new Date().toISOString(),
        }),
      })
    )
  } else if (event.action === 'snooze') {
    event.waitUntil(
      fetchWithAuth(`${apiBaseUrl}/tasks/${task_id}/action`, {
        method: 'POST',
        actionToken: action_token,
        body: JSON.stringify({
          action: 'snooze',
          client_timestamp: new Date().toISOString(),
          snooze_minutes: 10,
        }),
      })
    )
  } else if (['productive', 'average', 'not_productive'].includes(event.action)) {
    const statusMap = {
      'productive': 'focused',
      'average': 'idle',
      'not_productive': 'distracted'
    }
    event.waitUntil(
      fetchWithAuth(`${apiBaseUrl}/companion/checkin`, {
        method: 'POST',
        actionToken: action_token,
        body: JSON.stringify({
          status: statusMap[event.action],
          start_at: new Date(Date.now() - 3600000).toISOString(),
          end_at: new Date().toISOString(),
          reminder_id: event.notification.data?.reminder_id,
        }),
      }).then(() => {
        // Broadcast to any open windows to refresh the UI
        return clients.matchAll({ type: 'window' }).then((clientList) => {
          for (const client of clientList) {
            client.postMessage({ type: 'CHECKIN_LOGGED' })
          }
        })
      })
    )
  } else if (event.action === 'add_task') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'OPEN_ADD_TASK_MODAL' })
            return client.focus().then((c) => c.navigate('/dashboard?addTask=1'))
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/dashboard?addTask=1')
        }
      })
    )
  } else if (event.action === 'remind_later') {
    event.waitUntil(
      fetchWithAuth(`${apiBaseUrl}/companion/checkin/reschedule`, {
        method: 'POST',
        actionToken: action_token,
      })
    )
  } else {
    // Clicking the notification body (not an action button):
    // - For check-in notifications → open the app and signal voice check-in panel.
    // - For everything else → just focus/open the dashboard.
    const isCheckin = event.notification.tag === 'hourly-checkin'
    const reminderId = event.notification.data?.reminder_id
    const targetUrl = isCheckin
      ? `/dashboard?checkin=1${reminderId ? `&reminderId=${reminderId}` : ''}`
      : '/dashboard'

    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            if (isCheckin) {
              client.postMessage({ type: 'OPEN_CHECKIN_PANEL', reminderId })
            }
            return client.focus().then((c) => c.navigate(targetUrl))
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl)
        }
      })
    )
  }
})
