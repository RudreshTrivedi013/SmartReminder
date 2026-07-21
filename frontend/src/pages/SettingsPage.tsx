import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useAuth } from '@/hooks/useAuth'
import { devicesApi } from '@/api/devices'
import { authApi } from '@/api/auth'
import type { Device } from '@/types/api'
import { registerPushSubscription } from '@/lib/sw-registration'
import { parseApiError } from '@/lib/utils'
import toast from 'react-hot-toast'

// ── Working-hours time slot presets (interval is chosen separately) ──────────
const CHECKIN_PRESETS = [
  {
    id: 'short',
    label: 'Short',
    emoji: '🌅',
    description: 'Light workday',
    hours: '9 AM – 5 PM',
    working_hours_start: '09:00:00',
    working_hours_end: '17:00:00',
  },
  {
    id: 'standard',
    label: 'Standard',
    emoji: '⚡',
    description: 'Typical office day',
    hours: '9 AM – 7 PM',
    working_hours_start: '09:00:00',
    working_hours_end: '19:00:00',
  },
  {
    id: 'long',
    label: 'Long',
    emoji: '🔥',
    description: 'Extended work session',
    hours: '8 AM – 9 PM',
    working_hours_start: '08:00:00',
    working_hours_end: '21:00:00',
  },
] as const

