import api from './axios'
import type { ParsedVoiceResult } from '@/types/api'

export const voiceApi = {
  parseTranscript: (transcript: string) =>
    api.post<ParsedVoiceResult>('/tasks/parse-voice', { transcript }).then((r) => r.data),
}
