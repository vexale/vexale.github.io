import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { dbGetNote } from '../../db'
import { useLibrary, useTree } from '../../shared'
import { setLocale, useLocale } from '../../lib/i18n'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'
import { useDesktopMessages } from './i18n'
import type { DesktopPage } from './types'
import { FileText, Folder, Search, Wrench, X } from 'lucide-react'

interface Props { open: boolean; onClose: () => void; onNavigate: (page: DesktopPage) => void; onSwitchToSpace: () => void }
interface SectionRef { id: string; title: string; path: string[] }
interface NoteRef extends SectionRef { body: string }
type PaletteGroup = 'sections' | 'notes' | 'files' | 'pages' | 'actions'
interface PaletteResult { id: string; group: PaletteGroup; label: string; detail: string; searchText?: string; run: () => void }
const PALETTE_GROUPS: PaletteGroup[] = ['sections', 'notes', 'files', 'pages', 'actions']

function flatten(nodes: ReturnType<typeof useTree>['tree'], parent: string[] = []): SectionRef[] {
  return nodes.flatMap(node => { const path = [...parent, node.id]; return [{ id: node.id, title: node.title, path }, ...flatten(node.children, path)] })
}
function plainText(html: string): string { return new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? '' }
function fuzzyScore(text: string, query: string, locale: string): number | null {
  const source = text.toLocaleLowerCase(locale)
  const target = query.toLocaleLowerCase(locale)
  if (!target) return 0
  const exact = source.indexOf(target)
  if (exact >= 0) return 10000 - exact
  let cursor = 0
  let gaps = 0
  for (const character of target) {
    const found = source.indexOf(character, cursor)
    if (found < 0) return null
    gaps += found - cursor
    cursor = found + 1
  }
  return 5000 - gaps - cursor / 100000
}
function matchIndexes(text: string, query: string, locale: string): Set<number> {
  const indexes = new Set<number>()
  if (!query) return indexes
  const source = text.toLocaleLowerCase(locale)
  const target = query.toLocaleLowerCase(locale)
  const exact = source.indexOf(target)
  if (exact >= 0) { for (let index = exact; index < exact + target.length; index += 1) indexes.add(index); return indexes }
  let cursor = 0
  for (const character of target) { const found = source.indexOf(character, cursor); if (found < 0) return new Set(); indexes.add(found); cursor = found + 1 }
  return indexes
}
function Highlighted({ text, query, locale }: { text: string; query: string; locale: string }): ReactNode {
  if (!query) return text
  const indexes = matchIndexes(text, query, locale)
  if (!indexes.size) return text
  return Array.from(text).map((character, index) => indexes.has(index) ? <mark key={index}>{character}</mark> : <span key={index}>{character}</span>)
}

