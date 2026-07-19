import { useEffect, useState } from 'react'
import { getWordCountsByLevel, getStreak, getQualityStatsByModel, getAllSessions } from '../db.js'
import { getReferenceCounts, ApiError } from '../api.js'

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1']

const RATING_META = {
  good: { glyph: '✓', label: 'Good' },
  off: { glyph: '~', label: 'Off' },
  broken: { glyph: '✗', label: 'Broken' },
  gem: { glyph: '★', label: 'Gem' },
}

function relativeTime(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function StatsPanel({ onBack }) {
  const [counts, setCounts] = useState(null)
  const [totals, setTotals] = useState(null)
  const [streak, setStreak] = useState(null)
  const [qualityStats, setQualityStats] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getWordCountsByLevel().then(setCounts)
    getStreak().then(setStreak)
    getQualityStatsByModel().then(setQualityStats)
    getAllSessions().then(setSessions)
    getReferenceCounts().then(setTotals).catch((e) => {
      setError(e instanceof ApiError ? e.message : 'Could not reach the backend for total word counts.')
    })
  }, [])

  const loaded = counts && streak && qualityStats && sessions
  const wordsPracticed = loaded
    ? LEVELS.reduce((sum, lvl) => sum + counts[lvl].vocabulary + counts[lvl].kanji, 0)
    : 0
  const vocabPracticed = loaded ? LEVELS.reduce((s, l) => s + counts[l].vocabulary, 0) : 0
  const kanjiPracticed = loaded ? LEVELS.reduce((s, l) => s + counts[l].kanji, 0) : 0

  const encouragement = wordsPracticed === 0
    ? "Take your first session — every word you see starts adding up."
    : streak && streak.currentStreak > 0
      ? "Every question moves the needle. Come back tomorrow — the streak survives if you do."
      : "You've got words on the board. Come back and keep the momentum going."

  return (
    <div className="stats-layout">
      <aside className="stats-hero-col">
        <p className="eyebrow">▸ Progress Report</p>
        <h1 className="stats-hero-title">You're on<br />the line.</h1>
        <p className="stats-hero-sub">{encouragement}</p>

        <div className="stats-hero-card">
          <div className="setup-section-head">Words Practiced <span className="jp">/ れんしゅう</span></div>
          <div className="stats-hero-number">{wordsPracticed}</div>
          <div className="stats-hero-caption">across all levels · keep going</div>

          {streak && streak.currentStreak > 0 && (
            <div className="stats-hero-streak">
              <span className="stats-hero-streak-icon">🔥</span>
              <div>
                <div className="stats-hero-streak-label">{streak.currentStreak}-day streak</div>
                <div className="stats-hero-streak-sub">
                  {streak.longestStreak > streak.currentStreak
                    ? `Best: ${streak.longestStreak} days — keep pushing.`
                    : "Longest yet — don't break it."}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* <button className="start-button" onClick={onBack}>
          RUN A SESSION ▸ <span className="jp">つづける</span> ▸
        </button> */}
      </aside>

      <section className="stats-main-col">
        {error && <div className="error-banner">{error}</div>}

        <div className="stats-section">
          <div className="setup-section-head">Level Progress <span className="jp">/ レベル別</span></div>
          <div className="stats-level-list">
            {LEVELS.map((level) => {
              const practiced = loaded ? counts[level].vocabulary + counts[level].kanji : 0
              const total = totals
                ? (totals.vocabulary[level] || 0) + (totals.kanji[level] || 0)
                : 0
              const pct = total > 0 ? Math.min(100, (practiced / total) * 100) : 0
              const active = practiced > 0
              return (
                <div className="stats-level-row" key={level}>
                  <span className={`stats-level-badge${active ? ' active' : ''}`}>{level}</span>
                  <div className="stats-level-bar-col">
                    <div className="stats-level-bar-top">
                      <span>{practiced}{total > 0 && <span className="stats-level-total"> / {total.toLocaleString()} words</span>}</span>
                      <span className="stats-level-pct">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="stats-level-bar-track">
                      <div
                        className={`stats-level-bar-fill${active ? ' active' : ''}`}
                        style={{ width: `${Math.max(pct, active ? 1.5 : 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="stats-section">
          <div className="setup-section-head">By Category <span className="jp">/ カテゴリ別</span></div>
          <div className="stats-category-grid">
            <div className="stats-category-card">
              <div className="stats-category-label">VOCABULARY <span className="jp">/ ごい</span></div>
              <div className="stats-category-number">{vocabPracticed}</div>
              <div className="stats-category-caption">practiced</div>
            </div>
            <div className="stats-category-card">
              <div className="stats-category-label">KANJI <span className="jp">/ かんじ</span></div>
              <div className="stats-category-number">{kanjiPracticed}</div>
              <div className="stats-category-caption">practiced</div>
            </div>
          </div>
        </div>

        <div className="stats-section">
          <div className="setup-section-head">Tutor Feedback <span className="jp">/ AIひょうか</span></div>
          {qualityStats && Object.keys(qualityStats).length === 0 ? (
            <p className="settings-description">
              No ratings yet — the optional rating buttons during a quiz or conversation help track how well the AI is doing.
            </p>
          ) : (
            qualityStats && Object.entries(qualityStats).map(([model, s]) => {
              const goodShare = Math.round(((s.good + s.gem) / s.total) * 100)
              return (
                <div className="stats-feedback-card" key={model}>
                  <div className="stats-feedback-top">
                    <div>
                      <div className="setup-section-head" style={{ marginBottom: 4 }}>Signal Quality</div>
                      <div className="stats-feedback-share">{goodShare}% <span>useful</span></div>
                    </div>
                    <div className="stats-feedback-meta">
                      {s.total} ratings<br />
                      <span>{model}</span>
                    </div>
                  </div>

                  <div className="stats-feedback-bar">
                    {['good', 'off', 'broken', 'gem'].map((key) => (
                      s[key] > 0 && (
                        <div
                          key={key}
                          className={`stats-feedback-segment stats-feedback-${key}`}
                          style={{ width: `${(s[key] / s.total) * 100}%` }}
                        />
                      )
                    ))}
                  </div>

                  <div className="stats-feedback-legend">
                    {['good', 'off', 'broken', 'gem'].map((key) => (
                      <div className="stats-feedback-legend-item" key={key}>
                        <span className={`stats-feedback-glyph stats-feedback-${key}`}>{RATING_META[key].glyph}</span>
                        <div>
                          <div className="stats-feedback-legend-label">{RATING_META[key].label}</div>
                          <div className="stats-feedback-legend-value">
                            {s[key]} <span>{Math.round((s[key] / s.total) * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="stats-feedback-note">
                    {goodShare >= 70
                      ? "The model is doing well. Most rated questions land as natural or memorable — keep flagging the odd ones."
                      : "Mixed results so far — keep rating so the picture gets clearer, and consider trying a different model in Settings."}
                  </p>
                </div>
              )
            })
          )}
        </div>

        <div className="stats-section">
          <div className="setup-section-head">Recent Sessions <span className="jp">/ さいきん</span></div>
          {sessions && sessions.length === 0 ? (
            <p className="settings-description">No completed sessions yet.</p>
          ) : (
            <div className="stats-recent-list">
              {sessions && sessions.slice(0, 8).map((s) => (
                <div className="stats-recent-row" key={s.id}>
                  <span className="stats-recent-time">{relativeTime(s.date)}</span>
                  <span className="stats-recent-level">{s.level}</span>
                  <span className="stats-recent-cat">{s.category?.toUpperCase()}</span>
                  <span className="stats-recent-note">
                    {s.questionCount} questions · {s.initialScorePercent}% first try · {s.attemptsToMastery} round{s.attemptsToMastery === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <span className="back-link" onClick={onBack}>← Back to menu</span>
      </section>
    </div>
  )
}
