import { useMemo, useState } from 'react'
import { BellRing, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { useCheckinReminders } from '@/hooks/useCheckinReminders'
import { useCheckinPanelStore } from '@/stores/checkinPanelStore'
import { isToday, isYesterday, format } from 'date-fns'

export function MissedCheckinNotifications() {
  const { data: reminders = [], isLoading } = useCheckinReminders(false, 50, 'missed')
  const { open } = useCheckinPanelStore()
  const [isExpanded, setIsExpanded] = useState(true)

  const missed = useMemo(
    () => reminders.filter((reminder) => reminder.status === 'missed'),
    [reminders]
  )

  const groupedReminders = useMemo(() => {
    const today: typeof missed = []
    const yesterday: typeof missed = []
    const older: typeof missed = []

    missed.forEach(reminder => {
      const date = new Date(reminder.scheduled_time)
      if (isToday(date)) today.push(reminder)
      else if (isYesterday(date)) yesterday.push(reminder)
      else older.push(reminder)
    })

    return { today, yesterday, older }
  }, [missed])

  if (isLoading || missed.length === 0) {
    return null
  }

  const renderGroup = (title: string, group: typeof missed) => {
    if (group.length === 0) return null
    return (
      <div className="mb-4 last:mb-0">
        <h3 className="text-xs font-semibold text-text-muted mb-2 px-4 uppercase tracking-wider">{title}</h3>
        <div className="divide-y divide-white/5 bg-white/5 rounded-lg overflow-hidden mx-4">
          {group.map((reminder) => {
            const date = new Date(reminder.scheduled_time)
            return (
              <div key={reminder.id} className="p-3 hover:bg-white/5 transition-colors flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-warning/10 text-warning flex items-center justify-center shrink-0">
                    <Clock size={14} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">Hourly Check-in</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      {title === 'Today' 
                        ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                        : format(date, 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => open(reminder.id)}
                  className="btn-primary py-1.5 px-3 text-xs whitespace-nowrap"
                >
                  Complete
                </button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <section className="glass-card overflow-hidden animate-in fade-in slide-in-from-bottom-2">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-warning/10 border border-warning/20 flex items-center justify-center text-warning">
              <BellRing size={18} />
            </div>
            {/* Pulsing indicator */}
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-warning"></span>
            </span>
          </div>
          <div className="text-left">
            <h2 className="text-sm font-semibold text-text-primary">Missed Check-ins</h2>
            <p className="text-xs text-text-muted">You have {missed.length} missed reminder{missed.length !== 1 ? 's' : ''}.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-warning/10 px-3 py-1 text-[11px] font-semibold text-warning">
            {missed.length}
          </div>
          <div className="text-text-muted">
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="pb-4 pt-1 border-t border-white/5">
          {renderGroup('Today', groupedReminders.today)}
          {renderGroup('Yesterday', groupedReminders.yesterday)}
          {renderGroup('Older', groupedReminders.older)}
        </div>
      )}
    </section>
  )
}
