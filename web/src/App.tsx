import { useEffect, useState } from 'react'
import { API_URL } from './config'
import GoogleAccount from './GoogleAccount'
import Weather from './Weather'

function App() {
  const [health, setHealth] = useState<string>('loading...')

  useEffect(() => {
    fetch(`${API_URL}/health`)
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
      <GoogleAccount />
    </div>
  )
}

export default App
