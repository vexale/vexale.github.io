import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AlertCircle, Bold, Check, Code2, Heading2, Heading3, History, Italic, Link2, List, ListChecks, ListOrdered, LoaderCircle, Minus, Quote, Redo2, Table2, Undo2 } from 'lucide-react'
import { dbGetNote, dbPutNote } from '../../db'
import { useDesktopMessages } from './i18n'

interface DesktopNoteEditorProps {
  nodeId: string
  sectionTitle: string
}

type SaveState = 'loading' | 'saving' | 'saved' | 'error'
type NoteCommand = 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'undo' | 'redo'
type SlashAction = 'heading' | 'subheading' | 'bullets' | 'numbered' | 'checklist' | 'quote' | 'code' | 'divider' | 'table' | 'link'
interface NoteVersion { savedAt: number; html: string }

const NOTE_VERSION_LIMIT = 20
const CHECKBOX_MARKS = new Set(['☐', '☑'])
const ALLOWED_TAGS = new Set(['P', 'DIV', 'BR', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'HR', 'SPAN'])
const NOTE_STYLES = new Set(['text-light', 'text-dark', 'text-lilac', 'text-sky', 'text-rose', 'text-mint', 'highlight-yellow', 'highlight-lilac', 'highlight-mint', 'highlight-rose'])

function readNoteVersions(nodeId: string): NoteVersion[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`vexale-note-history-v1:${encodeURIComponent(nodeId)}`) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is NoteVersion => Boolean(item && typeof item === 'object' && 'html' in item && typeof item.html === 'string' && 'savedAt' in item && typeof item.savedAt === 'number' && Number.isFinite(item.savedAt) && item.savedAt >= 0 && item.savedAt <= 8.64e15)).slice(0, NOTE_VERSION_LIMIT) : []
  } catch { return [] }
}

function writeNoteVersion(nodeId: string, html: string, savedAt = Date.now()): NoteVersion[] {
  const history = readNoteVersions(nodeId)
  if (history[0]?.html === html) return history
  const next = [{ html, savedAt }, ...history.filter(version => version.html !== html)].slice(0, NOTE_VERSION_LIMIT)
  try { localStorage.setItem(`vexale-note-history-v1:${encodeURIComponent(nodeId)}`, JSON.stringify(next)) } catch { /* note saving must work even when local history storage is unavailable */ }
  return next
}

function wordCount(html: string): number {
  const text = (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/[☐☑]/gu, '')
  return text.trim() ? text.trim().split(/\s+/u).length : 0
}

function plainText(html: string): string {
  return (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/\s+/gu, ' ').trim()
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return value.replace(/[&<>"']/g, character => replacements[character] ?? character)
}

function sanitizeNoteHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const cleanNode = (node: Node): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) return [document.createTextNode(node.textContent ?? '')]
    if (!(node instanceof HTMLElement)) return Array.from(node.childNodes).flatMap(cleanNode)

    const children = Array.from(node.childNodes).flatMap(cleanNode)
    if (!ALLOWED_TAGS.has(node.tagName)) return children

    const clean = document.createElement(node.tagName.toLowerCase())
    children.forEach(child => clean.appendChild(child))
    if (node.tagName === 'A') {
      const href = node.getAttribute('href')
      if (href) {
        try {
          const url = new URL(href, window.location.origin)
          if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:') {
            clean.setAttribute('href', url.href)
            clean.setAttribute('target', '_blank')
            clean.setAttribute('rel', 'noopener noreferrer')
          }
        } catch {
          // إبقاء نص الرابط مع تجاهل الوجهة غير الصالحة.
        }
      }
    }
    if (node.tagName === 'SPAN') {
      const style = node.getAttribute('data-note-style')
      if (style && NOTE_STYLES.has(style)) clean.setAttribute('data-note-style', style)
      const mark = clean.textContent?.trim() ?? ''
      if (CHECKBOX_MARKS.has(mark)) {
        clean.className = 'desk-note-checkbox'
        clean.setAttribute('contenteditable', 'false')
        clean.setAttribute('role', 'checkbox')
        clean.setAttribute('aria-checked', String(mark === '☑'))
        clean.setAttribute('aria-label', (node.getAttribute('aria-label') || 'Checklist item').slice(0, 100))
        clean.setAttribute('tabindex', '0')
      }
    }
    if (node.tagName === 'DIV') {
      const columns = node.getAttribute('data-note-columns')
      if (columns === '2' || columns === '3') clean.setAttribute('data-note-columns', columns)
    }
    return [clean]
  }

  const wrapper = document.createElement('div')
  Array.from(parsed.body.childNodes).flatMap(cleanNode).forEach(node => wrapper.appendChild(node))
  return wrapper.innerHTML
}

