import { useState } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { TaskList } from '@/components/tasks/TaskList'
import { TaskCreateModal } from '@/components/tasks/TaskCreateModal'
import { Plus } from 'lucide-react'

export default function TasksPage() {
  const { data: tasks = [], isLoading, error } = useTasks()
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center select-none">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">All Reminders</h1>
          <p className="text-sm text-text-secondary">View and manage your complete checklist.</p>
        </div>

        <button onClick={() => setIsCreateOpen(true)} className="btn-primary w-full sm:w-auto flex items-center justify-center gap-1.5 py-2">
          <Plus size={18} /> New Reminder
        </button>
      </div>

      <div>
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
            Failed to load tasks. Please try refreshing.
          </div>
        ) : (
          <TaskList tasks={tasks} />
        )}
      </div>

      <TaskCreateModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  )
}