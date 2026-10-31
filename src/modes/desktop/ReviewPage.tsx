import { useMemo, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { getDueReviewCards, getReviewCards, getReviewStreak, reviewCard, type ReviewCard } from '../../lib/reviewCards'
import { useDesktopMessages } from './i18n'

export default function ReviewPage() {
  const messages = useDesktopMessages()
  const t = messages.review
  const [cards, setCards] = useState<ReviewCard[]>(() => getDueReviewCards())
  const [revealed, setRevealed] = useState(false)
  const [streak, setStreak] = useState(() => getReviewStreak())
  const total = getReviewCards().length
  const current = cards[0]
  const remaining = useMemo(() => cards.length, [cards])

  const rate = (quality: number): void => {
    if (!current) return
    reviewCard(current.id, quality)
    setCards(previous => previous.slice(1))
    setRevealed(false)
    setStreak(getReviewStreak())
  }

  return <section className="desk-review-page" aria-label={t.title}>
    <div className="desk-review-summary">
      <div><strong>{remaining}</strong><span>{t.dueToday}</span></div>
      <div><strong>{streak}</strong><span>{t.dayStreak}</span></div>
      <div><strong>{total}</strong><span>{t.totalCards}</span></div>
    </div>
    {current ? <section className="desk-review-card" aria-live="polite">
      <span className="desk-review-source">{current.sourceTitle}</span>
      <h2>{current.question}</h2>
      {revealed ? <p className="desk-review-answer" dir="auto">{current.answer}</p> : <button type="button" className="desk-button desk-button-primary" onClick={() => setRevealed(true)}>{t.showAnswer}</button>}
      {revealed && <div className="desk-review-ratings" role="group" aria-label={t.rateCard}>
        <button type="button" className="desk-button desk-review-again" onClick={() => rate(1)}><RotateCcw size={15} />{t.again}</button>
        <button type="button" className="desk-button" onClick={() => rate(3)}>{t.hard}</button>
        <button type="button" className="desk-button desk-button-primary" onClick={() => rate(4)}><Check size={15} />{t.good}</button>
        <button type="button" className="desk-button" onClick={() => rate(5)}>{t.easy}</button>
      </div>}
    </section> : <section className="desk-review-empty"><Check size={28} aria-hidden="true" /><h2>{t.allDone}</h2><p>{t.allDoneDescription}</p></section>}
  </section>
}
