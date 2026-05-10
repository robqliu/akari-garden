import { useEffect, useState } from 'react'

function App() {
  const [health, setHealth] = useState<string>('loading...')

  useEffect(() => {
    fetch('/health')
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
    </div>
  )
}

export default App
