import Brand from './Brand.jsx'

const NAV_ITEMS = [
  { key: 'config', label: 'Setup', jp: 'せってい' },
  { key: 'scenario', label: 'Converse', jp: 'かいわ' },
  { key: 'stats', label: 'Stats', jp: 'とうけい' },
  { key: 'flashcards', label: 'Flashcards', jp: 'カード' },
  { key: 'settings', label: 'Settings', jp: 'せってい' },
]

export default function Sidebar({ activeStage, onNavigate, streak }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <Brand />
      </div>

      {streak && streak.currentStreak > 0 && (
        <div className="streak-badge sidebar-streak">
          <span className="flame">🔥</span>
          {streak.currentStreak} day streak
        </div>
      )}

      <div className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`sidebar-nav-item${activeStage === item.key ? ' active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            <span>{item.label}</span>
            <span className="jp">{item.jp}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <span>LOCAL-FIRST</span>
        <span>v0.1</span>
      </div>
    </nav>
  )
}
