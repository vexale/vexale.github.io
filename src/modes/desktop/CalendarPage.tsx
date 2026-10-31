import { useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useLocale } from '../../lib/i18n'
import { useDesktopMessages } from './i18n'
import { getTaskTree, updateTask, useTaskTreeStore } from './taskStore'
import type { TaskRecord } from './taskStore'

function dayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
function parseDay(value: string): Date { const [year, month, day] = value.split('-').map(Number); return new Date(year, (month || 1) - 1, day || 1) }
function addDays(date: Date, amount: number): Date { const next = new Date(date); next.setDate(next.getDate() + amount); return next }
function startOfWeek(date: Date): Date { const next = new Date(date); const day = next.getDay(); next.setDate(next.getDate() - (day === 0 ? 6 : day - 1)); next.setHours(0, 0, 0, 0); return next }
function monthDays(date: Date): Date[] { const first = new Date(date.getFullYear(), date.getMonth(), 1); const start = startOfWeek(first); return Array.from({ length: 42 }, (_, index) => addDays(start, index)) }
function dateStamp(value: string): string { return value.replaceAll('-', '') }
function escapeIcs(value: string): string { return value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll(/\r?\n/gu, '\\n') }
function downloadIcs(tasks: TaskRecord[], filename: string): void {
  const events = tasks.filter(task => task.dueDate).map(task => {
    const start = dateStamp(task.dueDate!)
    const end = dateStamp(dayKey(addDays(parseDay(task.dueDate!), 1)))
    return ['BEGIN:VEVENT', `UID:${escapeIcs(task.id)}@vexale.local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z')}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${escapeIcs(task.title)}`, `STATUS:${task.status === 'done' ? 'COMPLETED' : 'CONFIRMED'}`, 'END:VEVENT'].join('\r\n')
  })
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vexale//Task Calendar//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n'
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function TaskChip({ task, onDragStart }: { task: TaskRecord; onDragStart: (id: string) => void }) {
  return <button type="button" className={`desk-calendar-task desk-calendar-task-${task.status}`} draggable onDragStart={() => onDragStart(task.id)} onDragEnd={() => onDragStart('')} title={task.title}>{task.title}</button>
}

export default function CalendarPage() {
  const locale = useLocale()
  const messages = useDesktopMessages()
  const t = messages.calendar
  const tasks = useTaskTreeStore()
  const [cursor, setCursor] = useState(() => new Date())
  const [view, setView] = useState<'month' | 'week'>('month')
  const [dragId, setDragId] = useState<string | null>(null)
  const [notificationState, setNotificationState] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const [status, setStatus] = useState('')
  const today = dayKey(new Date())
  const calendarDays = useMemo(() => view === 'month' ? monthDays(cursor) : Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)), [cursor, view])
  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskRecord[]>()
    for (const task of tasks) if (task.dueDate) map.set(task.dueDate, [...(map.get(task.dueDate) ?? []), task])
    return map
  }, [tasks])
  const dueToday = tasksByDate.get(today) ?? []

  useEffect(() => {
    if (notificationState !== 'granted' || !dueToday.length) return
    const key = `vexale-calendar-notified-v1:${today}`
    try {
      if (localStorage.getItem(key)) return
      new Notification(t.notificationsTitle, { body: `${dueToday.length} ${t.tasksDueToday}` })
      localStorage.setItem(key, '1')
    } catch { /* التذكيرات اختيارية ولا تؤثر على التقويم عند منعها */ }
  }, [dueToday, notificationState, t.notificationsTitle, t.tasksDueToday, today])

  const moveCursor = (amount: number): void => setCursor(current => view === 'month' ? new Date(current.getFullYear(), current.getMonth() + amount, 1) : addDays(current, amount * 7))
  const changeDate = (date: Date): void => { updateTask(dragId!, { dueDate: dayKey(date) }); setDragId(null); setStatus(t.rescheduled) }
  const requestNotifications = async (): Promise<void> => {
    if (typeof Notification === 'undefined') { setNotificationState('unsupported'); return }
    const permission = await Notification.requestPermission()
    setNotificationState(permission)
    setStatus(permission === 'granted' ? t.notificationsEnabled : t.notificationsDeclined)
  }
  const labels = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { weekday: 'short' }).format(addDays(startOfWeek(cursor), index)))
  const title = view === 'month'
    ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { month: 'long', year: 'numeric' }).format(cursor)
    : `${new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { month: 'short', day: 'numeric' }).format(calendarDays[0])} – ${new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { month: 'short', day: 'numeric', year: 'numeric' }).format(calendarDays[6])}`

  return <section className="desk-calendar-page" aria-label={t.title}>
    <header className="desk-calendar-toolbar">
      <div className="desk-calendar-toolbar-title"><CalendarDays size={20} aria-hidden="true" /><h2>{title}</h2></div>
      <div className="desk-calendar-actions">
        <button type="button" className="desk-button" onClick={() => setCursor(new Date())}>{t.today}</button>
        <button type="button" className="desk-icon-button" aria-label={t.previous} onClick={() => moveCursor(-1)}><ChevronLeft size={17} /></button>
        <button type="button" className="desk-icon-button" aria-label={t.next} onClick={() => moveCursor(1)}><ChevronRight size={17} /></button>
        <button type="button" className="desk-button" aria-pressed={view === 'month'} onClick={() => setView('month')}>{t.month}</button>
        <button type="button" className="desk-button" aria-pressed={view === 'week'} onClick={() => setView('week')}>{t.week}</button>
        <button type="button" className="desk-button" onClick={() => downloadIcs(getTaskTree(), 'vexale-tasks.ics')}><Download size={16} />{t.exportIcs}</button>
        {notificationState === 'granted' ? <button type="button" className="desk-button" onClick={() => setStatus(t.notificationsEnabled)}><Bell size={16} />{t.notificationsOn}</button> : notificationState === 'unsupported' ? <span className="desk-calendar-muted"><BellOff size={16} />{t.notificationsUnsupported}</span> : <button type="button" className="desk-button" onClick={() => void requestNotifications()}><Bell size={16} />{t.enableNotifications}</button>}
      </div>
    </header>
    {status && <p className="desk-inline-status" role="status">{status}</p>}
    <p className="desk-calendar-help">{t.dragHelp}</p>
    <div className={`desk-calendar-grid desk-calendar-${view}`}>
      {labels.map((label, index) => <div className="desk-calendar-weekday" key={`${label}-${index}`}>{label}</div>)}
      {calendarDays.map(date => {
        const key = dayKey(date)
        const dayTasks = tasksByDate.get(key) ?? []
        const outsideMonth = view === 'month' && date.getMonth() !== cursor.getMonth()
        return <div key={key} className={`desk-calendar-day${outsideMonth ? ' is-outside' : ''}${key === today ? ' is-today' : ''}`} onDragOver={event => { if (dragId) event.preventDefault() }} onDrop={() => { if (dragId) changeDate(date) }}>
          <time dateTime={key}>{date.getDate()}</time>
          <div className="desk-calendar-day-tasks">{dayTasks.map(task => <TaskChip key={task.id} task={task} onDragStart={setDragId} />)}</div>
        </div>
      })}
    </div>
  </section>
}
