import { useCallback, useEffect, useState } from 'react'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  RefreshCw,
  Sun,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import './Weather.css'

// Aomori City, Aomori Prefecture, Japan.
const LATITUDE = 40.8244
const LONGITUDE = 140.74
const LOCATION_LABEL = '青森市、青森県'

// Open-Meteo is free and key-less, and `jma_seamless` sources the
// underlying forecast from the Japan Meteorological Agency — the
// authoritative provider for Japan.
const FORECAST_URL =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${LATITUDE}` +
  `&longitude=${LONGITUDE}` +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,' +
  'wind_speed_10m_max,wind_direction_10m_dominant,precipitation_sum' +
  '&timezone=Asia%2FTokyo' +
  '&forecast_days=1' +
  '&wind_speed_unit=ms' +
  '&models=jma_seamless'

interface DailyForecast {
  date: string
  weatherCode: number
  tempMax: number
  tempMin: number
  windSpeedMax: number
  windDirection: number
  precipitation: number
}

interface OpenMeteoResponse {
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    wind_speed_10m_max: number[]
    wind_direction_10m_dominant: number[]
    precipitation_sum: number[]
  }
}

interface Condition {
  label: string
  Icon: LucideIcon
  tone: 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog'
}

// WMO weather interpretation codes — see
// https://open-meteo.com/en/docs#weathervariables
function describeWeather(code: number): Condition {
  if (code === 0) return { label: '快晴', Icon: Sun, tone: 'sun' }
  if (code === 1) return { label: '晴れ', Icon: Sun, tone: 'sun' }
  if (code === 2) return { label: '曇り時々晴れ', Icon: CloudSun, tone: 'cloud' }
  if (code === 3) return { label: '曇り', Icon: Cloud, tone: 'cloud' }
  if (code === 45 || code === 48) return { label: '霧', Icon: CloudFog, tone: 'fog' }
  if (code >= 51 && code <= 57) return { label: '霧雨', Icon: CloudDrizzle, tone: 'rain' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { label: '雨', Icon: CloudRain, tone: 'rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { label: '雪', Icon: CloudSnow, tone: 'snow' }
  if (code === 95) return { label: '雷雨', Icon: CloudLightning, tone: 'storm' }
  if (code === 96 || code === 99)
    return { label: '雷雨（雹）', Icon: CloudHail, tone: 'storm' }
  return { label: '不明', Icon: Cloud, tone: 'cloud' }
}

function formatDate(iso: string): string {
  // Treat the YYYY-MM-DD string as a local date in Asia/Tokyo. Parsing
  // with a midnight local-time stamp avoids UTC offset surprises.
  const date = new Date(`${iso}T00:00:00`)
  return date.toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

function formatWindDirection(deg: number): string {
  const compass = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']
  return compass[Math.round(deg / 45) % 8]
}

function Weather() {
  const [forecast, setForecast] = useState<DailyForecast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  // A monotonic counter used to (a) trigger refetches when the user
  // hits the refresh button and (b) ignore stale responses if a new
  // request is fired before the previous one resolves.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    fetch(FORECAST_URL, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Forecast request failed: ${res.status}`)
        return res.json() as Promise<OpenMeteoResponse>
      })
      .then((data) => {
        if (cancelled) return
        const d = data.daily
        if (!d?.time?.length) throw new Error('Forecast response was empty')
        setForecast({
          date: d.time[0],
          weatherCode: d.weather_code[0],
          tempMax: d.temperature_2m_max[0],
          tempMin: d.temperature_2m_min[0],
          windSpeedMax: d.wind_speed_10m_max[0],
          windDirection: d.wind_direction_10m_dominant[0],
          precipitation: d.precipitation_sum[0],
        })
        setError(null)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled || err.name === 'AbortError') return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [reloadKey])

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    setReloadKey((k) => k + 1)
  }, [])

  const condition = forecast ? describeWeather(forecast.weatherCode) : null

  return (
    <section className={`weather-card${condition ? ` weather-tone-${condition.tone}` : ''}`}>
      <header className="weather-header">
        <div>
          <p className="weather-location">{LOCATION_LABEL}</p>
          <p className="weather-date">
            {forecast ? formatDate(forecast.date) : '今日'}
          </p>
        </div>
        <button
          type="button"
          className="weather-refresh"
          onClick={refresh}
          disabled={loading}
          aria-label="予報を更新"
          title="予報を更新"
        >
          <RefreshCw size={16} className={loading ? 'spin' : undefined} />
        </button>
      </header>

      {error && <p className="weather-error">予報の取得に失敗しました: {error}</p>}

      {!error && forecast && condition && (
        <>
          <div className="weather-main">
            <condition.Icon size={80} strokeWidth={1.25} className="weather-main-icon" />
            <div>
              <p className="weather-condition">{condition.label}</p>
              <p className="weather-temps">
                <span className="weather-temp-high">{forecast.tempMax != null ? Math.round(forecast.tempMax) : '—'}°</span>
                <span className="weather-temp-sep"> / </span>
                <span className="weather-temp-low">{forecast.tempMin != null ? Math.round(forecast.tempMin) : '—'}°</span>
                <span className="weather-temp-unit">C</span>
              </p>
            </div>
          </div>

          <dl className="weather-stats">
            <div className="weather-stat">
              <dt>
                <Wind size={14} aria-hidden /> 風速
              </dt>
              <dd>
                {forecast.windSpeedMax?.toFixed(1) ?? '—'} m/s{' '}
                <span className="weather-muted">
                  {forecast.windDirection != null ? formatWindDirection(forecast.windDirection) : '—'}
                </span>
              </dd>
            </div>
            <div className="weather-stat">
              <dt>
                <Droplets size={14} aria-hidden /> 降水量
              </dt>
              <dd>{forecast.precipitation?.toFixed(1) ?? '—'} mm</dd>
            </div>
          </dl>
        </>
      )}

      {!error && !forecast && loading && (
        <p className="weather-loading">読み込み中…</p>
      )}

      <footer className="weather-footer">
        データ: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>（気象庁モデル）
      </footer>
    </section>
  )
}

export default Weather
