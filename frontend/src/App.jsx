import { useEffect, useState } from 'react'
import ConfigPanel from './components/ConfigPanel.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'
import QuizScreen from './components/QuizScreen.jsx'
import SessionComplete from './components/SessionComplete.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import FlashcardDeck from './components/FlashcardDeck.jsx'
import { generateQuestions, ApiError } from './api.js'
import { getStreak, recordActivityToday, saveSession, getSeenWords, getWordsForReview } from './db.js'

const STAGE = {
  CONFIG: 'config',
  LOADING: 'loading',
  QUIZ: 'quiz',
  COMPLETE: 'complete',
  STATS: 'stats',
  FLASHCARDS: 'flashcards',
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

  useEffect(() => {
    getStreak().then(setStreak)
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
      let requestParams = { level: config.level, category: config.category, count: config.count, mode: config.mode }

      if (config.mode === 'review') {
        const reviewWords = await getWordsForReview(config.category, config.level, config.count)
        requestParams.reviewWords = reviewWords
      } else {
        const excludeWords = await getSeenWords(config.category, config.level)
        requestParams.excludeWords = excludeWords
      }

      const data = await generateQuestions(requestParams)
      setQuestions(data.questions)
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

  return (
    <div className="genkou-bg">
      <div className="app-shell">
        <header className="app-header">
          <h1 className="title-jp">漢字道場</h1>
          <div className="title-sub">JLPT Adaptive Practice</div>
          {streak && streak.currentStreak > 0 && stage === STAGE.CONFIG && (
            <div className="streak-badge">
              <span className="flame">🔥</span>
              {streak.currentStreak} day streak
            </div>
          )}
        </header>

        {stage === STAGE.CONFIG && (
          <>
            <ConfigPanel
              config={config}
              onChange={setConfig}
              onGenerate={handleGenerate}
              isLoading={false}
              error={error}
              reviewAvailable={reviewAvailable}
            />
            <div className="menu-links">
              <span className="back-link" onClick={() => setStage(STAGE.STATS)}>View Stats</span>
              <span className="back-link" onClick={() => setStage(STAGE.FLASHCARDS)}>Flashcard Deck</span>
            </div>
          </>
        )}

        {stage === STAGE.LOADING && <LoadingScreen />}

        {stage === STAGE.QUIZ && (
          <QuizScreen
            questions={questions}
            config={config}
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
      </div>
    </div>
  )
}

