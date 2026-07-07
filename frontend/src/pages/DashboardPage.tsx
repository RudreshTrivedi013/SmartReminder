import { useState } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { useAuthStore } from '@/stores/authStore'
import { TaskList } from '@/components/tasks/TaskList'
import { TaskCreateModal } from '@/components/tasks/TaskCreateModal'
import { CompanionCommandBar } from '@/components/companion/CompanionCommandBar'
import { TodayTimeline } from '@/components/activity/TodayTimeline'
import { Plus, CheckCircle2, Clock, Sparkles } from 'lucide-react'
import type { Task } from '@/types/api'

export default function DashboardPage() {
  const { data: tasks = [], isLoading, error } = useTasks()
  const { user } = useAuthStore()
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Compute basic stats
  const pendingCount = tasks.filter((t: Task) => t.status === 'pending').length
  const inProgressCount = tasks.filter((t: Task) => t.status === 'in_progress').length
  const completedTodayCount = tasks.filter((t: Task) => t.status === 'done').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center select-none">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
            Hello, {user?.email.split('@')[0]}
          </h1>
          <p className="text-sm text-text-secondary">Here is your schedule for today.</p>
        </div>

        <button onClick={() => setIsCreateOpen(true)} className="btn-primary w-full sm:w-auto flex items-center justify-center gap-1.5 py-2">
          <Plus size={18} /> New Reminder
        </button>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 select-none">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Clock size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-text-muted uppercase tracking-wider font-semibold">Pending</p>
            <p className="text-xl font-bold text-text-primary">{pendingCount}</p>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
            <Sparkles size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-text-muted uppercase tracking-wider font-semibold">In Progress</p>
            <p className="text-xl font-bold text-text-primary">{inProgressCount}</p>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center text-success">
            <CheckCircle2 size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-text-muted uppercase tracking-wider font-semibold">Completed</p>
            <p className="text-xl font-bold text-text-primary">{completedTodayCount}</p>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-6">
        <CompanionCommandBar />
        <TodayTimeline />
        
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass-card p-4 space-y-3 animate-pulse">
                <div className="h-4 bg-white/5 rounded-md w-3/4" />
                <div className="h-3 bg-white/5 rounded-md w-1/2" />
                <div className="h-8 bg-white/5 rounded-md w-full mt-2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl border border-danger/20 bg-danger/5 text-danger text-sm flex items-center gap-2">
            Failed to load tasks. Please check your network connection.
          </div>
        ) : (
          <TaskList tasks={tasks} />
        )}
      </div>

      <TaskCreateModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  )
}