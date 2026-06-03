import { useState, useEffect } from 'react'
import FarmLayout from './FarmLayout'
import TaskList from './TaskList'
import Timeline from './Timeline'
import Weather from './Weather'
import { API_URL } from './config'
import './App.css'

type View = 'timeline' | 'calendar' | 'layout' | 'weather'
type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error'

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [view, setView] = useState<View>('timeline')

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data: { hasGoogleAccess: boolean }) => {
        setAuthStatus(data.hasGoogleAccess ? 'authenticated' : 'unauthenticated')
      })
      .catch(() => setAuthStatus('error'))
  }, [])

  const handleLogout = () => {
    fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' })
      .finally(() => window.location.reload())
  }

  if (authStatus === 'loading') {
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <p className="auth-card__app-name">🌿 akari-garden</p>
          <p className="auth-card__status">読み込み中…</p>
        </div>
      </div>
    )
  }

  if (authStatus !== 'authenticated') {
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <p className="auth-card__app-name">🌿 akari-garden</p>
          {authStatus === 'error' && (
            <p className="auth-card__error">サーバーに接続できませんでした。</p>
          )}
          <button
            type="button"
            className="auth-card__sign-in"
            onClick={() => { window.location.href = `${API_URL}/api/auth/google/start` }}
          >
            Googleでログイン
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app__content">
        {view === 'timeline' && <Timeline />}
        {view === 'layout' && <FarmLayout />}
        {view === 'calendar' && <TaskList />}
        {view === 'weather' && <Weather />}
      </div>

      <nav className="bottom-nav">
        <button
          className={`bottom-nav__item ${view === 'timeline' ? 'bottom-nav__item--active' : ''}`}
          onClick={() => setView('timeline')}
        >
          <span>📋</span>
          <span>メモ</span>
        </button>
        <button
          className={`bottom-nav__item ${view === 'calendar' ? 'bottom-nav__item--active' : ''}`}
          onClick={() => setView('calendar')}
        >
          <span>📅</span>
          <span>タスク</span>
        </button>
        <button
          className={`bottom-nav__item ${view === 'layout' ? 'bottom-nav__item--active' : ''}`}
          onClick={() => setView('layout')}
        >
          <span>🗺️</span>
          <span>図面</span>
        </button>
        <button
          className={`bottom-nav__item ${view === 'weather' ? 'bottom-nav__item--active' : ''}`}
          onClick={() => setView('weather')}
        >
          <span>🌤️</span>
          <span>天気</span>
        </button>
        <button className="bottom-nav__item bottom-nav__item--logout" onClick={handleLogout}>
          <span>↩</span>
          <span>ログアウト</span>
        </button>
      </nav>
    </div>
  )
}

export default App
