import { useState } from 'react'
import type { Task } from '@/types/api'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play, Check, Edit2, Trash, AlertTriangle, RefreshCw, Keyboard, Mic, ChevronDown, ChevronUp, Calendar, MessageSquare
} from 'lucide-react'
import { useTaskAction, useDeleteTask } from '@/hooks/useTasks'
import { StatusBadge } from './StatusBadge'
import { SnoozePopover } from './SnoozePopover'
import { TaskEditModal } from './TaskEditModal'
import { ReminderResponsePanel } from './ReminderResponsePanel'
import { formatDueDate } from '@/lib/utils'

interface TaskCardProps {
  task: Task
}

export function TaskCard({ task }: TaskCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [respondOpen, setRespondOpen] = useState(false)

  const actionMutation = useTaskAction()
  const deleteMutation = useDeleteTask()

  const handleAction = (action: string, snoozeMins?: number) => {
    actionMutation.mutate({
      id: task.id,
      data: {
        action,
        client_timestamp: new Date().toISOString(),
        snooze_minutes: snoozeMins,
      },
    })
  }

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this task?')) {
      deleteMutation.mutate(task.id)
    }
  }

  const hasNotes = task.notes && task.notes.length > 0
  const isDone = task.status === 'done'
  const isBlocked = task.status === 'blocked'
  const isInProgress = task.status === 'in_progress'

  return (
    <motion.div
      layout
      className={`glass-card p-4 flex flex-col justify-between gap-3 transition-all duration-200 border-l-4 ${
        isInProgress
          ? 'border-l-accent shadow-glow-accent/10'
          : isBlocked
          ? 'border-l-danger'
          : isDone
          ? 'border-l-success opacity-75'
          : task.status === 'snoozed'
          ? 'border-l-warning'
          : 'border-l-primary'
      }`}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="space-y-1 select-none flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-base font-semibold text-text-primary truncate ${isDone ? 'line-through text-text-secondary' : ''}`}>
              {task.title}
            </h3>
            {task.source === 'voice' ? (
              <span title="Voice Input">
                <Mic size={14} className="text-accent shrink-0" />
              </span>
            ) : (
              <span title="Text Input">
                <Keyboard size={14} className="text-text-muted shrink-0" />
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-text-secondary pt-0.5">
            <StatusBadge status={task.status} />
            {task.category && (
              <span className="bg-white/5 border border-border rounded px-1.5 py-0.5 text-text-secondary uppercase tracking-wider text-[10px] font-bold">
                {task.category}
              </span>
            )}
            {task.recurrence !== 'none' && (
              <span className="text-primary font-medium">
                ↻ {task.recurrence}
                {task.recurrence === 'interval' && ` (${task.interval_minutes}m)`}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsEditOpen(true)}
            className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all"
            title="Edit Task"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 rounded-md text-text-secondary hover:text-danger hover:bg-danger/10 transition-all"
            title="Delete Task"
            disabled={deleteMutation.isPending}
          >
            <Trash size={16} />
          </button>
        </div>
      </div>

      {/* Due date display */}
      {task.due_at && (
        <div className="flex items-center gap-1.5 text-xs text-text-secondary select-none">
          <Calendar size={14} className="text-text-muted" />
          <span>{formatDueDate(task.due_at)}</span>
          {task.status === 'snoozed' && task.snoozed_until && (
            <span className="text-warning">
              (Snoozed until {formatDueDate(task.snoozed_until)})
            </span>
          )}
        </div>
      )}

      {/* Notes collapsible list */}
      {hasNotes && (
        <div className="border-t border-border/30 pt-2 mt-1">
          <button
            onClick={() => setNotesExpanded(!notesExpanded)}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-all mb-1 font-medium"
          >
            {notesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>Notes ({task.notes.length})</span>
          </button>

          <AnimatePresence initial={false}>
            {notesExpanded && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-1 pl-1"
              >
                {task.notes.map((note) => (
                  <li key={note.id} className="text-xs text-text-secondary flex items-start gap-2 py-0.5">
                    <span className="text-text-muted mt-1 select-none">•</span>
                    <span className={note.done ? 'line-through text-text-muted' : ''}>{note.text}</span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Action buttons footer */}
      <div className="flex items-center gap-2 mt-1.5 border-t border-border/20 pt-3 flex-wrap">
        {!isDone && (task.status === 'pending' || isBlocked) && (
          <button
            onClick={() => handleAction('start')}
            className="btn-ghost py-1 px-3 text-xs bg-accent/10 border border-accent/20 hover:bg-accent/20 text-accent flex items-center gap-1"
            disabled={actionMutation.isPending}
          >
            <Play size={12} fill="currentColor" /> Start
          </button>
        )}

        {!isDone && (
          <button
            onClick={() => handleAction('done')}
            className="btn-ghost py-1 px-3 text-xs bg-success/10 border border-success/20 hover:bg-success/20 text-success flex items-center gap-1"
            disabled={actionMutation.isPending}
          >
            <Check size={12} strokeWidth={3} /> Complete
          </button>
        )}

        {!isDone && (
          <SnoozePopover
            onSnooze={(mins) => handleAction('snooze', mins)}
            disabled={actionMutation.isPending}
          />
        )}

        {!isDone && !isBlocked && (
          <button
            onClick={() => handleAction('block')}
            className="btn-ghost py-1.5 px-3 text-xs bg-danger/5 border border-danger/10 text-danger/80 hover:bg-danger/10 hover:text-danger flex items-center gap-1.5"
            disabled={actionMutation.isPending}
          >
            <AlertTriangle size={12} /> Block
          </button>
        )}

        {(isDone || task.status === 'snoozed') && (
          <button
            onClick={() => handleAction('reopen')}
            className="btn-ghost py-1 px-3 text-xs bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary flex items-center gap-1"
            disabled={actionMutation.isPending}
          >
            <RefreshCw size={12} /> Reopen
          </button>
        )}

        {/* Respond button — opens inline voice/text response panel */}
        <button
          onClick={() => setRespondOpen((o) => !o)}
          className={`ml-auto btn-ghost py-1 px-3 text-xs flex items-center gap-1 transition-all ${
            respondOpen
              ? 'bg-primary/15 border border-primary/30 text-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
          title="Respond to this reminder"
        >
          <MessageSquare size={12} />
          {respondOpen ? 'Close' : 'Respond'}
        </button>
      </div>

      {/* Inline reminder response panel */}
      <AnimatePresence>
        {respondOpen && (
          <ReminderResponsePanel
            taskId={task.id}
            onClose={() => setRespondOpen(false)}
          />
        )}
      </AnimatePresence>

      <TaskEditModal open={isEditOpen} onClose={() => setIsEditOpen(false)} task={task} />
    </motion.div>
  )
}
