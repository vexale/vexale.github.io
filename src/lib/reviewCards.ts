export interface ReviewCard {
  id: string
  nodeId: string
  sourceTitle: string
  question: string
  answer: string
  createdAt: number
  dueAt: number
  interval: number
  easeFactor: number
  repetitions: number
  lastReviewedAt: number | null
}

const STORAGE_KEY = 'vexale-review-cards-v1'
const STREAK_KEY = 'vexale-review-streak-v1'
const DAY = 86_400_000

function read<T>(key: string, fallback: T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    return value === null ? fallback : value as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* المراجعة تستمر خلال الجلسة عند تعذر التخزين */ }
}

function startOfDay(timestamp = Date.now()): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function getReviewCards(): ReviewCard[] {
  const value = read<unknown>(STORAGE_KEY, [])
  if (!Array.isArray(value)) return []
  return value.filter((card): card is ReviewCard => Boolean(card && typeof card === 'object' && typeof (card as ReviewCard).id === 'string' && typeof (card as ReviewCard).question === 'string' && typeof (card as ReviewCard).answer === 'string' && typeof (card as ReviewCard).dueAt === 'number'))
}

export function saveReviewCards(cards: ReviewCard[]): void { write(STORAGE_KEY, cards) }

export function addReviewCards(input: Array<{ nodeId: string; sourceTitle: string; question: string; answer: string }>): ReviewCard[] {
  const now = Date.now()
  const cards = getReviewCards()
  const next = input.filter(card => card.question.trim() && card.answer.trim()).map((card, index) => ({
    ...card,
    id: `${card.nodeId}-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    question: card.question.trim(),
    answer: card.answer.trim(),
    createdAt: now,
    dueAt: startOfDay(now),
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lastReviewedAt: null,
  }))
  const merged = [...next, ...cards]
  saveReviewCards(merged)
  return next
}

export function reviewCard(id: string, quality: number): ReviewCard | null {
  const cards = getReviewCards()
  const card = cards.find(item => item.id === id)
  if (!card) return null
  const now = Date.now()
  const q = Math.max(0, Math.min(5, Math.round(quality)))
  if (q < 3) {
    card.repetitions = 0
    card.interval = 1
  } else {
    card.repetitions += 1
    card.interval = card.repetitions === 1 ? 1 : card.repetitions === 2 ? 6 : Math.max(1, Math.round(card.interval * card.easeFactor))
  }
  card.easeFactor = Math.max(1.3, card.easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  card.dueAt = startOfDay(now) + card.interval * DAY
  card.lastReviewedAt = now
  saveReviewCards(cards)
  recordReviewDay(now)
  return card
}

export function getDueReviewCards(now = Date.now()): ReviewCard[] {
  const today = startOfDay(now)
  return getReviewCards().filter(card => card.dueAt <= today).sort((a, b) => a.dueAt - b.dueAt || a.createdAt - b.createdAt)
}

function recordReviewDay(timestamp: number): void {
  const days = read<string[]>(STREAK_KEY, [])
  const key = new Date(timestamp).toISOString().slice(0, 10)
  if (!days.includes(key)) write(STREAK_KEY, [...days, key].slice(-370))
}

export function getReviewStreak(now = Date.now()): number {
  const days = new Set(read<string[]>(STREAK_KEY, []))
  let streak = 0
  for (let cursor = startOfDay(now); days.has(new Date(cursor).toISOString().slice(0, 10)); cursor -= DAY) streak += 1
  return streak
}
