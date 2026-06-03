import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { API_URL } from './config'
import TaskListSetup from './TaskListSetup'
import {
  type Task,
  type TaskStatus,
  type TaskDay,
  type RawTask,
  Temporal,
  parseTask,
  formatDate,
  buildFirst7,
  buildBeyond7,
} from './tasks'

// Three page windows: first week, rest of first month, rest of year.
const PAGE_OFFSETS = [
  { start: 0, end: 6 },
  { start: 7, end: 30 },
  { start: 31, end: 364 },
] as const
import './TaskList.css'

type TaskActions = {
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
  onSaveEdit: (taskId: string, title: string, due: string) => Promise<void>
  onCancelEdit: () => void
  onDelete: (task: Task) => void
}

type TaskItemProps = {
  task: Task
  showDate?: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

function TaskItem({ task, showDate, onToggle, onEdit, onDelete }: TaskItemProps) {
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
      <button className="task-item__action" onClick={onEdit} aria-label="編集">✎</button>
      <button className="task-item__action" onClick={onDelete} aria-label="削除">✕</button>
    </div>
  )
}

type TaskFormProps = {
  initialTitle?: string
  initialDue?: string
  submitLabel: string
  onSubmit: (title: string, due: string) => Promise<void>
  onCancel: () => void
}

function TaskForm({ initialTitle = '', initialDue, submitLabel, onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(initialTitle)
  const [due, setDue] = useState(initialDue ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !due) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(title.trim(), due)
    } catch {
      setError('失敗しました。もう一度お試しください。')
      setSubmitting(false)
    }
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <div className="task-form__row">
        <input
          className="task-form__title"
          type="text"
          placeholder="タスクのタイトル"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />
        <input
          className="task-form__date"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          required
        />
      </div>
      <div className="task-form__actions">
        <button className="task-form__submit" type="submit" disabled={submitting || !title.trim() || !due}>
          {submitLabel}
        </button>
        <button className="task-form__cancel" type="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
      {error && <p className="task-form__error">{error}</p>}
    </form>
  )
}

