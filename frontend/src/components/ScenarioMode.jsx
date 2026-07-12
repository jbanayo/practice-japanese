import { useEffect, useState } from 'react'
import { getRandomScenario, ApiError } from '../api.js'

export default function ScenarioMode({ onBack }) {
  const [scenario, setScenario] = useState(null)
  const [error, setError] = useState(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [picked, setPicked] = useState(null) // 'a' | 'b' | null
  const [naturalCount, setNaturalCount] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    loadScenario()
  }, [])

  async function loadScenario() {
    setError(null)
    setScenario(null)
    setStepIndex(0)
    setPicked(null)
    setNaturalCount(0)
    setDone(false)
    try {
      const data = await getRandomScenario()
      setScenario(data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the backend.')
    }
  }

  function handlePick(choice) {
    if (picked) return
    setPicked(choice)
    const step = scenario.steps[stepIndex]
    if (choice === step.better_choice) {
      setNaturalCount((c) => c + 1)
    }
  }

  function handleContinue() {
    const nextIndex = stepIndex + 1
    if (nextIndex >= scenario.steps.length) {
      setDone(true)
      return
    }
    setStepIndex(nextIndex)
    setPicked(null)
  }

  if (error) {
    return (
      <div className="panel">
        <div className="error-banner">{error}</div>
        <button className="start-button" style={{ marginTop: 16 }} onClick={loadScenario}>Try Again</button>
        <span className="back-link" onClick={onBack}>← Back to menu</span>
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="panel">
        <div className="loading-caption">Loading a scenario…</div>
      </div>
    )
  }

  if (done) {
    const total = scenario.steps.length
    return (
      <div className="panel complete-panel">
        <div className="complete-stamp">できた</div>
        <div className="panel-label">Scenario Complete</div>
        <div className="complete-stats">
          <div className="stat">
            <span className="stat-value">{naturalCount}/{total}</span>
            <span className="stat-label">Natural Choices</span>
          </div>
        </div>
        <button className="start-button" style={{ marginTop: 20 }} onClick={loadScenario}>
          Try Another Scenario
        </button>
        <span className="back-link" onClick={onBack}>← Back to menu</span>
      </div>
    )
  }

  const step = scenario.steps[stepIndex]
  const showResult = picked !== null

  return (
    <div className="panel scenario-panel">
      <div className="quiz-meta">
        <span className="scenario-title">{scenario.title} <span className="jp">{scenario.title_jp}</span></span>
        <span>{stepIndex + 1} / {scenario.steps.length}</span>
      </div>

      <div className="scenario-situation">
        <div className="scenario-situation-jp">{step.situation_jp}</div>
        <div className="scenario-situation-en">{step.situation}</div>
      </div>

      <div className="scenario-choices">
        {['a', 'b'].map((key) => {
          const choice = step[`choice_${key}`]
          let className = 'scenario-choice'
          if (showResult) {
            if (key === step.better_choice) className += ' more-natural'
            else if (key === picked) className += ' less-natural'
          }
          return (
            <button
              key={key}
              className={className}
              disabled={showResult}
              onClick={() => handlePick(key)}
            >
              <div className="scenario-choice-phrase">{choice.phrase}</div>
              <div className="scenario-choice-reading">{choice.reading}</div>
              <div className="scenario-choice-translation">{choice.translation}</div>
              {showResult && key === step.better_choice && (
                <span className="scenario-tag">MORE NATURAL</span>
              )}
            </button>
          )
        })}
      </div>

      {showResult && (
        <div className="scenario-explanation">
          <p>{step.explanation}</p>
          <button className="start-button" onClick={handleContinue}>
            {stepIndex + 1 < scenario.steps.length ? 'Continue ▸' : 'Finish ▸'}
          </button>
        </div>
      )}

      <span className="back-link" onClick={onBack}>← Back to menu</span>
    </div>
  )
}
