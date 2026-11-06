import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { FileText, MessageSquareText, MoveHorizontal, X } from 'lucide-react'
import { useLocale } from '../../lib/i18n'
import type { Item } from '../../shared'
import AIChat from '../../components/AIChat'
import type { DesktopMessages } from './i18n'
import { getScopedStorageItem, setScopedStorageItem, subscribeLocalDataOwner } from '../../lib/localData'

type ChatMode = 'side' | 'split' | 'full'
const LAYOUT_KEY = 'vexale-desktop-study-chat-layout-v1'
const MIN_CHAT_WIDTH = 360
const MAX_CHAT_WIDTH = 900
interface LayoutPreference { mode: ChatMode; width: number }
function readLayout(): LayoutPreference {
  try {
    const saved: unknown = JSON.parse(getScopedStorageItem(LAYOUT_KEY) ?? 'null')
    if (saved && typeof saved === 'object') {
      const value = saved as Record<string, unknown>
      return {
        mode: value.mode === 'split' || value.mode === 'full' ? value.mode : 'side',
        width: typeof value.width === 'number' && Number.isFinite(value.width) ? Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, value.width)) : 480,
      }
    }
  } catch { /* Use the default layout when storage is unavailable. */ }
  return { mode: 'side', width: 480 }
}
function isTextFile(item: Item): boolean {
  const extension = item.name.split('.').pop()?.toLowerCase()
  return !!item.file && (item.file.type.startsWith('text/') || ['txt', 'md', 'markdown', 'csv', 'json', 'xml', 'html', 'htm', 'log'].includes(extension ?? ''))
}

interface Props {
  item: Item
  extractedText: string
  messages: DesktopMessages['files']
  onClose: () => void
}

export default function DesktopFileStudyView({ item, extractedText, messages, onClose }: Props) {
  const locale = useLocale()
  const [mode, setMode] = useState<ChatMode>(() => readLayout().mode)
  const [chatWidth, setChatWidth] = useState<number>(() => readLayout().width)
  const [chatOpen, setChatOpen] = useState(false)
  const [fileText, setFileText] = useState('')
  const [textLoading, setTextLoading] = useState(false)
  const dragRef = useRef<{ x: number; width: number } | null>(null)
  const type = item.file?.type ?? ''
  const isPdf = type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf')
  const text = (english: string, arabic: string): string => locale === 'ar' ? arabic : english

  useEffect(() => subscribeLocalDataOwner(() => { const layout = readLayout(); setMode(layout.mode); setChatWidth(layout.width) }), [])

  useEffect(() => {
    setScopedStorageItem(LAYOUT_KEY, JSON.stringify({ mode, width: chatWidth }))
  }, [mode, chatWidth])

  useEffect(() => {
    let cancelled = false
    setFileText(extractedText)
    if (!extractedText && isTextFile(item) && item.file) {
      setTextLoading(true)
      void item.file.text().then(content => { if (!cancelled) setFileText(content) }).catch(() => { if (!cancelled) setFileText('') }).finally(() => { if (!cancelled) setTextLoading(false) })
    } else setTextLoading(false)
    return () => { cancelled = true }
  }, [item, extractedText])

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (!dragRef.current) return
      setChatWidth(Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, dragRef.current.width + dragRef.current.x - event.clientX)))
    }
    const up = (): void => { dragRef.current = null; document.body.style.removeProperty('cursor'); document.body.style.removeProperty('user-select') }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); up() }
  }, [])

  const cycleMode = (): void => setMode(current => current === 'side' ? 'split' : current === 'split' ? 'full' : 'side')
  const modeLabel = mode === 'side' ? text('Side', 'جانبي') : mode === 'split' ? text('Split', 'مقسوم') : text('Full page', 'ملء الصفحة')
  const context = [`File: ${item.name}`, fileText.trim()].filter(Boolean).join('\n\n').slice(0, 16_000)

  return <div className="desk-file-study-backdrop" dir="ltr" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`desk-file-study${chatOpen ? ' has-chat' : ''}${mode === 'full' && chatOpen ? ' chat-full-page' : ''}`} role="dialog" aria-modal="true" aria-label={`${messages.preview}: ${item.name}`} style={{ '--desk-chat-width': mode === 'split' ? '50%' : `${chatWidth}px` } as CSSProperties}>
      {!(chatOpen && mode === 'full') && <div className="desk-file-study-file" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <header className="desk-file-study-header"><h2 title={item.name}>{item.name}</h2><div className="desk-file-study-actions">
          <button type="button" className="desk-button" aria-pressed={chatOpen} onClick={() => setChatOpen(value => !value)}><MessageSquareText size={16} aria-hidden="true" />{chatOpen ? text('Hide chat', 'إخفاء المحادثة') : text('Ask AI', 'اسأل المساعد')}</button>
          <button type="button" className="desk-icon-button" aria-label={messages.closePreview} onClick={onClose}><X size={17} aria-hidden="true" /></button>
        </div></header>
        <div className="desk-file-study-content">{type.startsWith('image/') ? <img src={item.url} alt={item.name} /> : type.startsWith('audio/') ? <audio controls src={item.url} /> : type.startsWith('video/') ? <video controls src={item.url} /> : isPdf ? <iframe title={item.name} src={`${item.url}#page=1&view=FitH`} /> : isTextFile(item) ? <pre className="desk-file-study-text">{textLoading ? text('Reading file…', 'جارٍ قراءة الملف…') : fileText || text('This file is empty.', 'هذا الملف فارغ.')}</pre> : <div className="desk-preview-unavailable"><FileText size={28} /><p>{messages.previewUnavailable}</p><a href={item.url} target="_blank" rel="noreferrer">{messages.open}</a></div>}</div>
      </div>}
      {chatOpen && mode === 'side' && <div className="desk-chat-resize" role="separator" aria-label={text('Resize chat panel', 'تغيير حجم لوحة المحادثة')} aria-orientation="vertical" aria-valuemin={MIN_CHAT_WIDTH} aria-valuemax={MAX_CHAT_WIDTH} aria-valuenow={chatWidth} tabIndex={0} onPointerDown={event => { event.preventDefault(); dragRef.current = { x: event.clientX, width: chatWidth }; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none' }} onKeyDown={event => { if (event.key === 'ArrowLeft') setChatWidth(width => Math.min(MAX_CHAT_WIDTH, width + 24)); if (event.key === 'ArrowRight') setChatWidth(width => Math.max(MIN_CHAT_WIDTH, width - 24)) }}><MoveHorizontal size={14} aria-hidden="true" /></div>}
      {chatOpen && <aside className={`desk-file-study-chat mode-${mode}`} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <header className="desk-chat-header"><div><strong>{text('File chat', 'محادثة الملف')}</strong><span>{item.name}</span></div><div className="desk-chat-header-actions"><button type="button" className="desk-button" onClick={cycleMode} title={text('Change chat layout', 'تغيير تخطيط المحادثة')}>{modeLabel}</button>{mode === 'full' && <button type="button" className="desk-icon-button" aria-label={messages.closePreview} onClick={onClose}><X size={17} /></button>}</div></header>
        <div className="desk-chat-messages"><AIChat key={item.id} context={context} nodeTitle={item.name} contextLoading={textLoading} /></div>
      </aside>}
    </section>
  </div>
}
