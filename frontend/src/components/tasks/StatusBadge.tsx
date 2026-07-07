import type { TaskStatus } from '@/types/api'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<TaskStatus, { label: string; classes: string; dot: string }> = {
  pending: { label: 'Pending', classes: 'bg-text-muted/10 text-text-secondary border-text-muted/20', dot: 'bg-text-muted' },
  in_progress: { label: 'In Progress', classes: 'bg-accent/10 text-accent border-accent/20', dot: 'bg-accent' },
  done: { label: 'Done', classes: 'bg-success/10 text-success border-success/20', dot: 'bg-success' },
  snoozed: { label: 'Snoozed', classes: 'bg-warning/10 text-warning border-warning/20', dot: 'bg-warning' },
  blocked: { label: 'Blocked', classes: 'bg-danger/10 text-danger border-danger/20', dot: 'bg-danger' },
}

interface StatusBadgeProps {
  status: TaskStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
      config.classes, className
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      {config.label}
    </span>
  )
}
