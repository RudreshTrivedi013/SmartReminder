import { useState, useEffect } from 'react'
import { summaryApi } from '@/api/summary'
import { parseApiError } from '@/lib/utils'
import type { DailySummaryOut } from '@/types/api'
import toast from 'react-hot-toast'
import { Calendar, Loader2, Zap, AlertTriangle, Lightbulb, Clock } from 'lucide-react'

export function SummaryHistory() {
  const [summaries, setSummaries] = useState<DailySummaryOut[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const LIMIT = 10

  const fetchHistory = async (currentOffset: number, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)

    try {
      const data = await summaryApi.getHistory(LIMIT, currentOffset)
      if (append) {
        setSummaries((prev) => [...prev, ...data.summaries])
      } else {
        setSummaries(data.summaries)
      }
      setTotal(data.total)
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      if (append) setLoadingMore(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory(0)
  }, [])

  const handleLoadMore = () => {
    const nextOffset = offset + LIMIT
    setOffset(nextOffset)
    fetchHistory(nextOffset, true)
  }

  if (loading && summaries.length === 0) {
    return (
      <div className="space-y-4 pt-8">
        <h2 className="text-lg font-bold text-text-primary tracking-tight flex items-center gap-2">
          <Calendar size={18} /> Past Summaries
        </h2>
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="glass-card p-5 space-y-4 animate-pulse">
              <div className="h-4 bg-white/5 rounded w-1/4"></div>
              <div className="space-y-2">
                <div className="h-3 bg-white/5 rounded w-full"></div>
                <div className="h-3 bg-white/5 rounded w-5/6"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (summaries.length === 0) {
    return (
      <div className="space-y-4 pt-8">
        <h2 className="text-lg font-bold text-text-primary tracking-tight flex items-center gap-2">
          <Calendar size={18} /> Past Summaries
        </h2>
        <div className="p-8 text-center text-sm text-text-muted border border-dashed border-border/50 rounded-xl bg-bg-surface">
          No past summaries available yet.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-8">
      <h2 className="text-lg font-bold text-text-primary tracking-tight flex items-center gap-2">
        <Calendar size={18} /> Past Summaries
      </h2>

      <div className="space-y-6">
        {summaries.map((s) => {
          const dateObj = new Date(s.date)
          const formattedDate = dateObj.toLocaleDateString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })

          return (
            <div key={s.id} className="glass-card p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-border/30 pb-3">
                <h3 className="font-bold text-sm text-text-primary">{formattedDate}</h3>
                <span className="text-xs text-text-muted flex items-center gap-1">
                  <Clock size={12} /> {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-text-secondary leading-relaxed">{s.content.summary}</p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Highlight */}
                  <div className="bg-success/5 border border-success/10 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-success mb-1">
                      <Zap size={14} />
                      <span className="font-bold text-xs uppercase tracking-wider">Highlight</span>
                    </div>
                    <p className="text-sm text-success/90">{s.content.highlight}</p>
                  </div>
                  
                  {/* Concern */}
                  <div className="bg-warning/5 border border-warning/10 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-warning mb-1">
                      <AlertTriangle size={14} />
                      <span className="font-bold text-xs uppercase tracking-wider">Concern</span>
                    </div>
                    <p className="text-sm text-warning/90">{s.content.concern}</p>
                  </div>
                </div>

                {/* Suggestion */}
                <div className="bg-accent/5 border border-accent/10 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-accent mb-1">
                    <Lightbulb size={14} />
                    <span className="font-bold text-xs uppercase tracking-wider">Tomorrow's Plan</span>
                  </div>
                  <p className="text-sm text-accent/90">{s.content.tomorrow_suggestion}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {summaries.length < total && (
        <div className="pt-4 flex justify-center">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="btn-secondary py-2 px-6 flex items-center gap-2"
          >
            {loadingMore && <Loader2 className="animate-spin h-4 w-4" />}
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  )
}