export default function DesktopCommandPalette({ open, onClose, onNavigate, onSwitchToSpace }: Props) {
  const messages = useDesktopMessages()
  const locale = useLocale()
  const prefs = useDesktopPreferences()
  const { tree, setPath } = useTree()
  const { items } = useLibrary()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [notes, setNotes] = useState<NoteRef[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const p = messages.commandPalette
  const sections = useMemo(() => flatten(tree), [tree])

  useEffect(() => {
    if (!open) return
    setQuery(''); setActiveIndex(0)
    const focus = window.setTimeout(() => inputRef.current?.focus(), 0)
    let cancelled = false
    void Promise.all(sections.map(async section => {
      try { const note = await dbGetNote(section.id); return note?.html ? { ...section, body: plainText(note.html) } : null } catch { return null }
    })).then(rows => { if (!cancelled) setNotes(rows.filter((row): row is NoteRef => Boolean(row?.body))) })
    return () => { cancelled = true; window.clearTimeout(focus) }
  }, [open, sections])

  const allResults: PaletteResult[] = useMemo(() => {
    const pathLabel = (path: string[]): string => path.map(id => sections.find(section => section.id === id)?.title).filter(Boolean).join(' / ')
    const sectionResults: PaletteResult[] = sections.map(section => ({ id: 'section:' + section.id, group: 'sections', label: section.title, detail: pathLabel(section.path), run: () => { onNavigate('library'); setPath(section.path) } }))
    const noteResults: PaletteResult[] = notes.map(note => ({ id: 'note:' + note.id, group: 'notes', label: note.body.split(/[.!?]/)[0]?.slice(0, 70) || p.noteLabel, detail: note.title, searchText: note.body, run: () => { onNavigate('library'); setPath(note.path); window.setTimeout(() => document.querySelector<HTMLElement>('.desk-note-editor')?.focus(), 120) } }))
    const fileResults: PaletteResult[] = items.map(item => {
      const section = sections.find(candidate => candidate.id === item.nodeId)
      return { id: 'file:' + item.id, group: 'files', label: item.name, detail: section?.title ?? '', run: () => { if (section) { onNavigate('library'); setPath(section.path); window.setTimeout(() => Array.from(document.querySelectorAll<HTMLElement>('[data-file-id]')).find(row => row.dataset.fileId === item.id)?.scrollIntoView({ block: 'center' }), 140) } } }
    })
    const pageIds: DesktopPage[] = ['home', 'library', 'tasks', 'tools', 'themes', 'settings', 'account', 'trash', 'support', 'privacy']
    const pages: PaletteResult[] = pageIds.map(page => ({ id: 'page:' + page, group: 'pages', label: page === 'home' ? messages.homeDashboard.pageTitle : messages.pages[page].title, detail: page === 'home' ? messages.homeDashboard.intro : messages.pages[page].description, run: () => onNavigate(page) }))
    const actions: PaletteResult[] = [
      { id: 'action:add-section', group: 'actions', label: p.addSection, detail: p.actionHint, run: () => { updateDesktopPreferences({ railCollapsed: false, sectionsCollapsed: false }); onNavigate('library'); window.setTimeout(() => document.getElementById('desk-new-section')?.focus(), 120) } },
      { id: 'action:switch-space', group: 'actions', label: p.switchSpace, detail: p.actionHint, run: onSwitchToSpace },
      { id: 'action:english', group: 'actions', label: p.english, detail: p.languageHint, run: () => setLocale('en') },
      { id: 'action:arabic', group: 'actions', label: p.arabic, detail: p.languageHint, run: () => setLocale('ar') },
    ]
    return [...sectionResults, ...noteResults, ...fileResults, ...pages, ...actions]
  }, [items, messages, notes, onNavigate, onSwitchToSpace, p, sections, setPath])

  const searchLocale = locale === 'ar' ? 'ar' : 'en'
  const queryText = query.trim()
  const filtered = useMemo(() => {
    if (!queryText) return prefs.recentItems.map(id => allResults.find(result => result.id === id)).filter((result): result is PaletteResult => Boolean(result))
    const recentRank = new Map(prefs.recentItems.map((id, index) => [id, index]))
    return allResults.map(result => {
      const searchable = [result.label, result.detail, result.searchText ?? ''].join(' ')
      const score = fuzzyScore(searchable, queryText, searchLocale)
      return score === null ? null : { result, score, recent: recentRank.has(result.id) ? 1 : 0, recentIndex: recentRank.get(result.id) ?? Number.MAX_SAFE_INTEGER }
    }).filter((entry): entry is { result: PaletteResult; score: number; recent: number; recentIndex: number } => Boolean(entry)).sort((a, b) => b.recent - a.recent || a.recentIndex - b.recentIndex || b.score - a.score).map(entry => entry.result).slice(0, 50)
  }, [allResults, prefs.recentItems, queryText, searchLocale])
  const groupedResults = useMemo(() => {
    return PALETTE_GROUPS.map(group => {
      const results = filtered.filter(result => result.group === group).map(result => ({ result, index: filtered.indexOf(result) }))
      return { group, results }
    }).filter(group => group.results.length > 0)
  }, [filtered])
  const select = (result: PaletteResult): void => {
    updateDesktopPreferences({ recentItems: [result.id, ...prefs.recentItems.filter(id => id !== result.id)].slice(0, 8) })
    onClose(); result.run()
  }
  if (!open) return null
  return <div className="desk-command-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="desk-command-palette" role="dialog" aria-modal="true" aria-label={p.title}>
      <div className="desk-command-search"><Search size={19} aria-hidden="true" /><input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0) }} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, Math.max(0, filtered.length - 1))) } else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(0, index - 1)) } else if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); select(filtered[activeIndex]) } else if (event.key === 'Escape') { event.preventDefault(); onClose() } }} placeholder={p.placeholder} aria-label={p.placeholder} aria-controls="desk-command-results" aria-activedescendant={filtered[activeIndex] ? 'desk-command-result-' + activeIndex : undefined} /><button type="button" className="desk-icon-button" aria-label={p.close} onClick={onClose}><X size={17} /></button></div>
      <div className="desk-command-subhead"><span>{queryText ? p.results : p.recent}</span><kbd dir="ltr">ESC</kbd></div>
      <div className="desk-command-results" id="desk-command-results" role="listbox" aria-label={p.results}>
        {groupedResults.length ? groupedResults.map(({ group, results }) => <section className="desk-command-group" key={group} role="group" aria-label={p[group]}><h3>{p[group]}</h3>{results.map(({ result, index }) => <button type="button" id={'desk-command-result-' + index} role="option" aria-selected={index === activeIndex} className="desk-command-result" key={result.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(result)}><span className="desk-command-result-icon">{result.group === 'sections' ? <Folder size={17} aria-hidden="true" /> : result.group === 'files' || result.group === 'notes' ? <FileText size={17} aria-hidden="true" /> : <Wrench size={17} aria-hidden="true" />}</span><span className="desk-command-result-copy"><b><Highlighted text={result.label} query={queryText} locale={searchLocale} /></b><small><Highlighted text={result.detail || p[group]} query={queryText} locale={searchLocale} /></small></span></button>)}</section>) : <p className="desk-command-empty">{queryText ? p.noResults : p.noRecent}</p>}
      </div>
      <footer><span>{p.navigateHelp}</span><span><kbd>↑</kbd> <kbd>↓</kbd> <kbd>↵</kbd></span></footer>
    </section>
  </div>
}
