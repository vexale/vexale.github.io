import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Eye, FileAudio, FileImage, FileText, FileX2, FolderOpen, Plus, Sparkles, Timer, Trash2 } from 'lucide-react'
import { findNode, useLibrary, useTree } from '../../shared'
import type { Item, TNode } from '../../shared'
import { dbGetAllOcr, dbGetNote } from '../../db'
import { useLocale } from '../../lib/i18n'
import { useDesktopMessages } from './i18n'
import { TOOL_CATALOG } from '../../lib/settings'
import { useDesktopPreferences } from './preferences'
import { requestFocusTimer } from './focusTimerEvents'
import DesktopFileOcrAction from './DesktopFileOcrAction'
import { addReviewCards } from '../../lib/reviewCards'
import { requestStudyAI } from '../../lib/studyAssistant'

const DesktopToolPanel = lazy(() => import('./DesktopToolsPage').then(module => ({ default: module.DesktopToolPanel })))
const DesktopNoteEditor = lazy(() => import('./DesktopNoteEditor'))
const DesktopFileStudyView = lazy(() => import('./DesktopFileStudyView'))

function kindOf(file: File): Item['kind'] {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'doc'
}

function sectionNodes(node: TNode): TNode[] { return [node, ...node.children.flatMap(sectionNodes)] }
function plainText(html: string): string { return new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/gu, ' ').trim() ?? '' }

function FileKindIcon({ kind }: { kind: Item['kind'] }) {
  if (kind === 'image' || kind === 'drawing') return <FileImage size={19} aria-hidden="true" />
  if (kind === 'audio') return <FileAudio size={19} aria-hidden="true" />
  return <FileText size={19} aria-hidden="true" />
}

function formatFileSize(bytes: number, locale: string, byteUnit: string, kilobyteUnit: string): string {
  const number = new Intl.NumberFormat(locale === 'ar' ? 'ar-IQ' : 'en', { maximumFractionDigits: 1 })
  return bytes < 1024 ? `${number.format(bytes)} ${byteUnit}` : `${number.format(bytes / 1024)} ${kilobyteUnit}`
}