function hasReadableText(html: string): boolean {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return (parsed.body.textContent ?? '').replace(/\u200b/g, '').trim().length > 0 || Boolean(parsed.body.querySelector('hr, pre'))
}

export default function DesktopNoteEditor({ nodeId, sectionTitle }: DesktopNoteEditorProps) {
  const messages = useDesktopMessages()
  const editorRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const latestHtmlRef = useRef('')
  const dirtyRef = useRef(false)
  const mountedRef = useRef(false)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [hasContent, setHasContent] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [words, setWords] = useState(0)
  const [noteVersions, setNoteVersions] = useState<NoteVersion[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashPosition, setSlashPosition] = useState({ top: 12, left: 12 })
  const noteMessages = messages.notes
  const errorMessageRef = useRef(noteMessages.error)

  useEffect(() => {
    errorMessageRef.current = noteMessages.error
  }, [noteMessages.error])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false
    void dbGetNote(nodeId)
      .then(note => {
        if (cancelled) return
        const safeHtml = sanitizeNoteHtml(note?.html ?? '')
        latestHtmlRef.current = safeHtml
        dirtyRef.current = false
        if (editorRef.current) editorRef.current.innerHTML = safeHtml
        setHasContent(hasReadableText(safeHtml))
        setWords(wordCount(safeHtml))
        setNoteVersions(writeNoteVersion(nodeId, safeHtml, note?.updatedAt ?? Date.now()))
        setSaveError('')
        setSaveState('saved')
      })
      .catch(() => {
        if (cancelled) return
        latestHtmlRef.current = ''
        if (editorRef.current) editorRef.current.innerHTML = ''
        setHasContent(false)
        setWords(0)
        setNoteVersions(readNoteVersions(nodeId))
        setSaveError(errorMessageRef.current)
        setSaveState('error')
      })

    return () => {
      cancelled = true
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (dirtyRef.current) {
        const html = latestHtmlRef.current
        saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(() => dbPutNote({ nodeId, html, updatedAt: Date.now() })).then(() => { writeNoteVersion(nodeId, html) })
      }
    }
  }, [nodeId])

  const queueSave = (html: string): Promise<void> => {
    const next = saveQueueRef.current.catch(() => undefined).then(async () => {
      await dbPutNote({ nodeId, html, updatedAt: Date.now() })
      const versions = writeNoteVersion(nodeId, html)
      if (mountedRef.current) setNoteVersions(versions)
    })
    saveQueueRef.current = next
    return next
  }

  const scheduleSave = (): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    const html = latestHtmlRef.current
    setSaveState('saving')
    setSaveError('')
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void queueSave(html)
        .then(() => {
          if (!mountedRef.current || latestHtmlRef.current !== html) return
          dirtyRef.current = false
          setSaveState('saved')
        })
        .catch(() => {
          if (!mountedRef.current) return
          setSaveError(errorMessageRef.current)
          setSaveState('error')
        })
    }, 450)
  }

  const handleInput = (): void => {
    if (!editorRef.current) return
    const html = sanitizeNoteHtml(editorRef.current.innerHTML)
    latestHtmlRef.current = html
    dirtyRef.current = true
    setHasContent(hasReadableText(html))
    setWords(wordCount(html))
    scheduleSave()
  }

  const runCommand = (command: NoteCommand): void => {
    if (!editorRef.current || saveState === 'loading') return
    editorRef.current.focus()
    document.execCommand(command, false)
    handleInput()
  }

  const formatBlock = (tag: 'h2' | 'h3' | 'blockquote'): void => {
    if (!editorRef.current || saveState === 'loading') return
    editorRef.current.focus()
    document.execCommand('formatBlock', false, tag)
    handleInput()
  }

  const slashCommands: Array<{ id: SlashAction; label: string; keywords: string }> = [
    { id: 'heading', label: noteMessages.heading, keywords: 'h2 heading title' },
    { id: 'subheading', label: noteMessages.subheading, keywords: 'h3 subheading' },
    { id: 'bullets', label: noteMessages.bullets, keywords: 'bullet list unordered' },
    { id: 'numbered', label: noteMessages.numbered, keywords: 'numbered ordered list' },
    { id: 'checklist', label: noteMessages.checklist, keywords: 'check task todo list' },
    { id: 'quote', label: noteMessages.quote, keywords: 'quote blockquote' },
    { id: 'code', label: noteMessages.codeBlock, keywords: 'code pre' },
    { id: 'divider', label: noteMessages.divider, keywords: 'divider horizontal rule' },
    { id: 'table', label: noteMessages.table, keywords: 'table grid' },
    { id: 'link', label: noteMessages.link, keywords: 'link url web' },
  ]
  const filteredSlashCommands = slashQuery === null ? [] : slashCommands.filter(command => `${command.label} ${command.keywords}`.toLocaleLowerCase().includes(slashQuery.toLocaleLowerCase()))

  const replaceSlashToken = (): void => {
    const selection = window.getSelection()
    const node = selection?.anchorNode
    if (!selection || !node || node.nodeType !== Node.TEXT_NODE) return
    const match = (node.textContent ?? '').slice(0, selection.anchorOffset).match(/^\/[\p{L}\p{N}]*$/u)
    if (!match) return
    const range = selection.getRangeAt(0)
    range.setStart(node, 0); range.setEnd(node, selection.anchorOffset); range.deleteContents(); range.collapse(true)
    selection.removeAllRanges(); selection.addRange(range)
  }

  const insertLink = (): void => {
    const selection = window.getSelection()
    const savedRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    const selectedText = selection?.toString() ?? ''
    const raw = window.prompt(noteMessages.linkPrompt)?.trim()
    setSlashQuery(null)
    if (!raw) {
      if (editorRef.current && sanitizeNoteHtml(editorRef.current.innerHTML) !== latestHtmlRef.current) handleInput()
      return
    }
    let href = ''
    try {
      const url = new URL(raw, window.location.origin)
      if (['https:', 'http:', 'mailto:'].includes(url.protocol)) href = url.href
    } catch { /* invalid links are reported below */ }
    if (!href) {
      if (editorRef.current && sanitizeNoteHtml(editorRef.current.innerHTML) !== latestHtmlRef.current) handleInput()
      setSaveError(noteMessages.linkInvalid)
      return
    }
    if (selection && savedRange) { selection.removeAllRanges(); selection.addRange(savedRange) }
    if (selectedText) document.execCommand('createLink', false, href)
    else document.execCommand('insertHTML', false, `<a href="${escapeHtml(href)}">${escapeHtml(raw)}</a>`)
    handleInput()
  }

  const runSlashAction = (action: SlashAction): void => {
    if (!editorRef.current || saveState === 'loading') return
    replaceSlashToken()
    setSlashQuery(null)
    if (action === 'link') { insertLink(); return }
    if (action === 'heading') document.execCommand('formatBlock', false, 'h2')
    else if (action === 'subheading') document.execCommand('formatBlock', false, 'h3')
    else if (action === 'bullets') document.execCommand('insertUnorderedList', false)
    else if (action === 'numbered') document.execCommand('insertOrderedList', false)
    else if (action === 'quote') document.execCommand('formatBlock', false, 'blockquote')
    else if (action === 'checklist') document.execCommand('insertHTML', false, `<ul><li><span class="desk-note-checkbox" contenteditable="false" role="checkbox" aria-label="${escapeHtml(noteMessages.checklistItem)}" aria-checked="false" tabindex="0">☐</span>&nbsp;${escapeHtml(noteMessages.checklistItem)}</li></ul><p><br></p>`)
    else if (action === 'code') document.execCommand('insertHTML', false, '<pre><code><br></code></pre><p><br></p>')
    else if (action === 'divider') document.execCommand('insertHTML', false, '<hr><p><br></p>')
    else if (action === 'table') {
      const cells = [noteMessages.tableHeaderOne, noteMessages.tableHeaderTwo, noteMessages.tableCell, noteMessages.tableCell, noteMessages.tableCell, noteMessages.tableCell]
      const cell = (index: number): string => cells[index] ?? noteMessages.tableCell
      const rows = Array.from({ length: 3 }, (_, row) => `<div data-note-columns="2"><div><p>${row === 0 ? `<strong>${escapeHtml(cell(0))}</strong>` : escapeHtml(cell(row * 2))}</p></div><div><p>${row === 0 ? `<strong>${escapeHtml(cell(1))}</strong>` : escapeHtml(cell(row * 2 + 1))}</p></div></div>`).join('')
      document.execCommand('insertHTML', false, `${rows}<p><br></p>`)
    }
    handleInput()
  }

  const updateSlashMenu = (): void => {
    const selection = window.getSelection(), node = selection?.anchorNode
    if (!selection || !node || node.nodeType !== Node.TEXT_NODE || !editorRef.current?.contains(node)) { setSlashQuery(null); return }
    const before = (node.textContent ?? '').slice(0, selection.anchorOffset)
    const match = before.match(/^\/([\p{L}\p{N}]*)$/u)
    if (!match) { setSlashQuery(null); return }
    setSlashQuery(match[1] ?? ''); setSlashIndex(0)
    const caret = selection.getRangeAt(0).cloneRange(); caret.collapse(false)
    const caretRect = caret.getBoundingClientRect(), editorRect = editorRef.current.getBoundingClientRect()
    setSlashPosition({ top: Math.max(8, caretRect.bottom - editorRect.top + 4), left: Math.max(8, Math.min(caretRect.left - editorRect.left, editorRect.width - 250)) })
  }

  const toggleCheckbox = (target: HTMLElement): void => {
    const mark = target.closest<HTMLElement>('.desk-note-checkbox')
    if (!mark || !mark.closest('li')) return
    const checked = mark.textContent?.trim() !== '☑'
    mark.textContent = checked ? '☑' : '☐'
    mark.setAttribute('aria-checked', String(checked))
    handleInput()
  }

  const onEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest('.desk-note-checkbox') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleCheckbox(target); return }
    if (slashQuery === null) return
    if (event.key === 'Escape') { event.preventDefault(); replaceSlashToken(); setSlashQuery(null); handleInput() }
    else if (event.key === 'ArrowDown' && filteredSlashCommands.length) { event.preventDefault(); setSlashIndex(index => (index + 1) % filteredSlashCommands.length) }
    else if (event.key === 'ArrowUp' && filteredSlashCommands.length) { event.preventDefault(); setSlashIndex(index => (index - 1 + filteredSlashCommands.length) % filteredSlashCommands.length) }
    else if (event.key === 'Enter' && filteredSlashCommands.length) { event.preventDefault(); runSlashAction(filteredSlashCommands[slashIndex]!.id) }
  }

  const restoreVersion = (version: NoteVersion): void => {
    const editor = editorRef.current
    if (!editor) return
    const restored = sanitizeNoteHtml(version.html)
    if (restored === latestHtmlRef.current) { setHistoryOpen(false); return }
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null }
    setNoteVersions(writeNoteVersion(nodeId, sanitizeNoteHtml(editor.innerHTML)))
    editor.innerHTML = restored
    latestHtmlRef.current = restored
    dirtyRef.current = true
    editor.focus()
    const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false)
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
    setHasContent(hasReadableText(restored)); setWords(wordCount(restored)); setHistoryOpen(false)
    scheduleSave()
  }

  const statusText = saveState === 'loading'
    ? noteMessages.loading
    : saveState === 'saving'
      ? noteMessages.saving
      : saveState === 'error'
        ? noteMessages.error
        : noteMessages.saved
  const StatusIcon = saveState === 'loading' || saveState === 'saving' ? LoaderCircle : saveState === 'error' ? AlertCircle : Check

  return (
    <section className="desk-note-panel" aria-labelledby="desk-note-title">
      <header className="desk-note-header">
        <div>
          <h2 id="desk-note-title">{noteMessages.title}</h2>
          <p>{sectionTitle}</p>
        </div>
        <p className={`desk-note-status desk-note-status-${saveState}`} role="status" aria-live="polite">
          <StatusIcon size={15} aria-hidden="true" />
          <span>{statusText}</span>
        </p>
      </header>
      <div className="desk-note-toolbar" role="toolbar" aria-label={noteMessages.toolbar}>
        <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.heading} title={noteMessages.heading} disabled={saveState === 'loading'} onMouseDown={event => event.preventDefault()} onClick={() => formatBlock('h2')}><Heading2 size={16} aria-hidden="true" /></button>
        <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.bold} title={noteMessages.bold} disabled={saveState === 'loading'} onMouseDown={event => event.preventDefault()} onClick={() => runCommand('bold')}><Bold size={16} aria-hidden="true" /></button>
        <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.italic} title={noteMessages.italic} disabled={saveState === 'loading'} onMouseDown={event => event.preventDefault()} onClick={() => runCommand('italic')}><Italic size={16} aria-hidden="true" /></button>
        <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.bullets} title={noteMessages.bullets} disabled={saveState === 'loading'} onMouseDown={event => event.preventDefault()} onClick={() => runCommand('insertUnorderedList')}><List size={16} aria-hidden="true" /></button>
        <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.numbered} title={noteMessages.numbered} disabled={saveState === 'loading'} onMouseDown={event => event.preventDefault()} onClick={() => runCommand('insertOrderedList')}><ListOrdered size={16} aria-hidden="true" /></button>
        <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.quote} title={noteMessages.quote} disabled={saveState === 'loading'} onMouseDown={event => event.preventDefault()} onClick={() => formatBlock('blockquote')}><Quote size={16} aria-hidden="true" /></button>
        <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.link} title={noteMessages.link} disabled={saveState === 'loading'} onMouseDown={event => event.preventDefault()} onClick={insertLink}><Link2 size={16} aria-hidden="true" /></button>
        <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.undo} title={noteMessages.undo} disabled={saveState === 'loading'} onMouseDown={event => event.preventDefault()} onClick={() => runCommand('undo')}><Undo2 size={16} aria-hidden="true" /></button>
        <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.redo} title={noteMessages.redo} disabled={saveState === 'loading'} onMouseDown={event => event.preventDefault()} onClick={() => runCommand('redo')}><Redo2 size={16} aria-hidden="true" /></button>
        <div className="desk-note-history-wrap">
          <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.versionHistory} title={noteMessages.versionHistory} aria-expanded={historyOpen} aria-controls="desk-note-history-panel" onMouseDown={event => event.preventDefault()} onClick={() => { setNoteVersions(readNoteVersions(nodeId)); setHistoryOpen(open => !open) }}><History size={16} aria-hidden="true" /></button>
          {historyOpen && <div id="desk-note-history-panel" className="desk-note-history-popover" role="dialog" aria-label={noteMessages.versionHistoryTitle}>
            <strong>{noteMessages.versionHistoryTitle} <span>({noteVersions.length}/{NOTE_VERSION_LIMIT})</span></strong>
            {noteVersions.length ? <div className="desk-note-history-list">{noteVersions.map((version, index) => <article className="desk-note-history-item" key={`${version.savedAt}-${index}`}>
              <time dateTime={new Date(version.savedAt).toISOString()}>{new Date(version.savedAt).toLocaleString()}</time>
              <p>{plainText(version.html) || noteMessages.emptyVersion}</p>
              <button type="button" className="desk-note-history-restore" onClick={() => restoreVersion(version)}>{noteMessages.restoreVersion}</button>
            </article>)}</div> : <p className="desk-note-history-empty">{noteMessages.emptyVersionHistory}</p>}
          </div>}
        </div>
      </div>
      {saveError && <p className="desk-note-error" role="alert">{saveError}</p>}
      <div className="desk-note-editor-shell">
        <div
          ref={editorRef}
          className="desk-note-editor desk-note-content"
          contentEditable={saveState !== 'loading'}
          suppressContentEditableWarning
          role="textbox"
          aria-label={`${noteMessages.editor}: ${sectionTitle}`}
          aria-multiline="true"
          aria-haspopup="listbox"
          aria-expanded={slashQuery !== null}
          aria-controls="desk-note-slash-listbox"
          aria-activedescendant={slashQuery !== null && filteredSlashCommands.length ? `desk-note-slash-${filteredSlashCommands[Math.min(slashIndex, filteredSlashCommands.length - 1)]!.id}` : undefined}
          data-empty={!hasContent}
          data-placeholder={noteMessages.placeholder}
          dir="auto"
          onInput={() => { handleInput(); updateSlashMenu() }}
          onClick={event => { const target = event.target as HTMLElement; if (target.closest('.desk-note-checkbox')) toggleCheckbox(target); else updateSlashMenu() }}
          onKeyDown={onEditorKeyDown}
        />
        {slashQuery !== null && <div id="desk-note-slash-listbox" className="desk-note-slash-menu" role="listbox" aria-label={noteMessages.slashMenu} style={{ top: slashPosition.top, left: slashPosition.left }}>
          {filteredSlashCommands.length ? filteredSlashCommands.map((command, index) => {
            const Icon = ({ heading: Heading2, subheading: Heading3, bullets: List, numbered: ListOrdered, checklist: ListChecks, quote: Quote, code: Code2, divider: Minus, table: Table2, link: Link2 })[command.id]
            return <button key={command.id} id={`desk-note-slash-${command.id}`} type="button" role="option" aria-selected={slashIndex === index} className={`desk-note-slash-option${slashIndex === index ? ' is-active' : ''}`} onMouseDown={event => event.preventDefault()} onClick={() => runSlashAction(command.id)}><Icon size={15} aria-hidden="true" /><span>{command.label}</span></button>
          }) : <p className="desk-note-slash-empty">{noteMessages.noSlashCommands}</p>}
        </div>}
      </div>
      <p className="desk-note-word-count" aria-live="polite">{words} {noteMessages.words}</p>
    </section>
  )
}
