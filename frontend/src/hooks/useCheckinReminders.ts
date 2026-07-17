import { useQuery } from '@tanstack/react-query'
import { companionApi } from '@/api/companion'
import type { HourlyCheckinReminder } from '@/types/companion'

export const CHECKIN_REMINDERS_KEY = ['checkinReminders'] as const

export function useCheckinReminders(today = true, limit = 50) {
  return useQuery<HourlyCheckinReminder[]>({
    queryKey: [...CHECKIN_REMINDERS_KEY, { today, limit }],
    queryFn: () => companionApi.getCheckinReminders(today, limit),
    staleTime: 30_000,
  })
}
