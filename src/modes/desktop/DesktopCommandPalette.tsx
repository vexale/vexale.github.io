import { useEffect, useMemo, useRef, useState } from 'react'
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
interface PaletteResult { id: string; kind: string; label: string; detail: string; searchText?: string; run: () => void }

function flatten(nodes: ReturnType<typeof useTree>['tree'], parent: string[] = []): SectionRef[] {
  return nodes.flatMap(node => { const path = [...parent, node.id]; return [{ id: node.id, title: node.title, path }, ...flatten(node.children, path)] })
}
function plainText(html: string): string { return new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? '' }

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
    const sectionResults: PaletteResult[] = sections.map(section => ({ id: 'section:' + section.id, kind: p.sections, label: section.title, detail: pathLabel(section.path), run: () => { onNavigate('library'); setPath(section.path) } }))
    const noteResults: PaletteResult[] = notes.map(note => ({ id: 'note:' + note.id, kind: p.notes, label: note.body.split(/[.!?]/)[0]?.slice(0, 70) || p.noteLabel, detail: note.title, searchText: note.body, run: () => { onNavigate('library'); setPath(note.path); window.setTimeout(() => document.querySelector<HTMLElement>('.desk-note-editor')?.focus(), 120) } }))
    const fileResults: PaletteResult[] = items.map(item => {
      const section = sections.find(candidate => candidate.id === item.nodeId)
      return { id: 'file:' + item.id, kind: p.files, label: item.name, detail: section?.title ?? '', run: () => { if (section) { onNavigate('library'); setPath(section.path); window.setTimeout(() => Array.from(document.querySelectorAll<HTMLElement>('[data-file-id]')).find(row => row.dataset.fileId === item.id)?.scrollIntoView({ block: 'center' }), 140) } } }
    })
    const pageIds: DesktopPage[] = ['library', 'tasks', 'tools', 'themes', 'settings', 'account', 'support', 'privacy']
    const pages: PaletteResult[] = pageIds.map(page => ({ id: 'page:' + page, kind: p.pages, label: messages.pages[page].title, detail: messages.pages[page].description, run: () => onNavigate(page) }))
    const actions: PaletteResult[] = [
      { id: 'action:add-section', kind: p.actions, label: p.addSection, detail: p.actionHint, run: () => { updateDesktopPreferences({ railCollapsed: false, sectionsCollapsed: false }); onNavigate('library'); window.setTimeout(() => document.getElementById('desk-new-section')?.focus(), 120) } },
      { id: 'action:switch-space', kind: p.actions, label: p.switchSpace, detail: p.actionHint, run: onSwitchToSpace },
      { id: 'action:english', kind: p.actions, label: p.english, detail: p.languageHint, run: () => setLocale('en') },
      { id: 'action:arabic', kind: p.actions, label: p.arabic, detail: p.languageHint, run: () => setLocale('ar') },
    ]
    return [...sectionResults, ...noteResults, ...fileResults, ...pages, ...actions]
  }, [items, messages, notes, onNavigate, onSwitchToSpace, p, sections, setPath])

  const queryText = query.trim().toLocaleLowerCase(locale === 'ar' ? 'ar' : 'en')
  const filtered = useMemo(() => queryText ? allResults.filter(result => (result.label + ' ' + result.detail + ' ' + result.kind + ' ' + (result.searchText ?? '')).toLocaleLowerCase(locale === 'ar' ? 'ar' : 'en').includes(queryText)).slice(0, 30) : prefs.recentItems.map(id => allResults.find(result => result.id === id)).filter((result): result is PaletteResult => Boolean(result)), [allResults, locale, prefs.recentItems, queryText])
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
        {filtered.length ? filtered.map((result, index) => <button type="button" id={'desk-command-result-' + index} role="option" aria-selected={index === activeIndex} className="desk-command-result" key={result.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(result)}><span className="desk-command-result-icon">{result.id.startsWith('section:') ? <Folder size={17} /> : result.id.startsWith('file:') || result.id.startsWith('note:') ? <FileText size={17} /> : <Wrench size={17} />}</span><span className="desk-command-result-copy"><b>{result.label}</b><small>{result.detail || result.kind}</small></span><span className="desk-command-kind">{result.kind}</span></button>) : <p className="desk-command-empty">{queryText ? p.noResults : p.noRecent}</p>}
      </div>
      <footer><span>{p.navigateHelp}</span><span><kbd>↑</kbd> <kbd>↓</kbd> <kbd>↵</kbd></span></footer>
    </section>
  </div>
}
