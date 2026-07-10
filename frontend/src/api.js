const API_BASE = 'http://localhost:5000'

export class ApiError extends Error {}

export async function generateQuestions({ level, category, count, mode, excludeWords, reviewWords }) {
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level,
      category,
      count,
      mode,
      exclude_words: excludeWords,
      review_words: reviewWords,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(data.error || `Request failed with status ${response.status}`)
  }

  return data
}

export async function lookupWords({ level, category, words }) {
  const response = await fetch(`${API_BASE}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, category, words }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(data.error || `Request failed with status ${response.status}`)
  }

  return data.cards
}
