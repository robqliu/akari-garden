import { useEffect, useState } from 'react'
import { API_URL } from './config'
import './CalendarSetup.css'

type State =
  | { step: 'loading' }
  | { step: 'registered'; calendarId: string }
  | { step: 'create' }
  | { step: 'error'; message: string }

function CalendarSetup() {
  const [state, setState] = useState<State>({ step: 'loading' })
  const [newName, setNewName] = useState('Akari Garden')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const res = await fetch(`${API_URL}/api/calendar/registered`, { credentials: 'include' })
      if (!res.ok) {
        const message = res.status === 401 ? 'Session expired — please sign in again' : 'Failed to load calendar info'
        if (!cancelled) setState({ step: 'error', message })
        return
      }
      const data = (await res.json()) as { calendar: { id: string } | null }
      if (!cancelled) {
        setState(data.calendar
          ? { step: 'registered', calendarId: data.calendar.id }
          : { step: 'create' })
      }
    }

    load().catch(() => {
      if (!cancelled) setState({ step: 'error', message: 'Failed to load calendar info' })
    })
    return () => { cancelled = true }
  }, [])

  async function handleCreate() {
    setState({ step: 'loading' })
    const res = await fetch(`${API_URL}/api/calendar/create`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    if (!res.ok) {
      setState({ step: 'error', message: 'Failed to create calendar' })
      return
    }
    const data = (await res.json()) as { calendar: { id: string } }
    setState({ step: 'registered', calendarId: data.calendar.id })
  }

  if (state.step === 'loading') {
    return <section className="calendar-setup"><p>Loading…</p></section>
  }

  if (state.step === 'error') {
    return <section className="calendar-setup"><p className="calendar-error">{state.message}</p></section>
  }

  if (state.step === 'registered') {
    return (
      <section className="calendar-setup">
        <p className="calendar-registered">Calendar connected</p>
      </section>
    )
  }

  return (
    <section className="calendar-setup">
      <h3>Create a calendar</h3>
      <p className="calendar-create-note">
        This creates a regular Google Calendar on your account. You can
        view and edit events in it from Google Calendar directly.
      </p>
      <div className="calendar-create-form">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Calendar name"
        />
        <button type="button" onClick={handleCreate} disabled={!newName.trim()}>
          Create calendar
        </button>
      </div>
    </section>
  )
}

export default CalendarSetup
