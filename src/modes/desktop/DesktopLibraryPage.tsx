import { useRef } from 'react'
import { FileAudio, FileImage, FileText, FileX2, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { findNode, useLibrary, useTree } from '../../shared'
import type { Item, TNode } from '../../shared'
import { useLocale } from '../../lib/i18n'
import { useDesktopMessages } from './i18n'
import DesktopNoteEditor from './DesktopNoteEditor'

function kindOf(file: File): Item['kind'] {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'doc'
}

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
  const { items, add, remove, storageError } = useLibrary()
  const { tree } = useTree()
  const inputRef = useRef<HTMLInputElement>(null)
  const sectionPath = path.map(id => findNode(tree, id)).filter((part): part is TNode => part !== undefined)
  const nodeItems = items.filter(item => item.nodeId === node.id)

  const addFiles = (files: FileList | null): void => {
    if (!files?.length) return
    Array.from(files).forEach(file => add({
      nodeId: node.id,
      name: file.name,
      kind: kindOf(file),
      url: URL.createObjectURL(file),
      size: file.size,
      file,
    }))
  }

  const removeFile = (item: Item): void => {
    if (window.confirm(messages.files.removeConfirm)) remove(item.id)
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
        <button type="button" className="desk-button desk-button-primary" onClick={() => inputRef.current?.click()}>
          <Plus size={17} aria-hidden="true" />
          <span>{messages.files.add}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="desk-visually-hidden"
          aria-label={messages.files.choose}
          onChange={event => { addFiles(event.target.files); event.target.value = '' }}
        />
      </header>
      <div className="desk-library-content">
        <section className="desk-files-panel" aria-labelledby="desk-files-title">
          <header className="desk-panel-heading">
            <h3 id="desk-files-title">{messages.files.title}</h3>
            <span className="desk-count-pill">{nodeItems.length}</span>
          </header>
          {storageError && <p className="desk-inline-error" role="status">{messages.files.storageError}</p>}
          {nodeItems.length ? (
            <ul className="desk-file-list">
              {nodeItems.map(item => (
                <li key={item.id} className="desk-file-row">
                  <span className="desk-file-icon"><FileKindIcon kind={item.kind} /></span>
                  <div className="desk-file-details">
                    <bdi className="desk-file-name" title={item.name}>{item.name}</bdi>
                    <span className="desk-file-meta">{formatFileSize(item.size, locale, messages.files.byteUnit, messages.files.kilobyteUnit)}</span>
                  </div>
                  <div className="desk-file-actions">
                    <a className="desk-icon-button" href={item.url} download={item.name} aria-label={`${messages.files.download}: ${item.name}`}>
                      <FolderOpen size={17} aria-hidden="true" />
                    </a>
                    <button type="button" className="desk-icon-button desk-danger-button" aria-label={`${messages.files.remove}: ${item.name}`} onClick={() => removeFile(item)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
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
        <DesktopNoteEditor key={node.id} nodeId={node.id} sectionTitle={node.title} />
      </div>
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
