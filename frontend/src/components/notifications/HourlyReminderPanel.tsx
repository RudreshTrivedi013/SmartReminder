import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ListPlus, Mic, MessageSquare, X } from 'lucide-react'
import { CheckinResponsePanel } from '@/components/companion/CheckinResponsePanel'
import { TaskCreateModal } from '@/components/tasks/TaskCreateModal'

interface HourlyReminderPanelProps {
  onClose: () => void
}

export function HourlyReminderPanel({ onClose }: HourlyReminderPanelProps) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'menu' | 'status'>('menu')
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  if (mode === 'status') {
    return <CheckinResponsePanel onClose={onClose} />
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 32, scale: 0.98 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="glass-card w-full max-w-md p-5 border border-border space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text-primary">Hourly Reminder</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-all"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="btn-ghost justify-start py-3 px-3 flex items-center gap-3 text-sm"
            >
              <ListPlus size={17} />
              Add Task
            </button>
            <button
              onClick={() => {
                onClose()
                navigate('/voice')
              }}
              className="btn-ghost justify-start py-3 px-3 flex items-center gap-3 text-sm"
            >
              <Mic size={17} />
              Add Task by Voice
            </button>
            <button
              onClick={() => setMode('status')}
              className="btn-primary justify-start py-3 px-3 flex items-center gap-3 text-sm"
            >
              <MessageSquare size={17} />
              Update Status
            </button>
          </div>
        </motion.div>
      </motion.div>

      <TaskCreateModal
        open={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false)
          onClose()
        }}
      />
    </>
  )
}
