const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1']

const CATEGORIES = [
  { id: 'vocabulary', label: 'Vocabulary', jp: '語彙', enabled: true },
  { id: 'kanji', label: 'Kanji', jp: '漢字', enabled: true },
  { id: 'grammar', label: 'Grammar', jp: '文法', enabled: false },
]

const SESSION_SIZES = [5, 10, 15]

function StampOption({ selected, disabled, onClick, children }) {
  return (
    <button
      type="button"
      className={`stamp-option${selected ? ' selected' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="stamp-mark" />
      {children}
    </button>
  )
}

export default function ConfigPanel({ config, onChange, onGenerate, isLoading, error, reviewAvailable }) {
  return (
    <div className="panel">
      <div className="panel-section">
        <div className="panel-label">Mode</div>
        <div className="stamp-grid">
          <StampOption
            selected={config.mode === 'new'}
            onClick={() => onChange({ ...config, mode: 'new' })}
          >
            Generate New
          </StampOption>
          <StampOption
            selected={config.mode === 'review'}
            disabled={!reviewAvailable}
            onClick={() => onChange({ ...config, mode: 'review' })}
          >
            Review Past Questions
            {!reviewAvailable && <span className="coming-soon-tag">NONE YET</span>}
          </StampOption>
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-label">JLPT Level</div>
        <div className="stamp-grid">
          {LEVELS.map((level) => (
            <StampOption
              key={level}
              selected={config.level === level}
              onClick={() => onChange({ ...config, level })}
            >
              {level}
            </StampOption>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-label">Category</div>
        <div className="stamp-grid">
          {CATEGORIES.map((cat) => (
            <StampOption
              key={cat.id}
              selected={config.category === cat.id}
              disabled={!cat.enabled}
              onClick={() => onChange({ ...config, category: cat.id })}
            >
              {cat.label}
              <span className="jp">{cat.jp}</span>
              {!cat.enabled && <span className="coming-soon-tag">SOON</span>}
            </StampOption>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-label">Session Size</div>
        <div className="stamp-grid">
          {SESSION_SIZES.map((size) => (
            <StampOption
              key={size}
              selected={config.count === size}
              onClick={() => onChange({ ...config, count: size })}
            >
              {size} questions
            </StampOption>
          ))}
        </div>
      </div>

      <button
        className="generate-button"
        onClick={onGenerate}
        disabled={isLoading}
      >
        {isLoading
          ? 'Generating…'
          : config.mode === 'review' ? '復習 — Review' : '始める — Generate'}
      </button>

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}
