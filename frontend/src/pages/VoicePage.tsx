import { VoicePanel } from '@/components/voice/VoicePanel'

export default function VoicePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Voice Input</h1>
        <p className="text-sm text-text-secondary">
          Transcribe and automatically schedule tasks using AI voice recognition.
        </p>
      </div>

      <VoicePanel />
    </div>
  )
}
