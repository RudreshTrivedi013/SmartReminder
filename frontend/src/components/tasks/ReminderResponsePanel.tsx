import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { Mic, MicOff, Send, X, Loader2, CheckCircle2, AlertTriangle, Play, Activity } from 'lucide-react'
import toast from 'react-hot-toast'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { activitiesApi } from '@/api/activities'
import { ACTIVITIES_KEY } from '@/hooks/useActivities'
import { parseApiError } from '@/lib/utils'
import type { ActivityType, ReminderActivity } from '@/types/api'
// ── Intent badge config ──────────────────────────────────────────────────────
const INTENT_CONFIG: Partial<Record<
  ActivityType,
  { label: string; color: string; icon: React.ReactNode }
>> = {
  started: {
    label: 'Started',
    color: 'text-accent border-accent/30 bg-accent/10',
    icon: <Play size={12} fill="currentColor" />,
  },
  working: {
    label: 'In Progress',
    color: 'text-primary border-primary/30 bg-primary/10',
    icon: <Activity size={12} />,
  },
  completed: {
    label: 'Completed',
    color: 'text-success border-success/30 bg-success/10',
    icon: <CheckCircle2 size={12} />,
  },
  blocked: {
    label: 'Blocked',
    color: 'text-danger border-danger/30 bg-danger/10',
    icon: <AlertTriangle size={12} />,
  },
  status_update: {
    label: 'Status Update',
    color: 'text-text-secondary border-border bg-white/5',
    icon: <Activity size={12} />,
  },
}
// ── Example hints ─────────────────────────────────────────────────────────────
const HINTS = [
  'I completed login',
  "I'm working on authentication",
  'Started frontend',
  "Blocked because Docker won't start",
  'Finished backend',
]
// ── Result card shown after a successful submit ───────────────────────────────
function ActivityResultCard({ result, onClose }: { result: ReminderActivity; onClose: () => void }) {
  const cfg = INTENT_CONFIG[result.activity_type] ?? INTENT_CONFIG.status_update!
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-3 p-4 rounded-xl border border-success/20 bg-success/5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-success/15 flex items-center justify-center text-success">
            <CheckCircle2 size={15} />
          </div>
          <span className="text-sm font-semibold text-text-primary">Activity Saved</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all"
        >
          <X size={14} />
        </button>
      </div>
      <div className="space-y-1.5 pl-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}
          >
            {cfg.icon}
            {cfg.label}
          </span>
          <span className="text-sm text-text-primary font-medium">{result.task_title}</span>
        </div>
        {result.optional_notes && (
          <p className="text-xs text-text-secondary italic pl-1">{result.optional_notes}</p>
        )}
        <p className="text-xs text-text-muted">
          via {result.source} · {new Date(result.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </motion.div>
  )
}
// ── Main panel ────────────────────────────────────────────────────────────────
interface ReminderResponsePanelProps {
  taskId?: string
  onClose: () => void
}
export function ReminderResponsePanel({ taskId, onClose }: ReminderResponsePanelProps) {
  const queryClient = useQueryClient()
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
  const [inputMode, setInputMode] = useState<'idle' | 'voice' | 'text'>('idle')
  const [textInput, setTextInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<ReminderActivity | null>(null)
  const [hintIndex, setHintIndex] = useState(Math.floor(Math.random() * HINTS.length))
  // The effective text: voice transcript OR typed text depending on mode
  const effectiveText = inputMode === 'voice' ? transcript.trim() : textInput.trim()
  const canSubmit = effectiveText.length > 0 && !isSubmitting && !isRecording
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
  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    const text = effectiveText
    const source = inputMode === 'voice' ? 'voice' : 'text'
    setIsSubmitting(true)
    try {
      const activity = await activitiesApi.submit({
        text,
        source,
        task_id: taskId ?? null,
      })
      setResult(activity)
      queryClient.invalidateQueries({ queryKey: ACTIVITIES_KEY })
      const cfg = INTENT_CONFIG[activity.activity_type] ?? INTENT_CONFIG.status_update!
      toast.success(`${cfg.label}: ${activity.task_title}`)
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setIsSubmitting(false)
    }
  }, [canSubmit, effectiveText, inputMode, queryClient, taskId])
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }
  const handleReset = () => {
    setResult(null)
    resetTranscript()
    setTextInput('')
    setInputMode('idle')
    setHintIndex((i) => (i + 1) % HINTS.length)
  }
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      <div className="border-t border-border/30 pt-3 mt-1 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Update Status
          </span>
          <button
            onClick={onClose}
            className="p-0.5 rounded text-text-muted hover:text-text-primary transition-all"
          >
            <X size={13} />
          </button>
        </div>
        {/* Result card (shown after submission) */}
        <AnimatePresence>
          {result && (
            <ActivityResultCard
              result={result}
              onClose={() => {
                handleReset()
                onClose()
              }}
            />
          )}
        </AnimatePresence>
        {/* Input area (hidden after result) */}
        {!result && (
          <>
            {/* Text area */}
            <div className="relative">
              <textarea
                id={`reminder-response-${taskId ?? 'new'}`}
                value={inputMode === 'voice' ? transcript : textInput}
                onChange={(e) => {
                  setTextInput(e.target.value)
                  setInputMode('text')
                }}
                onFocus={handleTextFocus}
                onKeyDown={handleKeyDown}
                rows={2}
                disabled={isSubmitting}
                placeholder={
                  isRecording
                    ? 'Listening… speak your update'
                    : `e.g. "${HINTS[hintIndex]}"`
                }
                className="input-field resize-none text-sm pr-10 transition-all duration-200 placeholder:text-text-muted/60"
              />
              {/* Live interim transcript overlay */}
              {isRecording && interimTranscript && (
                <p className="absolute bottom-2 left-3 right-10 text-xs text-text-muted italic pointer-events-none truncate">
                  {interimTranscript}
                </p>
              )}
            </div>
            {/* Controls row */}
            <div className="flex items-center gap-2">
              {/* Mic button */}
              {isMicSupported && (
                <div className="relative shrink-0">
                  {isRecording && (
                    <span className="absolute inset-0 rounded-full bg-danger/20 animate-ping" />
                  )}
                  <button
                    id={`mic-btn-${taskId ?? 'new'}`}
                    onClick={handleToggleMic}
                    disabled={isSubmitting}
                    title={isRecording ? 'Stop recording' : 'Speak your update'}
                    className={`relative w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-200 ${
                      isRecording
                        ? 'bg-danger border-danger/40 text-white shadow-lg shadow-danger/20'
                        : 'bg-white/5 border-border text-text-secondary hover:bg-white/10 hover:border-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
                  </button>
                </div>
              )}
              {/* Recording badge */}
              {isRecording && (
                <span className="text-xs text-danger font-semibold animate-pulse tracking-wide">
                  Listening…
                </span>
              )}
              {/* Spacer */}
              <div className="flex-1" />
              {/* Clear */}
              {effectiveText && !isSubmitting && (
                <button
                  onClick={handleReset}
                  className="text-xs text-text-muted hover:text-text-secondary transition-all px-2 py-1"
                >
                  Clear
                </button>
              )}
              {/* Submit */}
              <button
                id={`submit-activity-${taskId ?? 'new'}`}
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="btn-primary py-1.5 px-4 text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Submit
                  </>
                )}
              </button>
            </div>
            {/* Hint pills */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {(['started', 'working', 'completed', 'blocked'] as ActivityType[]).map((intent) => {
                const cfg = INTENT_CONFIG[intent]
                return (
                  <button
                    key={intent}
                    onClick={() => {
                      if (isRecording) stopRecording()
                      setInputMode('text')
                      setTextInput(
                        intent === 'started'
                          ? 'Started '
                          : intent === 'working'
                          ? "I'm working on "
                          : intent === 'completed'
                          ? 'Completed '
                          : "I'm blocked because "
                      )
                      // focus textarea
                      document
                        .getElementById(`reminder-response-${taskId ?? 'new'}`)
                        ?.focus()
                    }}
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all hover:opacity-80 ${cfg?.color}`}
                  >
                    {cfg?.icon}
                    {cfg?.label}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
