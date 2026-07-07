import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Clock, Check } from 'lucide-react'

interface SnoozePopoverProps {
  onSnooze: (minutes: number) => void
  disabled?: boolean
}

const SNOOZE_OPTIONS = [
  { label: '10 Minutes', value: 10 },
  { label: '30 Minutes', value: 30 },
  { label: '1 Hour', value: 60 },
  { label: '4 Hours', value: 240 },
]

export function SnoozePopover({ onSnooze, disabled }: SnoozePopoverProps) {
  const [open, setOpen] = useState(false)
  const [customVal, setCustomVal] = useState('')

  const handleSelectOption = (mins: number) => {
    onSnooze(mins)
    setOpen(false)
  }

  const handleCustomSnooze = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseInt(customVal, 10)
    if (!isNaN(parsed) && parsed > 0) {
      onSnooze(parsed)
      setOpen(false)
      setCustomVal('')
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          disabled={disabled}
          className="p-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-white/5 disabled:opacity-50 transition-all flex items-center gap-1.5"
          title="Snooze Reminder"
        >
          <Clock size={16} />
          <span className="text-xs font-medium">Snooze</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-56 rounded-xl p-3 bg-bg-elevated border border-border shadow-2xl animate-fade-in focus:outline-none"
          sideOffset={5}
        >
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-text-muted px-2 mb-2 tracking-wider uppercase">
              Snooze Duration
            </h3>
            {SNOOZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSelectOption(opt.value)}
                className="w-full text-left px-2 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-md transition-all"
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="border-t border-border/50 my-2 pt-2">
            <form onSubmit={handleCustomSnooze} className="flex gap-2 items-center">
              <input
                type="number"
                value={customVal}
                onChange={(e) => setCustomVal(e.target.value)}
                placeholder="Custom min"
                className="w-full text-xs bg-bg-surface border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary text-text-primary"
                min="1"
              />
              <button
                type="submit"
                className="p-1 rounded-md bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary transition-all"
              >
                <Check size={14} />
              </button>
            </form>
          </div>

          <Popover.Arrow className="fill-border" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
