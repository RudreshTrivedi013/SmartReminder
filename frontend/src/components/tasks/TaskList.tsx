import { useState } from 'react'
import type { Task } from '@/types/api'
import { TaskCard } from './TaskCard'
import { ChevronDown, ChevronUp, AlertCircle, ArrowUpRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { TaskCreateModal } from './TaskCreateModal'

interface TaskListProps {
  tasks: Task[]
}

export function TaskList({ tasks }: TaskListProps) {
  const [doneExpanded, setDoneExpanded] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Group tasks
  const inProgress = tasks.filter((t) => t.status === 'in_progress')
  const pending = tasks.filter((t) => t.status === 'pending')
  const snoozed = tasks.filter((t) => t.status === 'snoozed')
  const blocked = tasks.filter((t) => t.status === 'blocked')
  const done = tasks.filter((t) => t.status === 'done')

  const totalCount = tasks.length
  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border/50 rounded-2xl bg-white/[0.01]">
        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 text-primary animate-pulse-slow">
          <AlertCircle size={28} />
        </div>
        <h3 className="text-lg font-semibold text-text-primary">No reminders yet</h3>
        <p className="text-sm text-text-secondary mt-1 max-w-sm">
          Get started by adding a task or using Voice Input to transcribe your reminders automatically.
        </p>
        <button onClick={() => setIsCreateOpen(true)} className="btn-primary mt-6 flex items-center gap-2">
          Create Reminder <ArrowUpRight size={16} />
        </button>
        <TaskCreateModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-8 select-none">
      {/* 1. In Progress */}
      {inProgress.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-accent tracking-wider uppercase flex items-center gap-2">
            In Progress <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inProgress.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* 2. Pending */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-text-secondary tracking-wider uppercase">
            Pending ({pending.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pending.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* 3. Snoozed */}
      {snoozed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-warning tracking-wider uppercase">
            Snoozed ({snoozed.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {snoozed.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* 4. Blocked */}
      {blocked.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-danger tracking-wider uppercase">
            Blocked ({blocked.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {blocked.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* 5. Done (Collapsed by default) */}
      {done.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setDoneExpanded(!doneExpanded)}
            className="flex items-center gap-2 text-xs font-bold text-text-muted hover:text-text-secondary tracking-wider uppercase transition-all"
          >
            {doneExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>Completed ({done.length})</span>
          </button>

          <AnimatePresence initial={false}>
            {doneExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {done.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
