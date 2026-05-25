import { useEffect, useState } from 'react'
import { API_URL } from './config'
import './GoogleAccount.css'

type Status = 'loading' | 'connected' | 'disconnected' | 'error'

function GoogleAccount() {
  const [status, setStatus] = useState<Status>('loading')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data: { hasGoogleAccess: boolean }) => {
        if (!cancelled) setStatus(data.hasGoogleAccess ? 'connected' : 'disconnected')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => { cancelled = true }
  }, [retryKey])

  const handleConnect = () => {
    window.location.href = `${API_URL}/api/auth/google/start`
  }

  const handleDisconnect = () => {
    setStatus('loading')
    fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(() => setStatus('disconnected'))
      .catch(() => setStatus('error'))
  }

  return (
    <section className="google-account">
      <h2>Google Account</h2>

      {status === 'loading' && <p className="google-account-status">Checking…</p>}

      {status === 'error' && (
        <div className="google-account-error">
          <p>Couldn't reach the server.</p>
          <button type="button" onClick={() => { setStatus('loading'); setRetryKey((k) => k + 1) }}>
            Retry
          </button>
        </div>
      )}

      {status === 'disconnected' && (
        <button type="button" className="google-account-connect" onClick={handleConnect}>
          Log in with Google
        </button>
      )}

      {status === 'connected' && (
        <div className="google-account-connected">
          <p>Logged in</p>
          <button type="button" className="google-account-disconnect" onClick={handleDisconnect}>
            Log out
          </button>
        </div>
      )}
    </section>
  )
}

export default GoogleAccount
