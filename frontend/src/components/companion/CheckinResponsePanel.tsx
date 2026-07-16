/**
 * CheckinResponsePanel
 *
 * A full-screen overlay that appears when the user taps the hourly check-in
 * notification (or manually from any future "Check in" button).
 *
 * The user can:
 *  1. Quick-tap one of three status buttons (Productive / Average / Distracted).
 *  2. Speak their update using the mic (reuses useVoiceInput / Web Speech API).
 *  3. Type their update in the text area.
 *
 * On submit → POST /companion/checkin with status + transcript + source.
 */

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  MicOff,
  Send,
  X,
  Loader2,
  CheckCircle2,
  Zap,
  MinusCircle,
  XCircle,
  Volume2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { companionApi } from '@/api/companion'
import { tasksApi } from '@/api/tasks'
import { parseApiError } from '@/lib/utils'
import type { ProductivityStatus } from '@/types/companion'

// ── Status quick-pick config ─────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{
  value: ProductivityStatus
  label: string
  emoji: string
  color: string
  icon: React.ReactNode
}> = [
  {
    value: 'focused',
    label: 'Productive',
    emoji: '✅',
    color: 'text-success border-success/30 bg-success/10 hover:bg-success/20',
    icon: <CheckCircle2 size={16} />,
  },
  {
    value: 'idle',
    label: 'Average',
    emoji: '😐',
    color: 'text-warning border-warning/30 bg-warning/10 hover:bg-warning/20',
    icon: <MinusCircle size={16} />,
  },
  {
    value: 'distracted',
    label: 'Distracted',
    emoji: '❌',
    color: 'text-danger border-danger/30 bg-danger/10 hover:bg-danger/20',
    icon: <XCircle size={16} />,
  },
]

// ── Example voice hints ───────────────────────────────────────────────────────

const VOICE_HINTS = [
  '"I spent the last hour on authentication"',
  '"Was debugging Docker, got it working"',
  '"Finished the API integration, pretty focused"',
  '"Got a bit distracted by meetings"',
]

// ── Props ─────────────────────────────────────────────────────────────────────

