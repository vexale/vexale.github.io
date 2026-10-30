import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowUpRight, CalendarDays, Check, FileText, Flame, Folder, Plus, Star } from 'lucide-react'
import { dbGetNote } from '../../db'
import { findNode, useLibrary, useTree } from '../../shared'
import { useLocale } from '../../lib/i18n'
import { useDesktopMessages } from './i18n'
import { useDesktopPreferences } from './preferences'
import { useFocusSessions } from './focusStore'
import type { FocusSession } from './focusStore'
import { createTask, MAX_TASK_COUNT, updateTask, useTaskTreeStore } from './taskStore'
import type { DesktopPage } from './types'

interface HomeProps { onNavigate: (page: DesktopPage) => void }
interface SectionRef { id: string; title: string; path: string[] }
interface RecentNote extends SectionRef { excerpt: string; updatedAt: number }

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getFocusSummary(sessions: FocusSession[], locale: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  const weekSessions = sessions.filter(session => session.endedAt >= weekStart.getTime() && session.endedAt < tomorrow.getTime())
  const secondsByDay = new Map<string, number>()
  for (const session of weekSessions) {
    const key = dateKey(new Date(session.endedAt))
    secondsByDay.set(key, (secondsByDay.get(key) ?? 0) + session.durationSeconds)
  }
  const weekday = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ' : 'en', { weekday: 'short' })
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + index)
    const seconds = secondsByDay.get(dateKey(date)) ?? 0
    return { key: dateKey(date), label: weekday.format(date), seconds, minutes: Math.round(seconds / 60) }
  })
  const activeDays = new Set(sessions.map(session => dateKey(new Date(session.endedAt))))
  const cursor = new Date(today)
  if (!activeDays.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (activeDays.has(dateKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1) }
  return { days, minutes: Math.round(weekSessions.reduce((total, session) => total + session.durationSeconds, 0) / 60), sessions: weekSessions.length, streak }
}

function flattenSections(nodes: ReturnType<typeof useTree>['tree'], parent: string[] = []): SectionRef[] {
  return nodes.flatMap(node => {
    const path = [...parent, node.id]
    return [{ id: node.id, title: node.title, path }, ...flattenSections(node.children, path)]
  })
}

