import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  BookOpenText, Bold, Bot, Code2, Columns2, Columns3, Copy, Heading2, Heading3,
  Highlighter, Italic, List, ListChecks, ListOrdered, LoaderCircle, Palette, Quote,
  Redo2, Save, Send, Share2, Sparkles, Underline, Undo2,
} from 'lucide-react'
import { dbGetNote, dbPutNote } from '../db'
import { useLocale, tr } from '../lib/i18n'
import { createSharedWorkspace, readSharedNote, writeSharedNote } from '../lib/libraryApi'
import { getGoogleIdToken } from '../lib/googleAuth'
import { broadcastSharedNote, createWorkspaceInvite, activateWorkspace, leaveSharedWorkspace, subscribeToSharedNotes, useSharedWorkspace } from '../lib/sharedWorkspace'
import { requestStudyAI } from '../lib/studyAssistant'
import type { StudyAction } from '../lib/studyAssistant'
import type { SharedNote } from '../lib/libraryApi'

interface NotesEditorProps {
  nodeId: string
  title: string
  nodePathKey: string
}

type SaveState = 'loading' | 'saving' | 'saved' | 'error'
type SyncState = 'local' | 'connecting' | 'synced' | 'error'
type EditorCommand = 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList' | 'undo' | 'redo'
type NoteStyle = 'text-light' | 'text-dark' | 'text-lilac' | 'text-sky' | 'text-rose' | 'text-mint' | 'highlight-yellow' | 'highlight-lilac' | 'highlight-mint' | 'highlight-rose'

const TOOLBAR_BUTTON = 'ui-button-secondary flex h-9 min-w-9 items-center justify-center gap-1 px-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95'
const ALLOWED_TAGS = new Set(['P', 'DIV', 'BR', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'HR', 'SPAN'])
const ALLOWED_NOTE_STYLES = new Set<NoteStyle>([
  'text-light', 'text-dark', 'text-lilac', 'text-sky', 'text-rose', 'text-mint',
  'highlight-yellow', 'highlight-lilac', 'highlight-mint', 'highlight-rose',
])

const TEXT_STYLES: readonly { id: NoteStyle; label: { en: string; ar: string }; color: string }[] = [
  { id: 'text-light', label: { en: 'Light', ar: 'فاتح' }, color: '#f8fafc' },
  { id: 'text-dark', label: { en: 'Dark', ar: 'داكن' }, color: '#1f2937' },
  { id: 'text-lilac', label: { en: 'Lilac', ar: 'ليلكي' }, color: '#d8b4fe' },
  { id: 'text-sky', label: { en: 'Sky', ar: 'سماوي' }, color: '#7dd3fc' },
  { id: 'text-rose', label: { en: 'Rose', ar: 'وردي' }, color: '#fda4af' },
  { id: 'text-mint', label: { en: 'Mint', ar: 'نعناعي' }, color: '#86efac' },
]

