import { useState, useCallback, useRef, useEffect } from 'react'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { companionApi } from '@/api/companion'
import { Mic, MicOff, Send, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { parseApiError } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'

export function CompanionCommandBar() {
  const {
    isSupported,
    isRecording,
    transcript,
    interimTranscript,
    startRecording,
    stopRecording,
    resetTranscript,
    speakText
  } = useVoiceInput()

  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [latestReply, setLatestReply] = useState<string | null>(null)
  
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync voice transcript to text input
  useEffect(() => {
    if (isRecording) {
      setText(transcript + (interimTranscript ? ` ${interimTranscript}` : ''))
    } else if (transcript && !text) {
      setText(transcript)
    }
  }, [transcript, interimTranscript, isRecording, text])

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    const content = text.trim()
    if (!content || isSubmitting) return

    setIsSubmitting(true)
    if (isRecording) stopRecording()

    try {
      const messages = await companionApi.chat({ content, task_id: null })
      const assistantMessage = messages.find(m => m.role === 'assistant')
      
      if (assistantMessage) {
        setLatestReply(assistantMessage.content)
        speakText(assistantMessage.content)
      }
      
      setText('')
      resetTranscript()
      
      // Refresh tasks to reflect any updates (e.g. create/complete/update)
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['currentTask'] })
      
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setIsSubmitting(false)
      inputRef.current?.focus()
    }
  }, [text, isSubmitting, isRecording, stopRecording, resetTranscript, speakText, queryClient])

  const handleToggleRecord = useCallback(() => {
    if (isRecording) {
      stopRecording()
      handleSubmit()
    } else {
      resetTranscript()
      setText('')
      startRecording()
    }
  }, [isRecording, stopRecording, startRecording, resetTranscript, handleSubmit])

  return (
    <div className="w-full space-y-3">
      {latestReply && (
        <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg text-sm text-accent animate-in fade-in slide-in-from-bottom-2">
          <span className="font-semibold">Aria: </span>
          {latestReply}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isSubmitting}
            placeholder="Tell Aria what you're working on, e.g. 'Start backend' or 'Create a task...'"
            className="input-field w-full pr-12 py-3"
          />
          {isSupported && (
            <button
              type="button"
              onClick={handleToggleRecord}
              disabled={isSubmitting}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors ${
                isRecording 
                  ? 'text-danger bg-danger/10 hover:bg-danger/20 animate-pulse' 
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
        </div>
        
        <button
          type="submit"
          disabled={!text.trim() || isSubmitting}
          className="btn-primary py-3 px-4 flex items-center justify-center min-w-[3rem]"
        >
          {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  )
}
