export default function SessionComplete({ summary, streak, onRestart }) {
  return (
    <div className="panel complete-panel">
      <div className="complete-stamp">合格</div>
      <div className="panel-label">Session Complete</div>

      <div className="complete-stats">
        <div className="stat">
          <span className="stat-value">{summary.initialScorePercent}%</span>
          <span className="stat-label">Initial Score</span>
        </div>
        <div className="stat">
          <span className="stat-value">{summary.attemptsToMastery}</span>
          <span className="stat-label">Rounds to Mastery</span>
        </div>
        <div className="stat">
          <span className="stat-value">{summary.questionCount}</span>
          <span className="stat-label">Questions</span>
        </div>
      </div>

      {streak && (
        <div className="streak-badge complete-streak">
          <span className="flame">🔥</span>
          {streak.currentStreak} day streak
        </div>
      )}

      <button className="generate-button" onClick={onRestart}>
        New Session
      </button>
    </div>
  )
}
