import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { tasksApi } from '@/api/tasks'
import { ACTIVITIES_KEY } from '@/hooks/useActivities'
import type { Task, TaskCreateRequest, TaskUpdateRequest, TaskActionRequest } from '@/types/api'
import toast from 'react-hot-toast'
import { parseApiError } from '@/lib/utils'

export const TASKS_KEY = ['tasks'] as const

export function useTasks() {
  return useQuery<Task[]>({
    queryKey: TASKS_KEY,
    queryFn: () => tasksApi.list(0, 100),
    staleTime: 30_000,
  })
}

export function useInfiniteTasks() {
  return useInfiniteQuery<Task[], Error, Task[], typeof TASKS_KEY, number>({
    queryKey: [...TASKS_KEY, 'infinite'] as any,
    queryFn: ({ pageParam = 0 }) => tasksApi.list(pageParam as number, 50),
    initialPageParam: 0,
    getNextPageParam: (lastPage: Task[], allPages: Task[][]) =>
      lastPage.length === 50 ? allPages.length * 50 : undefined,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TaskCreateRequest) => tasksApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: ACTIVITIES_KEY })
      toast.success('Task created!')
    },
    onError: (err: unknown) => toast.error(parseApiError(err)),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskUpdateRequest }) =>
      tasksApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: ACTIVITIES_KEY })
      toast.success('Task updated!')
    },
    onError: (err: unknown) => toast.error(parseApiError(err)),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: ACTIVITIES_KEY })
      toast.success('Task deleted')
    },
    onError: (err: unknown) => toast.error(parseApiError(err)),
  })
}

export function useTaskAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskActionRequest }) =>
      tasksApi.action(id, data),
    onSuccess: (_data: any, variables: { id: string; data: TaskActionRequest }) => {
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: ACTIVITIES_KEY })
      const labels: Record<string, string> = {
        done: '✓ Marked as done',
        start: '▶ Started',
        block: '⛔ Blocked',
        reopen: '↩ Reopened',
        snooze: '⏰ Snoozed',
      }
      toast.success(labels[variables.data.action] ?? 'Action applied')
    },
    onError: (err: unknown) => toast.error(parseApiError(err)),
  })
}
