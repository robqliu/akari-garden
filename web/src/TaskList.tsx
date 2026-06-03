import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_URL } from './config'
import TaskListSetup from './TaskListSetup'
import {
  type Task,
  type TaskStatus,
  type TaskDay,
  PAGE_OFFSETS,
  localDateStr,
  addDays,
  formatDate,
  daysBetween,
  buildFirst7,
  buildBeyond7,
} from './tasks'
import './TaskList.css'

type TaskItemProps = {
  task: Task
  showDate?: boolean
  onToggle: () => void
}

function TaskItem({ task, showDate, onToggle }: TaskItemProps) {
  const done = task.status === 'completed'
  return (
    <div className={`task-item${done ? ' task-item--done' : ''}`}>
      <button
        className={`task-item__check${done ? ' task-item__check--done' : ''}`}
        onClick={onToggle}
        aria-label={done ? '未完了に戻す' : '完了にする'}
      >
        {done ? '☑' : '☐'}
      </button>
      <span className="task-item__title">{task.title}</span>
      {showDate && <span className="task-item__date">{formatDate(task.due)}</span>}
    </div>
  )
}

function DaySection({ day, label, onToggle }: { day: TaskDay; label: string; onToggle: (task: Task) => void }) {
  return (
    <section className="task-section">
      <h2 className="task-section__header">{label}</h2>
      {day.tasks.length > 0
        ? day.tasks.map((task) => (
          <TaskItem key={task.id} task={task} onToggle={() => onToggle(task)} />
        ))
        : <p className="task-day__empty">タスクなし</p>
      }
    </section>
  )
}

async function fetchTaskPage(from: string, to: string): Promise<Task[]> {
  const res = await fetch(
    `${API_URL}/api/tasks?dueMin=${from}T00:00:00.000Z&dueMax=${addDays(to, 1)}T00:00:00.000Z&showCompleted=true&showHidden=true`,
    { credentials: 'include' },
  )
  if (res.status === 404) throw Object.assign(new Error('task_list_not_found'), { code: 'task_list_not_found' })
  if (!res.ok) throw new Error(`tasks fetch failed: ${res.status}`)
  return ((await res.json()) as { tasks: Task[] }).tasks
}

