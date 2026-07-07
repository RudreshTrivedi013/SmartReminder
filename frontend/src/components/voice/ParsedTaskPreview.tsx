import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as zod from 'zod'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Sparkles, AlertTriangle, CheckCircle } from 'lucide-react'
import { useCreateTask } from '@/hooks/useTasks'
import { speakText, cancelSpeech } from '@/hooks/useVoiceInput'
import type { ParsedVoiceResult } from '@/types/api'

interface ParsedTaskPreviewProps {
  result: ParsedVoiceResult
  onClose: () => void
}

const previewSchema = zod.object({
  tasks: zod.array(
    zod.object({
      title: zod.string().min(1, 'Title is required'),
      due_date: zod.string().optional().nullable(),
      due_time: zod.string().optional().nullable(),
      recurrence: zod.enum(['none', 'interval', 'daily', 'weekly']),
      interval_minutes: zod.number().optional().nullable(),
      notes: zod.array(zod.object({ text: zod.string() })),
      ambiguous_fields: zod.array(zod.string()),
    })
  ),
})

type PreviewFormValues = zod.infer<typeof previewSchema>

export function ParsedTaskPreview({ result, onClose }: ParsedTaskPreviewProps) {
  const createMutation = useCreateTask()
  const [success, setSuccess] = useState(false)

  // On mount, speak a prompt to nudge the user to review ambiguous fields.
  useEffect(() => {
    const hasAmbiguous = result.tasks.some((t) => t.ambiguous_fields && t.ambiguous_fields.length > 0)
    if (hasAmbiguous) {
      speakText('Please review the highlighted fields before saving.')
    }
    return () => {
      // Do not cancel speech here — VoicePanel's onClose handler does that.
    }
  }, [result.tasks])

  const {
    register,
    handleSubmit,
    control,
  } = useForm<PreviewFormValues>({
    resolver: zodResolver(previewSchema) as any,
    defaultValues: {
      tasks: result.tasks.map((t) => ({
        title: t.title,
        due_date: t.due_date || '',
        due_time: t.due_time || '',
        recurrence: t.recurrence,
        interval_minutes: t.interval_minutes,
        notes: t.notes || [],
        ambiguous_fields: t.ambiguous_fields || [],
      })),
    },
  })

  const { fields } = useFieldArray({
    control,
    name: 'tasks',
  })

  const onSubmit = async (values: PreviewFormValues) => {
    // Speak save-intent confirmation
    const count = values.tasks.length
    speakText(`Saving ${count} ${count === 1 ? 'task' : 'tasks'} now.`)

    try {
      for (const t of values.tasks) {
        let isoDue: string | null = null
        if (t.due_date) {
          const time = t.due_time || '12:00'
          isoDue = new Date(`${t.due_date}T${time}:00`).toISOString()
        }

        await createMutation.mutateAsync({
          title: t.title,
          due_at: isoDue,
          recurrence: t.recurrence,
          interval_minutes: t.recurrence === 'interval' ? t.interval_minutes : null,
          source: 'voice',
          notes: t.notes?.map((n: { text: string }, i: number) => ({ text: n.text, done: false, order_index: i })) || [],
        })
      }

      setSuccess(true)
      // Speak success confirmation after a short delay so the save toast doesn't overlap
      setTimeout(() => {
        speakText(`Done! Your ${count === 1 ? 'task has' : 'tasks have'} been saved.`)
      }, 600)
    } catch {
      // Handled by react-query error toasts
      cancelSpeech()
    }
  }

  return (
    <Dialog.Root open={true} onOpenChange={(o: boolean) => { if (!o && !createMutation.isPending) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-bg-elevated border border-border p-6 shadow-2xl animate-fade-in focus:outline-none max-h-[90vh] overflow-y-auto">
          
          {success ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-success/15 border border-success/30 flex items-center justify-center text-success mx-auto">
                <CheckCircle size={32} />
              </div>
              <h2 className="text-xl font-bold text-text-primary">Tasks Imported Successfully!</h2>
              <p className="text-sm text-text-secondary max-w-sm mx-auto">
                All voice reminders have been processed and added to your dashboard.
              </p>
              <button onClick={onClose} className="btn-primary mt-4">
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-4">
                <Dialog.Title className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <Sparkles size={18} className="text-accent" /> Confirm Parsed Reminders
                </Dialog.Title>
                <Dialog.Close className="text-text-secondary hover:text-text-primary p-1 rounded-md hover:bg-white/5 transition-all">
                  <X size={18} />
                </Dialog.Close>
              </div>

              <p className="text-sm text-text-secondary mb-4">
                The AI has parsed the transcript. Review any fields marked as ambiguous and edit them before saving.
              </p>

              <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
                <div className="space-y-4">
                  {fields.map((field: any, idx: number) => {
                    const isAmbiguousDate = field.ambiguous_fields?.includes('due_date')
                    const isAmbiguousTime = field.ambiguous_fields?.includes('due_time')

                    return (
                      <div key={field.id} className="p-4 border border-border/60 rounded-xl bg-white/[0.01] space-y-4 relative">
                        <span className="absolute top-3 right-3 text-xs text-text-muted font-mono select-none">
                          Task #{idx + 1}
                        </span>

                        <div>
                          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                            Title
                          </label>
                          <input
                            type="text"
                            {...register(`tasks.${idx}.title` as const)}
                            className="input-field"
                            disabled={createMutation.isPending}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1 flex items-center gap-1">
                              Due Date
                              {isAmbiguousDate && (
                                <span title="Ambiguous from transcript">
                                  <AlertTriangle size={12} className="text-warning" />
                                </span>
                              )}
                            </label>
                            <input
                              type="date"
                              {...register(`tasks.${idx}.due_date` as const)}
                              className={`input-field [color-scheme:dark] ${isAmbiguousDate ? 'border-warning/50 focus:ring-warning/50' : ''}`}
                              disabled={createMutation.isPending}
                            />
                            {isAmbiguousDate && (
                              <p className="text-[10px] text-warning mt-1">Please confirm this date</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1 flex items-center gap-1">
                              Due Time
                              {isAmbiguousTime && (
                                <span title="Ambiguous from transcript">
                                  <AlertTriangle size={12} className="text-warning" />
                                </span>
                              )}
                            </label>
                            <input
                              type="time"
                              {...register(`tasks.${idx}.due_time` as const)}
                              className={`input-field [color-scheme:dark] ${isAmbiguousTime ? 'border-warning/50 focus:ring-warning/50' : ''}`}
                              disabled={createMutation.isPending}
                            />
                            {isAmbiguousTime && (
                              <p className="text-[10px] text-warning mt-1">Please confirm this time</p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                              Recurrence
                            </label>
                            <select
                              {...register(`tasks.${idx}.recurrence` as const)}
                              className="input-field"
                              disabled={createMutation.isPending}
                            >
                              <option value="none">One-off</option>
                              <option value="interval">Interval</option>
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                            </select>
                          </div>

                          {field.recurrence === 'interval' && (
                            <div>
                              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                                Interval Minutes
                              </label>
                              <input
                                type="number"
                                {...register(`tasks.${idx}.interval_minutes` as const, { valueAsNumber: true })}
                                className="input-field"
                                disabled={createMutation.isPending}
                              />
                            </div>
                          )}
                        </div>

                        {field.notes && field.notes.length > 0 && (
                          <div className="space-y-1">
                            <span className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                              Parsed Notes
                            </span>
                            <ul className="list-disc pl-4 space-y-1">
                              {field.notes.map((note: any, nIdx: number) => (
                                <li key={nIdx} className="text-xs text-text-secondary">
                                  {note.text}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )
                  })}
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
                    {createMutation.isPending ? 'Saving...' : 'Confirm & Save'}
                  </button>
                </div>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
