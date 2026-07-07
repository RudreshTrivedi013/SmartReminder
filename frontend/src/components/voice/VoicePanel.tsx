import { useState, useCallback } from 'react'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { voiceApi } from '@/api/voice'
import { ParsedTaskPreview } from './ParsedTaskPreview'
import { parseApiError } from '@/lib/utils'
import type { ParsedVoiceResult } from '@/types/api'
import toast from 'react-hot-toast'
import { Mic, MicOff, Sparkles, AlertCircle, Loader2, Volume2 } from 'lucide-react'

/**
 * Build a natural-language readback sentence for the parsed tasks.
 * Example: "I found 2 tasks: Call the dentist tomorrow at 3 PM, and Take vitamins daily at 8 AM. Should I save these?"
 */
function buildReadbackText(result: ParsedVoiceResult): string {
  const tasks = result.tasks
  if (tasks.length === 0) return 'I could not find any tasks in your transcript.'

  const count = tasks.length
  const taskList = tasks
    .map((t, i) => {
      let desc = t.title
      if (t.due_date && t.due_time) {
        desc += ` on ${t.due_date} at ${t.due_time}`
      } else if (t.due_date) {
        desc += ` on ${t.due_date}`
      }
      if (t.recurrence && t.recurrence !== 'none') {
        desc += ` (${t.recurrence})`
      }
      return i === tasks.length - 1 && tasks.length > 1 ? `and ${desc}` : desc
    })
    .join(', ')

  return `I found ${count} ${count === 1 ? 'task' : 'tasks'}: ${taskList}. Should I save ${count === 1 ? 'this' : 'these'}?`
}

export function VoicePanel() {
  const {
    isSupported,
    isRecording,
    transcript,
    interimTranscript,
    startRecording,
    stopRecording,
    resetTranscript,
    setTranscript,
    speakText,
    cancelSpeech,
  } = useVoiceInput()

  const [parsing, setParsing] = useState(false)
  const [parsedResult, setParsedResult] = useState<ParsedVoiceResult | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)

  const handleToggleRecord = () => {
    if (isRecording) {
      stopRecording()
    } else {
      cancelSpeech()
      startRecording()
    }
  }

  const handleParse = useCallback(async () => {
    if (!transcript.trim()) return
    setParsing(true)
    try {
      const data = await voiceApi.parseTranscript(transcript)

      // ── Readback: speak parsed tasks aloud before showing the confirmation modal ──
      const readback = buildReadbackText(data)
      setIsSpeaking(true)

      // Show result immediately; speech runs in parallel
      setParsedResult(data)
      toast.success('Transcript parsed successfully!')

      speakText(readback)

      // isSpeaking is cosmetic — reset after a generous timeout matching speech duration
      const approxMs = readback.length * 65
      setTimeout(() => setIsSpeaking(false), Math.min(approxMs, 12_000))
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setParsing(false)
    }
  }, [transcript, speakText])

  if (!isSupported) {
    return (
      <div className="p-8 text-center glass-card border border-dashed border-danger/20 bg-danger/5 space-y-4">
        <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center text-danger mx-auto">
          <AlertCircle size={24} />
        </div>
        <h3 className="text-lg font-bold text-text-primary">Voice Input Not Supported</h3>
        <p className="text-sm text-text-secondary max-w-md mx-auto">
          Your browser does not support the Web Speech API. Please use a modern browser (such as Google Chrome, Edge, or Safari) to use voice transcription features.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 flex flex-col items-center gap-6">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-bold text-text-primary">Speak Your Reminder</h2>
          <p className="text-sm text-text-secondary max-w-sm">
            Speak naturally. e.g. "Remind me to drop off dry cleaning tomorrow at 10 AM and call Sarah in 3 hours"
          </p>
        </div>

        {/* Recording Button */}
        <div className="relative">
          {isRecording && (
            <span className="absolute inset-0 rounded-full bg-danger/25 animate-ping" />
          )}
          <button
            onClick={handleToggleRecord}
            className={`w-20 h-20 rounded-full flex items-center justify-center border transition-all duration-300 relative z-10 ${
              isRecording
                ? 'bg-danger border-danger/30 text-white shadow-glow hover:bg-danger/80'
                : 'bg-white/5 border-border hover:bg-white/10 hover:border-text-secondary text-text-primary'
            }`}
          >
            {isRecording ? <MicOff size={28} /> : <Mic size={28} />}
          </button>
        </div>

        {/* Live Audio Status */}
        {isRecording && (
          <span className="text-xs font-semibold text-danger animate-pulse tracking-widest uppercase">
            Listening…
          </span>
        )}

        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="flex items-center gap-2 text-accent text-xs font-semibold animate-pulse">
            <Volume2 size={14} />
            Speaking parsed tasks…
          </div>
        )}

        {/* Text Area containing draft transcript */}
        <div className="w-full space-y-2">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Draft Transcript
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="input-field min-h-[140px] resize-none text-sm"
            placeholder="Your spoken transcript will appear here. You can also edit it manually before parsing."
            disabled={parsing}
          />
          {interimTranscript && (
            <p className="text-xs text-text-secondary italic pl-1">
              {interimTranscript}
            </p>
          )}
        </div>

        <div className="flex gap-3 w-full">
          <button
            onClick={resetTranscript}
            className="btn-ghost flex-1 py-2.5"
            disabled={!transcript || parsing}
          >
            Clear
          </button>
          <button
            onClick={handleParse}
            className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2"
            disabled={!transcript.trim() || parsing || isRecording}
          >
            {parsing ? (
              <>
                <Loader2 className="animate-spin h-5 w-5" /> Parsing...
              </>
            ) : (
              <>
                <Sparkles size={16} /> Parse Transcript
              </>
            )}
          </button>
        </div>
      </div>

      {parsedResult && (
        <ParsedTaskPreview
          result={parsedResult}
          onClose={() => {
            cancelSpeech()
            setParsedResult(null)
            setIsSpeaking(false)
          }}
        />
      )}
    </div>
  )
}
