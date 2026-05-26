import { useState } from 'react'
import CalendarSetup from './CalendarSetup'
import GoogleAccount from './GoogleAccount'
import Timeline from './Timeline'
import Weather from './Weather'
import './App.css'

type View = 'timeline' | 'calendar'

function App() {
  const [view, setView] = useState<View>('timeline')

  return (
    <div className="app">
      <div className="app__content">
        {view === 'timeline' && <Timeline />}
        {view === 'calendar' && (
          <div style={{ fontFamily: 'system-ui', padding: '2rem' }}>
            <p style={{ color: '#888' }}>カレンダー（近日公開）</p>
            <div style={{ borderTop: '1px solid #e0dbd0', marginTop: '2rem', padding: '1rem 0' }}>
              <Weather />
              <GoogleAccount><CalendarSetup /></GoogleAccount>
            </div>
          </div>
        )}
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
          <span>カレンダー</span>
        </button>
      </nav>
    </div>
  )
}

export default App