const INTERVAL_OPTIONS = [
  { value: 30,  label: 'Every 30 minutes' },
  { value: 60,  label: 'Every 1 hour' },
  { value: 120, label: 'Every 2 hours' },
] as const
import {
  Laptop,
  Globe,
  Zap,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ToggleLeft,
  ToggleRight,
  Bell,
  LogOut
} from 'lucide-react'

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const { logout } = useAuth()
  const navigate = useNavigate()
  
  const [devices, setDevices] = useState<Device[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [pinging, setPinging] = useState<string | null>(null)
  
  // Settings state
  const [savingSettings, setSavingSettings] = useState(false)
  const [testPushResult, setTestPushResult] = useState<any>(null)
  const [testingPush, setTestingPush] = useState(false)

  // Local form state
  const [settings, setSettings] = useState({
    working_hours_start: user?.working_hours_start || '09:00:00',
    working_hours_end: user?.working_hours_end || '17:00:00',
    checkin_interval_minutes: user?.checkin_interval_minutes || 60,
    daily_summary_enabled: user?.daily_summary_enabled ?? true,
    reminders_enabled: user?.reminders_enabled ?? true,
    checkin_enabled: user?.checkin_enabled ?? true,
  })

  // When global user changes, update local state
  useEffect(() => {
    if (user) {
      setSettings({
        working_hours_start: user.working_hours_start,
        working_hours_end: user.working_hours_end,
        checkin_interval_minutes: user.checkin_interval_minutes,
        daily_summary_enabled: user.daily_summary_enabled,
        reminders_enabled: user.reminders_enabled,
        checkin_enabled: user.checkin_enabled,
      })
    }
  }, [user])

  const fetchDevices = async () => {
    setLoadingDevices(true)
    try {
      const list = await devicesApi.list()
      setDevices(list)
    } catch {
      toast.error('Failed to load registered devices')
    } finally {
      setLoadingDevices(false)
    }
  }

  useEffect(() => {
    fetchDevices()
  }, [])

  const handleRegisterPush = async () => {
    try {
      await registerPushSubscription()
      toast.success('Device registered for push notifications!')
      fetchDevices()
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const handlePing = async (id: string) => {
    setPinging(id)
    try {
      await devicesApi.ping(id)
      toast.success('Heartbeat sent!')
      fetchDevices()
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setPinging(null)
    }
  }

  const handleSettingChange = (field: string, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }))
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const updatedUser = await authApi.updateMe(settings)
      setUser(updatedUser)
      toast.success('Settings saved successfully!')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setSavingSettings(false)
    }
  }

  const handleTestPush = async () => {
    setTestingPush(true)
    setTestPushResult(null)
    try {
      const result = await devicesApi.testPush()
      setTestPushResult(result)
      if (result.status === 'no_devices') {
        toast.error('No registered devices found — enable push first')
      } else {
        toast.success(`Test push sent to ${result.devices_targeted} device(s)`)
      }
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setTestingPush(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="space-y-6 w-full max-w-2xl select-none">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary">Configure app preferences and notification endpoints.</p>
      </div>

      {/* Account Info */}
      <div className="glass-card p-4 sm:p-5 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">Account Profile</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-text-muted">Email address</p>
            <p className="text-text-primary font-medium mt-0.5 break-all">{user?.email}</p>
          </div>
          <div>
            <p className="text-text-muted flex items-center gap-1">
              <Globe size={14} /> Timezone
            </p>
            <p className="text-text-primary font-medium mt-0.5">{user?.timezone}</p>
          </div>
        </div>
        <p className="text-xs text-text-muted italic pt-2 border-t border-border/30">
          Note: Timezone updates are determined by your backend profile and local calendar integrations.
        </p>
      </div>

      {/* Notification Preferences */}
      <div className="glass-card p-4 sm:p-5 space-y-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">Notifications & Preferences</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Daily Summaries</p>
              <p className="text-xs text-text-muted">Receive an AI-generated summary at the end of the day</p>
            </div>
            <button
              onClick={() => handleSettingChange('daily_summary_enabled', !settings.daily_summary_enabled)}
              className="text-primary hover:opacity-80 transition-opacity shrink-0"
            >
              {settings.daily_summary_enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-text-muted" />}
            </button>
          </div>
          
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Task Reminders</p>
              <p className="text-xs text-text-muted">Receive alerts when tasks are due</p>
            </div>
            <button
              onClick={() => handleSettingChange('reminders_enabled', !settings.reminders_enabled)}
              className="text-primary hover:opacity-80 transition-opacity shrink-0"
            >
              {settings.reminders_enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-text-muted" />}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Productivity Check-ins</p>
              <p className="text-xs text-text-muted">Interactive reminders to track your focus</p>
            </div>
            <button
              onClick={() => handleSettingChange('checkin_enabled', !settings.checkin_enabled)}
              className="text-primary hover:opacity-80 transition-opacity shrink-0"
            >
              {settings.checkin_enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-text-muted" />}
            </button>
          </div>
        </div>

        {settings.checkin_enabled && (
          <div className="pt-4 border-t border-border/30 space-y-4">

            {/* ── Working Hours slot presets ──────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                  <Clock size={12} /> Working Hours
                </label>
                {!CHECKIN_PRESETS.some(
                  p =>
                    p.working_hours_start === settings.working_hours_start &&
                    p.working_hours_end === settings.working_hours_end
                ) && (
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-warning/10 border border-warning/20 text-warning">
                    Custom
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {CHECKIN_PRESETS.map((preset) => {
                  const isActive =
                    settings.working_hours_start === preset.working_hours_start &&
                    settings.working_hours_end === preset.working_hours_end

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        handleSettingChange('working_hours_start', preset.working_hours_start)
                        handleSettingChange('working_hours_end', preset.working_hours_end)
                      }}
                      className={[
                        'relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all duration-200',
                        isActive
                          ? 'border-primary bg-primary/10 shadow-[0_0_0_1px] shadow-primary/30'
                          : 'border-border/40 bg-white/[0.02] hover:border-primary/40 hover:bg-white/5',
                      ].join(' ')}
                    >
                      {isActive && (
                        <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      )}

                      <span className="text-xl leading-none">{preset.emoji}</span>

                      <div>
                        <p className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-text-primary'}`}>
                          {preset.label}
                        </p>
                        <p className="text-[10px] text-text-muted leading-tight mt-0.5">
                          {preset.description}
                        </p>
                      </div>

                      <p className={`text-[10px] font-medium mt-0.5 ${ isActive ? 'text-primary/80' : 'text-text-secondary'}`}>
                        🕐 {preset.hours}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Check-in Interval dropdown ──────────────────────── */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2">
                Check-in Interval
              </label>
              <div className="grid grid-cols-3 gap-2">
                {INTERVAL_OPTIONS.map((opt) => {
                  const isActive = settings.checkin_interval_minutes === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSettingChange('checkin_interval_minutes', opt.value)}
                      className={[
                        'rounded-xl border py-2.5 px-3 text-xs font-medium transition-all duration-200 text-center',
                        isActive
                          ? 'border-primary bg-primary/10 text-primary shadow-[0_0_0_1px] shadow-primary/30'
                          : 'border-border/40 bg-white/[0.02] text-text-secondary hover:border-primary/40 hover:bg-white/5',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

          </div>
        )}
        
        <div className="pt-2 flex justify-end">
          <button 
            onClick={handleSaveSettings} 
            disabled={savingSettings}
            className="btn-primary w-full sm:w-auto py-2 px-4 text-sm disabled:opacity-50"
          >
            {savingSettings ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>

      {/* Push setup */}
      <div className="glass-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <Bell size={14} /> Web Push Notifications
            </h2>
            <p className="text-xs text-text-muted leading-relaxed">
              Register this browser window to receive alerts for upcoming reminders when the app tab is offline or closed.
            </p>
          </div>
          <button onClick={handleRegisterPush} className="btn-secondary w-full sm:w-auto py-1.5 px-3 text-xs shrink-0 whitespace-nowrap">
            Enable Push
          </button>
        </div>
      </div>

      {/* Registered Devices */}
      <div className="glass-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">Connected Devices</h2>
          <button
            onClick={handleTestPush}
            disabled={testingPush || devices.length === 0}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-focus transition-colors disabled:opacity-50"
          >
            <Zap size={14} />
            {testingPush ? 'Sending...' : 'Test Notifications'}
          </button>
        </div>
        
        {testPushResult && (
          <div className="p-3 rounded-lg bg-background-alt border border-border/50 space-y-2">
            <p className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Test Push Results</p>
            {testPushResult.status === 'no_devices' ? (
              <div className="flex items-center gap-2 text-xs text-warning">
                <AlertTriangle size={12} />
                No registered devices found
              </div>
            ) : (
              <div className="space-y-1.5">
                {testPushResult.results?.map((r: any) => (
                  <div key={r.device_id} className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    {r.status === 'sent' ? (
                      <CheckCircle size={14} className="text-success shrink-0" />
                    ) : (
                      <XCircle size={14} className="text-danger shrink-0" />
                    )}
                    <span className="font-mono truncate max-w-[150px] sm:max-w-[250px]">{r.device_id}</span>
                    <span className={r.status === 'sent' ? 'text-success' : 'text-danger'}>
                      {r.status}
                    </span>
                    {r.error && <span className="text-danger/70 truncate">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loadingDevices ? (
          <p className="text-xs text-text-muted animate-pulse">Loading registered devices...</p>
        ) : devices.length === 0 ? (
          <p className="text-xs text-text-muted">No push-enabled devices registered for this user.</p>
        ) : (
          <div className="space-y-3">
            {devices.map((d) => (
              <div key={d.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 p-3 border border-border/40 rounded-xl bg-white/[0.01]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-white/5 flex items-center justify-center text-text-secondary">
                    <Laptop size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-text-secondary truncate max-w-[200px] sm:max-w-[200px]">
                      {d.id}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      Active: {new Date(d.last_active_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-between sm:justify-end shrink-0">
                  {d.is_primary && (
                    <span className="text-[9px] bg-primary/10 border border-primary/20 text-primary uppercase font-bold tracking-wider px-1.5 py-0.5 rounded">
                      Primary
                    </span>
                  )}
                  <button
                    onClick={() => handlePing(d.id)}
                    className="btn-ghost py-1 px-2.5 text-xs bg-white/5 border border-border hover:bg-white/10 flex items-center gap-1.5 text-text-secondary"
                    disabled={pinging === d.id}
                  >
                    Ping
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account Actions (Visible mostly for mobile) */}
      <div className="md:hidden glass-card p-4 sm:p-5 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-danger">Account Actions</h2>
        <button 
          onClick={handleLogout} 
          className="w-full btn-ghost py-2.5 px-4 text-sm bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20 flex items-center justify-center gap-2"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </div>
  )
}