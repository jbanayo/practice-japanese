import { useState } from 'react'
import { getRandomScenario, ApiError } from '../api.js'
import { getSelectedModel, saveConversation, getAllConversations, saveQualityRating } from '../db.js'
import RatingRow from './RatingRow.jsx'

const LEVELS = [
  { id: 'N5', enabled: true },
  { id: 'N4', enabled: true },
  { id: 'N3', enabled: true },
  { id: 'N2', enabled: false },
  { id: 'N1', enabled: false },
]

function renderSegments(segments) {
  return segments.map((seg, idx) =>
    seg.furigana ? (
      <ruby key={idx}>
        {seg.text}
        <rt>{seg.furigana}</rt>
      </ruby>
    ) : (
      <span key={idx}>{seg.text}</span>
    )
  )
}

export default function ScenarioMode({ onBack }) {
  const [stage, setStage] = useState('setup') // setup | conversation | complete | history | replay
  const [level, setLevel] = useState('N5')
  const [scenario, setScenario] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const [messages, setMessages] = useState([]) // growing chat transcript
  const [picks, setPicks] = useState([]) // choice key picked at each step, for saving
  const [stepIndex, setStepIndex] = useState(0)
  const [picked, setPicked] = useState(null)
  const [naturalCount, setNaturalCount] = useState(0)
  const [ratedSteps, setRatedSteps] = useState(new Set())

  const [pastConversations, setPastConversations] = useState(null)
  const [replayConversation, setReplayConversation] = useState(null)

  async function handleStart() {
    setError(null)
    setLoading(true)
    try {
      const selectedModel = await getSelectedModel()
      const data = await getRandomScenario(level, selectedModel)
      setScenario(data)
      setStepIndex(0)
      setPicked(null)
      setNaturalCount(0)
      setPicks([])
      setRatedSteps(new Set())
      setMessages([{
        type: 'npc',
        text: data.steps[0].situation_jp,
        segments: data.steps[0].situation_segments,
        revealed: false,
      }])
      setStage('conversation')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the backend.')
    } finally {
      setLoading(false)
    }
  }

  function handlePick(choiceKey) {
    if (picked) return
    const step = scenario.steps[stepIndex]
    const choice = step[`choice_${choiceKey}`]
    const isNatural = choiceKey === step.better_choice

    setPicked(choiceKey)
    if (isNatural) setNaturalCount((c) => c + 1)
    setPicks((prev) => [...prev, choiceKey])

    // Reveal furigana on the NPC line that prompted this choice, so the
    // person can check whether they actually understood it correctly.
    setMessages((prev) => {
      const updated = [...prev]
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].type === 'npc') {
          updated[i] = { ...updated[i], revealed: true }
          break
        }
      }
      return [
        ...updated,
        {
          type: 'user',
          text: choice.phrase,
          reading: choice.reading,
          translation: choice.translation,
          isNatural,
          explanation: step.explanation,
        },
      ]
    })
  }

  async function handleContinue() {
    const nextIndex = stepIndex + 1
    if (nextIndex >= scenario.steps.length) {
      await saveConversation({
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        scenarioTitleJp: scenario.title_jp,
        level: scenario.level,
        npcRole: scenario.npc_role,
        steps: scenario.steps,
        picks,
        naturalCount,
        totalSteps: scenario.steps.length,
        modelUsed: scenario.model_used,
        aiDialogueUsed: scenario.ai_dialogue_used,
      })
      setStage('complete')
      return
    }
    setStepIndex(nextIndex)
    setPicked(null)
    setMessages((prev) => [...prev, {
      type: 'npc',
      text: scenario.steps[nextIndex].situation_jp,
      segments: scenario.steps[nextIndex].situation_segments,
      revealed: false,
    }])
  }

  async function handleRate(rating) {
    await saveQualityRating({
      model: scenario.model_used,
      category: 'conversation',
      level: scenario.level,
      word: `${scenario.id}:step${stepIndex + 1}`,
      rating,
    })
    setRatedSteps((prev) => new Set(prev).add(stepIndex))
  }

  async function openHistory() {
    const all = await getAllConversations()
    setPastConversations(all)
    setStage('history')
  }

  // --- Setup screen ---
  if (stage === 'setup') {
    return (
      <div className="panel">
        <div className="panel-section">
          <div className="panel-label">Conversation Level</div>
          <div className="level-pill-row">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                disabled={!l.enabled}
                className={`level-pill${level === l.id ? ' active' : ''}`}
                onClick={() => setLevel(l.id)}
                title={l.enabled ? undefined : 'Coming soon'}
              >
                {l.id}
              </button>
            ))}
          </div>
          <p className="settings-description" style={{ marginTop: 14 }}>
            N2/N1 conversation scenarios are still being curated — coming soon.
          </p>
        </div>

        <button className="start-button" onClick={handleStart} disabled={loading}>
          {loading ? 'Loading…' : <>CONVERSE ▸ <span className="jp">かいわ</span> ▸</>}
        </button>

        {error && <div className="error-banner">{error}</div>}

        <span className="back-link" onClick={openHistory}>Review Past Conversations</span>
        <br />
        <span className="back-link" onClick={onBack}>← Back to menu</span>
      </div>
    )
  }

  // --- History list (no Ollama calls — just browsing saved transcripts) ---
  if (stage === 'history') {
    return (
      <div className="panel">
        <div className="panel-label">Past Conversations</div>
        {pastConversations.length === 0 ? (
          <p className="settings-description">
            No completed conversations yet — finish one and it'll show up here for free replay.
          </p>
        ) : (
          <div className="stats-table">
            {pastConversations.map((c) => (
              <button
                key={c.id}
                className="chat-choice-button"
                style={{ marginBottom: 8, width: '100%' }}
                onClick={() => { setReplayConversation(c); setStage('replay') }}
              >
                {c.scenarioTitle} <span className="jp">{c.scenarioTitleJp}</span>
                <br />
                <span className="settings-description" style={{ margin: 0 }}>
                  {c.level} · {c.naturalCount}/{c.totalSteps} natural · {new Date(c.date).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}
        <span className="back-link" onClick={() => setStage('setup')}>← Back</span>
      </div>
    )
  }

  // --- Replay screen (pure local playback, zero Ollama calls) ---
  if (stage === 'replay') {
    const c = replayConversation
    return (
      <div className="panel scenario-panel">
        <div className="quiz-meta">
          <span className="scenario-title">{c.scenarioTitle} <span className="jp">{c.scenarioTitleJp}</span></span>
          <span>REPLAY</span>
        </div>
        <div className="chat-thread">
          {c.steps.map((step, i) => {
            const pickedKey = c.picks[i]
            const choice = step[`choice_${pickedKey}`]
            const isNatural = pickedKey === step.better_choice
            return (
              <div key={i} style={{ display: 'contents' }}>
                <div className="chat-bubble chat-bubble-npc">
                  <span className="chat-bubble-role">{c.npcRole}</span>
                  {renderSegments(step.situation_segments)}
                </div>
                <div className="chat-bubble-row-user">
                  <div className={`chat-bubble chat-bubble-user${isNatural ? '' : ' less-natural'}`}>
                    {choice.phrase}
                  </div>
                  <div className="chat-reveal">
                    <span className="chat-reveal-reading">{choice.reading}</span>
                    <span className="chat-reveal-translation">{choice.translation}</span>
                    <span className={`chat-reveal-tag ${isNatural ? 'is-natural' : 'is-less-natural'}`}>
                      {isNatural ? 'MORE NATURAL' : 'LESS NATURAL'}
                    </span>
                    <p className="chat-reveal-explanation">{step.explanation}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <span className="back-link" onClick={() => setStage('history')}>← Back to history</span>
      </div>
    )
  }

  // --- Completion screen ---
  if (stage === 'complete') {
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
        <button className="start-button" style={{ marginTop: 20 }} onClick={() => setStage('setup')}>
          Try Another Scenario
        </button>
        <span className="back-link" onClick={onBack}>← Back to menu</span>
      </div>
    )
  }

  // --- Conversation screen (chat bubbles, single column) ---
  const step = scenario.steps[stepIndex]
  const showChoices = picked === null

  return (
    <div className="panel scenario-panel">
      <div className="quiz-meta">
        <span className="scenario-title">{scenario.title} <span className="jp">{scenario.title_jp}</span></span>
        <span>{stepIndex + 1} / {scenario.steps.length}</span>
      </div>

      <div className="chat-thread">
        {messages.map((m, i) =>
          m.type === 'npc' ? (
            <div className="chat-bubble chat-bubble-npc" key={i}>
              <span className="chat-bubble-role">{scenario.npc_role}</span>
              {m.revealed ? renderSegments(m.segments) : m.text}
            </div>
          ) : (
            <div className="chat-bubble-row-user" key={i}>
              <div className={`chat-bubble chat-bubble-user${m.isNatural ? '' : ' less-natural'}`}>
                {m.text}
              </div>
              <div className="chat-reveal">
                <span className="chat-reveal-reading">{m.reading}</span>
                <span className="chat-reveal-translation">{m.translation}</span>
                <span className={`chat-reveal-tag ${m.isNatural ? 'is-natural' : 'is-less-natural'}`}>
                  {m.isNatural ? 'MORE NATURAL' : 'LESS NATURAL'}
                </span>
                <p className="chat-reveal-explanation">{m.explanation}</p>
              </div>
            </div>
          )
        )}
      </div>

      {!showChoices && scenario.ai_dialogue_used && (
        <RatingRow rated={ratedSteps.has(stepIndex)} onRate={handleRate} />
      )}

      {showChoices ? (
        <div className="chat-choice-row">
          {['a', 'b'].map((key) => (
            <button key={key} className="chat-choice-button" onClick={() => handlePick(key)}>
              {step[`choice_${key}`].phrase}
            </button>
          ))}
        </div>
      ) : (
        <button className="start-button" onClick={handleContinue}>
          {stepIndex + 1 < scenario.steps.length ? 'Continue ▸' : 'Finish ▸'}
        </button>
      )}

      <span className="back-link" onClick={onBack}>← Back to menu</span>
    </div>
  )
}