interface CheckinResponsePanelProps {
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CheckinResponsePanel({ onClose }: CheckinResponsePanelProps) {
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

  const [selectedStatus, setSelectedStatus] = useState<ProductivityStatus | null>(null)
  const [textInput, setTextInput] = useState('')
  const [inputMode, setInputMode] = useState<'idle' | 'voice' | 'text'>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [hintIdx] = useState(() => Math.floor(Math.random() * VOICE_HINTS.length))
  const [showTaskPicker, setShowTaskPicker] = useState(false)
  const [availableTasks, setAvailableTasks] = useState<any[] | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const effectiveTranscript = inputMode === 'voice' ? transcript.trim() : textInput.trim()
  const canSubmit = selectedStatus !== null && !isSubmitting && !isRecording

  const handleToggleMic = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      cancelSpeech()
      setInputMode('voice')
      resetTranscript()
      setTextInput('')
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording, resetTranscript, cancelSpeech])

  const handleTextFocus = () => {
    if (isRecording) stopRecording()
    setInputMode('text')
  }

  const handleQuickStatus = (status: ProductivityStatus) => {
    setSelectedStatus((prev) => (prev === status ? null : status))
  }

  const handleSubmit = useCallback(async () => {
    if (!selectedStatus || isSubmitting) return
    const source = inputMode === 'voice' ? 'voice' : 'text'
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    setIsSubmitting(true)
    try {
      await companionApi.createCheckin({
        status: selectedStatus,
        start_at: oneHourAgo.toISOString(),
        end_at: now.toISOString(),
        transcript: effectiveTranscript || null,
        source: effectiveTranscript ? source : null,
        task_id: selectedTaskId ?? undefined,
      })

      const statusCfg = STATUS_OPTIONS.find((s) => s.value === selectedStatus)!
      toast.success(`${statusCfg.emoji} Check-in saved — ${statusCfg.label}`)
      setDone(true)

      // Auto-close after a brief moment
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedStatus, isSubmitting, inputMode, effectiveTranscript, onClose])

  return (
    // Backdrop
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="glass-card w-full max-w-md p-6 space-y-5 border border-border relative"
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                <Zap size={16} />
              </div>
              <h2 className="text-lg font-bold text-text-primary">Hourly Check-in</h2>
            </div>
            <p className="text-sm text-text-secondary pl-10">
              How was your last hour?
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Success state */}
        <AnimatePresence>
          {done && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-6 text-center"
            >
              <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center text-success">
                <CheckCircle2 size={28} />
              </div>
              <p className="text-base font-semibold text-text-primary">Check-in saved!</p>
              <p className="text-sm text-text-secondary">Keep up the great work 🚀</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input form (hidden when done) */}
        {!done && (
          <>
            {/* Quick status picker */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Select your status
              </p>
              <div className="grid grid-cols-3 gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleQuickStatus(opt.value)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all text-sm font-semibold ${
                      selectedStatus === opt.value
                        ? `${opt.color} ring-2 ring-offset-1 ring-offset-bg ring-current scale-[1.04]`
                        : 'text-text-secondary border-border bg-white/3 hover:bg-white/8'
                    }`}
                  >
                    {opt.icon}
                    <span className="text-xs leading-none">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Voice / text input */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Add context{' '}
                <span className="normal-case font-normal text-text-muted">(optional)</span>
              </p>

              <div className="relative">
                <textarea
                  id="checkin-voice-text"
                  value={inputMode === 'voice' ? transcript : textInput}
                  onChange={(e) => {
                    setTextInput(e.target.value)
                    setInputMode('text')
                  }}
                  onFocus={handleTextFocus}
                  rows={3}
                  disabled={isSubmitting}
                  placeholder={
                    isRecording
                      ? 'Listening… describe your last hour'
                      : VOICE_HINTS[hintIdx]
                  }
                  className="input-field resize-none text-sm pr-12 placeholder:text-text-muted/60"
                />

                {/* Mic button inside textarea */}
                {isMicSupported && (
                  <div className="absolute right-2 bottom-2">
                    <div className="relative">
                      {isRecording && (
                        <span className="absolute inset-0 rounded-full bg-danger/20 animate-ping" />
                      )}
                      <button
                        id="checkin-mic-btn"
                        onClick={handleToggleMic}
                        disabled={isSubmitting}
                        title={isRecording ? 'Stop recording' : 'Speak your update'}
                        className={`relative w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-200 ${
                          isRecording
                            ? 'bg-danger border-danger/40 text-white shadow-lg shadow-danger/25'
                            : 'bg-white/5 border-border text-text-secondary hover:bg-white/10 hover:text-text-primary'
                        }`}
                      >
                        {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Live interim text */}
                {isRecording && interimTranscript && (
                  <p className="absolute bottom-10 left-3 right-12 text-xs text-text-muted italic pointer-events-none truncate">
                    {interimTranscript}
                  </p>
                )}
              </div>

              {/* Recording status */}
              <div className="flex items-center gap-2 min-h-[20px]">
                {isRecording && (
                  <span className="flex items-center gap-1.5 text-xs text-danger font-semibold animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-danger inline-block" />
                    Listening…
                  </span>
                )}
                {inputMode === 'voice' && transcript && !isRecording && (
                  <span className="flex items-center gap-1.5 text-xs text-accent">
                    <Volume2 size={12} />
                    Voice transcript captured
                  </span>
                )}
                {effectiveTranscript && (
                  <button
                    onClick={() => {
                      resetTranscript()
                      setTextInput('')
                      setInputMode('idle')
                    }}
                    className="ml-auto text-xs text-text-muted hover:text-text-secondary transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 pt-1">
              <div className="mb-2">
                <button
                  onClick={() => setShowTaskPicker(true)}
                  className="text-xs text-text-muted hover:text-text-secondary"
                >
                  Attach existing task
                </button>
              </div>
              <button
                onClick={onClose}
                className="btn-ghost flex-1 py-2.5 text-sm"
              >
                Dismiss
              </button>
              <button
                id="submit-checkin-btn"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    Submit Check-in
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

  // Task picker modal
  useEffect(() => {
    let mounted = true
    if (!showTaskPicker) return
    ;(async () => {
      try {
        const list = await tasksApi.list(0, 50)
        if (!mounted) return
        setAvailableTasks(list.filter((t: any) => !['done', 'blocked'].includes(t.status)))
      } catch (err) {
        toast.error('Failed to load tasks')
        setAvailableTasks([])
      }
    })()
    return () => {
      mounted = false
    }
  }, [showTaskPicker])

  // Render modal
  if (showTaskPicker) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60"
          onClick={(e) => e.target === e.currentTarget && setShowTaskPicker(false)}
        >
          <motion.div className="glass-card w-full max-w-md p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Choose a task</h3>
              <button onClick={() => setShowTaskPicker(false)} className="text-text-muted">Close</button>
            </div>
            <div className="space-y-2 max-h-72 overflow-auto">
              {availableTasks === null ? (
                <p className="text-sm text-text-muted">Loading…</p>
              ) : availableTasks.length === 0 ? (
                <p className="text-sm text-text-muted">No open tasks found.</p>
              ) : (
                availableTasks.map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTaskId(String(t.id))
                      setShowTaskPicker(false)
                    }}
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
          </motion.div>
        </motion.div>
      </AnimatePresence>
    )
  }
