import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  ListChecks,
  MessageCircle,
  Mic,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  TimerReset,
  Trash2,
} from 'lucide-react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { useActivities } from '@/hooks/useActivities'
import type { ActivityType, ReminderActivity } from '@/types/api'

const ACTIVITY_META: Record<ActivityType, { label: string; icon: typeof Plus; tone: string }> = {
  created: { label: 'Created Task', icon: Plus, tone: 'text-success bg-success/10 border-success/20' },
  started: { label: 'Started', icon: Play, tone: 'text-accent bg-accent/10 border-accent/20' },
  working: { label: 'Working', icon: Clock3, tone: 'text-primary bg-primary/10 border-primary/20' },
  updated: { label: 'Updated', icon: Pencil, tone: 'text-warning bg-warning/10 border-warning/20' },
  completed: { label: 'Completed', icon: CheckCircle2, tone: 'text-success bg-success/10 border-success/20' },
  blocked: { label: 'Blocked', icon: AlertTriangle, tone: 'text-danger bg-danger/10 border-danger/20' },
  resumed: { label: 'Resumed', icon: RotateCcw, tone: 'text-accent bg-accent/10 border-accent/20' },
  snoozed: { label: 'Snoozed', icon: TimerReset, tone: 'text-warning bg-warning/10 border-warning/20' },
  deleted: { label: 'Deleted Task', icon: Trash2, tone: 'text-danger bg-danger/10 border-danger/20' },
  reminder_response: { label: 'Reminder Response', icon: MessageCircle, tone: 'text-primary bg-primary/10 border-primary/20' },
  hourly_checkin: { label: 'Check-in', icon: ListChecks, tone: 'text-accent bg-accent/10 border-accent/20' },
  voice_update: { label: 'Voice Update', icon: Mic, tone: 'text-accent bg-accent/10 border-accent/20' },
  text_update: { label: 'Text Update', icon: FileText, tone: 'text-primary bg-primary/10 border-primary/20' },
  companion_action: { label: 'Companion Action', icon: Sparkles, tone: 'text-primary bg-primary/10 border-primary/20' },
  status_update: { label: 'Update', icon: FileText, tone: 'text-text-secondary bg-white/5 border-white/10' },
}

function displayMeta(activity: ReminderActivity) {
  if (activity.activity_type !== 'hourly_checkin') {
    return ACTIVITY_META[activity.activity_type] ?? ACTIVITY_META.status_update
  }

  const status = activity.metadata?.status
  if (status === 'focused') {
    return {
      label: 'Productive',
      icon: CheckCircle2,
      tone: 'text-success bg-success/10 border-success/20',
    }
  }
  if (status === 'distracted') {
    return {
      label: 'Not productive',
      icon: AlertTriangle,
      tone: 'text-danger bg-danger/10 border-danger/20',
    }
  }
  if (status === 'idle') {
    return {
      label: 'Average',
      icon: Clock3,
      tone: 'text-warning bg-warning/10 border-warning/20',
    }
  }
  if (status === 'missed') {
    return {
      label: 'Missed',
      icon: Clock3,
      tone: 'text-text-muted bg-white/5 border-white/10',
    }
  }

  return ACTIVITY_META.hourly_checkin
}

function TimelineRow({ activity }: { activity: ReminderActivity }) {
  const meta = displayMeta(activity)
  const Icon = meta.icon
  const timestamp = new Date(activity.timestamp)

  return (
    <div className="grid grid-cols-[4.25rem_2rem_minmax(0,1.1fr)_minmax(0,1fr)] gap-3 px-4 py-3 border-t border-white/[0.06] first:border-t-0 items-start">
      <div className="text-xs leading-tight">
        <div className="font-semibold text-text-primary">{format(timestamp, 'HH:mm')}</div>
        <div className="text-text-muted mt-1">{formatDistanceToNowStrict(timestamp, { addSuffix: true })}</div>
      </div>

      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${meta.tone}`}>
        <Icon size={16} />
      </div>

      <div className="min-w-0">
        <div className="text-sm font-semibold text-text-primary truncate">{meta.label}</div>
        <div className="text-xs text-text-muted capitalize mt-1">{activity.source}</div>
      </div>

      <div className="min-w-0">
        <div className="text-sm text-text-primary truncate">{activity.task_title}</div>
        {activity.optional_notes ? (
          <div className="text-xs text-text-secondary mt-1 line-clamp-2">{activity.optional_notes}</div>
        ) : null}
      </div>
    </div>
  )
}

export function TodayTimeline() {
  const { data: activities = [], isLoading, error } = useActivities({ today: true, limit: 25 })

  return (
    <section className="glass-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Today's Timeline</h2>
          <p className="text-xs text-text-muted mt-1">{activities.length} activities</p>
        </div>
        <Clock3 size={18} className="text-text-muted" />
      </div>

      {isLoading ? (
        <div className="px-4 pb-4 space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-12 rounded-lg bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="px-4 pb-4 text-sm text-danger">Failed to load today's timeline.</div>
      ) : activities.length === 0 ? (
        <div className="px-4 pb-4 text-sm text-text-secondary">No activity recorded today.</div>
      ) : (
        <div>
          {activities.map((activity) => (
            <TimelineRow key={activity.id} activity={activity} />
          ))}
        </div>
      )}
    </section>
  )
}
