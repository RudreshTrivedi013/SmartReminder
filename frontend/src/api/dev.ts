import api from './axios'

export interface SchedulerStatus {
  beat_schedule: Record<string, { task: string; schedule: string }>
  broker: string
  timezone: string
  server_time_utc: string
}

export interface TriggerResult {
  status: string
  task_id?: string
  user_id?: string
  triggered_at: string
}

export interface TestPushResult {
  status: string
  message?: string
  devices_targeted?: number
  results?: Array<{ device_id: string; status: string; error?: string }>
  sent_at?: string
}

export const devApi = {
  triggerCheckin: () =>
    api.post<TriggerResult>('/dev/trigger-checkin').then((r) => r.data),

  triggerReminderCheck: () =>
    api.post<TriggerResult>('/dev/trigger-reminder-check').then((r) => r.data),

  schedulerStatus: () =>
    api.get<SchedulerStatus>('/dev/scheduler-status').then((r) => r.data),

  testPush: () =>
    api.post<TestPushResult>('/dev/test-push').then((r) => r.data),
}
