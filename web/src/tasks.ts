export type TaskStatus = 'needsAction' | 'completed'

export type Task = {
  id: string
  title: string
  status: TaskStatus
  due: string // YYYY-MM-DD
}

export type TaskDay = {
  date: string // YYYY-MM-DD
  tasks: Task[]
}

export function localDateStr(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round(
    (new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()) / msPerDay,
  )
}

function groupByDate(tasks: Task[]): TaskDay[] {
  const map = new Map<string, Task[]>()
  for (const task of tasks) {
    const bucket = map.get(task.due) ?? []
    bucket.push(task)
    map.set(task.due, bucket)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tasks]) => ({ date, tasks }))
}

// Three fixed page windows: first week, first month, rest of year.
export const PAGE_OFFSETS = [
  { start: 0, end: 6 },
  { start: 7, end: 36 },
  { start: 37, end: 364 },
] as const

// First 7 days from today, every day shown even if empty.
export function buildFirst7(tasks: Task[], today: string): TaskDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i)
    return { date, tasks: tasks.filter((t) => t.due === date) }
  })
}

// Days beyond the first 7 that have tasks, for gap-indicator rendering.
export function buildBeyond7(tasks: Task[], today: string): TaskDay[] {
  const cutoff = addDays(today, 6)
  return groupByDate(tasks.filter((t) => t.due > cutoff))
}
