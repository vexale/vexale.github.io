import { useState } from 'react'
import DesktopSectionAddControl from './DesktopSectionAddControl'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import { Check, ChevronDown, ChevronRight, Folder, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { findNode, useLibrary, useTree } from '../../shared'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'
import type { TNode } from '../../shared'
import { useDesktopMessages } from './i18n'
import { moveToTrash } from '../../lib/trash'

interface TreeBranchProps {
  nodes: TNode[]
  parentPath: string[]
  activePath: string[]
  depth: number
  onSelect: (path: string[]) => void
  onToggle: (path: string[], parentPath: string[]) => void
  fileCountFor: (nodeId: string) => number
  labels: ReturnType<typeof useDesktopMessages>['sections']
  fileLabel: string
  favoriteSectionIds: string[]
  onToggleFavorite: (node: TNode) => void
  editingId: string
  editingTitle: string
  onStartRename: (node: TNode) => void
  onRenameTitle: (title: string) => void
  onCommitRename: (event: FormEvent<HTMLFormElement>, nodeId: string) => void
  onCancelRename: () => void
  onDelete: (node: TNode) => void
}

function TreeBranch({ nodes, parentPath, activePath, depth, onSelect, onToggle, fileCountFor, labels, fileLabel, favoriteSectionIds, onToggleFavorite, editingId, editingTitle, onStartRename, onRenameTitle, onCommitRename, onCancelRename, onDelete }: TreeBranchProps) {
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const tree = event.currentTarget.closest('[role="tree"]')
    const buttons = tree ? Array.from(tree.querySelectorAll<HTMLButtonElement>('.desk-tree-select')) : []
    const index = buttons.indexOf(event.currentTarget)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1)
      buttons[Math.max(0, Math.min(buttons.length - 1, nextIndex))]?.focus()
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const toggle = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('.desk-tree-toggle')
    if (!toggle) return
    const rtl = event.currentTarget.closest('[dir="rtl"]') !== null
    const expands = rtl ? event.key === 'ArrowLeft' : event.key === 'ArrowRight'
    if (expands !== (toggle.getAttribute('aria-expanded') === 'true')) { event.preventDefault(); toggle.click() }
  }
  return (
    <ul className="desk-tree-list" role={depth === 0 ? 'tree' : 'group'}>
      {nodes.map(node => {
        const nodePath = [...parentPath, node.id]
        const expanded = activePath[parentPath.length] === node.id
        const selected = activePath.length === nodePath.length && expanded
        const hasChildren = node.children.length > 0
        const fileCount = fileCountFor(node.id)

        return (
          <li key={node.id} className="desk-tree-item" role="treeitem" aria-level={depth + 1} aria-selected={selected} aria-expanded={hasChildren ? expanded : undefined}>
            <div className="desk-tree-row" style={{ '--desk-tree-depth': depth } as CSSProperties}>
              {editingId === node.id ? <form className="desk-tree-rename-form" onSubmit={event => onCommitRename(event, node.id)}>
                <label className="desk-visually-hidden" htmlFor={`desk-rename-${node.id}`}>{labels.renameInput}</label>
                <input id={`desk-rename-${node.id}`} autoFocus value={editingTitle} onChange={event => onRenameTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') onCancelRename() }} maxLength={80} />
                <button type="submit" className="desk-icon-button" aria-label={labels.saveEdit} disabled={!editingTitle.trim()}><Check size={15} aria-hidden="true" /></button>
                <button type="button" className="desk-icon-button" aria-label={labels.cancelEdit} onClick={onCancelRename}><X size={15} aria-hidden="true" /></button>
              </form> : <button
                type="button"
                className="desk-tree-select"
                aria-current={selected ? 'page' : undefined}
                onKeyDown={moveFocus}
                onClick={() => onSelect(nodePath)}
              >
                <Folder size={16} aria-hidden="true" />
                <span className="desk-tree-name">{node.title}</span>
                {fileCount > 0 && <span className="desk-tree-count" aria-label={`${fileCount} ${fileLabel}`}>{fileCount}</span>}
              </button>}
              {hasChildren && (
                <button
                  type="button"
                  className="desk-tree-toggle"
                  aria-label={`${expanded ? labels.collapse : labels.expand}: ${node.title}`}
                  aria-expanded={expanded}
                  onClick={() => onToggle(nodePath, parentPath)}
                >
                  {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
                </button>
              )}
              <button type="button" className={`desk-tree-favorite ${favoriteSectionIds.includes(node.id) ? 'is-favorite' : ''}`} aria-pressed={favoriteSectionIds.includes(node.id)} aria-label={`${favoriteSectionIds.includes(node.id) ? labels.unfavorite : labels.favorite}: ${node.title}`} title={`${favoriteSectionIds.includes(node.id) ? labels.unfavorite : labels.favorite}: ${node.title}`} onClick={() => onToggleFavorite(node)}><Star size={15} fill={favoriteSectionIds.includes(node.id) ? 'currentColor' : 'none'} aria-hidden="true" /></button>
              <button type="button" className="desk-icon-button desk-tree-action" aria-label={`${labels.rename}: ${node.title}`} title={`${labels.rename}: ${node.title}`} onClick={() => onStartRename(node)}><Pencil size={15} aria-hidden="true" /></button>
              <button type="button" className="desk-icon-button desk-tree-action desk-danger-button" aria-label={`${labels.delete}: ${node.title}`} title={`${labels.delete}: ${node.title}`} onClick={() => onDelete(node)}><Trash2 size={15} aria-hidden="true" /></button>
              <DesktopSectionAddControl parentId={node.id} parentPath={nodePath} targetTitle={node.title} />
            </div>
            {hasChildren && expanded && (
              <TreeBranch
                nodes={node.children}
                parentPath={nodePath}
                activePath={activePath}
                depth={depth + 1}
                onSelect={onSelect}
                onToggle={onToggle}
                fileCountFor={fileCountFor}
                labels={labels}
                fileLabel={fileLabel}
                favoriteSectionIds={favoriteSectionIds}
                onToggleFavorite={onToggleFavorite}
                editingId={editingId}
                editingTitle={editingTitle}
                onStartRename={onStartRename}
                onRenameTitle={onRenameTitle}
                onCommitRename={onCommitRename}
                onCancelRename={onCancelRename}
                onDelete={onDelete}
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
  const { tree, path, setPath, addNode, renameNode, removeNode } = useTree()
  const preferences = useDesktopPreferences()
  const { items } = useLibrary()
  const [sectionName, setSectionName] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editingTitle, setEditingTitle] = useState('')
  const labels = messages.sections
  const favoriteSectionIds = preferences.favoriteSectionIds
  const allSections = (nodes: TNode[], parent: string[] = []): Array<{ node: TNode; path: string[] }> => nodes.flatMap(node => { const next = [...parent, node.id]; return [{ node, path: next }, ...allSections(node.children, next)] })
  const favoriteSections = allSections(tree).filter(entry => favoriteSectionIds.includes(entry.node.id))
  const toggleFavorite = (node: TNode): void => updateDesktopPreferences({ favoriteSectionIds: favoriteSectionIds.includes(node.id) ? favoriteSectionIds.filter(id => id !== node.id) : [...favoriteSectionIds, node.id] })
  const startRename = (node: TNode): void => { setEditingId(node.id); setEditingTitle(node.title) }
  const cancelRename = (): void => { setEditingId(''); setEditingTitle('') }
  const commitRename = (event: FormEvent<HTMLFormElement>, nodeId: string): void => { event.preventDefault(); if (editingTitle.trim()) renameNode(nodeId, editingTitle); cancelRename() }
  const deleteSection = async (node: TNode): Promise<void> => {
    if (!window.confirm(labels.deleteConfirm)) return
    const current = allSections(tree).find(entry => entry.node.id === node.id)
    if (!current) return
    const parentId = current.path.length > 1 ? current.path[current.path.length - 2]! : null
    const siblings = parentId ? (findNode(tree, parentId)?.children ?? []) : tree
    const index = siblings.findIndex(item => item.id === node.id)
    const ids = new Set<string>()
    const collect = (item: TNode): void => { ids.add(item.id); item.children.forEach(collect) }
    collect(node)
    const files = items.filter(item => ids.has(item.nodeId) && item.file).map(item => ({ nodeId: item.nodeId, name: item.name, kind: item.kind, size: item.size, file: item.file! }))
    if (!(await moveToTrash({ node, parentId, index, files }))) return
    removeNode(node.id)
    if (path.some(id => ids.has(id))) setPath(parentId ? current.path.slice(0, -1) : [])
  }

  const fileCountFor = (nodeId: string): number => items.reduce((count, item) => count + Number(item.nodeId === nodeId), 0)
  const addSection = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const title = sectionName.trim()
    if (!title) return
    const id = addNode(null, title)
    setSectionName('')
    setPath([id])
  }
  return (
    <section className="desk-section-tree" aria-labelledby="desk-section-tree-title">
      <header className="desk-section-tree-header">
        <h2 id="desk-section-tree-title">{labels.title}</h2>
      </header>
      {favoriteSections.length > 0 && <section className="desk-favorites" aria-label={labels.favorites}><h3>{labels.favorites}</h3><ul>{favoriteSections.map(({ node, path: favoritePath }) => <li key={node.id}><button type="button" className="desk-favorite-link" onClick={() => setPath(favoritePath)}><Star size={14} fill="currentColor" aria-hidden="true" /><span>{node.title}</span></button></li>)}</ul></section>}
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
            <Plus size={17} aria-hidden="true" />
          </button>
        </div>
      </form>
      <nav className="desk-tree-navigation" aria-label={labels.tree}>
        {tree.length ? (
          <TreeBranch
            nodes={tree}
            parentPath={[]}
            activePath={path}
            depth={0}
            onSelect={setPath}
            onToggle={(nodePath, parentPath) => setPath(path[parentPath.length] === nodePath[nodePath.length - 1] ? parentPath : nodePath)}
                fileCountFor={fileCountFor}
            labels={labels}
            fileLabel={messages.files.title}
                favoriteSectionIds={favoriteSectionIds}
                onToggleFavorite={toggleFavorite}
                editingId={editingId}
                editingTitle={editingTitle}
                onStartRename={startRename}
                onRenameTitle={setEditingTitle}
                onCommitRename={commitRename}
                onCancelRename={cancelRename}
                onDelete={node => void deleteSection(node)}
              />
        ) : <p className="desk-tree-empty">{labels.empty}</p>}
      </nav>
    </section>
  )
}
