import { useState, useEffect, useCallback } from 'react'
import './Timeline.css'
import { API_URL } from './config'

type CropId = 1 | 2 | 3 | 4 | 5 | 6

const SORTED_CROPS = [
  { id: 1 as CropId, name: 'にんじん', emoji: '🥕' },
  { id: 2 as CropId, name: 'さつまいも', emoji: '🍠' },
  { id: 3 as CropId, name: 'メロン', emoji: '🍈' },
  { id: 4 as CropId, name: 'トマト', emoji: '🍅' },
  { id: 5 as CropId, name: 'ネギ', emoji: '🌿' },
  { id: 6 as CropId, name: 'なす', emoji: '🍆' },
].sort((a, b) => a.name.localeCompare(b.name, 'ja'))

// TODO: duplicate of NoteResponse in server/src/routes/notes.ts — move to a
// shared packages/types package so FE and BE can't drift apart.
type Note = {
  id: string
  crops: CropId[]
  text: string
  createdAt: string
}

function formatDate(createdAt: string) {
  return new Date(createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type ComposeSheetProps = {
  onSave: (crops: CropId[], text: string) => Promise<void>
  onClose: () => void
}

function ComposeSheet({ onSave, onClose }: ComposeSheetProps) {
  const [text, setText] = useState('')
  const [selectedCrops, setSelectedCrops] = useState<Set<CropId>>(new Set())
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)

  const toggleCrop = (id: CropId) => {
    setSelectedCrops((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setValidationError(null)
  }

  const handleSave = async () => {
    if (selectedCrops.size === 0) { setValidationError('作物を選んでください'); return }
    if (!text.trim()) { setValidationError('メモを入力してください'); return }
    setValidationError(null)
    setSaving(true)
    setSaveError(false)
    try {
      await onSave([...selectedCrops], text.trim())
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="compose-overlay" onClick={onClose}>
      <div className="compose-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="compose-sheet__crop-tags">
          {SORTED_CROPS.map((c) => (
            <button
              key={c.id}
              className={`tag-btn ${selectedCrops.has(c.id) ? 'tag-btn--selected' : ''}`}
              onClick={() => toggleCrop(c.id)}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
        <textarea
          className="compose-sheet__textarea"
          placeholder="メモを入力..."
          value={text}
          onChange={(e) => { setText(e.target.value); setValidationError(null) }}
          rows={4}
          autoFocus
        />
        {validationError && <p className="compose-sheet__error">{validationError}</p>}
        {saveError && <p className="compose-sheet__error">保存に失敗しました。もう一度試してください。</p>}
        <button
          className="compose-sheet__save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}

export default function Timeline() {
  const [notes, setNotes] = useState<Note[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState<CropId | null>(null)
  const [composing, setComposing] = useState(false)

  const loadNotes = useCallback(async (crop: CropId | null, cursor: string | null) => {
    const params = new URLSearchParams()
    if (crop !== null) params.set('crop', String(crop))
    if (cursor !== null) params.set('cursor', cursor)
    const res = await fetch(`${API_URL}/api/notes?${params}`, { credentials: 'include' })
    if (!res.ok) throw new Error(`${res.status}`)
    return res.json() as Promise<{ notes: Note[]; nextCursor: string | null }>
  }, [])

  useEffect(() => {
    let cancelled = false
    loadNotes(filter, null)
      .then(({ notes, nextCursor }) => {
        if (cancelled) return
        setNotes(notes)
        setNextCursor(nextCursor)
        setLoadError(false)
      })
      .catch(() => {
        if (cancelled) return
        setNotes([])
        setNextCursor(null)
        setLoadError(true)
      })
    return () => { cancelled = true }
  }, [filter, loadNotes])

  const loadMore = async () => {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const { notes: more, nextCursor: next } = await loadNotes(filter, nextCursor)
      setNotes((prev) => [...prev, ...more])
      setNextCursor(next)
    } catch {
      setLoadError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  const saveNote = async (crops: CropId[], text: string) => {
    const res = await fetch(`${API_URL}/api/notes`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, crops }),
    })
    if (!res.ok) throw new Error(`${res.status}`)
    const note = await res.json() as Note
    setNotes((prev) => [note, ...prev])
    setComposing(false)
  }

  return (
    <>
      <div className="timeline">
        <div className="timeline__filters">
          {SORTED_CROPS.map((c) => (
            <button
              key={c.id}
              className={`filter-btn ${filter === c.id ? 'filter-btn--active' : ''}`}
              onClick={() => setFilter(filter === c.id ? null : c.id)}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>

        <div className="timeline__notes">
          {loadError && notes.length === 0 && (
            <p className="timeline__error">メモを読み込めませんでした。<button className="timeline__retry" onClick={() => setFilter(filter)}>再試行</button></p>
          )}
          {!loadError && notes.length === 0 && (
            <p className="timeline__empty">まだメモがありません。右下の ＋ ボタンから追加できます。</p>
          )}
          {notes.map((note) => (
            <div key={note.id} className="note-card">
              <div className="note-card__crops">
                {note.crops.map((cid) => {
                  const crop = SORTED_CROPS.find((c) => c.id === cid)!
                  return <span key={cid} className="note-card__crop-tag">{crop.emoji} {crop.name}</span>
                })}
              </div>
              <p className="note-card__text">{note.text}</p>
              <span className="note-card__date">{formatDate(note.createdAt)}</span>
            </div>
          ))}
          {nextCursor && (
            <button className="timeline__load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? '読み込み中…' : 'もっと見る'}
            </button>
          )}
          {loadError && notes.length > 0 && (
            <p className="timeline__error">読み込みに失敗しました。<button className="timeline__retry" onClick={loadMore}>再試行</button></p>
          )}
        </div>
      </div>

      <button className="fab" onClick={() => setComposing(true)}>＋</button>

      {composing && <ComposeSheet onSave={saveNote} onClose={() => setComposing(false)} />}
    </>
  )
}
