import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as zod from 'zod'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useUpdateTask } from '@/hooks/useTasks'
import type { Task } from '@/types/api'
import { parseISO, format } from 'date-fns'

const taskUpdateSchema = zod.object({
  title: zod.string().min(1, 'Title is required'),
  due_at: zod.string().optional().or(zod.literal('')),
  recurrence: zod.enum(['none', 'interval', 'daily', 'weekly']),
  interval_minutes: zod.number().nullable().optional(),
  category: zod.string().optional(),
})

type TaskUpdateFormValues = zod.infer<typeof taskUpdateSchema>

interface TaskEditModalProps {
  open: boolean
  onClose: () => void
  task: Task
}

export function TaskEditModal({ open, onClose, task }: TaskEditModalProps) {
  const updateMutation = useUpdateTask()

  const formatInitialDate = (isoStr: string | null) => {
    if (!isoStr) return ''
    try {
      const parsed = parseISO(isoStr)
      return format(parsed, "yyyy-MM-dd'T'HH:mm")
    } catch {
      return ''
    }
  }

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<TaskUpdateFormValues>({
    resolver: zodResolver(taskUpdateSchema),
    defaultValues: {
      title: task.title,
      due_at: formatInitialDate(task.due_at),
      recurrence: task.recurrence,
      interval_minutes: task.interval_minutes,
      category: task.category || '',
    },
  })

  // Ensure form updates if task changes
  useEffect(() => {
    if (open) {
      reset({
        title: task.title,
        due_at: formatInitialDate(task.due_at),
        recurrence: task.recurrence,
        interval_minutes: task.interval_minutes,
        category: task.category || '',
      })
    }
  }, [open, task, reset])

  const recurrenceValue = watch('recurrence')

  const onSubmit = async (values: TaskUpdateFormValues) => {
    let isoDue: string | null = null
    if (values.due_at) {
      isoDue = new Date(values.due_at).toISOString()
    }

    const payload = {
      title: values.title,
      due_at: isoDue,
      recurrence: values.recurrence,
      interval_minutes: values.recurrence === 'interval' ? values.interval_minutes : null,
      category: values.category || null,
    }

    updateMutation.mutate(
      { id: task.id, data: payload },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o: boolean) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-bg-elevated border border-border p-6 shadow-2xl animate-fade-in focus:outline-none max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-4">
            <Dialog.Title className="text-lg font-bold text-text-primary">Edit Reminder</Dialog.Title>
            <Dialog.Close className="text-text-secondary hover:text-text-primary p-1 rounded-md hover:bg-white/5 transition-all">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Reminder Title *
              </label>
              <input
                type="text"
                {...register('title')}
                className="input-field"
                disabled={updateMutation.isPending}
              />
              {errors.title && <p className="text-xs text-danger mt-1">{errors.title.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  Due At
                </label>
                <input
                  type="datetime-local"
                  {...register('due_at')}
                  className="input-field [color-scheme:dark]"
                  disabled={updateMutation.isPending}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  Category
                </label>
                <input
                  type="text"
                  {...register('category')}
                  className="input-field"
                  disabled={updateMutation.isPending}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  Recurrence
                </label>
                <select
                  {...register('recurrence')}
                  className="input-field"
                  disabled={updateMutation.isPending}
                >
                  <option value="none">One-off (None)</option>
                  <option value="interval">Interval (Minutes)</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>

              {recurrenceValue === 'interval' && (
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                    Interval Minutes
                  </label>
                  <input
                    type="number"
                    {...register('interval_minutes', { valueAsNumber: true })}
                    className="input-field"
                    disabled={updateMutation.isPending}
                  />
                </div>
              )}
            </div>

            {task.notes && task.notes.length > 0 && (
              <div className="space-y-2 border-t border-border/30 pt-3">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                  Checklist Notes (Read-Only)
                </span>
                <div className="space-y-1">
                  {task.notes.map((note) => (
                    <div key={note.id} className="text-xs bg-bg-surface border border-border/40 rounded-lg p-2 text-text-secondary">
                      {note.text}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-border/30">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost"
                disabled={updateMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
