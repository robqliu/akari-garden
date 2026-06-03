import { useState } from 'react'
import { API_URL } from './config'
import './TaskListSetup.css'

type State = 'idle' | 'creating' | 'error'

type Props = {
  onComplete: () => void
}

function TaskListSetup({ onComplete }: Props) {
  const [state, setState] = useState<State>('idle')
  const [name, setName] = useState('Akari Garden')

  async function handleCreate() {
    setState('creating')
    try {
      const res = await fetch(`${API_URL}/api/task-list`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error()
      onComplete()
    } catch {
      setState('error')
    }
  }

  return (
    <section className="task-list-setup">
      <h3>タスクリストを作成</h3>
      <p className="task-list-setup__note">
        Googleタスクに新しいリストを作成します。現在、タスクの追加はGoogleカレンダーから行ってください。
      </p>
      {state === 'error' && (
        <p className="task-list-setup__error">作成に失敗しました。もう一度試してください。</p>
      )}
      <div className="task-list-setup__create-form">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="リスト名"
          disabled={state === 'creating'}
        />
        <button type="button" onClick={handleCreate} disabled={state === 'creating' || !name.trim()}>
          {state === 'creating' ? '作成中…' : '作成'}
        </button>
      </div>
    </section>
  )
}

export default TaskListSetup
