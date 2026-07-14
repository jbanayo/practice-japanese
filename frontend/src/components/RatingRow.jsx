import { RATING_OPTIONS } from '../db.js'

export default function RatingRow({ rated, onRate }) {
  if (rated) {
    return <div className="rating-thanks-icon">✓ rated</div>
  }

  return (
    <div className="rating-icon-row">
      {RATING_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={`rating-icon-button rating-icon-${opt.key}`}
          title={opt.label}
          onClick={() => onRate(opt.key)}
        >
          <span className="rating-glyph">{opt.glyph}</span>
          <span className="rating-icon-label">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}
