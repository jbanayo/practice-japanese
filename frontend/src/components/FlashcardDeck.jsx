import { useState } from 'react'
import { getReviewedWords } from '../db.js'
import { lookupWords, ApiError } from '../api.js'

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1']

function StampOption({ selected, onClick, children }) {
  return (
    <button type="button" className={`stamp-option${selected ? ' selected' : ''}`} onClick={onClick}>
      <span className="stamp-mark" />
      {children}
    </button>
  )
}

export default function FlashcardDeck({ onBack }) {
  const [stage, setStage] = useState('setup') // setup | deck | empty
  const [level, setLevel] = useState('N5')
  const [category, setCategory] = useState('vocabulary')
  const [cards, setCards] = useState([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [error, setError] = useState(null)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)

  async function handleStart() {
    setError(null)
    const words = await getReviewedWords(category, level)
    if (words.length === 0) {
      setStage('empty')
      return
    }
    try {
      const fetchedCards = await lookupWords({ level, category, words })
      setCards(fetchedCards)
      setIndex(0)
      setFlipped(false)
      setStage('deck')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the backend.')
    }
  }

  function goNext() {
    setFlipped(false)
    setIndex((i) => Math.min(i + 1, cards.length - 1))
  }

  function goPrev() {
    setFlipped(false)
    setIndex((i) => Math.max(i - 1, 0))
  }

  // Simple pointer-drag swipe (works for touch and mouse/trackpad)
  function handlePointerDown(e) {
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function handlePointerMove(e) {
    if (!dragging) return
    setDragX(e.movementX ? dragX + e.movementX : dragX)
  }
  function handlePointerUp() {
    if (dragX > 60) goPrev()
    else if (dragX < -60) goNext()
    setDragging(false)
    setDragX(0)
  }

  if (stage === 'setup') {
    return (
      <div className="panel">
        <div className="panel-section">
          <div className="panel-label">Review Deck — JLPT Level</div>
          <div className="stamp-grid">
            {LEVELS.map((lvl) => (
              <StampOption key={lvl} selected={level === lvl} onClick={() => setLevel(lvl)}>
                {lvl}
              </StampOption>
            ))}
          </div>
        </div>
        <div className="panel-section">
          <div className="panel-label">Category</div>
          <div className="stamp-grid">
            <StampOption selected={category === 'vocabulary'} onClick={() => setCategory('vocabulary')}>
              Vocabulary <span className="jp">語彙</span>
            </StampOption>
            <StampOption selected={category === 'kanji'} onClick={() => setCategory('kanji')}>
              Kanji <span className="jp">漢字</span>
            </StampOption>
          </div>
        </div>
        <button className="generate-button" onClick={handleStart}>
          めくる — Start Flashcards
        </button>
        {error && <div className="error-banner">{error}</div>}
        <span className="back-link" onClick={onBack}>← Back to menu</span>
      </div>
    )
  }

  if (stage === 'empty') {
    return (
      <div className="panel">
        <div className="panel-section">
          <div className="panel-label">No words yet</div>
          <p>You haven't answered any {category} questions at {level} yet — take a quiz first, then come back to review them here.</p>
        </div>
        <button className="generate-button" onClick={() => setStage('setup')}>
          Try a different level
        </button>
        <span className="back-link" onClick={onBack}>← Back to menu</span>
      </div>
    )
  }

  const card = cards[index]

  return (
    <div className="panel flashcard-panel">
      <div className="quiz-meta">
        <span>{level} · {category}</span>
        <span>{index + 1} / {cards.length}</span>
      </div>

      <div
        className="flashcard"
        style={{ transform: `translateX(${dragX}px) rotate(${dragX / 20}deg)` }}
        onClick={() => setFlipped((f) => !f)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {!flipped ? (
          <div className="flashcard-front">{card.word}</div>
        ) : (
          <div className="flashcard-back">
            <div className="flashcard-reading">{card.reading}</div>
            <div className="flashcard-meaning">{card.meaning}</div>
          </div>
        )}
      </div>

      <div className="flashcard-hint">Tap card to flip · swipe or use buttons to navigate</div>

      <div className="flashcard-nav">
        <button className="stamp-option" onClick={goPrev} disabled={index === 0}>
          ← Previous
        </button>
        <button className="stamp-option" onClick={goNext} disabled={index === cards.length - 1}>
          Next →
        </button>
      </div>

      <span className="back-link" onClick={onBack}>← Back to menu</span>
    </div>
  )
}
