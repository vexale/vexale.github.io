import { useState } from 'react'
import type { CSSProperties, DragEvent, FormEvent, KeyboardEvent } from 'react'
import { Check, ChevronDown, ChevronRight, Folder, GripVertical, Trash2, X } from 'lucide-react'
import { useLibrary, useTree } from '../../shared'
import type { TNode } from '../../shared'
import { collectNodeIds, moveToTrash } from '../../lib/trash'
import type { TrashFile } from '../../lib/trash'
import { TRASH_RETENTION_DAYS } from '../../lib/settings'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'
import { useDesktopMessages } from './i18n'
import DesktopSectionAddControl from './DesktopSectionAddControl'

interface TreeBranchProps {
  nodes: TNode[]
  parentPath: string[]
  activePath: string[]
  expandedIds: ReadonlySet<string>
  depth: number
  dropTargetId: string | null
  draggedId: string | null
  onSelect: (path: string[]) => void
  onToggle: (id: string, nodePath: string[]) => void
  onRename: (id: string, title: string) => void
  onReorder: (id: string, parentId: string | null, index: number) => void
  onDropTarget: (id: string | null) => void
  onDragging: (id: string | null) => void
  onTrash: (node: TNode, parentPath: string[], index: number) => void
  fileCountFor: (nodeId: string) => number
  labels: ReturnType<typeof useDesktopMessages>['sections']
  fileLabel: string
}