function SelectedSection({ node, path }: { node: TNode; path: string[] }) {
  const locale = useLocale()
  const messages = useDesktopMessages()
  const preferences = useDesktopPreferences()
  const [openTool, setOpenTool] = useState('')
  const [previewItem, setPreviewItem] = useState<Item | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [busyOcrId, setBusyOcrId] = useState<string | null>(null)
  const [ocrTextByFile, setOcrTextByFile] = useState<Record<string, string>>({})
  const [generatingCards, setGeneratingCards] = useState(false)
  const [cardStatus, setCardStatus] = useState('')
  const { items, add, remove, storageError } = useLibrary()
  const { tree, setPath } = useTree()
  const inputRef = useRef<HTMLInputElement>(null)
  const sectionPath = path.map(id => findNode(tree, id)).filter((part): part is TNode => part !== undefined)
  useEffect(() => {
    let cancelled = false
    dbGetAllOcr()
      .then(records => {
        if (!cancelled) setOcrTextByFile(Object.fromEntries(records.map(record => [record.itemId, record.text])))
      })
      .catch(() => { if (!cancelled) setOcrTextByFile({}) })
    return () => { cancelled = true }
  }, [])
  const nodeItems = items.filter(item => item.nodeId === node.id)
  const childSections = node.children
  const sectionTools = TOOL_CATALOG.filter(tool => { const assignment = preferences.toolAssignments[tool.id] ?? { global: true, sectionIds: [] }; return assignment.global || assignment.sectionIds.includes(node.id) })

  const addFiles = async (files: FileList | null): Promise<void> => {
    const selectedFiles = files ? Array.from(files) : []
    if (!selectedFiles.length) return
    setUploadProgress(0)
    for (const [index, file] of selectedFiles.entries()) {
      add({ nodeId: node.id, name: file.name, kind: kindOf(file), url: URL.createObjectURL(file), size: file.size, file })
      setUploadProgress(Math.round(((index + 1) / selectedFiles.length) * 100))
      await new Promise<void>(resolve => window.setTimeout(resolve, 0))
    }
    window.setTimeout(() => setUploadProgress(null), 500)
  }

  const removeFile = (item: Item): void => {
    if (window.confirm(messages.files.removeConfirm)) {
      remove(item.id)
      setOcrTextByFile(previous => {
        const next = { ...previous }
        delete next[item.id]
        return next
      })
    }
  }

  const generateCards = async (notes: string, sourceTitle: string): Promise<void> => {
    if (generatingCards || notes.trim().length < 40) { setCardStatus(messages.notes.placeholder); return }
    setGeneratingCards(true); setCardStatus('')
    try {
      const response = await requestStudyAI({ action: 'quiz', nodeTitle: sourceTitle, notes: notes.slice(0, 16_000), language: locale, questionCount: 8 })
      const start = response.indexOf('['), end = response.lastIndexOf(']')
      if (start < 0 || end < start) throw new Error('invalid-cards')
      const parsed: unknown = JSON.parse(response.slice(start, end + 1))
      if (!Array.isArray(parsed)) throw new Error('invalid-cards')
      const cards = parsed.flatMap(item => {
        if (!item || typeof item !== 'object') return []
        const card = item as { q?: unknown; a?: unknown }
        return typeof card.q === 'string' && typeof card.a === 'string' ? [{ nodeId: node.id, sourceTitle, question: card.q, answer: card.a }] : []
      })
      if (!cards.length) throw new Error('invalid-cards')
      addReviewCards(cards)
      setCardStatus(`${cards.length} ${messages.review.totalCards}`)
      window.history.pushState({ desktopPage: 'review' }, '', '#/office/review')
      window.dispatchEvent(new PopStateEvent('popstate'))
    } catch (error) {
      setCardStatus(error instanceof Error && error.message !== 'invalid-cards' ? error.message : messages.notes.error)
    } finally { setGeneratingCards(false) }
  }

  const generateSectionCards = async (): Promise<void> => {
    const notes = await Promise.all(sectionNodes(node).map(async part => {
      const note = await dbGetNote(part.id)
      return note?.html ? `${part.title}\n${plainText(note.html)}` : ''
    }))
    await generateCards(notes.filter(Boolean).join('\n\n'), node.title)
  }

  return (
    <div className="desk-library-page">
      <nav className="desk-breadcrumbs" aria-label={messages.sections.breadcrumb}>
        {sectionPath.map((part, index) => (
          <span key={part.id}>
            {index > 0 && <span className="desk-breadcrumb-separator" aria-hidden="true">/</span>}
            <bdi>{part.title}</bdi>
          </span>
        ))}
      </nav>
      <header className="desk-section-heading">
        <div className="desk-section-heading-copy">
          <h2>{node.title}</h2>
          <p>{messages.sections.sectionDescription}</p>
        </div>
        <button type="button" className="desk-button" onClick={() => requestFocusTimer({ type: 'section', id: node.id, title: node.title })}>
          <Timer size={16} aria-hidden="true" />
          <span>{messages.focusTimer.startForSection}</span>
        </button>
        <button type="button" className="desk-button" disabled={generatingCards} onClick={() => void generateSectionCards()}><Sparkles size={16} aria-hidden="true" /><span>{generatingCards ? messages.notes.saving : messages.notes.generateCards}</span></button>
        <button type="button" className="desk-button desk-button-primary desk-files-add-button" style={{ background: 'var(--accent)' }} onClick={() => inputRef.current?.click()}>
          <Plus size={17} aria-hidden="true" />
          <span>{messages.files.add}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="desk-visually-hidden"
          aria-label={messages.files.choose}
          onChange={event => { void addFiles(event.target.files); event.target.value = '' }}
        />
      </header>
      {cardStatus && <p className="desk-inline-status" role="status">{cardStatus}</p>}
      <section className="desk-child-sections" aria-label={messages.sections.childSections}><h3>{messages.sections.childSections}</h3>{childSections.length ? <div className="desk-child-section-grid">{childSections.map(child => <button type="button" key={child.id} className="desk-child-section-card" onClick={() => setPath([...path, child.id])}><span>{child.title}</span><span>{child.children.length} {messages.sections.childrenCount}</span></button>)}</div> : <p className="desk-section-empty">{messages.sections.childEmpty}</p>}</section>
      <section className="desk-section-tools" aria-label={messages.toolHub.sectionSpecific}>
        <div className="desk-section-tools-list">{sectionTools.map(tool => <button type="button" className="desk-tool-chip-button" key={tool.id} onClick={() => setOpenTool(tool.id)}>{locale === 'ar' ? ({ calc: 'الحاسبة', notes: 'ملاحظات سريعة', plot: 'الإحداثيات', chat: 'محادثة المكتبة', math: 'حلّال الرياضيات', code: 'مساحة الأكواد', quiz: 'أسئلة وبطاقات', data: 'تحليل البيانات', board: 'لوحة وخرائط', docs: 'أدوات المستندات', tasks: 'المهام', audio: 'تركيز وصوت' }[tool.id] ?? tool.label) : tool.label}</button>)}<button type="button" className="desk-tool-chip-button desk-tool-add-button" onClick={() => { window.history.pushState({ desktopPage: 'tools' }, '', '#/office/tools'); window.dispatchEvent(new PopStateEvent('popstate')) }}>{messages.toolHub.addTool}</button></div>
      </section>
      <div className="desk-library-content">
        <section className={`desk-files-panel ${isDragging ? 'desk-files-panel-dragging' : ''}`} aria-labelledby="desk-files-title" onDragOver={event => { event.preventDefault(); setIsDragging(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false) }} onDrop={event => { event.preventDefault(); setIsDragging(false); void addFiles(event.dataTransfer.files) }}>
          <header className="desk-panel-heading">
            <h3 id="desk-files-title">{messages.files.title}</h3>
            <span className="desk-count-pill">{nodeItems.length}</span>
          </header>
          {storageError && <p className="desk-inline-error" role="status">{messages.files.storageError}</p>}
          {isDragging && <p className="desk-drop-hint" role="status">{messages.files.dropHere}</p>}
          {uploadProgress !== null && <div className="desk-upload-progress" role="status"><progress value={uploadProgress} max="100" /> <span>{messages.files.uploading} {uploadProgress}%</span></div>}
          {nodeItems.some(item => item.file && (item.kind === 'image' || item.file.type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf'))) && <p className="desk-ocr-privacy">{messages.files.ocrPrivacy}</p>}
          {nodeItems.length ? (
            <ul className="desk-file-grid">
              {nodeItems.map(item => (
                <li key={item.id} className="desk-file-card" data-file-id={item.id}>
                  <div className="desk-file-card-preview">{item.kind === 'image' ? <img src={item.url} alt="" loading="lazy" /> : (item.file?.type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf')) ? <iframe title={item.name} src={`${item.url}#page=1&view=FitH`} tabIndex={-1} /> : <span className="desk-file-icon"><FileKindIcon kind={item.kind} /></span>}</div>
                  <div className="desk-file-details">
                    <bdi className="desk-file-name" title={item.name}>{item.name}</bdi>
                    <span className="desk-file-meta"><FileKindIcon kind={item.kind} />{formatFileSize(item.size, locale, messages.files.byteUnit, messages.files.kilobyteUnit)}</span>
                  </div>
                  <div className="desk-file-actions">
                    <a className="desk-icon-button" href={item.url} target="_blank" rel="noreferrer" aria-label={`${messages.files.open}: ${item.name}`}>
                      <FolderOpen size={17} aria-hidden="true" />
                    </a>
                    <button type="button" className="desk-icon-button" aria-label={messages.files.preview} title={messages.files.preview} onClick={() => setPreviewItem(item)}><Eye size={17} aria-hidden="true" /></button>
                    <button type="button" className="desk-icon-button desk-danger-button" disabled={busyOcrId === item.id} aria-label={`${messages.files.remove}: ${item.name}`} onClick={() => removeFile(item)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <DesktopFileOcrAction
                    item={item}
                    busyItemId={busyOcrId}
                    saved={Object.prototype.hasOwnProperty.call(ocrTextByFile, item.id)}
                    onSaved={(id, text) => setOcrTextByFile(previous => ({ ...previous, [id]: text }))}
                    onBusyChange={setBusyOcrId}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="desk-files-empty">
              <FileX2 size={21} aria-hidden="true" />
              <p>{messages.files.empty}</p>
            </div>
          )}
        </section>
        <Suspense fallback={<div className="desk-lazy-placeholder" aria-busy="true" aria-label={messages.notes.loading} />}>
          <DesktopNoteEditor key={node.id} nodeId={node.id} sectionTitle={node.title} onGenerateCards={notes => void generateCards(notes, node.title)} />
        </Suspense>
      </div>
      {openTool && <Suspense fallback={<div className="desk-lazy-placeholder" aria-busy="true" aria-label={messages.toolHub.loading} />}><DesktopToolPanel toolId={openTool} onClose={() => setOpenTool('')} /></Suspense>}
      {previewItem && <Suspense fallback={<div className="desk-file-study-backdrop" aria-busy="true" aria-label={messages.toolHub.loading} />}><DesktopFileStudyView item={previewItem} extractedText={ocrTextByFile[previewItem.id] ?? ""} messages={messages.files} onClose={() => setPreviewItem(null)} /></Suspense>}
    </div>
  )
}

export default function DesktopLibraryPage() {
  const messages = useDesktopMessages()
  const { tree, path } = useTree()
  const currentId = path[path.length - 1]
  const currentNode = currentId ? findNode(tree, currentId) : undefined

  if (!currentNode) {
    return (
      <section className="desk-library-empty" aria-live="polite">
        <FolderOpen size={24} aria-hidden="true" />
        <h2>{messages.sections.chooseTitle}</h2>
        <p>{tree.length ? messages.sections.choose : messages.sections.empty}</p>
      </section>
    )
  }

  return <SelectedSection node={currentNode} path={path} />
}