export default function TaskList() {
  const [overdue, setOverdue] = useState<Task[]>([])
  const [pages, setPages] = useState<Task[][]>([])
  const [nextPageIndex, setNextPageIndex] = useState<number | null>(null)
  const [phase, setPhase] = useState<'checking-setup' | 'needs-setup' | 'loading' | 'ready' | 'error'>('checking-setup')
  const [loadingMore, setLoadingMore] = useState(false)
  const [overdueOpen, setOverdueOpen] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const today = useMemo(() => localDateStr(0), [])
  const tomorrow = useMemo(() => addDays(today, 1), [today])

  useEffect(() => {
    if (phase !== 'checking-setup') return
    fetch(`${API_URL}/api/task-list`, { credentials: 'include' })
      .then((r) => r.json() as Promise<{ id: string | null }>)
      .then((data) => setPhase(data.id ? 'loading' : 'needs-setup'))
      .catch(() => setPhase('error'))
  }, [phase])

  useEffect(() => {
    if (phase !== 'loading') return
    const firstPage = PAGE_OFFSETS[0]
    Promise.all([
      fetch(`${API_URL}/api/tasks?dueMax=${today}T00:00:00.000Z&showCompleted=false`, { credentials: 'include' }),
      fetch(
        `${API_URL}/api/tasks?dueMin=${addDays(today, firstPage.start)}T00:00:00.000Z&dueMax=${addDays(today, firstPage.end + 1)}T00:00:00.000Z&showCompleted=true&showHidden=true`,
        { credentials: 'include' },
      ),
    ])
      .then(async ([overdueRes, upcomingRes]) => {
        if (overdueRes.status === 404 || upcomingRes.status === 404) { setPhase('needs-setup'); return }
        if (!overdueRes.ok || !upcomingRes.ok) { setPhase('error'); return }
        const [overdueData, upcomingData] = await Promise.all([
          overdueRes.json() as Promise<{ tasks: Task[] }>,
          upcomingRes.json() as Promise<{ tasks: Task[] }>,
        ])
        setOverdue(overdueData.tasks)
        setPages([upcomingData.tasks])
        setNextPageIndex(PAGE_OFFSETS.length > 1 ? 1 : null)
        setPhase('ready')
      })
      .catch(() => setPhase('error'))
  }, [phase, today])

  const loadMore = useCallback(async () => {
    if (nextPageIndex === null || loadingMore) return
    setLoadingMore(true)
    try {
      const { start, end } = PAGE_OFFSETS[nextPageIndex]
      const tasks = await fetchTaskPage(addDays(today, start), addDays(today, end))
      setPages((prev) => [...prev, tasks])
      setNextPageIndex(nextPageIndex + 1 < PAGE_OFFSETS.length ? nextPageIndex + 1 : null)
    } catch (err) {
      if (err instanceof Error && err.message === 'task_list_not_found') setPhase('needs-setup')
    } finally {
      setLoadingMore(false)
    }
  }, [nextPageIndex, loadingMore, today])

  useEffect(() => {
    if (phase !== 'ready' || nextPageIndex === null || loadingMore) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      // On desktop the full list may fit on screen, causing all pages to load
      // immediately. That's acceptable — 3 requests total, hard cap at 1 year.
      // On mobile (primary target) the 7-day grid is typically tall enough that
      // the sentinel starts below the fold.
      { rootMargin: '0px 0px -80px 0px' },
    )
    if (sentinelRef.current) observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [phase, nextPageIndex, loadingMore, loadMore])

  const toggleTask = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'completed' ? 'needsAction' : 'completed'
    const update = (t: Task) => t.id === task.id ? { ...t, status: newStatus } : t
    setOverdue((prev) => prev.map(update))
    setPages((prev) => prev.map((page) => page.map(update)))
    try {
      const res = await fetch(`${API_URL}/api/tasks/${task.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
    } catch {
      const revert = (t: Task) => t.id === task.id ? { ...t, status: task.status } : t
      setOverdue((prev) => prev.map(revert))
      setPages((prev) => prev.map((page) => page.map(revert)))
    }
  }

  if (phase === 'checking-setup' || phase === 'loading') {
    return <div className="task-list"><p className="task-list__status">読み込み中…</p></div>
  }
  if (phase === 'needs-setup') {
    return <TaskListSetup onComplete={() => setPhase('loading')} />
  }
  if (phase === 'error') {
    return <div className="task-list"><p className="task-list__status task-list__status--error">読み込みに失敗しました。</p></div>
  }

  const first7 = buildFirst7(pages[0] ?? [], today)
  const beyond7 = buildBeyond7(pages.slice(1).flat(), today)
  const isEmpty = overdue.length === 0 && (pages[0] ?? []).length === 0 && beyond7.length === 0

  return (
    <div className="task-list">
      {overdue.length > 0 && (
        <section className="task-section">
          <button
            className="task-section__header task-section__header--overdue"
            onClick={() => setOverdueOpen((o) => !o)}
          >
            <span>期限切れ ({overdue.length})</span>
            <span>{overdueOpen ? '▾' : '▸'}</span>
          </button>
          {overdueOpen && overdue.map((task) => (
            <TaskItem key={task.id} task={task} showDate onToggle={() => toggleTask(task)} />
          ))}
        </section>
      )}

      {isEmpty && <p className="task-list__status">タスクがありません。</p>}

      {first7.map((day) => {
        const label = day.date === today
          ? `今日 · ${formatDate(day.date)}`
          : day.date === tomorrow
          ? `明日 · ${formatDate(day.date)}`
          : formatDate(day.date)
        return <DaySection key={day.date} day={day} label={label} onToggle={toggleTask} />
      })}

      {beyond7.map((day, i) => {
        const prevDate = i === 0 ? addDays(today, 6) : beyond7[i - 1].date
        const skipped = daysBetween(prevDate, day.date) - 1
        return (
          <Fragment key={day.date}>
            {skipped > 0 && <div className="task-gap"><span>{skipped}日省略</span></div>}
            <DaySection day={day} label={formatDate(day.date)} onToggle={toggleTask} />
          </Fragment>
        )
      })}

      {nextPageIndex !== null && <div ref={sentinelRef} style={{ height: 1 }} />}
      {loadingMore && <p className="task-list__status">読み込み中…</p>}
    </div>
  )
}
