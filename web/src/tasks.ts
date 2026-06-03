import { Temporal } from '@js-temporal/polyfill'

export { Temporal }

export type TaskStatus = 'needsAction' | 'completed'

export type Task = {
  id: string
  title: string
  status: TaskStatus
  due: Temporal.PlainDate
}

export type TaskDay = {
  date: Temporal.PlainDate
  tasks: Task[]
}

// Three fixed page windows: first week, first month, rest of year.
export const PAGE_OFFSETS = [
  { start: 0, end: 6 },
  { start: 7, end: 36 },
  { start: 37, end: 364 },
] as const

export type RawTask = { id: string; title: string; status: TaskStatus; due: string }

export function parseTask(raw: RawTask): Task {
  return { ...raw, due: Temporal.PlainDate.from(raw.due) }
}

export function formatDate(date: Temporal.PlainDate): string {
  return date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric' })
}


function groupByDate(tasks: Task[]): TaskDay[] {
  const map = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = task.due.toString()
    const bucket = map.get(key) ?? []
    bucket.push(task)
    map.set(key, bucket)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, tasks]) => ({ date: Temporal.PlainDate.from(key), tasks }))
}

// First 7 days from today, every day shown even if empty.
export function buildFirst7(tasks: Task[], today: Temporal.PlainDate): TaskDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = today.add({ days: i })
    return { date, tasks: tasks.filter((t) => t.due.equals(date)) }
  })
}

// Days beyond the first 7 that have tasks, for gap-indicator rendering.
export function buildBeyond7(tasks: Task[], today: Temporal.PlainDate): TaskDay[] {
  const cutoff = today.add({ days: 6 })
  return groupByDate(tasks.filter((t) => Temporal.PlainDate.compare(t.due, cutoff) > 0))
}
