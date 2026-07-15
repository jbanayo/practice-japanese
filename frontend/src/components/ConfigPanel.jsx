const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1']

const CATEGORIES = [
  { id: 'vocabulary', label: 'Vocabulary', enabled: true },
  { id: 'kanji', label: 'Kanji', enabled: true },
  { id: 'grammar', label: 'Grammar', enabled: false },
]

const SESSION_SIZES = [5, 10, 15]

export default function ConfigPanel({
  config, onChange, onGenerate, onConverse, isLoading, error,
  reviewAvailable, modelLabel, onOpenStats, onOpenFlashcards, onOpenSettings,
}) {
  return (
    <div className="setup-controls">
      <section>
        <div className="setup-section-head">Level <span className="jp">/ レベル</span></div>
        <div className="level-pill-row">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={`level-pill${config.level === level ? ' active' : ''}`}
              onClick={() => onChange({ ...config, level })}
            >
              {level}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="setup-section-head">Category <span className="jp">/ カテゴリ</span></div>
        <div className="category-tabs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              disabled={!cat.enabled}
              className={`category-tab${config.category === cat.id ? ' active' : ''}`}
              onClick={() => onChange({ ...config, category: cat.id })}
            >
              {cat.label.toUpperCase()}
              {!cat.enabled && <span className="tag-soon">SOON</span>}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="setup-section-head">Session Size <span className="jp">/ サイズ</span></div>
        <div className="size-row">
          {SESSION_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={`size-option${config.count === size ? ' active' : ''}`}
              onClick={() => onChange({ ...config, count: size })}
            >
              {String(size).padStart(2, '0')}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="setup-section-head">Mode <span className="jp">/ モード</span></div>
        <div className="mode-row">
          <button
            type="button"
            className={`mode-option${config.mode === 'new' ? ' active' : ''}`}
            onClick={() => onChange({ ...config, mode: 'new' })}
          >
            <span className="dot" />
            <span className="mode-label">Generate New</span>
          </button>
          <button
            type="button"
            className={`mode-option${config.mode === 'review' ? ' active' : ''}`}
            disabled={!reviewAvailable}
            onClick={() => onChange({ ...config, mode: 'review' })}
          >
            <span className="dot" />
            <span className="mode-label">Review Past</span>
            {!reviewAvailable && <span className="mode-tag-none">NONE YET</span>}
          </button>
        </div>
      </section>

      <div className="start-row">
        <button className="start-button" onClick={onGenerate} disabled={isLoading}>
          {isLoading ? 'Generating…' : <>START ▸ <span className="jp">はじめる</span> ▸</>}
        </button>
        <div className="model-status">
          <div className="status-line">
            <span className="status-dot" />
            MODEL · {modelLabel || 'default'}
          </div>
          <div className="status-sub">ready · local</div>
        </div>
      </div>

      <button className="converse-button" onClick={onConverse}>
        CONVERSE ▸ <span className="jp">かいわ</span> ▸
        <span className="converse-hint">Practice with tutor bot</span>
      </button>

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}
