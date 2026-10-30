import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Timer, Volume2, X } from 'lucide-react'
import { sfx, useTree } from '../../shared'
import { useLocale } from '../../lib/i18n'
import { useDesktopMessages } from './i18n'
import { startFocusAmbient } from './focusAudio'
import { FOCUS_TIMER_REQUEST_EVENT } from './focusTimerEvents'
import { addFocusSession, readFocusSettings, saveFocusSettings, useFocusSessions } from './focusStore'
import type { FocusAmbient, FocusSession, FocusSettings, FocusTarget } from './focusStore'
import { useTaskTreeStore } from './taskStore'

function flattenTargets(nodes: ReturnType<typeof useTree>['tree']): FocusTarget[] {
  return nodes.flatMap(node => [{ type: 'section' as const, id: node.id, title: node.title }, ...flattenTargets(node.children)])
}

function sessionId(): string {
  return `focus-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function DesktopFocusTimer() {
  const messages = useDesktopMessages()
  const labels = messages.focusTimer
  const locale = useLocale()
  const { tree } = useTree()
  const tasks = useTaskTreeStore()
  const sessions = useFocusSessions()
  const sectionTargets = useMemo(() => flattenTargets(tree), [tree])
  const taskTargets = useMemo(() => tasks.map(task => ({ type: 'task' as const, id: task.id, title: task.title })), [tasks])
  const [settings, setSettings] = useState<FocusSettings>(readFocusSettings)
  const [target, setTarget] = useState<FocusTarget | null>(null)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'focus' | 'break'>('focus')
  const [remaining, setRemaining] = useState(() => readFocusSettings().workMinutes * 60)
  const [running, setRunning] = useState(false)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const startedAt = useRef<number | null>(null)
  const transitioned = useRef(false)
  const elapsed = phase === 'focus' ? Math.max(0, settings.workMinutes * 60 - remaining) : settings.breakMinutes * 60 - remaining
  const targetKey = target ? `${target.type}:${target.id}` : ''
  const canChangeTarget = !running && phase === 'focus' && remaining === settings.workMinutes * 60

  useEffect(() => { saveFocusSettings(settings) }, [settings])
  useEffect(() => {
    const onRequest = (event: Event): void => {
      const requested = (event as CustomEvent<FocusTarget>).detail
      if (!requested?.id || (requested.type !== 'task' && requested.type !== 'section')) return
      setOpen(true)
      if (running || !canChangeTarget) { setNotice(labels.targetLocked); return }
      setPhase('focus')
      setRemaining(settings.workMinutes * 60)
      setTarget(requested)
      setNotice('')
    }
    window.addEventListener(FOCUS_TIMER_REQUEST_EVENT, onRequest)
    return () => window.removeEventListener(FOCUS_TIMER_REQUEST_EVENT, onRequest)
  }, [canChangeTarget, labels.targetLocked, running, settings.workMinutes])

  useEffect(() => {
    if (!open) return
    const onEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [open])

  useEffect(() => {
    if (!running || deadline === null) return
    const tick = (): void => {
      if (transitioned.current) return
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(next)
      if (next > 0) return
      transitioned.current = true
      setRunning(false)
      setDeadline(null)
      sfx.success()
      if (phase === 'focus') {
        const endedAt = Date.now()
        const durationSeconds = settings.workMinutes * 60
        addFocusSession({ id: sessionId(), targetType: target?.type ?? null, targetId: target?.id ?? null, targetTitle: target?.title ?? null, startedAt: startedAt.current ?? endedAt - durationSeconds * 1000, endedAt, durationSeconds } satisfies FocusSession)
        startedAt.current = null
        setPhase('break')
        setRemaining(settings.breakMinutes * 60)
        setDeadline(endedAt + settings.breakMinutes * 60 * 1000)
        transitioned.current = false
        setRunning(true)
      } else {
        setPhase('focus')
        setRemaining(settings.workMinutes * 60)
        setNotice('')
      }
    }
    tick()
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [deadline, labels.start, phase, running, settings.breakMinutes, settings.workMinutes, target])

  useEffect(() => {
    if (!running || phase !== 'focus' || settings.ambient === 'none') return
    let context: AudioContext | null = null
    let stop: (() => void) | null = null
    try {
      context = new AudioContext()
      const master = context.createGain()
      master.gain.value = settings.volume
      master.connect(context.destination)
      stop = startFocusAmbient(settings.ambient as Exclude<FocusAmbient, 'none'>, context, master)
      void context.resume().catch(() => undefined)
    } catch { /* Web Audio is unavailable in this browser */ }
    return () => {
      stop?.()
      if (context && context.state !== 'closed') void context.close().catch(() => undefined)
    }
  }, [phase, running, settings.ambient, settings.volume])

  const start = (): void => {
    if (remaining <= 0) return
    transitioned.current = false
    if (phase === 'focus' && remaining === settings.workMinutes * 60) startedAt.current = Date.now()
    const nextDeadline = Date.now() + remaining * 1000
    setDeadline(nextDeadline)
    setRunning(true)
    setNotice('')
  }
  const pause = (): void => {
    if (deadline !== null) setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    setRunning(false)
    setDeadline(null)
  }
  const savePartialSession = (): void => {
    const left = running && deadline !== null ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : remaining
    const durationSeconds = Math.max(0, settings.workMinutes * 60 - left)
    if (phase === 'focus' && durationSeconds > 0) {
      const endedAt = Date.now()
      addFocusSession({ id: sessionId(), targetType: target?.type ?? null, targetId: target?.id ?? null, targetTitle: target?.title ?? null, startedAt: startedAt.current ?? endedAt - durationSeconds * 1000, endedAt, durationSeconds } satisfies FocusSession)
      setNotice(labels.ended)
    }
    startedAt.current = null
    transitioned.current = true
    setRunning(false)
    setDeadline(null)
    setPhase('focus')
    setRemaining(settings.workMinutes * 60)
  }
  const updateSettings = (patch: Partial<FocusSettings>): void => {
    setSettings(current => ({ ...current, ...patch }))
    if (!running && phase === 'focus' && patch.workMinutes !== undefined) setRemaining(patch.workMinutes * 60)
    if (!running && phase === 'break' && patch.breakMinutes !== undefined) setRemaining(patch.breakMinutes * 60)
  }
  const onTargetChange = (value: string): void => {
    if (!value) { setTarget(null); return }
    const separator = value.indexOf(':')
    if (separator < 0) return
    const type = value.slice(0, separator)
    const id = value.slice(separator + 1)
    setTarget(type === 'task' ? taskTargets.find(item => item.id === id) ?? null : sectionTargets.find(item => item.id === id) ?? null)
    setNotice('')
  }
  const onAmbientChange = (value: string): void => {
    if (value === 'none' || value === 'drone' || value === 'wind' || value === 'stars') updateSettings({ ambient: value as FocusAmbient })
  }
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0')
  const seconds = String(remaining % 60).padStart(2, '0')
  const todayKey = new Date().toDateString()
  const todaySessions = sessions.filter(session => new Date(session.startedAt).toDateString() === todayKey).length
  const targetSessions = sessions.filter(session => target ? session.targetType === target.type && session.targetId === target.id : session.targetType === null).slice(-5).reverse()
  const formatSessionDate = (timestamp: number): string => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ' : 'en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp))

  return <div className="desk-focus-control">
    <button type="button" className="desk-icon-button desk-focus-trigger" aria-label={labels.open} title={labels.open} aria-expanded={open} onClick={() => setOpen(value => !value)}><Timer size={18} aria-hidden="true" />{running && <span className="desk-focus-live-dot" aria-hidden="true" />}</button>
    {open && <section className="desk-focus-panel" role="dialog" aria-label={labels.title}>
      <header className="desk-focus-panel-header"><div><h2>{labels.title}</h2><span>{todaySessions} {labels.sessionCount}</span></div><button type="button" className="desk-icon-button" aria-label={messages.shell.close} onClick={() => setOpen(false)}><X size={17} aria-hidden="true" /></button></header>
      <label className="desk-focus-target-label" htmlFor="desk-focus-target">{labels.chooseTarget}</label>
      <select id="desk-focus-target" value={targetKey} disabled={!canChangeTarget} onChange={event => onTargetChange(event.target.value)}>
        <option value="">{labels.freeSession}</option>
        {taskTargets.length > 0 && <optgroup label={labels.taskGroup}>{taskTargets.map(item => <option key={item.id} value={`task:${item.id}`}>{item.title}</option>)}</optgroup>}
        {sectionTargets.length > 0 && <optgroup label={labels.sectionGroup}>{sectionTargets.map(item => <option key={item.id} value={`section:${item.id}`}>{item.title}</option>)}</optgroup>}
      </select>
      <div className="desk-focus-clock" aria-label={`${phase === 'focus' ? labels.focusPhase : labels.breakPhase}: ${minutes}:${seconds}`}>
        <span className="desk-focus-phase">{phase === 'focus' ? labels.focusPhase : labels.breakPhase}</span>
        <span className="desk-focus-time" dir="ltr" role="timer" aria-live="off">{minutes}:{seconds}</span>
        {target && <span className="desk-focus-target-name" title={target.title}>{target.title}</span>}
      </div>
      <div className="desk-focus-actions">
        {!running ? <button type="button" className="desk-button desk-button-primary" onClick={start}><Play size={15} aria-hidden="true" />{phase === 'break' ? labels.resume : elapsed > 0 ? labels.resume : labels.start}</button> : <button type="button" className="desk-button desk-button-primary" onClick={pause}><Pause size={15} aria-hidden="true" />{labels.pause}</button>}
        {phase === 'break' ? <button type="button" className="desk-button" onClick={() => { setRunning(false); setDeadline(null); setPhase('focus'); setRemaining(settings.workMinutes * 60) }}>{labels.skipBreak}</button> : elapsed > 0 && <button type="button" className="desk-button" onClick={savePartialSession}>{labels.endSession}</button>}
      </div>
      {notice && <p className="desk-focus-notice" role="status">{notice}</p>}
      <details className="desk-focus-settings">
        <summary>{labels.settings}</summary>
        <div className="desk-focus-setting-row"><label htmlFor="desk-focus-work">{labels.workDuration}</label><input id="desk-focus-work" type="number" min={1} max={120} value={settings.workMinutes} disabled={running || (phase === 'focus' && elapsed > 0)} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 1 && value <= 120) updateSettings({ workMinutes: Math.round(value) }) }} /></div>
        <div className="desk-focus-setting-row"><label htmlFor="desk-focus-break">{labels.breakDuration}</label><input id="desk-focus-break" type="number" min={1} max={60} value={settings.breakMinutes} disabled={running || (phase === 'break' && elapsed > 0)} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 1 && value <= 60) updateSettings({ breakMinutes: Math.round(value) }) }} /></div>
        <label className="desk-focus-ambient-label" htmlFor="desk-focus-ambient"><Volume2 size={15} aria-hidden="true" />{labels.ambient}</label>
        <select id="desk-focus-ambient" value={settings.ambient} onChange={event => onAmbientChange(event.target.value)}><option value="none">{labels.soundOff}</option><option value="drone">{labels.drone}</option><option value="wind">{labels.wind}</option><option value="stars">{labels.stars}</option></select>
        {settings.ambient !== 'none' && <label className="desk-focus-volume" htmlFor="desk-focus-volume">{labels.volume}<input id="desk-focus-volume" type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={event => updateSettings({ volume: Number(event.target.value) })} /></label>}
      </details>
      <section className="desk-focus-log" aria-label={labels.sessionLog}><h3>{labels.sessionLog}</h3>{targetSessions.length ? <ul>{targetSessions.map(session => <li key={session.id}><div><span>{session.targetTitle ?? labels.freeSession}</span><time dateTime={new Date(session.endedAt).toISOString()}>{formatSessionDate(session.endedAt)}</time></div><strong>{Math.max(1, Math.round(session.durationSeconds / 60))} {labels.minutesShort}</strong></li>)}</ul> : <p>{labels.noSessions}</p>}</section>
    </section>}
  </div>
}
