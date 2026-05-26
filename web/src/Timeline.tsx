import { useState } from 'react'
import './Timeline.css'

type CropId = 'ninjin' | 'satsumaimo' | 'melon' | 'tomato' | 'negi' | 'nasu'

const CROPS: { id: CropId; name: string; emoji: string }[] = [
  { id: 'ninjin', name: 'にんじん', emoji: '🥕' },
  { id: 'satsumaimo', name: 'さつまいも', emoji: '🍠' },
  { id: 'melon', name: 'メロン', emoji: '🍈' },
  { id: 'tomato', name: 'トマト', emoji: '🍅' },
  { id: 'negi', name: 'ネギ', emoji: '🌿' },
  { id: 'nasu', name: 'なす', emoji: '🍆' },
]

type Note = {
  id: string
  crops: CropId[]
  text: string
  createdAt: Date
}

const MOCK_NOTES: Note[] = [
  { id: '1', crops: ['ninjin', 'nasu'], text: '水やりした。なすの葉が少し黄ばんでいる。', createdAt: new Date('2026-05-26T08:00:00') },
  { id: '2', crops: ['tomato'], text: 'トマトに支柱を立てた。花が咲き始めた。', createdAt: new Date('2026-05-25T09:30:00') },
  { id: '3', crops: ['melon'], text: 'メロンのつるが伸びてきた。', createdAt: new Date('2026-05-24T07:45:00') },
  { id: '4', crops: ['ninjin', 'negi', 'satsumaimo'], text: '全体的に水やり。', createdAt: new Date('2026-05-23T08:15:00') },
]

function formatDate(date: Date) {
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type ComposeSheetProps = {
  onSave: (crops: CropId[], text: string) => void
  onClose: () => void
}

function ComposeSheet({ onSave, onClose }: ComposeSheetProps) {
  const [text, setText] = useState('')
  const [selectedCrops, setSelectedCrops] = useState<Set<CropId>>(new Set())

  const toggleCrop = (id: CropId) => {
    setSelectedCrops((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = () => {
    if (!text.trim() || selectedCrops.size === 0) return
    onSave([...selectedCrops], text.trim())
  }

  return (
    <div className="compose-overlay" onClick={onClose}>
      <div className="compose-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="compose-sheet__crop-tags">
          {CROPS.map((c) => (
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
          onChange={(e) => setText(e.target.value)}
          rows={4}
          autoFocus
        />
        <button
          className="compose-sheet__save"
          onClick={handleSave}
          disabled={!text.trim() || selectedCrops.size === 0}
        >
          保存
        </button>
      </div>
    </div>
  )
}

export default function Timeline() {
  const [notes, setNotes] = useState<Note[]>(MOCK_NOTES)
  const [filter, setFilter] = useState<CropId | null>(null)
  const [composing, setComposing] = useState(false)

  const saveNote = (crops: CropId[], text: string) => {
    setNotes([{ id: Date.now().toString(), crops, text, createdAt: new Date() }, ...notes])
    setComposing(false)
  }

  const filtered = filter ? notes.filter((n) => n.crops.includes(filter)) : notes

  return (
    <>
      <div className="timeline">
        <div className="timeline__filters">
          {CROPS.map((c) => (
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
          {filtered.length === 0 && <p className="timeline__empty">メモがありません</p>}
          {filtered.map((note) => (
            <div key={note.id} className="note-card">
              <div className="note-card__crops">
                {note.crops.map((cid) => {
                  const crop = CROPS.find((c) => c.id === cid)!
                  return <span key={cid} className="note-card__crop-tag">{crop.emoji} {crop.name}</span>
                })}
              </div>
              <p className="note-card__text">{note.text}</p>
              <span className="note-card__date">{formatDate(note.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>

      <button className="fab" onClick={() => setComposing(true)}>＋</button>

      {composing && <ComposeSheet onSave={saveNote} onClose={() => setComposing(false)} />}
    </>
  )
}