function TaskComposeSheet({ today, onSave, onClose }: {
  today: Temporal.PlainDate
  onSave: (title: string, due: string) => Promise<void>
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(today.toString())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const handleSave = async () => {
    if (!title.trim() || !due) return
    setSaving(true)
    setSaveError(false)
    try {
      await onSave(title.trim(), due)
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end z-[100]" onClick={onClose}>
      <div className="bg-white w-full max-w-[600px] mx-auto rounded-t-2xl p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <input
          className="text-base font-[inherit] border border-[#d8d0c0] rounded-lg py-2 px-3 w-full box-border bg-white"
          type="text"
          placeholder="タスクのタイトル"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <input
          className="text-[0.9375rem] font-[inherit] border border-[#d8d0c0] rounded-lg py-2 px-3 bg-white"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        {saveError && <p className="m-0 text-sm text-red-600">保存に失敗しました。もう一度試してください。</p>}
        <button
          className="self-end py-2 px-6 bg-garden text-white border-0 rounded-lg text-base font-[inherit] cursor-pointer disabled:bg-[#bbb] disabled:cursor-default"
          onClick={handleSave}
          disabled={saving || !title.trim() || !due}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}

function DaySection({
  day,
  label,
  editingTaskId,
  actions,
}: {
  day: TaskDay
  label: string
  editingTaskId: string | null
  actions: TaskActions
}) {
  if (day.tasks.length === 0) {
    return (
      <div className="task-section task-section--empty">
        <span className="task-section__header">{label}</span>
        <span className="task-day__empty">タスクなし</span>
      </div>
    )
  }
  return (
    <section className="task-section">
      <h2 className="task-section__header">{label}</h2>
      {day.tasks.map((task) =>
        editingTaskId === task.id ? (
          <TaskForm
            key={task.id}
            initialTitle={task.title}
            initialDue={task.due.toString()}
            submitLabel="保存"
            onSubmit={(title, due) => actions.onSaveEdit(task.id, title, due)}
            onCancel={actions.onCancelEdit}
          />
        ) : (
          <TaskItem
            key={task.id}
            task={task}
            onToggle={() => actions.onToggle(task)}
            onEdit={() => actions.onEdit(task)}
            onDelete={() => actions.onDelete(task)}
          />
        ),
      )}
    </section>
  )
}

async function fetchTaskPage(from: Temporal.PlainDate, to: Temporal.PlainDate): Promise<Task[]> {
  const res = await fetch(
    `${API_URL}/api/tasks?dueMin=${from}&dueMax=${to.add({ days: 1 })}&showCompleted=true`,
    { credentials: 'include' },
  )
  if (res.status === 404) throw Object.assign(new Error('task_list_not_found'), { code: 'task_list_not_found' })
  if (!res.ok) throw new Error(`tasks fetch failed: ${res.status}`)
  return ((await res.json()) as { tasks: RawTask[] }).tasks.map(parseTask)
}

export default function TaskList() {
  const [overdue, setOverdue] = useState<Task[]>([])
  const [pages, setPages] = useState<Task[][]>([])
  const [nextPageIndex, setNextPageIndex] = useState<number | null>(null)
  const [phase, setPhase] = useState<'checking-setup' | 'needs-setup' | 'loading' | 'ready' | 'error'>('checking-setup')
  const [loadingMore, setLoadingMore] = useState(false)
  const [overdueOpen, setOverdueOpen] = useState(true)
  const [composing, setComposing] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const today = useMemo(() => Temporal.Now.plainDateISO(), [])
  const tomorrow = useMemo(() => today.add({ days: 1 }), [today])

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
      fetch(`${API_URL}/api/tasks?dueMax=${today}&showCompleted=false`, { credentials: 'include' }),
      fetch(
        `${API_URL}/api/tasks?dueMin=${today.add({ days: firstPage.start })}&dueMax=${today.add({ days: firstPage.end + 1 })}&showCompleted=true`,
        { credentials: 'include' },
      ),
    ])
      .then(async ([overdueRes, upcomingRes]) => {
        if (overdueRes.status === 404 || upcomingRes.status === 404) { setPhase('needs-setup'); return }
        if (!overdueRes.ok || !upcomingRes.ok) { setPhase('error'); return }
        const [overdueData, upcomingData] = await Promise.all([
          overdueRes.json() as Promise<{ tasks: RawTask[] }>,
          upcomingRes.json() as Promise<{ tasks: RawTask[] }>,
        ])
        setOverdue(overdueData.tasks.map(parseTask))
        setPages([upcomingData.tasks.map(parseTask)])
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
      const tasks = await fetchTaskPage(today.add({ days: start }), today.add({ days: end }))
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

  const createTask = async (title: string, due: string): Promise<void> => {
    const res = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, due }),
    })
    if (!res.ok) throw new Error()
    setComposing(false)
    setPhase('loading')
  }

  const saveEdit = async (taskId: string, title: string, due: string): Promise<void> => {
    const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, due }),
    })
    if (!res.ok) throw new Error()
    setEditingTaskId(null)
    setPhase('loading')
  }

  const deleteTask = async (task: Task) => {
    // Optimistic: remove immediately. On failure, reload to restore the task —
    // reinserting at the correct sorted position is not worth the complexity.
    setOverdue((prev) => prev.filter((t) => t.id !== task.id))
    setPages((prev) => prev.map((page) => page.filter((t) => t.id !== task.id)))
    try {
      const res = await fetch(`${API_URL}/api/tasks/${task.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error()
    } catch {
      setPhase('loading') // triggers a full reload, restoring the task
    }
  }

  const taskActions: TaskActions = {
    onToggle: toggleTask,
    onEdit: (task) => setEditingTaskId(task.id),
    onSaveEdit: saveEdit,
    onCancelEdit: () => setEditingTaskId(null),
    onDelete: deleteTask,
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
    <>
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
          {overdueOpen && overdue.map((task) =>
            editingTaskId === task.id ? (
              <TaskForm
                key={task.id}
                initialTitle={task.title}
                initialDue={task.due.toString()}
                submitLabel="保存"
                onSubmit={(title, due) => saveEdit(task.id, title, due)}
                onCancel={() => setEditingTaskId(null)}
              />
            ) : (
              <TaskItem
                key={task.id}
                task={task}
                showDate
                onToggle={() => toggleTask(task)}
                onEdit={() => setEditingTaskId(task.id)}
                onDelete={() => deleteTask(task)}
              />
            ),
          )}
        </section>
      )}

      {isEmpty && <p className="task-list__status">タスクがありません。</p>}

      {first7.map((day) => {
        const label = day.date.equals(today)
          ? `今日 · ${formatDate(day.date)}`
          : day.date.equals(tomorrow)
          ? `明日 · ${formatDate(day.date)}`
          : formatDate(day.date)
        return <DaySection key={day.date.toString()} day={day} label={label} editingTaskId={editingTaskId} actions={taskActions} />
      })}

      {beyond7.map((day, i) => {
        const prevDate = i === 0 ? today.add({ days: 6 }) : beyond7[i - 1].date
        const skipped = prevDate.until(day.date).days - 1
        return (
          <Fragment key={day.date.toString()}>
            {skipped > 0 && <div className="task-gap"><span>{skipped}日省略</span></div>}
            <DaySection day={day} label={formatDate(day.date)} editingTaskId={editingTaskId} actions={taskActions} />
          </Fragment>
        )
      })}

      {nextPageIndex !== null && <div ref={sentinelRef} style={{ height: 1 }} />}
      {loadingMore && <p className="task-list__status">読み込み中…</p>}
    </div>

    <button className="fixed bottom-20 right-5 w-14 h-14 rounded-full bg-garden text-white text-[1.75rem] border-0 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.2)] flex items-center justify-center leading-none" onClick={() => setComposing(true)}>＋</button>
    {composing && <TaskComposeSheet today={today} onSave={createTask} onClose={() => setComposing(false)} />}
    </>
  )
}
