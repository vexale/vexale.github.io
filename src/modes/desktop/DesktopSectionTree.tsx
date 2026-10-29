import { useState } from 'react'
import DesktopSectionAddControl from './DesktopSectionAddControl'
import type { CSSProperties, FormEvent } from 'react'
import { ChevronDown, ChevronRight, Folder, Plus, Star } from 'lucide-react'
import { useLibrary, useTree } from '../../shared'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'
import type { TNode } from '../../shared'
import { useDesktopMessages } from './i18n'

interface TreeBranchProps {
  nodes: TNode[]
  parentPath: string[]
  activePath: string[]
  depth: number
  onSelect: (path: string[]) => void
  onToggle: (path: string[], parentPath: string[]) => void
  onAddChild: (path: string[]) => void
  fileCountFor: (nodeId: string) => number
  labels: ReturnType<typeof useDesktopMessages>['sections']
  fileLabel: string
  favoriteSectionIds: string[]
  onToggleFavorite: (node: TNode) => void
}

function TreeBranch({ nodes, parentPath, activePath, depth, onSelect, onToggle, onAddChild, fileCountFor, labels, fileLabel, favoriteSectionIds, onToggleFavorite }: TreeBranchProps) {
  return (
    <ul className="desk-tree-list">
      {nodes.map(node => {
        const nodePath = [...parentPath, node.id]
        const expanded = activePath[parentPath.length] === node.id
        const selected = activePath.length === nodePath.length && expanded
        const hasChildren = node.children.length > 0
        const fileCount = fileCountFor(node.id)

        return (
          <li key={node.id} className="desk-tree-item">
            <div className="desk-tree-row" style={{ '--desk-tree-depth': depth } as CSSProperties}>
              <button
                type="button"
                className="desk-tree-select"
                aria-current={selected ? 'page' : undefined}
                onClick={() => onSelect(nodePath)}
              >
                <Folder size={16} aria-hidden="true" />
                <span className="desk-tree-name">{node.title}</span>
                {fileCount > 0 && <span className="desk-tree-count" aria-label={`${fileCount} ${fileLabel}`}>{fileCount}</span>}
              </button>
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
                onAddChild={onAddChild}
                fileCountFor={fileCountFor}
                labels={labels}
                fileLabel={fileLabel}
                favoriteSectionIds={favoriteSectionIds}
                onToggleFavorite={onToggleFavorite}
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
  const { tree, path, setPath, addNode } = useTree()
  const preferences = useDesktopPreferences()
  const { items } = useLibrary()
  const [sectionName, setSectionName] = useState('')
  const labels = messages.sections
  const favoriteSectionIds = preferences.favoriteSectionIds
  const allSections = (nodes: TNode[], parent: string[] = []): Array<{ node: TNode; path: string[] }> => nodes.flatMap(node => { const next = [...parent, node.id]; return [{ node, path: next }, ...allSections(node.children, next)] })
  const favoriteSections = allSections(tree).filter(entry => favoriteSectionIds.includes(entry.node.id))
  const toggleFavorite = (node: TNode): void => updateDesktopPreferences({ favoriteSectionIds: favoriteSectionIds.includes(node.id) ? favoriteSectionIds.filter(id => id !== node.id) : [...favoriteSectionIds, node.id] })

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
            onAddChild={() => undefined}
            fileCountFor={fileCountFor}
            labels={labels}
            fileLabel={messages.files.title}
            favoriteSectionIds={favoriteSectionIds}
            onToggleFavorite={toggleFavorite}
          />
        ) : <p className="desk-tree-empty">{labels.empty}</p>}
      </nav>
    </section>
  )
}
