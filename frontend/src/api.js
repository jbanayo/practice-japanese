const API_BASE = 'http://localhost:5000'

export class ApiError extends Error {}

export async function generateQuestions({ level, category, count, mode, excludeWords, reviewWords, model }) {
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
      model,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(data.error || `Request failed with status ${response.status}`)
  }

  return data
}

export async function getAvailableModels() {
  const response = await fetch(`${API_BASE}/models`)
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

export async function getRandomScenario(level, model) {
  const params = new URLSearchParams()
  if (level) params.set('level', level)
  if (model) params.set('model', model)
  const url = `${API_BASE}/scenarios/random${params.toString() ? '?' + params.toString() : ''}`
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) {
    throw new ApiError(data.error || `Request failed with status ${response.status}`)
  }
  return data
}

export async function getReferenceCounts() {
  const response = await fetch(`${API_BASE}/reference-counts`)
  const data = await response.json()
  if (!response.ok) {
    throw new ApiError(data.error || `Request failed with status ${response.status}`)
  }
  return data
}
