import { useEffect, useState } from 'react'

// A handful of real, simple kanji to cycle through while waiting —
// purely decorative here, not tied to the actual generated content.
const CYCLE_KANJI = ['学', '習', '力', '道', '心']

const CAPTIONS = [
  'Consulting the local model…',
  'Drawing from verified vocabulary…',
  'Composing example sentences…',
  'Almost ready…',
]

export default function LoadingScreen() {
  const [kanjiIndex, setKanjiIndex] = useState(0)
  const [captionIndex, setCaptionIndex] = useState(0)

  useEffect(() => {
    const kanjiTimer = setInterval(() => {
      setKanjiIndex((i) => (i + 1) % CYCLE_KANJI.length)
    }, 1800)
    const captionTimer = setInterval(() => {
      setCaptionIndex((i) => (i + 1) % CAPTIONS.length)
    }, 2600)
    return () => {
      clearInterval(kanjiTimer)
      clearInterval(captionTimer)
    }
  }, [])

  return (
    <div className="loading-screen">
      <div className="ink-circle-wrap">
        <svg viewBox="0 0 120 120">
          <circle className="ink-circle-track" cx="60" cy="60" r="55" />
          <circle className="ink-circle-stroke" cx="60" cy="60" r="55" />
        </svg>
        <div className="loading-kanji">{CYCLE_KANJI[kanjiIndex]}</div>
      </div>
      <div className="loading-caption">{CAPTIONS[captionIndex]}</div>
    </div>
  )
}
