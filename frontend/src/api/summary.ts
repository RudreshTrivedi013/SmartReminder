import api from './axios'
import type { DaySummary } from '@/types/api'

export const summaryApi = {
  trigger: () => api.post<DaySummary>('/summary/trigger').then((r) => r.data),
}
