import { useEffect, useState } from 'react'
import { getWordCountsByLevel, getQualityStatsByModel } from '../db.js'

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1']

export default function StatsPanel({ onBack }) {
  const [counts, setCounts] = useState(null)
  const [qualityStats, setQualityStats] = useState(null)

  useEffect(() => {
    getWordCountsByLevel().then(setCounts)
    getQualityStatsByModel().then(setQualityStats)
  }, [])

  const totals = counts
    ? LEVELS.reduce(
        (acc, lvl) => ({
          vocabulary: acc.vocabulary + counts[lvl].vocabulary,
          kanji: acc.kanji + counts[lvl].kanji,
        }),
        { vocabulary: 0, kanji: 0 }
      )
    : null

  return (
    <div className="panel">
      <div className="panel-section">
        <div className="panel-label">Words Learned</div>

        {!counts ? (
          <div className="loading-caption">Loading…</div>
        ) : (
          <div className="stats-table">
            <div className="stats-row stats-header">
              <span>Level</span>
              <span>Vocabulary</span>
              <span>Kanji</span>
            </div>
            {LEVELS.map((level) => (
              <div className="stats-row" key={level}>
                <span className="stats-level">{level}</span>
                <span>{counts[level].vocabulary}</span>
                <span>{counts[level].kanji}</span>
              </div>
            ))}
            <div className="stats-row stats-total">
              <span>Total</span>
              <span>{totals.vocabulary}</span>
              <span>{totals.kanji}</span>
            </div>
          </div>
        )}
      </div>

      <div className="panel-section">
        <div className="panel-label">AI Quality Ratings by Model</div>

        {!qualityStats ? (
          <div className="loading-caption">Loading…</div>
        ) : Object.keys(qualityStats).length === 0 ? (
          <p className="settings-description">
            No ratings submitted yet — the "Rate this question" button during
            a quiz is optional, so this fills in as you use it.
          </p>
        ) : (
          <div className="stats-table">
            <div className="stats-row stats-header stats-row-quality">
              <span>Model</span>
              <span>Very Wrong</span>
              <span>Slightly Wrong</span>
              <span>Okay</span>
            </div>
            {Object.entries(qualityStats).map(([model, s]) => (
              <div className="stats-row stats-row-quality" key={model}>
                <span className="stats-model-name">{model}</span>
                <span>{s.very_wrong}</span>
                <span>{s.slightly_wrong}</span>
                <span>{s.okay}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <span className="back-link" onClick={onBack}>← Back to menu</span>
    </div>
  )
}
