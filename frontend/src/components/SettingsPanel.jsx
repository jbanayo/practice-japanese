import { useEffect, useState } from 'react'
import { getAvailableModels, ApiError } from '../api.js'
import { getSelectedModel, setSelectedModel, clearAllData } from '../db.js'
import ConfirmDialog from './ConfirmDialog.jsx'

export default function SettingsPanel({ onBack }) {
  const [modelInfo, setModelInfo] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetDone, setResetDone] = useState(false)

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
    }
    load()
  }, [])

  async function handleSelectModel(name) {
    setSelected(name)
    await setSelectedModel(name)
  }

  async function handleReset() {
    await clearAllData()
    setShowResetConfirm(false)
    setResetDone(true)
    setSelected(modelInfo?.default_model || null)
  }

  return (
    <div className="panel">
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
