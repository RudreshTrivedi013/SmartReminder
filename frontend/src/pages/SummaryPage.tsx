import { useSummaryStore } from '@/stores/summaryStore'
import { SummaryDrawer } from '@/components/summary/SummaryDrawer'

export default function SummaryPage() {
  const { pendingSummary } = useSummaryStore()

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-1 sm:px-0">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">Summary</h1>
        <p className="text-sm text-text-secondary mt-1">
          Review your day and prepare for tomorrow.
        </p>
      </div>
      <SummaryDrawer initialSummary={pendingSummary} />
    </div>
  )
}