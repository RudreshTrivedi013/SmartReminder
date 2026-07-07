import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as zod from 'zod'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Plus, Trash } from 'lucide-react'
import { useCreateTask } from '@/hooks/useTasks'
import { parseISO } from 'date-fns'

const taskCreateSchema = zod.object({
  title: zod.string().min(1, 'Title is required'),
  due_at: zod.string().optional().or(zod.literal('')),
  recurrence: zod.enum(['none', 'interval', 'daily', 'weekly']),
  interval_minutes: zod.number().nullable().optional(),
  category: zod.string().optional(),
  notes: zod.array(
    zod.object({
      text: zod.string().min(1, 'Note text cannot be empty'),
    })
  ),
})

type TaskCreateFormValues = zod.infer<typeof taskCreateSchema>

interface TaskCreateModalProps {
  open: boolean
  onClose: () => void
}

export function TaskCreateModal({ open, onClose }: TaskCreateModalProps) {
  const createMutation = useCreateTask()

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<TaskCreateFormValues>({
    resolver: zodResolver(taskCreateSchema) as any,
    defaultValues: {
      recurrence: 'none',
      interval_minutes: null,
      notes: [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'notes',
  })

  const recurrenceValue = watch('recurrence')

  const onSubmit = async (values: TaskCreateFormValues) => {
    let isoDue: string | null = null
    if (values.due_at) {
      const parsed = parseISO(values.due_at)
      isoDue = parsed.toISOString()
    }

    const payload = {
      title: values.title,
      due_at: isoDue,
      recurrence: values.recurrence,
      interval_minutes: values.recurrence === 'interval' ? values.interval_minutes : null,
      category: values.category || null,
      source: 'text' as const,
      notes: values.notes?.map((n, i) => ({ text: n.text, done: false, order_index: i })) || [],
    }

    createMutation.mutate(payload, {
      onSuccess: () => {
        reset()
        onClose()
      },
    })
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o: boolean) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-bg-elevated border border-border p-6 shadow-2xl animate-fade-in focus:outline-none max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-4">
            <Dialog.Title className="text-lg font-bold text-text-primary">Create Reminder</Dialog.Title>
            <Dialog.Close className="text-text-secondary hover:text-text-primary p-1 rounded-md hover:bg-white/5 transition-all">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Reminder Title *
              </label>
              <input
                type="text"
                {...register('title')}
                placeholder="e.g. Call client about invoice"
                className="input-field"
                disabled={createMutation.isPending}
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
                  disabled={createMutation.isPending}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  Category
                </label>
                <input
                  type="text"
                  {...register('category')}
                  placeholder="e.g. Work, Personal"
                  className="input-field"
                  disabled={createMutation.isPending}
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
                  disabled={createMutation.isPending}
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
                    placeholder="e.g. 30"
                    disabled={createMutation.isPending}
                  />
                </div>
              )}
            </div>

            {/* Dynamic Notes */}
            <div className="space-y-2 border-t border-border/30 pt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Checklist Notes
                </span>
                <button
                  type="button"
                  onClick={() => append({ text: '' })}
                  className="text-xs text-primary hover:text-white flex items-center gap-1 font-medium transition-all"
                  disabled={createMutation.isPending}
                >
                  <Plus size={14} /> Add Note
                </button>
              </div>

              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-center animate-fade-in">
                  <input
                    type="text"
                    {...register(`notes.${index}.text` as const)}
                    placeholder="e.g. Note point"
                    className="input-field py-1 text-sm flex-1"
                    disabled={createMutation.isPending}
                  />
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-text-secondary hover:text-danger p-1 rounded transition-all"
                    disabled={createMutation.isPending}
                  >
                    <Trash size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border/30">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost"
                disabled={createMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