const HIGHLIGHT_STYLES: readonly { id: NoteStyle; label: { en: string; ar: string }; color: string }[] = [
  { id: 'highlight-yellow', label: { en: 'Sunlight', ar: 'أصفر هادئ' }, color: '#facc15' },
  { id: 'highlight-lilac', label: { en: 'Lilac', ar: 'ليلكي' }, color: '#c084fc' },
  { id: 'highlight-mint', label: { en: 'Mint', ar: 'نعناعي' }, color: '#34d399' },
  { id: 'highlight-rose', label: { en: 'Rose', ar: 'وردي' }, color: '#fb7185' },
]

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
          // يُحذف الرابط غير الصالح ويظل نصه محفوظاً.
        }
      }
    }

    if (node.tagName === 'SPAN') {
      const style = node.getAttribute('data-note-style')
      if (style && ALLOWED_NOTE_STYLES.has(style as NoteStyle)) clean.setAttribute('data-note-style', style)
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

function localizeAssistantError(error: string, locale: 'en' | 'ar'): string {
  if (locale === 'en') return error
  const translations: Record<string, string> = {
    'Sign in or reconnect your Google account to continue.': 'سجّل الدخول أو أعد ربط حساب Google للمتابعة.',
    'Your Google session needs to be refreshed. Please sign in again.': 'تحتاج جلسة Google إلى تحديث. سجّل الدخول مرة أخرى.',
    'Study tools are getting ready. Please try again soon.': 'تجري تهيئة أدوات الدراسة. حاول مرة أخرى بعد قليل.',
    'Choose a focused passage to work with.': 'اختر مقطعاً محدداً للعمل عليه.',
    'Add some notes to this section to get started.': 'أضف بعض الملاحظات إلى هذا القسم للبدء.',
    'What would you like to explore?': 'ما الموضوع الذي ترغب في استكشافه؟',
    'Could you make your question a little more focused?': 'هل يمكنك تحديد سؤالك أكثر قليلاً؟',
    'Please enter a clear, focused question.': 'اكتب سؤالاً واضحاً ومحدداً.',
    'Please review the request and try again.': 'راجع الطلب وحاول مرة أخرى.',
    'Something interrupted the request. Please try again.': 'حدث انقطاع بسيط أثناء الطلب. حاول مرة أخرى.',
    'No response came through this time. Please try again.': 'لم تصل إجابة هذه المرة. حاول مرة أخرى.',
  }
  return translations[error] ?? 'تعذّر إكمال الطلب الآن. حاول مرة أخرى.'
}

export default function NotesEditor({ nodeId, title, nodePathKey }: NotesEditorProps) {
  const locale = useLocale()
  const workspace = useSharedWorkspace()
  const editorRef = useRef<HTMLDivElement>(null)
  const currentHtmlRef = useRef('')
  const dirtyRef = useRef(false)
  const revisionRef = useRef(0)
  const saveTimerRef = useRef<number | null>(null)
  const remoteUpdatedAtRef = useRef(0)
  const pendingRemoteRef = useRef<SharedNote | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [revision, setRevision] = useState(0)
  const [hasContent, setHasContent] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [syncState, setSyncState] = useState<SyncState>('local')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [assistantQuestion, setAssistantQuestion] = useState('')
  const [assistantAnswer, setAssistantAnswer] = useState('')
  const [assistantError, setAssistantError] = useState('')
  const text = useCallback((english: string, arabic: string): string => tr(locale, english, arabic), [locale])

  const applyRemoteNote = useCallback((note: SharedNote): void => {
    if (note.nodeKey !== nodePathKey || note.updatedAt <= remoteUpdatedAtRef.current) return
    if (dirtyRef.current) {
      if (!pendingRemoteRef.current || note.updatedAt > pendingRemoteRef.current.updatedAt) pendingRemoteRef.current = note
      return
    }
    const safeHtml = sanitizeNoteHtml(note.html)
    remoteUpdatedAtRef.current = note.updatedAt
    currentHtmlRef.current = safeHtml
    revisionRef.current = 0
    if (editorRef.current) editorRef.current.innerHTML = safeHtml
    setRevision(0)
    setHasContent(hasReadableText(safeHtml))
    setSaveState('saved')
    setSaveError('')
    setSyncState('synced')
    void dbPutNote({ nodeId, html: safeHtml, updatedAt: note.updatedAt }).catch(() => undefined)
  }, [nodeId, nodePathKey])

  useEffect(() => {
    let cancelled = false
    dbGetNote(nodeId)
      .then(note => {
        if (cancelled || remoteUpdatedAtRef.current > 0) return
        const safeHtml = sanitizeNoteHtml(note?.html ?? '')
        currentHtmlRef.current = safeHtml
        dirtyRef.current = false
        revisionRef.current = 0
        if (editorRef.current) editorRef.current.innerHTML = safeHtml
        setHasContent(hasReadableText(safeHtml))
        setSaveState('saved')
      })
      .catch(() => {
        if (cancelled) return
        currentHtmlRef.current = ''
        if (editorRef.current) editorRef.current.innerHTML = ''
        setSaveError(text('Notes could not be loaded from this browser.', 'تعذّر تحميل الملاحظات من هذا المتصفح.'))
        setSaveState('error')
      })
    return () => { cancelled = true }
  }, [nodeId, text])

  useEffect(() => {
    if (!workspace) {
      setSyncState('local')
      setInviteLink('')
      return undefined
    }

    let cancelled = false
    setSyncState('connecting')
    const unsubscribe = subscribeToSharedNotes(note => applyRemoteNote(note))
    void readSharedNote(workspace, nodePathKey)
      .then(async remote => {
        if (cancelled) return
        if (remote) {
          applyRemoteNote(remote)
          setSyncState('synced')
        } else {
          const html = sanitizeNoteHtml(currentHtmlRef.current)
          if (hasReadableText(html)) {
            const saved = await writeSharedNote(workspace, { nodeKey: nodePathKey, title, html })
            if (cancelled) return
            remoteUpdatedAtRef.current = Math.max(remoteUpdatedAtRef.current, saved.updatedAt)
            await broadcastSharedNote(saved)
          }
          if (!cancelled) setSyncState('synced')
        }
      })
      .catch(() => { if (!cancelled) setSyncState('error') })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [applyRemoteNote, nodePathKey, title, workspace])

  useEffect(() => {
    if (revision === 0) return undefined
    let cancelled = false
    const timer = window.setTimeout(() => {
      saveTimerRef.current = null
      const html = sanitizeNoteHtml(currentHtmlRef.current)
      currentHtmlRef.current = html
      const version = revision
      setSaveState('saving')
      setSaveError('')
      void dbPutNote({ nodeId, html, updatedAt: Date.now() })
        .then(async () => {
          if (cancelled) return
          if (revisionRef.current === version) {
            dirtyRef.current = false
            setSaveState('saved')
          } else {
            setSaveState('saving')
          }
          if (!workspace) return
          setSyncState('connecting')
          const saved = await writeSharedNote(workspace, { nodeKey: nodePathKey, title, html })
          if (cancelled) return
          remoteUpdatedAtRef.current = Math.max(remoteUpdatedAtRef.current, saved.updatedAt)
          await broadcastSharedNote(saved)
          if (revisionRef.current === version) setSyncState('synced')
          const pending = pendingRemoteRef.current
          if (pending && pending.updatedAt > remoteUpdatedAtRef.current && !dirtyRef.current) {
            pendingRemoteRef.current = null
            applyRemoteNote(pending)
          }
        })
        .catch(() => {
          if (cancelled) return
          if (workspace) setSyncState('error')
          else {
            setSaveError(text('Notes could not be saved in this browser.', 'تعذّر حفظ الملاحظات في هذا المتصفح.'))
            setSaveState('error')
          }
        })
    }, 450)
    saveTimerRef.current = timer
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (saveTimerRef.current === timer) saveTimerRef.current = null
    }
  }, [applyRemoteNote, nodeId, nodePathKey, revision, text, title, workspace])

  const markDirty = (): void => {
    dirtyRef.current = true
    revisionRef.current += 1
    setRevision(revisionRef.current)
  }

  const commitImmediately = (): void => {
    if (!dirtyRef.current || !editorRef.current) return
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const version = revisionRef.current
    const html = sanitizeNoteHtml(editorRef.current.innerHTML)
    currentHtmlRef.current = html
    setSaveState('saving')
    setSaveError('')
    void dbPutNote({ nodeId, html, updatedAt: Date.now() })
      .then(async () => {
        if (revisionRef.current === version) {
          dirtyRef.current = false
          setSaveState('saved')
        }
        if (!workspace) return
        setSyncState('connecting')
        const saved = await writeSharedNote(workspace, { nodeKey: nodePathKey, title, html })
        remoteUpdatedAtRef.current = Math.max(remoteUpdatedAtRef.current, saved.updatedAt)
        await broadcastSharedNote(saved)
        setSyncState('synced')
        const pending = pendingRemoteRef.current
        if (pending && pending.updatedAt > remoteUpdatedAtRef.current && !dirtyRef.current) {
          pendingRemoteRef.current = null
          applyRemoteNote(pending)
        }
      })
      .catch(() => {
        setSaveError(text('Notes could not be saved in this browser.', 'تعذّر حفظ الملاحظات في هذا المتصفح.'))
        setSaveState('error')
        if (workspace) setSyncState('error')
      })
  }

  const runAssistant = async (action: StudyAction): Promise<void> => {
    if (assistantBusy) return
    const notes = editorRef.current?.innerText.trim() ?? ''
    const question = assistantQuestion.trim()
    if (action !== 'answer' && !notes) {
      setAssistantError(text('Add a few notes to this section first.', 'أضف بعض الملاحظات إلى هذا القسم أولاً.'))
      return
    }
    if (action === 'answer' && !question) {
      setAssistantError(text('Write a question to get started.', 'اكتب سؤالاً للبدء.'))
      return
    }

    setAssistantBusy(true)
    setAssistantError('')
    setAssistantAnswer('')
    try {
      const answer = await requestStudyAI({ action, nodeTitle: title, notes, question, language: locale })
      setAssistantAnswer(answer)
      if (action === 'answer') setAssistantQuestion('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The study assistant could not complete this request.'
      setAssistantError(localizeAssistantError(message, locale))
    } finally {
      setAssistantBusy(false)
    }
  }

  const runCommand = (command: EditorCommand): void => {
    if (!editorRef.current || saveState === 'loading') return
    editorRef.current.focus()
    document.execCommand(command, false)
    currentHtmlRef.current = editorRef.current.innerHTML
    setHasContent(hasReadableText(currentHtmlRef.current))
    markDirty()
  }

  const formatBlock = (tag: 'h2' | 'h3' | 'blockquote'): void => {
    if (!editorRef.current || saveState === 'loading') return
    editorRef.current.focus()
    document.execCommand('formatBlock', false, tag)
    currentHtmlRef.current = editorRef.current.innerHTML
    setHasContent(hasReadableText(currentHtmlRef.current))
    markDirty()
  }

  const insertCodeBlock = (): void => {
    if (!editorRef.current || saveState === 'loading') return
    editorRef.current.focus()
    const selectedText = window.getSelection()?.toString() ?? ''
    const code = selectedText ? escapeHtml(selectedText) : '\u200b'
    document.execCommand('insertHTML', false, `<pre><code>${code}</code></pre><p><br></p>`)
    currentHtmlRef.current = editorRef.current.innerHTML
    setHasContent(hasReadableText(currentHtmlRef.current))
    markDirty()
  }

  const insertStudyTemplate = (): void => {
    if (!editorRef.current || saveState === 'loading') return
    editorRef.current.focus()
    const template = locale === 'ar'
      ? '<h2>ملاحظات الدراسة</h2><p><strong>الفكرة الرئيسة:</strong> </p><p><strong>مصطلحات ومفاهيم:</strong></p><ul><li> </li></ul><p><strong>أسئلة للمراجعة:</strong></p><ol><li> </li></ol><h3>ملخص المحاضرة</h3><p><br></p>'
      : '<h2>Study notes</h2><p><strong>Key idea:</strong> </p><p><strong>Terms and concepts:</strong></p><ul><li> </li></ul><p><strong>Review questions:</strong></p><ol><li> </li></ol><h3>Lecture summary</h3><p><br></p>'
    document.execCommand('insertHTML', false, template)
    currentHtmlRef.current = editorRef.current.innerHTML
    setHasContent(hasReadableText(currentHtmlRef.current))
    markDirty()
  }

  const insertColumns = (columns: 2 | 3): void => {
    if (!editorRef.current || saveState === 'loading') return
    editorRef.current.focus()
    const cells = Array.from({ length: columns }, (_, index) => `<div><p><strong>${text(`Column ${index + 1}`, `العمود ${index + 1}`)}</strong></p><p><br></p></div>`).join('')
    document.execCommand('insertHTML', false, `<div data-note-columns="${columns}">${cells}</div><p><br></p>`)
    currentHtmlRef.current = editorRef.current.innerHTML
    setHasContent(hasReadableText(currentHtmlRef.current))
    markDirty()
  }

  const applyNoteStyle = (style: NoteStyle): void => {
    if (!editorRef.current || saveState === 'loading') return
    editorRef.current.focus()
    const selectedText = window.getSelection()?.toString() ?? ''
    const contents = selectedText ? escapeHtml(selectedText).replace(/\n/g, '<br>') : '\u200b'
    document.execCommand('insertHTML', false, `<span data-note-style="${style}">${contents}</span>`)
    currentHtmlRef.current = editorRef.current.innerHTML
    setHasContent(hasReadableText(currentHtmlRef.current))
    markDirty()
  }

  const onEditorInput = (): void => {
    if (!editorRef.current) return
    currentHtmlRef.current = editorRef.current.innerHTML
    setHasContent(hasReadableText(currentHtmlRef.current))
    markDirty()
  }

  const createOrCopyInvite = async (): Promise<void> => {
    if (shareBusy) return
    if (!workspace && !getGoogleIdToken()) {
      setShareMessage(text('Sign in with Google to create a live workspace.', 'سجّل الدخول بحساب Google لإنشاء مساحة مباشرة.'))
      return
    }
    setShareBusy(true)
    setShareMessage('')
    try {
      let activeWorkspace = workspace
      if (!activeWorkspace) {
        activeWorkspace = await createSharedWorkspace()
        activateWorkspace(activeWorkspace)
        const initial = sanitizeNoteHtml(editorRef.current?.innerHTML ?? currentHtmlRef.current)
        const saved = await writeSharedNote(activeWorkspace, { nodeKey: nodePathKey, title, html: initial })
        remoteUpdatedAtRef.current = saved.updatedAt
        await broadcastSharedNote(saved)
      }
      const link = createWorkspaceInvite(activeWorkspace)
      setInviteLink(link)
      try {
        await navigator.clipboard.writeText(link)
        setShareMessage(text('Invitation link copied. Anyone with the link can access this shared workspace.', 'نُسخ رابط الدعوة. يستطيع كل من يملكه الوصول إلى مساحة المشاركة.'))
      } catch {
        setShareMessage(text('Your invitation link is ready below. Anyone with the link can access this shared workspace.', 'رابط الدعوة جاهز أدناه. يستطيع كل من يملكه الوصول إلى مساحة المشاركة.'))
      }
    } catch {
      setShareMessage(text('The shared workspace could not be opened. Please try again.', 'تعذّر فتح مساحة المشاركة. حاول مرة أخرى.'))
    } finally {
      setShareBusy(false)
    }
  }

  const statusText = saveState === 'loading'
    ? text('Loading notes…', 'جارٍ تحميل الملاحظات…')
    : saveState === 'saving'
      ? text('Saving…', 'جارٍ الحفظ…')
      : saveState === 'error'
        ? text('Could not save', 'تعذّر الحفظ')
        : text('Saved on this device', 'حُفظت على هذا الجهاز')

  const syncLabel = syncState === 'connecting'
    ? text('Connecting live sync…', 'جارٍ الاتصال بالمزامنة…')
    : syncState === 'synced'
      ? text('Live sync on', 'المزامنة المباشرة مفعّلة')
      : syncState === 'error'
        ? text('Live sync is reconnecting', 'جارٍ إعادة الاتصال بالمزامنة')
        : text('Private on this device', 'خاصة على هذا الجهاز')

  const button = (label: string, icon: ReactNode, onClick: () => void, extraClass = '') => (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={saveState === 'loading'}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
      className={`${TOOLBAR_BUTTON} disabled:cursor-not-allowed disabled:opacity-40 ${extraClass}`}
    >
      {icon}
    </button>
  )

  return (
    <section data-tour="note-canvas" aria-label={text(`Notes for ${title}`, `ملاحظات ${title}`)} className="space-y-3 rounded-2xl border border-white/10 bg-black/10 p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpenText size={17} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <h3 className="truncate text-sm font-semibold">{text('Section notes', 'ملاحظات القسم')}: {title}</h3>
        </div>
        <p role="status" aria-live="polite" className={`flex items-center gap-1 text-xs ${saveState === 'error' ? 'text-rose-200' : 'opacity-65'}`}>
          {saveState === 'loading' || saveState === 'saving' ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
          {statusText}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-2">
        <button
          type="button"
          onClick={() => { void createOrCopyInvite() }}
          disabled={shareBusy}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-950 transition active:scale-95 disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {shareBusy ? <LoaderCircle size={14} className="animate-spin" /> : workspace ? <Copy size={14} /> : <Share2 size={14} />}
          {shareBusy
            ? text('Preparing…', 'جارٍ التجهيز…')
            : workspace
              ? text('Copy invitation link', 'نسخ رابط الدعوة')
              : text('Create live share link', 'إنشاء رابط مشاركة مباشرة')}
        </button>
        <span className="flex items-center gap-1.5 text-[11px] opacity-55">
          <span className={`h-1.5 w-1.5 rounded-full ${syncState === 'synced' ? 'bg-emerald-300' : syncState === 'error' ? 'bg-amber-300' : 'bg-white/40'}`} />{syncLabel}
        </span>
        {workspace && (
          <button type="button" onClick={() => { leaveSharedWorkspace(); setInviteLink(''); setShareMessage(text('Live sharing is off for this browser.', 'أوقفت المشاركة المباشرة لهذا المتصفح.')) }} className="ms-auto rounded-lg px-2 py-1.5 text-[11px] opacity-60 transition hover:bg-white/10 hover:opacity-100">
            {text('Leave workspace', 'مغادرة المساحة')}
          </button>
        )}
      </div>
      {shareMessage && <p role="status" className="text-[11px] leading-5 opacity-70">{shareMessage}</p>}
      {inviteLink && (
        <input
          aria-label={text('Shared workspace invitation link', 'رابط دعوة مساحة المشاركة')}
          readOnly
          value={inviteLink}
          onFocus={event => event.currentTarget.select()}
          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[10px] text-white/70 outline-none"
          dir="ltr"
        />
      )}

      <div role="toolbar" aria-label={text('Note formatting', 'تنسيق الملاحظات')} className="flex flex-wrap gap-1.5">
        {button(text('Heading', 'عنوان'), <Heading2 size={16} />, () => formatBlock('h2'))}
        {button(text('Subheading', 'عنوان فرعي'), <Heading3 size={16} />, () => formatBlock('h3'))}
        {button(text('Bold', 'غامق'), <Bold size={15} />, () => runCommand('bold'))}
        {button(text('Italic', 'مائل'), <Italic size={15} />, () => runCommand('italic'))}
        {button(text('Underline', 'تسطير'), <Underline size={15} />, () => runCommand('underline'))}
        {button(text('Bulleted list', 'قائمة نقطية'), <List size={15} />, () => runCommand('insertUnorderedList'))}
        {button(text('Numbered list', 'قائمة مرقمة'), <ListOrdered size={15} />, () => runCommand('insertOrderedList'))}
        {button(text('Quote', 'اقتباس'), <Quote size={15} />, () => formatBlock('blockquote'))}
        {button(text('Code block', 'كتلة برمجية'), <Code2 size={15} />, insertCodeBlock)}
        {button(text('Study template', 'قالب دراسة'), <BookOpenText size={15} />, insertStudyTemplate)}
        {button(text('Two columns', 'عمودان'), <Columns2 size={15} />, () => insertColumns(2))}
        {button(text('Three columns', 'ثلاثة أعمدة'), <Columns3 size={15} />, () => insertColumns(3))}

        <details className="relative">
          <summary className={`${TOOLBAR_BUTTON} list-none cursor-pointer`} aria-label={text('Text colors', 'ألوان النص')} title={text('Text colors', 'ألوان النص')}>
            <Palette size={15} /><span className="text-[11px]">{text('Text', 'النص')}</span>
          </summary>
          <div className="absolute start-0 top-11 z-30 grid min-w-40 grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-[#12131d] p-2 shadow-xl">
            {TEXT_STYLES.map(style => (
              <button key={style.id} type="button" onMouseDown={event => event.preventDefault()} onClick={() => applyNoteStyle(style.id)} aria-label={style.label[locale]} title={style.label[locale]} className="flex h-8 items-center justify-center rounded-lg border border-white/10 text-xs font-semibold transition hover:bg-white/10" style={{ color: style.color }}>A</button>
            ))}
          </div>
        </details>
        <details className="relative">
          <summary className={`${TOOLBAR_BUTTON} list-none cursor-pointer`} aria-label={text('Highlight colors', 'ألوان التمييز')} title={text('Highlight colors', 'ألوان التمييز')}>
            <Highlighter size={15} /><span className="text-[11px]">{text('Highlight', 'تمييز')}</span>
          </summary>
          <div className="absolute start-0 top-11 z-30 grid min-w-40 grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-[#12131d] p-2 shadow-xl">
            {HIGHLIGHT_STYLES.map(style => (
              <button key={style.id} type="button" onMouseDown={event => event.preventDefault()} onClick={() => applyNoteStyle(style.id)} className="rounded-lg border border-white/10 px-2 py-1.5 text-[11px] transition hover:brightness-110" style={{ background: `${style.color}30`, color: style.color }}>{style.label[locale]}</button>
            ))}
          </div>
        </details>
        {button(text('Undo', 'تراجع'), <Undo2 size={15} />, () => runCommand('undo'))}
        {button(text('Redo', 'إعادة'), <Redo2 size={15} />, () => runCommand('redo'))}
      </div>

      <div className="relative">
        {!hasContent && saveState !== 'loading' && (
          <p aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-3 z-10 text-sm leading-7 opacity-40">
            {text('Write study notes, lecture summaries, or longer passages here…', 'اكتب ملاحظات دراسية أو ملخصات محاضرات أو نصوصاً طويلة هنا…')}
          </p>
        )}
        <div
          ref={editorRef}
          contentEditable={saveState !== 'loading'}
          suppressContentEditableWarning
          role="textbox"
          aria-label={text(`Notes editor for ${title}`, `محرر ملاحظات ${title}`)}
          aria-multiline="true"
          aria-busy={saveState === 'loading'}
          dir="auto"
          onInput={onEditorInput}
          onPaste={event => {
            event.preventDefault()
            const plainText = event.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, plainText)
            onEditorInput()
          }}
          onBlur={() => {
            if (editorRef.current) currentHtmlRef.current = sanitizeNoteHtml(editorRef.current.innerHTML)
            commitImmediately()
          }}
          className="note-rich-editor min-h-56 max-h-[60vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm leading-7 outline-none transition focus:border-white/25 focus:ring-1 focus:ring-white/10 [&_a]:text-sky-300 [&_blockquote]:my-2 [&_blockquote]:border-s-2 [&_blockquote]:border-violet-300 [&_blockquote]:ps-3 [&_code]:rounded [&_code]:bg-black/30 [&_code]:px-1 [&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:my-2 [&_h3]:text-base [&_h3]:font-semibold [&_li]:ms-5 [&_ol]:list-decimal [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/50 [&_pre]:p-3 [&_ul]:list-disc"
        />
      </div>

      <section data-tour="ai-assistant" className="overflow-hidden rounded-xl border border-violet-300/20 bg-violet-400/[0.04]">
        <button
          type="button"
          aria-expanded={assistantOpen}
          onClick={() => setAssistantOpen(value => !value)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold transition hover:bg-white/5"
        >
          <span className="flex items-center gap-2"><Bot size={17} style={{ color: 'var(--accent)' }} />{text('Study assistant', 'مساعد الدراسة')}</span>
          <span className="text-xs opacity-60">{assistantOpen ? text('Hide', 'إخفاء') : text('Summary, quiz, or question', 'ملخص أو اختبار أو سؤال')}</span>
        </button>

        {assistantOpen && (
          <div className="space-y-3 border-t border-white/10 p-3">
            <p className="text-xs leading-5 opacity-65">
              {text('Your notes stay here unless you choose an AI action. When you continue, the current section text is sent for that request.', 'تبقى ملاحظاتك هنا ما لم تختر إجراءً للذكاء الاصطناعي. عند المتابعة، يُرسل نص القسم الحالي لهذا الطلب.')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={assistantBusy || !hasContent} onClick={() => { void runAssistant('summarize') }} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">
                <Sparkles size={14} />{text('Summarize notes', 'تلخيص الملاحظات')}
              </button>
              <button type="button" disabled={assistantBusy || !hasContent} onClick={() => { void runAssistant('quiz') }} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">
                <ListChecks size={14} />{text('Create a review quiz', 'إنشاء اختبار مراجعة')}
              </button>
            </div>

            <form className="space-y-2" onSubmit={event => { event.preventDefault(); void runAssistant('answer') }}>
              <label htmlFor={`study-question-${nodeId}`} className="block text-xs font-medium">{text('Ask about this section', 'اسأل عن هذا القسم')}</label>
              <div className="flex items-end gap-2">
                <textarea
                  id={`study-question-${nodeId}`}
                  value={assistantQuestion}
                  onChange={event => setAssistantQuestion(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void runAssistant('answer') } }}
                  rows={2}
                  maxLength={1_200}
                  placeholder={text('Ask a question about these notes…', 'اكتب سؤالاً عن هذه الملاحظات…')}
                  dir="auto"
                  className="min-h-11 min-w-0 flex-1 resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10"
                />
                <button type="submit" disabled={assistantBusy || !assistantQuestion.trim()} aria-label={text('Send question to the assistant', 'إرسال السؤال إلى المساعد')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-black transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: 'var(--accent)' }}>
                  {assistantBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
              <p className="text-[10px] opacity-45">{text('Press Ctrl+Enter to send.', 'اضغط Ctrl+Enter للإرسال.')}</p>
            </form>

            {assistantBusy && <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs opacity-70"><LoaderCircle size={14} className="animate-spin" />{text('Preparing a response from this section…', 'جارٍ إعداد إجابة من هذا القسم…')}</p>}
            {assistantError && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-400/10 p-2 text-xs text-rose-100">{assistantError}</p>}
            {assistantAnswer && (
              <div aria-live="polite" className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-3">
                <h4 className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{text('Study assistant', 'مساعد الدراسة')}</h4>
                <p dir="auto" className="whitespace-pre-wrap text-sm leading-7">{assistantAnswer}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {saveError && <p role="alert" className="text-xs text-rose-200">{saveError}</p>}
      <p className="text-[11px] leading-5 opacity-45">{text('Notes are saved separately for each section on this device. Live sharing is optional.', 'تُحفظ ملاحظات كل قسم منفصلة على هذا الجهاز. المشاركة المباشرة اختيارية.')}</p>
    </section>
  )
}
