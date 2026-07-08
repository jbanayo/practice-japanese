/**
 * Local persistence layer using IndexedDB (not localStorage — gives us more
 * headroom and structured queries, still 100% local/offline).
 *
 * Three stores, each with bounded growth:
 * - sessions:   one small record per completed quiz session (date, level,
 *               category, score, attempts). Grows with usage but each
 *               record is tiny (~200 bytes), so even years of daily use
 *               stays well under a few MB.
 * - wordStats:  ONE record per unique word/kanji ever seen. Bounded by the
 *               size of the reference dataset (~8,000 vocab + ~2,200 kanji),
 *               NOT by how often you use the app. Worst case ever: ~10,000
 *               small records, still under ~2MB fully populated.
 * - meta:       tiny singleton records like the current streak.
 *
 * Question generation caching (if added later) is intentionally NOT in this
 * file — that would be unbounded and belongs in its own clearable store.
 */

const DB_NAME = 'jlpt_exam_db'
const DB_VERSION = 1

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
 * Picks words for "Review" mode: weakest mastery first (lowest correct
 * rate), then longest-since-last-seen as a tiebreaker. Simple spaced
 * repetition — not fancy, but a real foundation to build on later.
 */
export async function getWordsForReview(category, level, count) {
  const all = await getAllWordStats()
  const candidates = all.filter((w) => w.category === category && w.level === level)

  candidates.sort((a, b) => {
    const rateA = a.timesCorrectFirstTry / a.timesReviewed
    const rateB = b.timesCorrectFirstTry / b.timesReviewed
    if (rateA !== rateB) return rateA - rateB // weakest first
    return new Date(a.lastReviewed) - new Date(b.lastReviewed) // oldest first
  })

  return candidates.slice(0, count).map((w) => w.word)
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
