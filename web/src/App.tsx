import { useEffect, useState } from 'react'
import Weather from './Weather'

// In production, set VITE_API_URL at build time (e.g. via the GitHub
// Actions repo variable) to the deployed Worker's origin, e.g.
// https://akari-garden-api.<account-subdomain>.workers.dev
// In dev, leave it unset so requests stay same-origin and hit the
// Vite proxy configured in vite.config.ts.
const API_BASE = import.meta.env.VITE_API_URL ?? ''

function App() {
  const [health, setHealth] = useState<string>('loading...')

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((res) => res.json())
      .then((data) => setHealth(data.status))
      .catch(() => setHealth('unreachable'))
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>akari garden</h1>
      <p>
        Backend status: <strong>{health}</strong>
      </p>
      <Weather />
    </div>
  )
}

export default App
