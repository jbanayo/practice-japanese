import { useState } from 'react'
import { updateWordStat } from '../db.js'

/** Shuffles a question's options and recomputes correct_option so the
 * answer isn't always in the same button position on retest rounds. */
function shuffleOptions(question) {
  const correctValue = question.options[question.correct_option]
  const shuffled = [...question.options]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return {
    ...question,
    options: shuffled,
    correct_option: shuffled.indexOf(correctValue),
  }
}

export default function QuizScreen({ questions, config, onComplete }) {
  const [round, setRound] = useState(1)
  const [queue, setQueue] = useState(questions)
  const [pointer, setPointer] = useState(0)
  const [selected, setSelected] = useState(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [wrongThisRound, setWrongThisRound] = useState([])
  const [correctFirstRound, setCorrectFirstRound] = useState(0)

  const current = queue[pointer]
  const isCorrect = selected !== null && selected === current.correct_option
  const isLastInQueue = pointer + 1 >= queue.length

  function handleSelect(idx) {
    if (isAnswered) return
    setSelected(idx)
    setIsAnswered(true)

    const wasCorrect = idx === current.correct_option

    // Only round 1 counts toward "first try" mastery stats — retries in
    // later rounds are the whole point of the loop, not a fresh attempt.
    if (round === 1) {
      updateWordStat(config.category, config.level, current.topic, wasCorrect)
      if (wasCorrect) setCorrectFirstRound((c) => c + 1)
    }

    if (!wasCorrect) {
      setWrongThisRound((w) => [...w, current])
    }
  }

  function handleNext() {
    if (!isLastInQueue) {
      setPointer((p) => p + 1)
      setSelected(null)
      setIsAnswered(false)
      return
    }

    if (wrongThisRound.length === 0) {
      // 100% on this round with nothing left to retest — session complete.
      const initialScorePercent = Math.round((correctFirstRound / questions.length) * 100)
      onComplete({
        level: config.level,
        category: config.category,
        questionCount: questions.length,
        initialScorePercent,
        attemptsToMastery: round,
      })
      return
    }

    // Start a new round using only the missed questions, options reshuffled.
    setQueue(wrongThisRound.map(shuffleOptions))
    setWrongThisRound([])
    setPointer(0)
    setSelected(null)
    setIsAnswered(false)
    setRound((r) => r + 1)
  }

  return (
    <div className="panel quiz-panel">
      <div className="quiz-meta">
        <span>Round {round}</span>
        <span>{pointer + 1} / {queue.length}</span>
      </div>

      <div className="quiz-topic">{current.topic}</div>
      <div className="quiz-prompt">
        {current.sentence_segments ? (
          <>
            <div className="quiz-sentence">
              {current.sentence_segments.map((seg, idx) =>
                seg.furigana ? (
                  <ruby key={idx}>
                    {seg.text}
                    <rt>{seg.furigana}</rt>
                  </ruby>
                ) : (
                  <span key={idx}>{seg.text}</span>
                )
              )}
            </div>
            <div className="quiz-question-line">{current.question_line}</div>
          </>
        ) : (
          // Grammar path (parked feature) still uses the older plain-prompt shape
          current.prompt
        )}
      </div>

      <div className="quiz-options">
        {current.options.map((opt, idx) => {
          let className = 'quiz-option'
          if (isAnswered) {
            if (idx === current.correct_option) className += ' correct'
            else if (idx === selected) className += ' wrong'
          }
          return (
            <button
              key={idx}
              className={className}
              onClick={() => handleSelect(idx)}
              disabled={isAnswered}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {isAnswered && (
        <div className={`quiz-feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`}>
          <strong>{isCorrect ? '正解 — Correct!' : '不正解 — Incorrect'}</strong>
          <p>{current.explanation}</p>
          <button className="generate-button" onClick={handleNext}>
            Next ▸
          </button>
        </div>
      )}
    </div>
  )
}