function TreeBranch({
  nodes,
  parentPath,
  activePath,
  expandedIds,
  depth,
  dropTargetId,
  draggedId,
  onSelect,
  onToggle,
  onRename,
  onReorder,
  onDropTarget,
  onDragging,
  onTrash,
  fileCountFor,
  labels,
  fileLabel,
}: TreeBranchProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const beginRename = (node: TNode): void => {
    setEditingId(node.id)
    setDraft(node.title)
  }

  const cancelRename = (): void => {
    setEditingId(null)
    setDraft('')
  }

  const saveRename = (event: FormEvent<HTMLFormElement>, nodeId: string): void => {
    event.preventDefault()
    const title = draft.trim()
    if (!title) return
    onRename(nodeId, title)
    cancelRename()
  }

  const handleDragStart = (event: DragEvent<HTMLDivElement>, nodeId: string): void => {
    if (editingId === nodeId) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', nodeId)
    onDragging(nodeId)
    onDropTarget(null)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>, nodeId: string): void => {
    const sourceId = draggedId
    if (!sourceId || sourceId === nodeId || !nodes.some(node => node.id === sourceId)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    onDropTarget(nodeId)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string, targetIndex: number): void => {
    event.preventDefault()
    const sourceId = draggedId
    onDropTarget(null)
    onDragging(null)
    if (!sourceId) return
    const sourceIndex = nodes.findIndex(node => node.id === sourceId)
    if (sourceIndex < 0 || sourceId === targetId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const desiredIndex = targetIndex + Number(event.clientY > rect.top + rect.height / 2)
    const finalIndex = desiredIndex - Number(sourceIndex < desiredIndex ? 1 : 0)
    const parentId = parentPath[parentPath.length - 1] ?? null
    onReorder(sourceId, parentId, finalIndex)
  }

  const handleSelectKeyDown = (event: KeyboardEvent<HTMLButtonElement>, node: TNode, nodePath: string[], parentId: string | null, index: number): void => {
    if (event.key === 'F2') {
      event.preventDefault()
      beginRename(node)
      return
    }
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    const nextIndex = index + (event.key === 'ArrowUp' ? -1 : 1)
    if (nextIndex < 0 || nextIndex >= nodes.length) return
    event.preventDefault()
    onReorder(node.id, parentId, nextIndex)
    onSelect(nodePath)
  }

  return (
    <ul className="desk-tree-list">
      {nodes.map((node, index) => {
        const nodePath = [...parentPath, node.id]
        const expanded = expandedIds.has(node.id)
        const selected = activePath.length === nodePath.length && nodePath.every((id, pathIndex) => activePath[pathIndex] === id)
        const hasChildren = node.children.length > 0
        const fileCount = fileCountFor(node.id)
        const parentId = parentPath[parentPath.length - 1] ?? null
        const renaming = editingId === node.id
        const dropTarget = dropTargetId === node.id
        const inputId = `desk-rename-${node.id}`

        return (
          <li key={node.id} className="desk-tree-item">
            <div
              className="desk-tree-row"
              data-drop-target={dropTarget ? 'true' : undefined}
              style={{ '--desk-tree-depth': depth } as CSSProperties}
              draggable={!renaming && nodes.length > 1}
              onDragStart={event => handleDragStart(event, node.id)}
              onDragOver={event => handleDragOver(event, node.id)}
              onDragLeave={event => {
                const nextTarget = event.relatedTarget
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) onDropTarget(null)
              }}
              onDrop={event => handleDrop(event, node.id, index)}
              onDragEnd={() => { onDropTarget(null); onDragging(null) }}
            >
              <span className="desk-tree-grip" aria-hidden="true"><GripVertical size={14} /></span>
              {renaming ? (
                <form className="desk-tree-rename-form" onSubmit={event => saveRename(event, node.id)}>
                  <label className="desk-visually-hidden" htmlFor={inputId}>{labels.renameInput}</label>
                  <input
                    id={inputId}
                    autoFocus
                    type="text"
                    value={draft}
                    maxLength={80}
                    aria-label={`${labels.renameInput}: ${node.title}`}
                    onChange={event => setDraft(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelRename() } }}
                  />
                  <button type="submit" className="desk-icon-button desk-tree-action" aria-label={labels.saveRename} disabled={!draft.trim()}>
                    <Check size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="desk-icon-button desk-tree-action" aria-label={labels.cancelEdit} onClick={cancelRename}>
                    <X size={16} aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="desk-tree-select"
                  aria-current={selected ? 'page' : undefined}
                  aria-describedby="desk-tree-help"
                  aria-keyshortcuts="F2 Alt+ArrowUp Alt+ArrowDown"
                  title={`${labels.rename} · F2`}
                  onKeyDown={event => handleSelectKeyDown(event, node, nodePath, parentId, index)}
                  onClick={() => onSelect(nodePath)}
                >
                  <Folder size={16} aria-hidden="true" />
                  <span className="desk-tree-name">{node.title}</span>
                  {fileCount > 0 && <span className="desk-tree-count" aria-label={`${fileCount} ${fileLabel}`}>{fileCount}</span>}
                </button>
              )}
              {!renaming && (
                <div className="desk-tree-actions">
                  <DesktopSectionAddControl parentId={node.id} parentPath={nodePath} targetTitle={node.title} />
                  <button
                    type="button"
                    className="desk-icon-button desk-tree-action desk-tree-trash"
                    aria-label={`${labels.moveToTrash}: ${node.title}`}
                    title={`${labels.moveToTrash}: ${node.title}`}
                    onClick={() => onTrash(node, parentPath, index)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              )}
              {!renaming && hasChildren && (
                <button
                  type="button"
                  className="desk-tree-toggle"
                  aria-label={`${expanded ? labels.collapse : labels.expand}: ${node.title}`}
                  aria-expanded={expanded}
                  onClick={() => onToggle(node.id, nodePath)}
                >
                  {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
                </button>
              )}
            </div>
            {hasChildren && expanded && (
              <TreeBranch
                nodes={node.children}
                parentPath={nodePath}
                activePath={activePath}
                expandedIds={expandedIds}
                depth={depth + 1}
                dropTargetId={dropTargetId}
                draggedId={draggedId}
                onSelect={onSelect}
                onToggle={onToggle}
                onRename={onRename}
                onReorder={onReorder}
                onDropTarget={onDropTarget}
                onDragging={onDragging}
                onTrash={onTrash}
                fileCountFor={fileCountFor}
                labels={labels}
                fileLabel={fileLabel}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default function DesktopSectionTree() {
  const messages = useDesktopMessages()
  const { tree, path, setPath, addNode, removeNode, renameNode, reorderNode } = useTree()
  const { items } = useLibrary()
  const preferences = useDesktopPreferences()
  const [sectionName, setSectionName] = useState('')
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const labels = messages.sections
  const expandedIds = new Set([...preferences.expandedSectionIds, ...path.slice(0, -1)])

  const fileCountFor = (nodeId: string): number => items.reduce((count, item) => count + Number(item.nodeId === nodeId), 0)

  const addSection = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const title = sectionName.trim()
    if (!title) return
    const id = addNode(null, title)
    setSectionName('')
    setPath([id])
  }

  const toggleExpanded = (id: string, nodePath: string[]): void => {
    const isExpanded = expandedIds.has(id)
    const nextIds = isExpanded
      ? preferences.expandedSectionIds.filter(expandedId => expandedId !== id)
      : [...new Set([...preferences.expandedSectionIds, id])]
    updateDesktopPreferences({ expandedSectionIds: nextIds })
    if (isExpanded && path.length > nodePath.length && nodePath.every((pathId, index) => path[index] === pathId)) setPath(nodePath)
  }

  const updateName = (id: string, title: string): void => {
    renameNode(id, title)
    setStatus(labels.renameComplete)
  }

  const reorder = (id: string, parentId: string | null, index: number): void => {
    if (reorderNode(id, parentId, index)) setStatus(labels.reorderComplete)
  }

  const trashSection = async (node: TNode, parentPath: string[], index: number): Promise<void> => {
    const confirmText = labels.trashConfirm
      .replace('{title}', node.title)
      .replace('{days}', String(TRASH_RETENTION_DAYS))
    if (!window.confirm(confirmText)) return

    const ids = new Set(collectNodeIds(node))
    const files: TrashFile[] = items.flatMap(item => ids.has(item.nodeId) && item.file
      ? [{ nodeId: item.nodeId, name: item.name, kind: item.kind, size: item.size, file: item.file }]
      : [])
    const parentId = parentPath[parentPath.length - 1] ?? null
    const saved = await moveToTrash({ node, parentId, index, files }).catch(() => false)
    if (!saved) {
      setStatus(labels.trashUnavailable)
      return
    }

    if (path.some(pathId => ids.has(pathId))) setPath(parentPath)
    removeNode(node.id)
    setStatus(labels.trashComplete)
  }

  return (
    <section className="desk-section-tree" aria-labelledby="desk-section-tree-title">
      <header className="desk-section-tree-header">
        <h2 id="desk-section-tree-title">{labels.title}</h2>
      </header>
      <form className="desk-section-create" onSubmit={addSection}>
        <label className="desk-section-create-label" htmlFor="desk-new-section">{labels.add}</label>
        <div className="desk-section-create-control">
          <input
            id="desk-new-section"
            type="text"
            value={sectionName}
            onChange={event => setSectionName(event.target.value)}
            placeholder={labels.placeholder}
            maxLength={80}
          />
          <button type="submit" className="desk-icon-button" aria-label={labels.create} disabled={!sectionName.trim()}>
            <Check size={17} aria-hidden="true" />
          </button>
        </div>
      </form>
      <nav className="desk-tree-navigation" aria-label={labels.tree}>
        <p className="desk-visually-hidden" id="desk-tree-help">{labels.treeHelp}</p>
        {tree.length ? (
          <TreeBranch
            nodes={tree}
            parentPath={[]}
            activePath={path}
            expandedIds={expandedIds}
            depth={0}
            dropTargetId={dropTargetId}
            draggedId={draggedId}
            onSelect={setPath}
            onToggle={toggleExpanded}
            onRename={updateName}
            onReorder={reorder}
            onDropTarget={setDropTargetId}
            onDragging={setDraggedId}
            onTrash={(node, parentPath, index) => { void trashSection(node, parentPath, index) }}
            fileCountFor={fileCountFor}
            labels={labels}
            fileLabel={messages.files.title}
          />
        ) : <p className="desk-tree-empty">{labels.empty}</p>}
      </nav>
      {status && <p className="desk-tree-status" role="status" aria-live="polite">{status}</p>}
    </section>
  )
}
