import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Bold, Check, Heading2, Italic, List, ListOrdered, LoaderCircle, Quote, Redo2, Undo2 } from 'lucide-react'
import { dbGetNote, dbPutNote } from '../../db'
import { useDesktopMessages } from './i18n'

interface DesktopNoteEditorProps {
  nodeId: string
  sectionTitle: string
}

type SaveState = 'loading' | 'saving' | 'saved' | 'error'
type NoteCommand = 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'undo' | 'redo'

const ALLOWED_TAGS = new Set(['P', 'DIV', 'BR', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'HR', 'SPAN'])
const NOTE_STYLES = new Set(['text-light', 'text-dark', 'text-lilac', 'text-sky', 'text-rose', 'text-mint', 'highlight-yellow', 'highlight-lilac', 'highlight-mint', 'highlight-rose'])

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
  return (parsed.body.textContent ?? '').replace(/\u200b/g, '').trim().length > 0
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
        setSaveError('')
        setSaveState('saved')
      })
      .catch(() => {
        if (cancelled) return
        latestHtmlRef.current = ''
        if (editorRef.current) editorRef.current.innerHTML = ''
        setHasContent(false)
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
        saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(() => dbPutNote({ nodeId, html, updatedAt: Date.now() }))
      }
    }
  }, [nodeId])

  const queueSave = (html: string): Promise<void> => {
    const next = saveQueueRef.current.catch(() => undefined).then(() => dbPutNote({ nodeId, html, updatedAt: Date.now() }))
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
        <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.undo} title={noteMessages.undo} disabled={saveState === 'loading'} onMouseDown={event => event.preventDefault()} onClick={() => runCommand('undo')}><Undo2 size={16} aria-hidden="true" /></button>
        <button type="button" className="desk-note-toolbar-button" aria-label={noteMessages.redo} title={noteMessages.redo} disabled={saveState === 'loading'} onMouseDown={event => event.preventDefault()} onClick={() => runCommand('redo')}><Redo2 size={16} aria-hidden="true" /></button>
      </div>
      {saveError && <p className="desk-note-error" role="alert">{saveError}</p>}
      <div
        ref={editorRef}
        className="desk-note-editor desk-note-content"
        contentEditable={saveState !== 'loading'}
        suppressContentEditableWarning
        role="textbox"
        aria-label={`${noteMessages.editor}: ${sectionTitle}`}
        aria-multiline="true"
        data-empty={!hasContent}
        data-placeholder={noteMessages.placeholder}
        dir="auto"
        onInput={handleInput}
      />
    </section>
  )
}
