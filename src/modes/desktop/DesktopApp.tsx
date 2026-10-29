import { useEffect, useLayoutEffect, useState } from 'react'
import { BookOpen, Building2, Ellipsis, LifeBuoy, ListTodo, Monitor, Palette, Settings, ShieldCheck, UserRound, Wrench, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Maximize2, Minimize2, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { setLocale, useLocale } from '../../lib/i18n'
import { useSettings } from '../../lib/settings'
import { useDesktopMessages } from './i18n'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'
import type { DesktopPage } from './types'
import DesktopLibraryPage from './DesktopLibraryPage'
import DesktopSectionTree from './DesktopSectionTree'
import { DesktopPageContent } from './DesktopPages'
import DesktopCommandPalette from './DesktopCommandPalette'
import './desktop.css'

interface DesktopAppProps { onSwitchToSpace: () => void }
const NAV_ITEMS: readonly { id: DesktopPage; Icon: LucideIcon }[] = [
  { id: 'library', Icon: BookOpen }, { id: 'tasks', Icon: ListTodo }, { id: 'tools', Icon: Wrench }, { id: 'themes', Icon: Palette },
  { id: 'settings', Icon: Settings }, { id: 'account', Icon: UserRound }, { id: 'support', Icon: LifeBuoy }, { id: 'privacy', Icon: ShieldCheck },
]
const CONTENT_WIDTHS = { narrow: '760px', comfortable: '1040px', wide: '1440px' } as const
const DENSITY_GAPS = { compact: '8px', comfortable: '14px', spacious: '22px' } as const
const FONT_FAMILIES = { instrument: "'Instrument Sans', 'Noto Kufi Arabic', system-ui, sans-serif", noto: "'Noto Kufi Arabic', 'Instrument Sans', system-ui, sans-serif", system: "system-ui, 'Noto Kufi Arabic', sans-serif" } as const
const PAGE_IDS = new Set<DesktopPage>(['library', 'tasks', 'tools', 'themes', 'settings', 'account', 'support', 'privacy'])
function pageFromHash(): DesktopPage {
  const key = window.location.hash.split('/').filter(Boolean).at(-1) as DesktopPage | undefined
  return key && PAGE_IDS.has(key) ? key : 'library'
}
function pageHash(page: DesktopPage): string { return `#/office/${page}` }

export default function DesktopApp({ onSwitchToSpace }: DesktopAppProps) {
  const locale = useLocale()
  const messages = useDesktopMessages()
  const spaceSettings = useSettings()
  const preferences = useDesktopPreferences()
  const [page, setPage] = useState<DesktopPage>(() => typeof window === 'undefined' ? 'library' : pageFromHash())
  const [menuOpen, setMenuOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const bothPanelsCollapsed = preferences.railCollapsed && preferences.sectionsCollapsed
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  const railExpanded = !preferences.railCollapsed
  const sectionsExpanded = !preferences.sectionsCollapsed

  const navigate = (next: DesktopPage, updateHash = true): void => {
    setPage(next)
    if (updateHash && window.location.hash !== pageHash(next)) window.history.pushState({ desktopPage: next }, '', pageHash(next))
    setMenuOpen(false)
  }
  const toggleRail = (): void => updateDesktopPreferences({ railCollapsed: !preferences.railCollapsed })
  const toggleSections = (): void => { if (page === 'library') updateDesktopPreferences({ sectionsCollapsed: !preferences.sectionsCollapsed }) }
  const toggleFocus = (): void => { const collapsed = !bothPanelsCollapsed; updateDesktopPreferences({ railCollapsed: collapsed, sectionsCollapsed: collapsed }) }

  useLayoutEffect(() => {
    const root = document.documentElement
    const previousMode = root.dataset.mode
    root.dataset.mode = 'desktop'
    root.dataset.theme = preferences.theme
    root.dataset.reduceMotion = String(preferences.reduceMotion)
    root.dataset.sidebarPosition = preferences.sidebarPosition
    root.style.setProperty('--desk-font-family', FONT_FAMILIES[preferences.font])
    root.style.setProperty('--desk-font-size', `${preferences.fontSize}px`)
    root.style.setProperty('--desk-line-height', String(preferences.lineHeight))
    root.style.setProperty('--desk-content-width', CONTENT_WIDTHS[preferences.contentWidth])
    root.style.setProperty('--desk-density-space', DENSITY_GAPS[preferences.density])
    if (preferences.accentColor) root.style.setProperty('--desk-accent', preferences.accentColor)
    else root.style.removeProperty('--desk-accent')
    return () => {
      if (previousMode) root.dataset.mode = previousMode
      else delete root.dataset.mode
      root.dataset.theme = spaceSettings.theme
      delete root.dataset.reduceMotion
      delete root.dataset.sidebarPosition
      root.style.removeProperty('--desk-font-family'); root.style.removeProperty('--desk-font-size')
      root.style.removeProperty('--desk-line-height'); root.style.removeProperty('--desk-content-width')
      root.style.removeProperty('--desk-density-space')
      root.style.removeProperty('--desk-accent')
    }
  }, [preferences, spaceSettings.theme])

  useEffect(() => {
    const syncHash = (): void => setPage(pageFromHash())
    const onShortcut = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { setMenuOpen(false); setPaletteOpen(false); return }
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(value => !value); setMenuOpen(false); return }
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (event.key === '\\') { event.preventDefault(); toggleFocus() }
      else if (event.key.toLowerCase() === 'b' && event.shiftKey) { event.preventDefault(); toggleRail() }
      else if (event.key.toLowerCase() === 'b') { event.preventDefault(); toggleSections() }
    }
    window.addEventListener('hashchange', syncHash)
    window.addEventListener('popstate', syncHash)
    window.addEventListener('keydown', onShortcut)
    if (window.location.hash !== pageHash(page)) window.history.replaceState({ desktopPage: page }, '', pageHash(page))
    return () => { window.removeEventListener('hashchange', syncHash); window.removeEventListener('popstate', syncHash); window.removeEventListener('keydown', onShortcut) }
  }, [page, preferences.railCollapsed, preferences.sectionsCollapsed])

  return (
    <div className="desk-app" data-desktop-page={page} data-rail-collapsed={preferences.railCollapsed} data-sections-collapsed={preferences.sectionsCollapsed} lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="desk-topbar">
        <div className="desk-brand"><img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={32} height={32} className="desk-brand-mark" /><span className="desk-brand-name">{messages.appName}</span><span className="desk-workspace-label">{messages.shell.workspaceLabel}</span></div>
        <div className="desk-topbar-actions">
          <div className="desk-menu-wrap">
            <button type="button" className="desk-icon-button" aria-label={messages.shell.menu} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><Ellipsis size={18} aria-hidden="true" /></button>
            {menuOpen && <div className="desk-topbar-menu" role="menu">
              <button type="button" role="menuitem" onClick={toggleRail}>{railExpanded ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}{messages.shell.toggleRail}<kbd dir="ltr">Ctrl+Shift+B</kbd></button>
              <button type="button" role="menuitem" disabled={page !== 'library'} onClick={toggleSections}>{sectionsExpanded ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}{messages.shell.toggleSections}<kbd dir="ltr">Ctrl+B</kbd></button>
              <button type="button" role="menuitem" onClick={toggleFocus}>{bothPanelsCollapsed ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{messages.shell.collapseAll}<kbd dir="ltr">Ctrl+\</kbd></button>
            </div>}
          </div>
          <button type="button" className="desk-command-trigger" aria-label={messages.commandPalette.open} onClick={() => setPaletteOpen(true)}><Search size={16} aria-hidden="true" /><span>{messages.commandPalette.open}</span><kbd dir="ltr">Ctrl+K</kbd></button>
          <button type="button" className="desk-button desk-language-toggle" aria-label={messages.language.switch} onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}><span>{messages.language.nextLabel}</span></button>
          <button type="button" className="desk-button desk-mode-switch" aria-label={messages.mode.switchToSpace} onClick={onSwitchToSpace}><Monitor size={17} aria-hidden="true" /><span>{messages.mode.space}</span></button>
        </div>
      </header>
      <aside id="desk-sidebar" className="desk-sidebar" inert={preferences.railCollapsed && !isMobile} aria-label={messages.navigation.primary}>
        <div className="desk-sidebar-heading"><Building2 size={16} aria-hidden="true" /><span>{messages.navigation.workspace}</span></div>
        <nav className="desk-navigation" aria-label={messages.navigation.primary}>{NAV_ITEMS.map(({ id, Icon }) => <button key={id} type="button" className="desk-navigation-link" aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={18} aria-hidden="true" /><span>{messages.navigation[id]}</span></button>)}</nav>
        <div className="desk-sidebar-spacer" />
      </aside>
      {page === 'library' && <aside id="desk-section-pane" className="desk-section-pane" inert={preferences.sectionsCollapsed && !isMobile} aria-label={messages.sections.title}><DesktopSectionTree /></aside>}
      <main className={`desk-main ${page === 'library' ? 'desk-main-with-sections' : 'desk-main-full'}`} id="main-content">
        <div className="desk-page"><header className="desk-page-header"><h1 className="desk-page-title">{messages.pages[page].title}</h1><p className="desk-page-description">{messages.pages[page].description}</p></header>
          {page === 'library' ? <DesktopLibraryPage /> : <DesktopPageContent page={page} onSwitchToSpace={onSwitchToSpace} onOpenPrivacy={() => navigate('privacy')} />}
        </div>
      </main>
      <DesktopCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} onSwitchToSpace={onSwitchToSpace} />
    </div>
  )
}
