/**
 * HourlyReminderPanel — 2-step wizard
 *
 * Step 1 → Status Update  (voice / text check-in with quick-pick status)
 * Step 2 → Create Task    (voice via AI-parse  OR  manual text form)
 *
 * After both steps (or skipping step 2), the panel closes automatically.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Zap,
  CheckCircle2,
  MinusCircle,
  XCircle,
  Mic,
  MicOff,
  Send,
  Loader2,
  Volume2,
  ChevronRight,
  ListPlus,
  Sparkles,
  ArrowLeft,
  SkipForward,
  PenLine,
} from 'lucide-react'
import { companionApi } from '@/api/companion'
import type { HourlyCheckinReminder } from '@/types/companion'
import toast from 'react-hot-toast'
import { tasksApi } from '@/api/tasks'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { voiceApi } from '@/api/voice'
import { useCreateTask } from '@/hooks/useTasks'
import { parseApiError } from '@/lib/utils'
import { CHECKIN_REMINDERS_KEY } from '@/hooks/useCheckinReminders'
import type { ProductivityStatus } from '@/types/companion'
import type { Task, ParsedVoiceResult } from '@/types/api'
import { ParsedTaskPreview } from '@/components/voice/ParsedTaskPreview'
import { TaskEditModal } from '@/components/tasks/TaskEditModal'

// ── Types ────────────────────────────────────────────────────────────────────

interface HourlyReminderPanelProps {
  onClose: () => void
  reminderId?: string
}

type Step = 'status' | 'task'
type TaskMode = 'pick' | 'voice' | 'text' | 'preview'

// ── Status options ────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{
  value: ProductivityStatus
  label: string
  emoji: string
  color: string
  icon: React.ReactNode
  description: string
}> = [
  {
    value: 'focused',
    label: 'Productive',
    emoji: '✅',
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20',
    icon: <CheckCircle2 size={18} />,
    description: 'On a roll!',
  },
  {
    value: 'idle',
    label: 'Average',
    emoji: '😐',
    color: 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20',
    icon: <MinusCircle size={18} />,
    description: 'Getting by',
  },
  {
    value: 'distracted',
    label: 'Distracted',
    emoji: '❌',
    color: 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20',
    icon: <XCircle size={18} />,
    description: 'Off track',
  },
]

// ── Step indicator ─────────────────────────────────────────────────────────

function StepDots({ current }: { current: Step }) {
  const steps: Step[] = ['status', 'task']
  return (
    <div className="flex items-center gap-2 justify-center">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              s === current
                ? 'bg-accent w-5 scale-110'
                : steps.indexOf(current) > i
                ? 'bg-success'
                : 'bg-white/15'
            }`}
          />
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function HourlyReminderPanel({ onClose, reminderId }: HourlyReminderPanelProps) {
  const [step, setStep] = useState<Step>('status')
  const [taskMode, setTaskMode] = useState<TaskMode>('pick')
  const [parsedResult, setParsedResult] = useState<ParsedVoiceResult | null>(null)

  const [recentTask, setRecentTask] = useState<Task | null>(null)
  const [recentTaskLoading, setRecentTaskLoading] = useState(false)
  const [isMarkingComplete, setIsMarkingComplete] = useState(false)
  const [isTaskEditOpen, setIsTaskEditOpen] = useState(false)

  // ── Step 1: Status state ─────────────────────────────────────────────────
  const [selectedStatus, setSelectedStatus] = useState<ProductivityStatus | null>(null)
  const [statusInputMode, setStatusInputMode] = useState<'idle' | 'voice' | 'text'>('idle')
  const [textInput, setTextInput] = useState('')
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false)
  const [statusDone, setStatusDone] = useState(false)
  // Pending checkin data (deferred submission until step 2 completes)
  const [pendingCheckin, setPendingCheckin] = useState<{
    status: ProductivityStatus
    start_at: string
    end_at: string
    transcript?: string | null
    source?: string | null
  } | null>(null)

  // Task selection state for attaching existing task
  const [showTaskPicker, setShowTaskPicker] = useState(false)
  const [availableTasks, setAvailableTasks] = useState<any[] | null>(null)
  const [missedReminder, setMissedReminder] = useState<HourlyCheckinReminder | null>(null)
  const [isLoadingReminder, setIsLoadingReminder] = useState(false)
  
  // ── Recent task support ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    setRecentTaskLoading(true)

    ;(async () => {
      try {
        const tasks = await tasksApi.recent(1)
        if (!mounted) return
        if (tasks.length > 0) {
          setRecentTask(tasks[0])
        }
      } catch {
        // ignored
      } finally {
        if (mounted) setRecentTaskLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const loadRecentTask = useCallback(async () => {
    try {
      setRecentTaskLoading(true)
      const tasks = await tasksApi.recent(1)
      setRecentTask(tasks.length > 0 ? tasks[0] : null)
    } catch {
      setRecentTask(null)
    } finally {
      setRecentTaskLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRecentTask()
  }, [loadRecentTask])

  useEffect(() => {
    if (!reminderId) {
      return
    }

    let mounted = true
    setIsLoadingReminder(true)

    ;(async () => {
      try {
        const reminder = await companionApi.getCheckinReminder(reminderId)
        if (!mounted) return
        setMissedReminder(reminder)
      } catch {
        // ignore failures, we still allow a normal checkin flow
      } finally {
        if (mounted) setIsLoadingReminder(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [reminderId])

  const handleUpdateRecentTask = () => {
    if (!recentTask) return
    setIsTaskEditOpen(true)
  }

  const handleMarkRecentTaskComplete = async () => {
    if (!recentTask || isMarkingComplete) return
    setIsMarkingComplete(true)
    try {
      await tasksApi.action(recentTask.id, {
        action: 'done',
        client_timestamp: new Date().toISOString(),
        snooze_minutes: null,
      })
      setRecentTask(null)
      toast.success('✅ Task marked as completed.')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setIsMarkingComplete(false)
    }
  }

  // ── Step 2: Voice-task state ─────────────────────────────────────────────
  const [isParsingVoice, setIsParsingVoice] = useState(false)

  // ── Step 2: Text-task state ─────────────────────────────────────────────
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueAt, setTaskDueAt] = useState('')
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const createTask = useCreateTask()
  const queryClient = useQueryClient()

  // ── Voice input (shared) ─────────────────────────────────────────────────
  const {
    isSupported: isMicSupported,
    isRecording,
    transcript,
    interimTranscript,
    startRecording,
    stopRecording,
    resetTranscript,
    cancelSpeech,
  } = useVoiceInput()

  const hintIdx = useRef(Math.floor(Math.random() * 4)).current
  const reminderLabel = missedReminder
    ? `Missed reminder from ${new Date(missedReminder.scheduled_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Hourly Check-in'
  const VOICE_HINTS = [
    '"Worked on the API integration, pretty focused"',
    '"Got distracted by Slack messages"',
    '"Finished the report, on a roll!"',
    '"Had a long meeting, not much deep work"',
  ]

  // ── Helpers ───────────────────────────────────────────────────────────────

  const effectiveTranscript = statusInputMode === 'voice' ? transcript.trim() : textInput.trim()

  const handleToggleMic = useCallback(() => {
    if (step === 'status') {
      if (isRecording) {
        stopRecording()
      } else {
        cancelSpeech()
        setStatusInputMode('voice')
        resetTranscript()
        setTextInput('')
        startRecording()
      }
    } else {
      // Step 2 voice recording for task creation
      if (isRecording) {
        stopRecording()
      } else {
        cancelSpeech()
        resetTranscript()
        startRecording()
      }
    }
  }, [step, isRecording, startRecording, stopRecording, resetTranscript, cancelSpeech])

  // ── Step 1: Submit status check-in ───────────────────────────────────────

  const handleSubmitStatus = useCallback(async () => {
    if (!selectedStatus || isSubmittingStatus) return
    const source = statusInputMode === 'voice' ? 'voice' : 'text'
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    // Defer submission until user finishes step 2 so we can attach a task_id
    setPendingCheckin({
      status: selectedStatus,
      start_at: oneHourAgo.toISOString(),
      end_at: now.toISOString(),
      transcript: effectiveTranscript || null,
      source: effectiveTranscript ? source : null,
    })

    const statusCfg = STATUS_OPTIONS.find((s) => s.value === selectedStatus)!
    toast.success(`${statusCfg.emoji} Check-in ready — ${statusCfg.label}`)
    setStatusDone(true)
    // Stop any ongoing recording before moving to step 2
    if (isRecording) stopRecording()
    setTimeout(() => {
      setStep('task')
      setTaskMode('pick')
    }, 600)
  }, [selectedStatus, isSubmittingStatus, statusInputMode, effectiveTranscript, isRecording, stopRecording])

  // ── Step 2: Parse voice transcript for task ───────────────────────────────

  const handleParseVoiceTask = useCallback(async () => {
    if (!transcript.trim()) return
    setIsParsingVoice(true)
    try {
      const data = await voiceApi.parseTranscript(transcript)
      setParsedResult(data)
      setTaskMode('preview')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setIsParsingVoice(false)
    }
  }, [transcript])

  // Submit the deferred checkin (called after task selection/creation or skip)
  const submitPendingCheckin = useCallback(
    async (taskId: string | null = null) => {
      if (!pendingCheckin) return
      setIsSubmittingStatus(true)
      try {
        console.debug('[HourlyReminderPanel] submitting checkin', { pendingCheckin, taskId, reminderId })
        await companionApi.createCheckin({
          status: pendingCheckin.status,
          start_at: pendingCheckin.start_at,
          end_at: pendingCheckin.end_at,
          transcript: pendingCheckin.transcript ?? null,
          source: pendingCheckin.source ?? null,
          task_id: taskId ?? undefined,
          reminder_id: reminderId ?? undefined,
        } as any)
        toast.success('✅ Check-in saved')
        setPendingCheckin(null)
        try {
          queryClient.invalidateQueries({ queryKey: CHECKIN_REMINDERS_KEY, exact: false })
        } catch (iqErr) {
          console.error('[HourlyReminderPanel] invalidateQueries failed', iqErr)
        }
        onClose()
      } catch (err) {
        console.error('[HourlyReminderPanel] submitPendingCheckin error', err)
        toast.error(parseApiError(err))
      } finally {
        setIsSubmittingStatus(false)
      }
    },
    [pendingCheckin, onClose, queryClient, reminderId]
  )

  // ── Step 2: Create task via text form ─────────────────────────────────────

  const handleCreateTextTask = useCallback(async () => {
    if (!taskTitle.trim()) return
    setIsCreatingTask(true)
    try {
      const created = await createTask.mutateAsync({
        title: taskTitle.trim(),
        due_at: taskDueAt ? new Date(taskDueAt).toISOString() : null,
        recurrence: 'none',
        interval_minutes: null,
        source: 'text',
        notes: [],
      })
      toast.success('Task created!')
      // Attach the created task to the pending checkin and submit
      await submitPendingCheckin(String(created.id))
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setIsCreatingTask(false)
    }
  }, [taskTitle, taskDueAt, createTask, onClose])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 28, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="glass-card w-full max-w-md border border-border shadow-2xl overflow-hidden"
        >
          {/* ── Gradient accent bar ── */}
          <div className="h-0.5 w-full bg-gradient-to-r from-accent/70 via-purple-500/60 to-accent/30" />

          <div className="p-5 space-y-5">
            {/* ── Header ── */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                  <Zap size={15} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-primary leading-tight">
                    {reminderLabel}
                  </h2>
                  <p className="text-[11px] text-text-muted">
                    {isLoadingReminder
                      ? 'Loading reminder…'
                      : step === 'status'
                      ? 'Step 1 of 2 — Status Update'
                      : 'Step 2 of 2 — Create Task'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-all"
              >
                <X size={15} />
              </button>
            </div>

            {/* ── Step dots ── */}
            <StepDots current={step} />

            {/* ── Step 1: Status Update ── */}
            <AnimatePresence mode="wait">
              {step === 'status' && (
                <motion.div
                  key="step-status"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <AnimatePresence>
                    {statusDone ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center gap-2 py-6 text-center"
                      >
                        <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                          <CheckCircle2 size={26} />
                        </div>
                        <p className="text-sm font-semibold text-text-primary">Check-in saved!</p>
                        <p className="text-xs text-text-muted">Moving to task creation…</p>
                      </motion.div>
                    ) : (
                      <>
                        {/* Quick status picker */}
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                            How was your last hour?
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {STATUS_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() =>
                                  setSelectedStatus((prev: ProductivityStatus | null) =>
                                    prev === opt.value ? null : opt.value
                                  )
                                }
                                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all text-sm font-semibold ${
                                  selectedStatus === opt.value
                                    ? `${opt.color} ring-2 ring-offset-1 ring-offset-bg-elevated ring-current scale-[1.04]`
                                    : 'text-text-secondary border-border bg-white/3 hover:bg-white/8'
                                }`}
                              >
                                {opt.icon}
                                <span className="text-[11px] leading-none">{opt.label}</span>
                                <span className="text-[10px] leading-none text-current opacity-60">
                                  {opt.description}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Context input */}
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                            Add context{' '}
                            <span className="normal-case font-normal text-text-muted">(optional)</span>
                          </p>
                          <div className="relative">
                            <textarea
                              value={statusInputMode === 'voice' ? transcript : textInput}
                              onChange={(e) => {
                                setTextInput(e.target.value)
                                setStatusInputMode('text')
                              }}
                              onFocus={() => {
                                if (isRecording) stopRecording()
                                setStatusInputMode('text')
                              }}
                              rows={2}
                              disabled={isSubmittingStatus}
                              placeholder={
                                isRecording
                                  ? 'Listening… describe your last hour'
                                  : VOICE_HINTS[hintIdx]
                              }
                              className="input-field resize-none text-sm pr-12 placeholder:text-text-muted/60"
                            />
                            {isMicSupported && (
                              <div className="absolute right-2 bottom-2">
                                <div className="relative">
                                  {isRecording && (
                                    <span className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                                  )}
                                  <button
                                    onClick={handleToggleMic}
                                    disabled={isSubmittingStatus}
                                    title={isRecording ? 'Stop recording' : 'Speak your update'}
                                    className={`relative w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-200 ${
                                      isRecording
                                        ? 'bg-red-500 border-red-400/40 text-white shadow-lg shadow-red-500/25'
                                        : 'bg-white/5 border-border text-text-secondary hover:bg-white/10 hover:text-text-primary'
                                    }`}
                                  >
                                    {isRecording ? <MicOff size={13} /> : <Mic size={13} />}
                                  </button>
                                </div>
                              </div>
                            )}
                            {isRecording && interimTranscript && (
                              <p className="absolute bottom-10 left-3 right-12 text-xs text-text-muted italic pointer-events-none truncate">
                                {interimTranscript}
                              </p>
                            )}
                          </div>

                          {recentTask && !recentTaskLoading && ['pending', 'in_progress'].includes(recentTask.status) && (
                            <div className="rounded-2xl border border-border/60 bg-white/5 p-4 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-wider text-text-secondary font-semibold">
                                    Recent Task
                                  </p>
                                  <p className="text-sm font-semibold text-text-primary mt-1">
                                    {recentTask.title}
                                  </p>
                                </div>
                                <div className="text-right text-[11px] text-text-muted">
                                  <div>
                                    {recentTask.status === 'in_progress' ? 'In Progress' : 'Pending'}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={handleMarkRecentTaskComplete}
                                  className="btn-ghost flex-1 py-2 text-sm border border-border hover:bg-white/5"
                                  disabled={isMarkingComplete}
                                >
                                  {isMarkingComplete ? 'Completing…' : 'Mark Complete'}
                                </button>
                                <button
                                  onClick={handleUpdateRecentTask}
                                  className="btn-primary flex-1 py-2 text-sm"
                                >
                                  Update
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Recording status row */}
                          <div className="flex items-center gap-2 min-h-[18px]">
                            {isRecording && (
                              <span className="flex items-center gap-1.5 text-[11px] text-red-400 font-semibold animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                                Listening…
                              </span>
                            )}
                            {statusInputMode === 'voice' && transcript && !isRecording && (
                              <span className="flex items-center gap-1.5 text-[11px] text-accent">
                                <Volume2 size={11} />
                                Voice captured
                              </span>
                            )}
                            {effectiveTranscript && (
                              <button
                                onClick={() => {
                                  resetTranscript()
                                  setTextInput('')
                                  setStatusInputMode('idle')
                                }}
                                className="ml-auto text-[11px] text-text-muted hover:text-text-secondary transition-all"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={onClose}
                            className="btn-ghost flex-1 py-2 text-sm"
                          >
                            Dismiss
                          </button>
                          <button
                            onClick={handleSubmitStatus}
                            disabled={!selectedStatus || isSubmittingStatus || isRecording}
                            className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isSubmittingStatus ? (
                              <>
                                <Loader2 size={14} className="animate-spin" /> Saving…
                              </>
                            ) : (
                              <>
                                <Send size={14} /> Save &amp; Next
                                <ChevronRight size={13} className="opacity-70" />
                              </>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* ── Step 2: Create Task ── */}
              {step === 'task' && (
                <motion.div
                  key="step-task"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <AnimatePresence mode="wait">

                    {/* ── Pick mode (Voice or Text) ── */}
                    {taskMode === 'pick' && (
                      <motion.div
                        key="pick"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        className="space-y-3"
                      >
                        <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                          Want to add a task?
                        </p>
                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            onClick={() => {
                              resetTranscript()
                              setTaskMode('voice')
                            }}
                            className="flex flex-col items-center gap-2 py-5 px-3 rounded-xl border border-border bg-white/3 hover:bg-accent/10 hover:border-accent/40 text-text-secondary hover:text-accent transition-all group"
                          >
                            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-all">
                              <Mic size={20} />
                            </div>
                            <div className="text-center">
                              <p className="text-xs font-semibold">By Voice</p>
                              <p className="text-[10px] text-text-muted mt-0.5">AI-powered</p>
                            </div>
                          </button>
                          <button
                            onClick={() => setTaskMode('text')}
                            className="flex flex-col items-center gap-2 py-5 px-3 rounded-xl border border-border bg-white/3 hover:bg-purple-500/10 hover:border-purple-500/40 text-text-secondary hover:text-purple-400 transition-all group"
                          >
                            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-all">
                              <PenLine size={20} />
                            </div>
                            <div className="text-center">
                              <p className="text-xs font-semibold">By Text</p>
                              <p className="text-[10px] text-text-muted mt-0.5">Quick form</p>
                            </div>
                          </button>
                        </div>
                        <div className="space-y-2">
                          <button
                            onClick={() => setShowTaskPicker(true)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm btn-ghost"
                          >
                            <ListPlus size={14} /> Choose existing task
                          </button>

                          <button
                            onClick={() => submitPendingCheckin(null)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-text-muted hover:text-text-secondary transition-all"
                          >
                            <SkipForward size={13} /> Skip — I'm done
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* ── Voice mode ── */}
                    {taskMode === 'voice' && (
                      <motion.div
                        key="voice"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="space-y-3"
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (isRecording) stopRecording()
                              setTaskMode('pick')
                            }}
                            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-white/5 transition-all"
                          >
                            <ArrowLeft size={14} />
                          </button>
                          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                            Speak your task
                          </p>
                        </div>

                        {/* Mic button */}
                        <div className="flex flex-col items-center gap-3 py-3">
                          <div className="relative">
                            {isRecording && (
                              <span className="absolute inset-0 rounded-full bg-red-500/25 animate-ping" />
                            )}
                            <button
                              onClick={handleToggleMic}
                              className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all duration-300 relative z-10 ${
                                isRecording
                                  ? 'bg-red-500 border-red-400/50 text-white shadow-xl shadow-red-500/30'
                                  : 'bg-white/5 border-border hover:bg-white/10 hover:border-text-secondary text-text-primary'
                              }`}
                            >
                              {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
                            </button>
                          </div>
                          {isRecording ? (
                            <span className="text-[11px] font-semibold text-red-400 animate-pulse tracking-widest uppercase">
                              Listening…
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted">Tap to start speaking</span>
                          )}
                        </div>

                        {/* Transcript area */}
                        <div className="space-y-1">
                          <textarea
                            value={transcript}
                            readOnly
                            rows={2}
                            placeholder='e.g. "Remind me to send the report tomorrow at 9 AM"'
                            className="input-field resize-none text-sm placeholder:text-text-muted/60"
                          />
                          {interimTranscript && (
                            <p className="text-[11px] text-text-muted italic pl-1">{interimTranscript}</p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (isRecording) stopRecording()
                              resetTranscript()
                              setTaskMode('pick')
                            }}
                            className="btn-ghost flex-1 py-2 text-sm"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleParseVoiceTask}
                            disabled={!transcript.trim() || isParsingVoice || isRecording}
                            className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isParsingVoice ? (
                              <>
                                <Loader2 size={14} className="animate-spin" /> Parsing…
                              </>
                            ) : (
                              <>
                                <Sparkles size={14} /> Parse &amp; Create
                              </>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* ── Text mode ── */}
                    {taskMode === 'text' && (
                      <motion.div
                        key="text"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="space-y-3"
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setTaskMode('pick')}
                            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-white/5 transition-all"
                          >
                            <ArrowLeft size={14} />
                          </button>
                          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                            New task
                          </p>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                              Task title *
                            </label>
                            <input
                              type="text"
                              value={taskTitle}
                              onChange={(e) => setTaskTitle(e.target.value)}
                              placeholder="e.g. Review project proposal"
                              className="input-field text-sm"
                              disabled={isCreatingTask}
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                              Due at <span className="normal-case font-normal text-text-muted">(optional)</span>
                            </label>
                            <input
                              type="datetime-local"
                              value={taskDueAt}
                              onChange={(e) => setTaskDueAt(e.target.value)}
                              className="input-field text-sm [color-scheme:dark]"
                              disabled={isCreatingTask}
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => setTaskMode('pick')}
                            className="btn-ghost flex-1 py-2 text-sm"
                            disabled={isCreatingTask}
                          >
                            Back
                          </button>
                          <button
                            onClick={handleCreateTextTask}
                            disabled={!taskTitle.trim() || isCreatingTask}
                            className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isCreatingTask ? (
                              <>
                                <Loader2 size={14} className="animate-spin" /> Creating…
                              </>
                            ) : (
                              <>
                                <ListPlus size={14} /> Create Task
                              </>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* ── Preview mode (after voice parse) ── */}
                    {taskMode === 'preview' && parsedResult && (
                      <motion.div
                        key="preview"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-2 space-y-2"
                      >
                        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent mx-auto">
                          <Sparkles size={20} />
                        </div>
                        <p className="text-sm font-semibold text-text-primary">
                          {parsedResult.tasks.length} task{parsedResult.tasks.length !== 1 ? 's' : ''} parsed!
                        </p>
                        <p className="text-xs text-text-muted">
                          Opening confirmation to review and save…
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>

      {/* ParsedTaskPreview dialog (renders on top of the panel) */}
      {parsedResult && taskMode === 'preview' && (
        <ParsedTaskPreview
          result={parsedResult}
          onClose={() => {
            setParsedResult(null)
            setTaskMode('pick')
            cancelSpeech()
            onClose()
          }}
        />
      )}
      {recentTask && isTaskEditOpen && (
        <TaskEditModal
          open={isTaskEditOpen}
          onClose={() => {
            setIsTaskEditOpen(false)
            loadRecentTask()
          }}
          task={recentTask}
        />
      )}
      {/* Task picker modal (renders on top when requested) */}
      {showTaskPicker && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50"
            onClick={(e) => e.target === e.currentTarget && setShowTaskPicker(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="glass-card w-full max-w-md p-4 border border-border"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Choose a task</h3>
                <button onClick={() => setShowTaskPicker(false)} className="text-text-muted">Close</button>
              </div>
              <TaskPickerContent />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}
    </>
  )
  
  // Task picker content (hookable inside component)
  function TaskPickerContent() {
    useEffect(() => {
      let mounted = true
      ;(async () => {
        try {
          const list = await tasksApi.list(0, 50)
          if (!mounted) return
          // Filter out completed/blocked tasks
          setAvailableTasks(list.filter((t: any) => !['done', 'blocked'].includes(t.status)))
        } catch (err) {
          toast.error('Failed to load tasks')
          setAvailableTasks([])
        }
      })()
      return () => {
        mounted = false
      }
    }, [])

    return (
      <div className="space-y-2 max-h-72 overflow-auto">
        {availableTasks === null ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : availableTasks.length === 0 ? (
          <p className="text-sm text-text-muted">No open tasks found.</p>
        ) : (
          availableTasks.map((t: any) => (
            <button
              key={t.id}
              onClick={() => submitPendingCheckin(String(t.id))}
              className="w-full text-left p-2 rounded hover:bg-white/5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-text-primary">{t.title}</div>
                  <div className="text-xs text-text-muted">{t.status}</div>
                </div>
                <div className="text-xs text-text-muted">Select</div>
              </div>
            </button>
          ))
        )}
      </div>
    )
  }}
