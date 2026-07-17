import { useMemo } from 'react'
import { BellRing } from 'lucide-react'
import { useCheckinReminders } from '@/hooks/useCheckinReminders'
import { useNavigate } from 'react-router-dom'

export function MissedCheckinNotifications() {
  const navigate = useNavigate()
  const { data: reminders = [], isLoading } = useCheckinReminders(true, 50)

  const missed = useMemo(
    () => reminders.filter((reminder) => reminder.status === 'missed'),
    [reminders]
  )

  if (isLoading || missed.length === 0) {
    return null
  }

  return (
    <section className="glass-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-warning/10 border border-warning/20 flex items-center justify-center text-warning">
            <BellRing size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Missed Hourly Check-ins</h2>
            <p className="text-xs text-text-muted">Review and complete missed reminders from today.</p>
          </div>
        </div>
        <div className="rounded-full bg-warning/10 px-3 py-1 text-[11px] font-semibold text-warning">
          {missed.length} missed
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {missed.map((reminder) => (
          <div key={reminder.id} className="px-4 py-3 hover:bg-white/5 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">⚠️ Missed Hourly Check-in</p>
                <p className="text-[11px] text-text-muted mt-1">{new Date(reminder.scheduled_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
              </div>
              <div className="rounded-full bg-danger/10 px-2 py-1 text-[11px] font-semibold text-danger">Missed</div>
            </div>
            <button
              onClick={() => navigate(`/dashboard?checkin=1&reminderId=${reminder.id}`)}
              className="mt-3 btn-primary w-full py-2 text-sm"
            >
              Complete Now
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
