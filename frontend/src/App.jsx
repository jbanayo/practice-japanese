import { useEffect, useState } from 'react'
import ConfigPanel from './components/ConfigPanel.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'
import QuizScreen from './components/QuizScreen.jsx'
import SessionComplete from './components/SessionComplete.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import FlashcardDeck from './components/FlashcardDeck.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import ScenarioMode from './components/ScenarioMode.jsx'
import { generateQuestions, ApiError } from './api.js'
import { getStreak, recordActivityToday, saveSession, getSeenWords, getWordsForReview, getSelectedModel } from './db.js'

const STAGE = {
  CONFIG: 'config',
  LOADING: 'loading',
  QUIZ: 'quiz',
  COMPLETE: 'complete',
  STATS: 'stats',
  FLASHCARDS: 'flashcards',
  SETTINGS: 'settings',
  SCENARIO: 'scenario',
}

// Maps every stage to one of the three breadcrumb labels in the top bar
const BREADCRUMB_FOR_STAGE = {
  [STAGE.CONFIG]: 'Setup',
  [STAGE.LOADING]: 'Session',
  [STAGE.QUIZ]: 'Session',
  [STAGE.SCENARIO]: 'Session',
  [STAGE.COMPLETE]: 'Review',
  [STAGE.STATS]: 'Review',
  [STAGE.FLASHCARDS]: 'Review',
  [STAGE.SETTINGS]: 'Review',
}

const MIN_WORDS_FOR_REVIEW = 5 // below this, review mode isn't very useful yet

export default function App() {
  const [stage, setStage] = useState(STAGE.CONFIG)
  const [config, setConfig] = useState({ level: 'N4', category: 'vocabulary', count: 5, mode: 'new' })
  const [questions, setQuestions] = useState([])
  const [error, setError] = useState(null)
  const [streak, setStreak] = useState(null)
  const [summary, setSummary] = useState(null)
  const [reviewAvailable, setReviewAvailable] = useState(false)
  const [modelUsed, setModelUsed] = useState(null)
  const [selectedModelLabel, setSelectedModelLabel] = useState(null)

  useEffect(() => {
    getStreak().then(setStreak)
    getSelectedModel().then((m) => setSelectedModelLabel(m || 'qwen2.5:7b-instruct'))
  }, [])

  // Check whether review mode has enough words to be worth offering,
  // re-checked whenever level/category changes.
  useEffect(() => {
    let cancelled = false
    getWordsForReview(config.category, config.level, MIN_WORDS_FOR_REVIEW).then((words) => {
      if (!cancelled) setReviewAvailable(words.length > 0)
    })
    return () => { cancelled = true }
  }, [config.category, config.level, stage])

  async function handleGenerate() {
    setError(null)
    setStage(STAGE.LOADING)
    try {
      const selectedModel = await getSelectedModel()
      let requestParams = {
        level: config.level, category: config.category, count: config.count, mode: config.mode,
        model: selectedModel || undefined, // undefined lets the backend use its own default
      }

      if (config.mode === 'review') {
        const reviewWords = await getWordsForReview(config.category, config.level, config.count)
        requestParams.reviewWords = reviewWords
      } else {
        const excludeWords = await getSeenWords(config.category, config.level)
        requestParams.excludeWords = excludeWords
      }

      const data = await generateQuestions(requestParams)
      setQuestions(data.questions)
      setModelUsed(data.model_used)
      setStage(STAGE.QUIZ)
    } catch (e) {
      const message = e instanceof ApiError
        ? e.message
        : 'Could not reach the backend. Is the Flask server running on localhost:5000?'
      setError(message)
      setStage(STAGE.CONFIG)
    }
  }

  // Real completion point: fires once the person has reached 100% mastery
  // on the retest queue, not just on generation.
  async function handleQuizComplete(sessionSummary) {
    setSummary(sessionSummary)
    await saveSession(sessionSummary)
    const updatedStreak = await recordActivityToday()
    setStreak(updatedStreak)
    setStage(STAGE.COMPLETE)
  }

  // Quitting mid-session: no session record, no streak credit — but word
  // generation itself is already preserved by QuizScreen before this fires.
  function handleQuizQuit() {
    setStage(STAGE.CONFIG)
  }

  const currentBreadcrumb = BREADCRUMB_FOR_STAGE[stage]

  return (
    <div className="genkou-bg">
      <header className="top-bar">
        <div className="top-bar-inner">
          <div className="top-bar-brand">
            <span className="top-bar-logo">STUDY.JP</span>
            <span className="top-bar-jp">日本語能力試験</span>
          </div>
          <div className="top-bar-nav">
            {['Setup', 'Session', 'Review'].map((label, i) => (
              <span key={label} style={{ display: 'contents' }}>
                {i > 0 && <span className="sep">/</span>}
                <button className={currentBreadcrumb === label ? 'active' : ''} disabled>
                  {label}
                </button>
              </span>
            ))}
          </div>
        </div>
      </header>

      {stage === STAGE.CONFIG ? (
        <div className="setup-layout">
          <div className="setup-title-block">
            <p className="eyebrow">▸ New Session</p>
            <h1>Configure<br />your line.</h1>
            <p>Pick a level, category, and size. Questions are generated fresh by a local model — no fixed bank, no accounts.</p>

            <div className="setup-current-badge">
              <span className="badge-circle">{config.level}</span>
              <div className="badge-label">
                Current Level
                <div className="badge-sub">{config.category.toUpperCase()} · {String(config.count).padStart(2, '0')} Q</div>
              </div>
            </div>

            {streak && streak.currentStreak > 0 && (
              <div className="streak-badge" style={{ marginTop: 20 }}>
                <span className="flame">🔥</span>
                {streak.currentStreak} day streak
              </div>
            )}
          </div>

          <ConfigPanel
            config={config}
            onChange={setConfig}
            onGenerate={handleGenerate}
            onConverse={() => setStage(STAGE.SCENARIO)}
            isLoading={false}
            error={error}
            reviewAvailable={reviewAvailable}
            modelLabel={selectedModelLabel}
            onOpenStats={() => setStage(STAGE.STATS)}
            onOpenFlashcards={() => setStage(STAGE.FLASHCARDS)}
            onOpenSettings={() => setStage(STAGE.SETTINGS)}
          />
        </div>
      ) : (
        <div className="app-shell">
          {stage === STAGE.LOADING && <LoadingScreen />}

          {stage === STAGE.QUIZ && (
            <QuizScreen
              questions={questions}
              config={config}
              modelUsed={modelUsed}
              onComplete={handleQuizComplete}
              onQuit={handleQuizQuit}
            />
          )}

          {stage === STAGE.COMPLETE && (
            <SessionComplete
              summary={summary}
              streak={streak}
              onRestart={() => setStage(STAGE.CONFIG)}
            />
          )}

          {stage === STAGE.STATS && (
            <StatsPanel onBack={() => setStage(STAGE.CONFIG)} />
          )}

          {stage === STAGE.FLASHCARDS && (
            <FlashcardDeck onBack={() => setStage(STAGE.CONFIG)} />
          )}

          {stage === STAGE.SETTINGS && (
            <SettingsPanel onBack={() => setStage(STAGE.CONFIG)} />
          )}

          {stage === STAGE.SCENARIO && (
            <ScenarioMode onBack={() => setStage(STAGE.CONFIG)} />
          )}
        </div>
      )}

      <footer className="bottom-bar">
        <div className="bottom-bar-inner">
          <span>JLPT.STUDY · LOCAL-FIRST</span>
          <span>v0.1 · {currentBreadcrumb?.toUpperCase()}</span>
        </div>
      </footer>
    </div>
  )
}

