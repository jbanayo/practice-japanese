/**
 * Local persistence layer using IndexedDB (not localStorage — gives us more
 * headroom and structured queries, still 100% local/offline).
 *
 * Four stores, each with bounded growth:
 * - sessions:       one small record per completed quiz session (date, level,
 *                   category, score, attempts). Grows with usage but each
 *                   record is tiny (~200 bytes), so even years of daily use
 *                   stays well under a few MB.
 * - wordStats:      ONE record per unique word/kanji ever seen. Bounded by the
 *                   size of the reference dataset (~8,000 vocab + ~2,200 kanji),
 *                   NOT by how often you use the app. Worst case ever: ~10,000
 *                   small records, still under ~2MB fully populated.
 * - meta:           tiny singleton records like the current streak and the
 *                   selected model setting.
 * - qualityRatings: one small record per optional "rate this question"
 *                   submission (model, rating). Grows with usage, but each
 *                   record is tiny and this is opt-in per question.
 *
 * Question generation caching (if added later) is intentionally NOT in this
 * file — that would be unbounded and belongs in its own clearable store.
 */

const DB_NAME = 'jlpt_exam_db'
const DB_VERSION = 2

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('wordStats')) {
        db.createObjectStore('wordStats', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('qualityRatings')) {
        db.createObjectStore('qualityRatings', { keyPath: 'id', autoIncrement: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// --- Sessions ---------------------------------------------------------

export async function saveSession(session) {
  const db = await openDB()
  const tx = db.transaction('sessions', 'readwrite')
  tx.objectStore('sessions').add({
    date: new Date().toISOString(),
    ...session,
  })
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getAllSessions() {
  const db = await openDB()
  const tx = db.transaction('sessions', 'readonly')
  const result = await promisifyRequest(tx.objectStore('sessions').getAll())
  return result.sort((a, b) => new Date(b.date) - new Date(a.date))
}

// --- Word/kanji mastery stats ------------------------------------------

/**
 * key format: "vocabulary:N4:言葉" or "kanji:N3:漢"
 */
export async function updateWordStat(category, level, word, wasCorrectFirstTry) {
  const db = await openDB()
  const key = `${category}:${level}:${word}`
  const tx = db.transaction('wordStats', 'readwrite')
  const store = tx.objectStore('wordStats')
  const existing = await promisifyRequest(store.get(key))

  const updated = existing || {
    key,
    category,
    level,
    word,
    timesReviewed: 0,
    timesCorrectFirstTry: 0,
    lastReviewed: null,
  }

  updated.timesReviewed += 1
  if (wasCorrectFirstTry) updated.timesCorrectFirstTry += 1
  updated.lastReviewed = new Date().toISOString()

  store.put(updated)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(updated)
    tx.onerror = () => reject(tx.error)
  })
}

export async function getAllWordStats() {
  const db = await openDB()
  const tx = db.transaction('wordStats', 'readonly')
  return promisifyRequest(tx.objectStore('wordStats').getAll())
}

/** All words seen before for this category+level — used to exclude them
 * from "Generate New" so you're not re-shown words you already know about. */
export async function getSeenWords(category, level) {
  const all = await getAllWordStats()
  return all
    .filter((w) => w.category === category && w.level === level)
    .map((w) => w.word)
}

/**
 * Marks a word as "seen" WITHOUT counting it as an actual answered review —
 * used when a session is quit early. The AI already spent real generation
 * time/compute on this word, so we don't want a future "Generate New" to
 * waste another call re-selecting it. But since it was never actually
 * answered, it must NOT count toward mastery stats (timesReviewed stays 0,
 * so it's correctly excluded from "Review Past Questions" candidates,
 * which only makes sense for words you've actually attempted).
 * Does nothing if a real stats record already exists for this word.
 */
export async function ensureWordSeen(category, level, word) {
  const db = await openDB()
  const key = `${category}:${level}:${word}`
  const tx = db.transaction('wordStats', 'readwrite')
  const store = tx.objectStore('wordStats')
  const existing = await promisifyRequest(store.get(key))

  if (!existing) {
    store.put({
      key,
      category,
      level,
      word,
      timesReviewed: 0,
      timesCorrectFirstTry: 0,
      lastReviewed: null,
    })
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Picks words for "Review" mode: weakest mastery first (lowest correct
 * rate), then longest-since-last-seen as a tiebreaker. Simple spaced
 * repetition — not fancy, but a real foundation to build on later.
 * Only considers words that have actually been answered at least once
 * (timesReviewed > 0) — words merely "seen" via a quit don't qualify.
 */
export async function getWordsForReview(category, level, count) {
  const all = await getAllWordStats()
  const candidates = all.filter(
    (w) => w.category === category && w.level === level && w.timesReviewed > 0
  )

  candidates.sort((a, b) => {
    const rateA = a.timesCorrectFirstTry / a.timesReviewed
    const rateB = b.timesCorrectFirstTry / b.timesReviewed
    if (rateA !== rateB) return rateA - rateB // weakest first
    return new Date(a.lastReviewed) - new Date(b.lastReviewed) // oldest first
  })

  return candidates.slice(0, count).map((w) => w.word)
}

/** Words actually answered at least once (for the flashcard deck — reviewing
 * a word you were only ever "shown" via a quit isn't a meaningful flashcard). */
export async function getReviewedWords(category, level) {
  const all = await getAllWordStats()
  return all
    .filter((w) => w.category === category && w.level === level && w.timesReviewed > 0)
    .map((w) => w.word)
}

/**
 * Simple stats foundation: unique word count per level, split by category.
 * Returns { N5: { vocabulary: 12, kanji: 4 }, N4: { ... }, ... }
 */
export async function getWordCountsByLevel() {
  const all = await getAllWordStats()
  const counts = {}
  for (const level of ['N5', 'N4', 'N3', 'N2', 'N1']) {
    counts[level] = { vocabulary: 0, kanji: 0 }
  }

  for (const w of all) {
    if (w.timesReviewed > 0 && counts[w.level] && (w.category === 'vocabulary' || w.category === 'kanji')) {
      counts[w.level][w.category] += 1
    }
  }

  return counts
}

// --- Streak --------------------------------------------------------------

function daysBetween(a, b) {
  const msPerDay = 1000 * 60 * 60 * 24
  const dateA = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const dateB = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((dateB - dateA) / msPerDay)
}

export async function getStreak() {
  const db = await openDB()
  const tx = db.transaction('meta', 'readonly')
  const record = await promisifyRequest(tx.objectStore('meta').get('streak'))
  return record || { currentStreak: 0, longestStreak: 0, lastActiveDate: null }
}

/** Call this once per completed session. Increments/resets the daily streak. */
export async function recordActivityToday() {
  const db = await openDB()
  const tx = db.transaction('meta', 'readwrite')
  const store = tx.objectStore('meta')
  const existing = await promisifyRequest(store.get('streak'))

  const today = new Date()
  let record = existing || { key: 'streak', currentStreak: 0, longestStreak: 0, lastActiveDate: null }

  if (record.lastActiveDate) {
    const diff = daysBetween(new Date(record.lastActiveDate), today)
    if (diff === 0) {
      // already active today, no change
    } else if (diff === 1) {
      record.currentStreak += 1
    } else {
      record.currentStreak = 1
    }
  } else {
    record.currentStreak = 1
  }

  record.longestStreak = Math.max(record.longestStreak, record.currentStreak)
  record.lastActiveDate = today.toISOString()

  store.put(record)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(record)
    tx.onerror = () => reject(tx.error)
  })
}

// --- Settings (selected model) ------------------------------------------

export async function getSelectedModel() {
  const db = await openDB()
  const tx = db.transaction('meta', 'readonly')
  const record = await promisifyRequest(tx.objectStore('meta').get('selectedModel'))
  return record ? record.value : null
}

export async function setSelectedModel(modelName) {
  const db = await openDB()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').put({ key: 'selectedModel', value: modelName })
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// --- Quality ratings (optional per-question AI-output feedback) --------

export const RATING = {
  VERY_WRONG: 'very_wrong',
  SLIGHTLY_WRONG: 'slightly_wrong',
  OKAY: 'okay',
}

/**
 * Records an optional quality rating for a single generated question,
 * tagged with which model produced it — so Stats can show a breakdown of
 * generation quality per model over time.
 */
export async function saveQualityRating({ model, category, level, word, rating }) {
  const db = await openDB()
  const tx = db.transaction('qualityRatings', 'readwrite')
  tx.objectStore('qualityRatings').add({
    date: new Date().toISOString(),
    model: model || 'unknown',
    category,
    level,
    word,
    rating,
  })
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Aggregates quality ratings by model, for the Stats page.
 * Returns { "qwen2.5:7b-instruct": { very_wrong: 2, slightly_wrong: 5, okay: 20, total: 27 }, ... }
 */
export async function getQualityStatsByModel() {
  const db = await openDB()
  const tx = db.transaction('qualityRatings', 'readonly')
  const all = await promisifyRequest(tx.objectStore('qualityRatings').getAll())

  const byModel = {}
  for (const r of all) {
    if (!byModel[r.model]) {
      byModel[r.model] = { very_wrong: 0, slightly_wrong: 0, okay: 0, total: 0 }
    }
    byModel[r.model][r.rating] = (byModel[r.model][r.rating] || 0) + 1
    byModel[r.model].total += 1
  }
  return byModel
}

// --- Reset / clear all data ---------------------------------------------

/** Wipes every store — used by the Settings "Reset" button. Irreversible. */
export async function clearAllData() {
  const db = await openDB()
  const storeNames = ['sessions', 'wordStats', 'meta', 'qualityRatings']
  const tx = db.transaction(storeNames, 'readwrite')
  for (const name of storeNames) {
    tx.objectStore(name).clear()
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