function noteExcerpt(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

export default function DesktopHomePage({ onNavigate }: HomeProps) {
  const messages = useDesktopMessages()
  const locale = useLocale()
  const labels = messages.homeDashboard
  const focusSessions = useFocusSessions()
  const preferences = useDesktopPreferences()
  const { tree, path, setPath } = useTree()
  const { items } = useLibrary()
  const tasks = useTaskTreeStore()
  const [quickTitle, setQuickTitle] = useState('')
  const [taskLimitReached, setTaskLimitReached] = useState(false)
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([])
  const sections = useMemo(() => flattenSections(tree), [tree])
  const focusSummary = useMemo(() => getFocusSummary(focusSessions, locale), [focusSessions, locale])
  const focusMaxSeconds = Math.max(...focusSummary.days.map(day => day.seconds), 1)
  const today = dateKey(new Date())
  const dateLabel = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ' : 'en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
  const todayTasks = tasks.filter(task => task.status !== 'done' && task.status !== 'late' && task.dueDate === today)
  const overdueTasks = tasks.filter(task => task.status !== 'done' && (task.status === 'late' || Boolean(task.dueDate && task.dueDate < today)))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  const favoriteSections = sections.filter(section => preferences.favoriteSectionIds.includes(section.id))
  const currentSection = path.length ? findNode(tree, path[path.length - 1]) : undefined
  const continueSection = currentSection ? sections.find(section => section.id === currentSection.id) : sections.find(section => section.id === preferences.recentItems.find(id => id.startsWith('section:'))?.slice('section:'.length))
  const recentFiles = items.slice().reverse().slice(0, 4)

  useEffect(() => {
    let cancelled = false
    void Promise.all(sections.map(async section => {
      try {
        const note = await dbGetNote(section.id)
        const excerpt = note?.html ? noteExcerpt(note.html) : ''
        return note && excerpt ? { ...section, excerpt, updatedAt: note.updatedAt } : null
      } catch { return null }
    })).then(rows => {
      if (!cancelled) setRecentNotes(rows.filter((note): note is RecentNote => Boolean(note)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4))
    })
    return () => { cancelled = true }
  }, [sections])

  const openSection = (sectionPath: string[]): void => {
    setPath(sectionPath)
    onNavigate('library')
  }
  const addQuickTask = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const title = quickTitle.trim()
    if (!title) return
    const id = createTask(null, title)
    setTaskLimitReached(!id)
    if (id) {
      updateTask(id, { dueDate: today })
      setQuickTitle('')
    }
  }
  const toggleDone = (id: string, done: boolean): void => updateTask(id, { status: done ? 'done' : 'todo' })
  const dateFormat = (value: string | null): string => value ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ' : 'en', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)) : labels.noDate

  return <section className="desk-home" aria-label={labels.title}>
    <header className="desk-home-welcome">
      <div><p className="desk-home-date"><CalendarDays size={16} aria-hidden="true" />{dateLabel}</p><h2>{labels.greeting}</h2><p>{labels.intro}</p></div>
      <form className="desk-home-quick-add" onSubmit={addQuickTask}>
        <label htmlFor="desk-home-task">{labels.quickAdd}</label>
        <div><input id="desk-home-task" value={quickTitle} onChange={event => { setQuickTitle(event.target.value); setTaskLimitReached(false) }} placeholder={labels.taskPlaceholder} maxLength={180} /><button className="desk-button desk-button-primary" type="submit" disabled={!quickTitle.trim() || tasks.length >= MAX_TASK_COUNT}><Plus size={17} aria-hidden="true" /><span>{labels.addTask}</span></button></div>
        {taskLimitReached && <p className="desk-home-inline-error" role="alert">{labels.taskLimit}</p>}
      </form>
    </header>

    <div className="desk-home-grid">
      <section className="desk-home-panel desk-home-focus" aria-labelledby="desk-home-today-title">
        <header className="desk-home-panel-heading"><div><h3 id="desk-home-today-title">{labels.today}</h3><p>{todayTasks.length} {labels.tasksCount}</p></div><button type="button" className="desk-home-text-link" onClick={() => onNavigate('tasks')}>{labels.viewTasks}<ArrowUpRight size={15} aria-hidden="true" /></button></header>
        {todayTasks.length ? <ul className="desk-home-task-list">{todayTasks.slice(0, 5).map(task => <li key={task.id}><button className="desk-home-task-check" type="button" aria-label={`${labels.markDone}: ${task.title}`} onClick={() => toggleDone(task.id, true)}><Check size={15} aria-hidden="true" /></button><span>{task.title}</span><time dateTime={task.dueDate ?? undefined}>{dateFormat(task.dueDate)}</time></li>)}</ul> : <p className="desk-home-empty">{labels.noTodayTasks}</p>}
      </section>

      <section className="desk-home-panel desk-home-overdue" aria-labelledby="desk-home-overdue-title">
        <header className="desk-home-panel-heading"><div><h3 id="desk-home-overdue-title">{labels.overdue}</h3><p>{overdueTasks.length} {labels.tasksCount}</p></div><button type="button" className="desk-home-text-link" onClick={() => onNavigate('tasks')}>{labels.viewTasks}<ArrowUpRight size={15} aria-hidden="true" /></button></header>
        {overdueTasks.length ? <ul className="desk-home-task-list">{overdueTasks.slice(0, 4).map(task => <li key={task.id}><button className="desk-home-task-check" type="button" aria-label={`${labels.markDone}: ${task.title}`} onClick={() => toggleDone(task.id, true)}><Check size={15} aria-hidden="true" /></button><span>{task.title}</span><time dateTime={task.dueDate ?? undefined}>{task.dueDate ? dateFormat(task.dueDate) : labels.late}</time></li>)}</ul> : <p className="desk-home-empty">{labels.noOverdueTasks}</p>}
      </section>

      <section className="desk-home-panel desk-home-recent" aria-labelledby="desk-home-recent-title">
        <header className="desk-home-panel-heading"><div><h3 id="desk-home-recent-title">{labels.recent}</h3><p>{labels.recentDescription}</p></div></header>
        <div className="desk-home-recent-columns">
          <div><h4><FileText size={15} aria-hidden="true" />{labels.notes}</h4>{recentNotes.length ? <ul>{recentNotes.map(note => <li key={note.id}><button type="button" onClick={() => openSection(note.path)}><span>{note.title}</span><small>{note.excerpt}</small></button></li>)}</ul> : <p className="desk-home-empty">{labels.noRecentNotes}</p>}</div>
          <div><h4><Folder size={15} aria-hidden="true" />{labels.files}</h4>{recentFiles.length ? <ul>{recentFiles.map(file => <li key={file.id}><a href={file.url} target="_blank" rel="noreferrer"><span>{file.name}</span><small>{sections.find(section => section.id === file.nodeId)?.title ?? labels.files}</small></a></li>)}</ul> : <p className="desk-home-empty">{labels.noRecentFiles}</p>}</div>
        </div>
      </section>

      <section className="desk-home-panel desk-home-weekly" aria-labelledby="desk-home-weekly-title">
        <header className="desk-home-panel-heading"><div><h3 id="desk-home-weekly-title">{labels.focusWeek}</h3><p>{labels.focusWeekDescription}</p></div></header>
        <div className="desk-home-weekly-totals"><div><strong>{focusSummary.minutes}</strong><span>{labels.focusMinutes}</span></div><div><strong>{focusSummary.sessions}</strong><span>{labels.focusSessionCount}</span></div></div>
        <div className="desk-home-weekly-chart" role="list" aria-label={labels.focusWeek}>{focusSummary.days.map(day => { const height = focusSummary.minutes ? Math.round((day.seconds / focusMaxSeconds) * 100) : 0; return <div className="desk-home-weekday" role="listitem" aria-label={`${day.label}: ${day.minutes} ${labels.focusMinutesShort}`} key={day.key} title={`${day.label}: ${day.minutes} ${labels.focusMinutesShort}`}><div className="desk-home-weekday-track"><span style={{ height: `${height}%` }} /></div><small>{day.label}</small></div> })}</div>
        {focusSummary.sessions === 0 && <p className="desk-home-empty">{labels.focusNoSessions}</p>}
      </section>

      <aside className="desk-home-side">
        <section className="desk-home-panel desk-home-continue" aria-labelledby="desk-home-continue-title"><header className="desk-home-panel-heading"><h3 id="desk-home-continue-title">{labels.continueTitle}</h3></header>{continueSection ? <button type="button" className="desk-home-continue-link" onClick={() => openSection(continueSection.path)}><span className="desk-home-continue-icon"><Folder size={18} aria-hidden="true" /></span><span><strong>{continueSection.title}</strong><small>{labels.openSection}</small></span><ArrowUpRight size={16} aria-hidden="true" /></button> : <p className="desk-home-empty">{labels.noContinue}</p>}</section>
        <section className="desk-home-panel desk-home-streak" aria-label={labels.streak}><div className="desk-home-streak-icon"><Flame size={19} aria-hidden="true" /></div><div><strong>{focusSummary.streak}</strong><span>{labels.dayStreak}</span></div><p>{labels.streakHint}</p></section>
        <section className="desk-home-panel desk-home-favorites" aria-labelledby="desk-home-favorites-title"><header className="desk-home-panel-heading"><h3 id="desk-home-favorites-title"><Star size={15} aria-hidden="true" />{labels.favorites}</h3></header>{favoriteSections.length ? <ul>{favoriteSections.slice(0, 5).map(section => <li key={section.id}><button type="button" onClick={() => openSection(section.path)}><Star size={14} aria-hidden="true" /><span>{section.title}</span></button></li>)}</ul> : <p className="desk-home-empty">{labels.noFavorites}</p>}</section>
      </aside>
    </div>
  </section>
}
