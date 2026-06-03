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
    const bucket = map.get(key)
    if (bucket) {
      bucket.push(task)
    } else {
      map.set(key, [task])
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, tasks]) => ({ date: Temporal.PlainDate.from(key), tasks }))
}

// First 7 days from today, every day shown even if empty.
export function buildFirst7(tasks: Task[], today: Temporal.PlainDate): TaskDay[] {
  const byDate = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = task.due.toString()
    const bucket = byDate.get(key)
    if (bucket) bucket.push(task)
    else byDate.set(key, [task])
  }
  return Array.from({ length: 7 }, (_, i) => {
    const date = today.add({ days: i })
    return { date, tasks: byDate.get(date.toString()) ?? [] }
  })
}

// Tasks beyond the first 7 days that have tasks, for gap-indicator rendering.
export function buildBeyond7(tasks: Task[], today: Temporal.PlainDate): TaskDay[] {
  const firstWeekEnd = today.add({ days: 6 })
  return groupByDate(tasks.filter((t) => Temporal.PlainDate.compare(t.due, firstWeekEnd) > 0))
}
