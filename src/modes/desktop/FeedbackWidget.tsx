import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { MessageSquareText, Star, X } from 'lucide-react'
import { getGoogleIdToken } from '../../lib/googleAuth'
import { submitSupportRequest } from '../../lib/libraryApi'
import type { DesktopPage } from './types'
import { useDesktopMessages } from './i18n'

interface FeedbackWidgetProps {
  open: boolean
  page: DesktopPage
  onClose: () => void
  onRequestAuth: () => void
}

export default function FeedbackWidget({ open, page, onClose, onRequestAuth }: FeedbackWidgetProps) {
  const messages = useDesktopMessages()
  const t = messages.feedback
  const pageName = page === 'home' ? messages.homeDashboard.pageTitle : messages.pages[page].title
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [status, setStatus] = useState<'signIn' | 'failed' | ''>('')
  const closeRef = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setRating(0)
    setComment('')
    setBusy(false)
    busyRef.current = false
    setSent(false)
    setStatus('')
    closeRef.current?.focus()
    const onEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape' && !busyRef.current) onClose()
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [open, onClose])

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy || rating < 1 || rating > 5) return
    if (!getGoogleIdToken()) { setStatus('signIn'); return }
    busyRef.current = true
    setBusy(true)
    setStatus('')
    try {
      await submitSupportRequest({
        category: 'suggestion',
        subject: `${t.subjectPrefix}: ${pageName}`,
        message: `${t.ratingField}: ${rating}/5\n${t.pageField}: ${pageName}\n${t.commentField}: ${comment.trim()}`,
        contactEmail: '',
      })
      setSent(true)
    } catch {
      setStatus('failed')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const trapFocus = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), textarea'))
    if (!controls.length) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  const moveRating = (event: KeyboardEvent<HTMLButtonElement>, value: number): void => {
    const rtl = event.currentTarget.closest('[dir="rtl"]') !== null
    const forward = event.key === 'ArrowUp' || (event.key === 'ArrowRight' && !rtl) || (event.key === 'ArrowLeft' && rtl)
    const backward = event.key === 'ArrowDown' || (event.key === 'ArrowLeft' && !rtl) || (event.key === 'ArrowRight' && rtl)
    const next = event.key === 'Home' ? 1 : event.key === 'End' ? 5 : forward ? Math.min(5, value + 1) : backward ? Math.max(1, value - 1) : null
    if (next === null) return
    event.preventDefault()
    setRating(next)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next - 1]?.focus()
  }

  if (!open) return null
  return <div className="desk-feedback-backdrop" role="presentation" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose() }}>
    <section className="desk-feedback-panel" role="dialog" aria-modal="true" aria-labelledby="desk-feedback-title" onKeyDown={trapFocus}>
      <header className="desk-feedback-header">
        <div><MessageSquareText size={18} aria-hidden="true" /><h2 id="desk-feedback-title">{t.title}</h2></div>
        <button ref={closeRef} type="button" className="desk-icon-button" aria-label={t.close} disabled={busy} onClick={onClose}><X size={17} aria-hidden="true" /></button>
      </header>
      {sent ? <div className="desk-feedback-confirmation" role="status"><p>{t.sent}</p><button type="button" className="desk-button desk-button-primary" onClick={onClose}>{t.close}</button></div> : <>
        <p className="desk-feedback-description">{t.description}</p>
        <p className="desk-feedback-page"><span>{t.currentPage}:</span> <strong dir="auto">{pageName}</strong></p>
        <form className="desk-feedback-form" onSubmit={event => void submit(event)}>
          <fieldset className="desk-feedback-rating" aria-label={t.rating}>
            <legend>{t.rating} <span aria-hidden="true">(1–5)</span></legend>
            <div role="radiogroup" aria-label={t.rating}>
              {[1, 2, 3, 4, 5].map(value => <button key={value} type="button" role="radio" aria-checked={rating === value} tabIndex={rating === value || (rating === 0 && value === 1) ? 0 : -1} aria-label={t.ratingOption.replace('{value}', String(value))} className={rating >= value ? 'is-selected' : ''} onKeyDown={event => moveRating(event, value)} onClick={() => setRating(value)}>
                <Star size={23} fill={rating >= value ? 'currentColor' : 'none'} aria-hidden="true" />
              </button>)}
            </div>
          </fieldset>
          <label className="desk-feedback-comment">{t.commentLabel}<textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={500} rows={3} dir="auto" /></label>
          <p className="desk-feedback-privacy">{t.privacy}</p>
          {status && <div className="desk-feedback-status" role="alert"><p>{status === 'signIn' ? t.signInRequired : t.failed}</p>{status === 'signIn' && <button type="button" className="desk-feedback-signin" onClick={onRequestAuth}>{t.signInAction}</button>}</div>}
          <button type="submit" className="desk-button desk-button-primary" disabled={busy || rating === 0}>
            {busy ? t.sending : t.send}
          </button>
        </form>
      </>}
    </section>
  </div>
}
