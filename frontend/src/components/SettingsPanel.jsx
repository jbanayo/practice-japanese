import { useEffect, useState } from 'react'
import { getAvailableModels, ApiError } from '../api.js'
import {
  getSelectedModel, setSelectedModel, clearAllData,
  getTheme, setTheme, getUIScale, setUIScale, DEFAULT_UI_SCALE,
} from '../db.js'
import ConfirmDialog from './ConfirmDialog.jsx'

const THEMES = [
  { id: 'metro', label: 'Metro (current)' },
  { id: 'classic', label: 'Classic (washi/hanko)' },
]

const ZOOM_OPTIONS = [90, 100, 110, 125, 140]

export default function SettingsPanel({ onBack }) {
  const [modelInfo, setModelInfo] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [theme, setThemeState] = useState('metro')
  const [zoom, setZoomState] = useState(100)

  useEffect(() => {
    async function load() {
      try {
        const info = await getAvailableModels()
        setModelInfo(info)
        const saved = await getSelectedModel()
        setSelected(saved || info.default_model)
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not reach the backend.')
      }
      const savedTheme = await getTheme()
      setThemeState(savedTheme)
      const savedScale = await getUIScale()
      // zoom is a percentage OF the app's default scale (140%), not of the
      // browser's native 16px — so a fresh install shows "100%" here even
      // though the actual rendered size is what used to be "140%".
      setZoomState(Math.round((savedScale / DEFAULT_UI_SCALE) * 100))
    }
    load()
  }, [])

  async function handleSelectModel(name) {
    setSelected(name)
    await setSelectedModel(name)
  }

  async function handleSelectTheme(themeId) {
    setThemeState(themeId)
    await setTheme(themeId)
    document.documentElement.setAttribute('data-theme', themeId)
  }

  async function handleSelectZoom(percent) {
    setZoomState(percent)
    const scale = (percent / 100) * DEFAULT_UI_SCALE
    await setUIScale(scale)
    document.documentElement.style.setProperty('--ui-scale', scale)
  }

  async function handleReset() {
    await clearAllData()
    setShowResetConfirm(false)
    setResetDone(true)
    setSelected(modelInfo?.default_model || null)
    // Preferences live in the same 'meta' store that just got wiped —
    // reapply the defaults to the actual page, not just React state.
    setThemeState('metro')
    setZoomState(100)
    document.documentElement.setAttribute('data-theme', 'metro')
    document.documentElement.style.setProperty('--ui-scale', DEFAULT_UI_SCALE)
  }

  return (
    <div className="panel">
      <div className="panel-section">
        <div className="panel-label">Theme</div>
        <div className="stamp-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`stamp-option${theme === t.id ? ' selected' : ''}`}
              onClick={() => handleSelectTheme(t.id)}
            >
              <span className="stamp-mark" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-label">Zoom</div>
        <p className="settings-description">
          Scales text and spacing together — unlike browser zoom, this won't
          cause layout overflow/scrolling at larger sizes.
        </p>
        <div className="stamp-grid">
          {ZOOM_OPTIONS.map((percent) => (
            <button
              key={percent}
              type="button"
              className={`stamp-option${zoom === percent ? ' selected' : ''}`}
              onClick={() => handleSelectZoom(percent)}
            >
              <span className="stamp-mark" />
              {percent}%
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-label">AI Model (Ollama)</div>

        {error && <div className="error-banner">{error}</div>}

        {!error && !modelInfo && <div className="loading-caption">Checking Ollama…</div>}

        {modelInfo && !modelInfo.ollama_reachable && (
          <div className="error-banner">
            Ollama doesn't seem to be running, or has no models pulled yet.
            Using the app will fail until it's started (try: <code>ollama serve</code>).
          </div>
        )}

        {modelInfo && modelInfo.ollama_reachable && (
          <div className="stamp-grid">
            {modelInfo.available_models.map((name) => (
              <button
                key={name}
                type="button"
                className={`stamp-option${selected === name ? ' selected' : ''}`}
                onClick={() => handleSelectModel(name)}
              >
                <span className="stamp-mark" />
                {name}
              </button>
            ))}
          </div>
        )}

        {modelInfo && selected && (
          <div className="settings-current-model">
            Currently using: <strong>{selected}</strong>
          </div>
        )}
      </div>

      <div className="panel-section">
        <div className="panel-label">Reset</div>
        <p className="settings-description">
          Clears all local data — session history, word mastery stats, streak,
          and quality ratings. The AI model itself is untouched; this only
          resets what's saved on your device.
        </p>
        <button className="dialog-button-confirm reset-button" onClick={() => setShowResetConfirm(true)}>
          Clear All Data
        </button>
        {resetDone && <div className="settings-reset-done">Done — all local data cleared.</div>}
      </div>

      <span className="back-link" onClick={onBack}>← Back to menu</span>

      {showResetConfirm && (
        <ConfirmDialog
          title="Clear all data?"
          message="This permanently deletes your session history, word mastery stats, streak, and quality ratings. This cannot be undone."
          confirmLabel="Clear Everything"
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </div>
  )
}
