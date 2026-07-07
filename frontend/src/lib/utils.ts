import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isToday, isTomorrow, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const date = parseISO(dateStr)
    const timeStr = format(date, 'h:mm a')
    if (isToday(date)) return `Today ${timeStr}`
    if (isTomorrow(date)) return `Tomorrow ${timeStr}`
    return format(date, 'MMM d, yyyy · h:mm a')
  } catch {
    return dateStr
  }
}

export function formatRelative(dateStr: string): string {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

export function formatTime(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'h:mm a')
  } catch {
    return dateStr
  }
}

export function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy')
  } catch {
    return dateStr
  }
}

export function parseApiError(error: unknown): string {
  if (!error) return 'An unexpected error occurred'
  const err = error as { response?: { data?: { detail?: unknown } }; message?: string }
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d: { msg?: string }) => d?.msg ?? '').join(', ')
  }
  return err?.message ?? 'An unexpected error occurred'
}

export const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo',
  'Asia/Singapore', 'Australia/Sydney', 'Pacific/Auckland',
]
