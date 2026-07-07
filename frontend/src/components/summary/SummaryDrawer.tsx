import { useState } from 'react'
import { summaryApi } from '@/api/summary'
import { parseApiError } from '@/lib/utils'
import type { DaySummary } from '@/types/api'
import toast from 'react-hot-toast'
import {
  Sparkles, Loader2, BarChart2, Zap, AlertTriangle, Lightbulb, Clock
} from 'lucide-react'

interface SummaryDrawerProps {
  /**
   * Pre-filled summary received via push notification or WebSocket event.
   * When provided the drawer renders the data immediately without needing
   * the user to click "Generate Summary".
   */
  initialSummary?: DaySummary | null
}

export function SummaryDrawer({ initialSummary }: SummaryDrawerProps = {}) {
  const [generating, setGenerating] = useState(false)
  const [summary, setSummary] = useState<DaySummary | null>(initialSummary ?? null)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(initialSummary ? new Date() : null)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const data = await summaryApi.trigger()
      setSummary(data)
      setGeneratedAt(new Date())
      toast.success('Day-end summary generated!')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-text-primary tracking-tight">Day-End AI Summary</h2>
          <p className="text-sm text-text-secondary">Get an encouraging structured review of today's progress.</p>
        </div>

        <button
          onClick={handleGenerate}
          className="btn-primary flex items-center gap-2"
          disabled={generating}
        >
          {generating ? (
            <>
              <Loader2 className="animate-spin h-4 w-4" /> Generating...
            </>
          ) : (
            <>
              <Sparkles size={16} /> {summary ? 'Regenerate' : 'Generate Summary'}
            </>
          )}
        </button>
      </div>

      {generating && (
        <div className="glass-card p-12 text-center flex flex-col items-center justify-center space-y-4">
          <Loader2 className="animate-spin h-10 w-10 text-primary" />
          <h3 className="text-base font-semibold text-text-primary">Generating Summary</h3>
          <p className="text-sm text-text-secondary max-w-sm">
            Groq is analyzing your completed tasks, open deadlines, and today's activity log...
          </p>
        </div>
      )}

      {!generating && !summary && (
        <div className="glass-card p-12 text-center flex flex-col items-center justify-center space-y-4 border border-dashed border-border/50">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <BarChart2 size={28} />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">No summary generated yet</h3>
          <p className="text-sm text-text-secondary max-w-sm">
            Click the button above to analyze today's completion rates, snooze counters, and layout your plan for tomorrow.
          </p>
        </div>
      )}

      {summary && !generating && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Overview */}
            <div className="glass-card p-5 space-y-2 border-t-2 border-t-primary">
              <div className="flex items-center gap-2 text-primary">
                <BarChart2 size={18} />
                <h3 className="font-bold text-sm tracking-wide uppercase">Today's Overview</h3>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{summary.summary}</p>
            </div>

            {/* Highlight */}
            <div className="glass-card p-5 space-y-2 border-t-2 border-t-success">
              <div className="flex items-center gap-2 text-success">
                <Zap size={18} />
                <h3 className="font-bold text-sm tracking-wide uppercase">⭐ Highlight</h3>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{summary.highlight}</p>
            </div>

            {/* Concerns */}
            <div className="glass-card p-5 space-y-2 border-t-2 border-t-warning bg-warning/[0.01]">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle size={18} />
                <h3 className="font-bold text-sm tracking-wide uppercase">⚠️ Concern</h3>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{summary.concern}</p>
            </div>

            {/* Tomorrow's Suggestion */}
            <div className="glass-card p-5 space-y-2 border-t-2 border-t-accent">
              <div className="flex items-center gap-2 text-accent">
                <Lightbulb size={18} />
                <h3 className="font-bold text-sm tracking-wide uppercase">🌅 Tomorrow's Plan</h3>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{summary.tomorrow_suggestion}</p>
            </div>
          </div>

          {generatedAt && (
            <div className="flex items-center justify-end gap-1.5 text-xs text-text-muted select-none font-mono">
              <Clock size={12} />
              Generated today at {generatedAt.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
