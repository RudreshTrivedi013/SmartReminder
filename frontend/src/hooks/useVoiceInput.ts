import { useState, useRef, useCallback, useEffect } from 'react'

// ── SpeechSynthesis helper ────────────────────────────────────────────────

const isSpeechSynthesisSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window

/**
 * Speak `text` aloud using the Web Speech API SpeechSynthesis.
 * Cancels any ongoing speech first so new utterances are never queued behind
 * a stale one.  Safe to call if SpeechSynthesis is unavailable — no-ops.
 */
export function speakText(text: string, rate = 1, pitch = 1): void {
  if (!isSpeechSynthesisSupported) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = rate
  utterance.pitch = pitch
  utterance.lang = 'en-US'
  // Prefer a natural-sounding English voice if available
  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find(
    (v) => v.lang.startsWith('en') && !v.localService === false,
  ) ?? voices.find((v) => v.lang.startsWith('en'))
  if (preferred) utterance.voice = preferred
  window.speechSynthesis.speak(utterance)
}

export function cancelSpeech(): void {
  if (isSpeechSynthesisSupported) window.speechSynthesis.cancel()
}

// ── useVoiceInput hook ────────────────────────────────────────────────────

export function useVoiceInput() {
  const [isSupported] = useState(() =>
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
  )
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const recognitionRef = useRef<any>(null)

  const startRecording = useCallback(() => {
    if (!isSupported) return
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRec()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalText += result[0].transcript
        } else {
          interimText += result[0].transcript
        }
      }
      if (finalText) setTranscript((prev) => prev + finalText + ' ')
      setInterimTranscript(interimText)
    }

    recognition.onerror = () => setIsRecording(false)
    recognition.onend = () => {
      setIsRecording(false)
      setInterimTranscript('')
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
  }, [isSupported])

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop()
    setIsRecording(false)
  }, [])

  const resetTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
  }, [])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      cancelSpeech()
    }
  }, [])

  return {
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
  }
}
