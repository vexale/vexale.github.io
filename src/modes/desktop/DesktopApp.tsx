import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BookOpen, Building2, Download, Ellipsis, House, LifeBuoy, ListTodo, Menu, MessageSquareText, Monitor, Palette, Search, Settings, ShieldCheck, Trash2, UserRound, Wrench, X, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Maximize2, Minimize2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { setLocale, useLocale } from '../../lib/i18n'
import { useSettings } from '../../lib/settings'
import { useDesktopMessages } from './i18n'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'
import type { DesktopPage } from './types'
import DesktopSectionTree from './DesktopSectionTree'
import DesktopCommandPalette from './DesktopCommandPalette'
import DesktopHomePage from './DesktopHomePage'
import DesktopFocusTimer from './DesktopFocusTimer'
import FeedbackWidget from './FeedbackWidget'
import DesktopSkeleton from './DesktopSkeleton'
import OfflineNotice from './OfflineNotice'
import './desktop.css'
import './performance.css'

interface DesktopAppProps { onSwitchToSpace: () => void }
interface PwaInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}
const NAV_ITEMS: readonly { id: DesktopPage; Icon: LucideIcon }[] = [
  { id: 'home', Icon: House }, { id: 'library', Icon: BookOpen }, { id: 'tasks', Icon: ListTodo }, { id: 'tools', Icon: Wrench }, { id: 'themes', Icon: Palette },
  { id: 'settings', Icon: Settings }, { id: 'account', Icon: UserRound }, { id: 'trash', Icon: Trash2 }, { id: 'support', Icon: LifeBuoy }, { id: 'privacy', Icon: ShieldCheck },
]
const DesktopLibraryPage = lazy(() => import('./DesktopLibraryPage'))
const DesktopPageContent = lazy(async () => {
  const module = await import('./DesktopPages')
  return { default: module.DesktopPageContent }
})
const CONTENT_WIDTHS = { narrow: '760px', comfortable: '1040px', wide: '1440px' } as const
const DENSITY_GAPS = { compact: '8px', comfortable: '14px', spacious: '22px' } as const
const FONT_FAMILIES = { instrument: "'Instrument Sans', 'Noto Kufi Arabic', system-ui, sans-serif", noto: "'Noto Kufi Arabic', 'Instrument Sans', system-ui, sans-serif", system: "system-ui, 'Noto Kufi Arabic', sans-serif" } as const
  const PAGE_IDS = new Set<DesktopPage>(['home', 'library', 'tasks', 'tools', 'themes', 'settings', 'account', 'trash', 'support', 'privacy'])
function pageFromHash(): DesktopPage {
  const key = window.location.hash.split('/').filter(Boolean).at(-1) as DesktopPage | undefined
  return key && PAGE_IDS.has(key) ? key : 'home'
}
function pageHash(page: DesktopPage): string { return `#/office/${page}` }

export default function DesktopApp({ onSwitchToSpace }: DesktopAppProps) {
  const locale = useLocale()
  const messages = useDesktopMessages()
  const spaceSettings = useSettings()
  const preferences = useDesktopPreferences()
  const [page, setPage] = useState<DesktopPage>(() => typeof window === 'undefined' ? 'home' : pageFromHash())
  const [menuOpen, setMenuOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<PwaInstallPromptEvent | null>(null)
  const bothPanelsCollapsed = preferences.railCollapsed && preferences.sectionsCollapsed
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  const railExpanded = !preferences.railCollapsed
  const sectionsExpanded = !preferences.sectionsCollapsed

  const navigate = (next: DesktopPage, updateHash = true): void => {
    setPage(next)
    if (updateHash && window.location.hash !== pageHash(next)) window.history.pushState({ desktopPage: next }, '', pageHash(next))
    setMenuOpen(false)
    setMobileNavOpen(false)
  }
  const toggleRail = (): void => updateDesktopPreferences({ railCollapsed: !preferences.railCollapsed })
  const toggleSections = (): void => { if (page === 'library') updateDesktopPreferences({ sectionsCollapsed: !preferences.sectionsCollapsed }) }
  const toggleFocus = (): void => { const collapsed = !bothPanelsCollapsed; updateDesktopPreferences({ railCollapsed: collapsed, sectionsCollapsed: collapsed }) }
  const closeFeedback = useCallback((): void => {
    setFeedbackOpen(false)
    window.requestAnimationFrame(() => moreButtonRef.current?.focus())
  }, [])
  const installApp = async (): Promise<void> => {
    if (!installPrompt) return
    setMenuOpen(false)
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

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

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault()
      setInstallPrompt(event as PwaInstallPromptEvent)
    }
    const onAppInstalled = (): void => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  return (
    <div className="desk-app" data-desktop-page={page} data-rail-collapsed={preferences.railCollapsed} data-sections-collapsed={preferences.sectionsCollapsed} lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="desk-topbar">
        <div className="desk-brand"><img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={32} height={32} className="desk-brand-mark" /><span className="desk-brand-name">{messages.appName}</span><span className="desk-workspace-label">{messages.shell.workspaceLabel}</span></div>
        <div className="desk-topbar-actions">
          <div className="desk-menu-wrap">
            <button ref={moreButtonRef} type="button" className="desk-icon-button" aria-label={messages.shell.menu} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><Ellipsis size={18} aria-hidden="true" /></button>
            {menuOpen && <div className="desk-topbar-menu" role="menu">
              {installPrompt && <button type="button" role="menuitem" onClick={() => void installApp()}><Download size={16} />{messages.shell.installApp}</button>}
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setFeedbackOpen(true) }}><MessageSquareText size={16} aria-hidden="true" />{messages.feedback.open}</button>
              <button type="button" role="menuitem" onClick={toggleRail}>{railExpanded ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}{messages.shell.toggleRail}<kbd dir="ltr">Ctrl+Shift+B</kbd></button>
              <button type="button" role="menuitem" disabled={page !== 'library'} onClick={toggleSections}>{sectionsExpanded ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}{messages.shell.toggleSections}<kbd dir="ltr">Ctrl+B</kbd></button>
              <button type="button" role="menuitem" onClick={toggleFocus}>{bothPanelsCollapsed ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{messages.shell.collapseAll}<kbd dir="ltr">Ctrl+\</kbd></button>
            </div>}
          </div>
          <button type="button" className="desk-mobile-nav-trigger desk-icon-button" aria-label={mobileNavOpen ? messages.shell.closeNavigation : messages.shell.openNavigation} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(value => !value)}>{mobileNavOpen ? <X size={19} /> : <Menu size={19} />}</button>
          <button type="button" className="desk-command-trigger" aria-label={messages.commandPalette.open} onClick={() => setPaletteOpen(true)}><Search size={16} aria-hidden="true" /><span>{messages.commandPalette.open}</span><kbd dir="ltr">Ctrl+K</kbd></button>
          <button type="button" className="desk-button desk-language-toggle" aria-label={messages.language.switch} onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}><span>{messages.language.nextLabel}</span></button>
          <button type="button" className="desk-button desk-mode-switch" aria-label={messages.mode.switchToSpace} onClick={onSwitchToSpace}><Monitor size={17} aria-hidden="true" /><span>{messages.mode.space}</span></button>
          <DesktopFocusTimer />
        </div>
      </header>
      <OfflineNotice />
      {mobileNavOpen && <button type="button" className="desk-mobile-nav-backdrop" aria-label={messages.shell.closeNavigation} onClick={() => setMobileNavOpen(false)} />}
      <aside id="desk-sidebar" className={`desk-sidebar${mobileNavOpen ? ' is-mobile-open' : ''}`} inert={isMobile ? !mobileNavOpen : preferences.railCollapsed} aria-label={messages.navigation.primary}>
        <div className="desk-sidebar-heading"><Building2 size={16} aria-hidden="true" /><span>{messages.navigation.workspace}</span></div>
        <nav className="desk-navigation" aria-label={messages.navigation.primary}>{NAV_ITEMS.map(({ id, Icon }) => <button key={id} type="button" className="desk-navigation-link" aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={18} aria-hidden="true" /><span>{id === 'home' ? messages.homeDashboard.pageTitle : messages.navigation[id]}</span></button>)}</nav>
        <div className="desk-sidebar-spacer" />
      </aside>
      {page === 'library' && <aside id="desk-section-pane" className="desk-section-pane" inert={preferences.sectionsCollapsed && !isMobile} aria-label={messages.sections.title}><DesktopSectionTree /></aside>}
      <main className={`desk-main ${page === 'library' ? 'desk-main-with-sections' : 'desk-main-full'}`} id="main-content">
        <div className="desk-page"><header className="desk-page-header"><h1 className="desk-page-title">{page === 'home' ? messages.homeDashboard.pageTitle : messages.pages[page].title}</h1><p className="desk-page-description">{page === 'home' ? messages.homeDashboard.intro : messages.pages[page].description}</p></header>
          {page === 'home' ? <DesktopHomePage onNavigate={navigate} /> : page === 'library' ? <Suspense fallback={<DesktopSkeleton />}><DesktopLibraryPage /></Suspense> : <Suspense fallback={<DesktopSkeleton />}><DesktopPageContent page={page} onSwitchToSpace={onSwitchToSpace} onOpenPrivacy={() => navigate('privacy')} /></Suspense>}
        </div>
      </main>
      <FeedbackWidget open={feedbackOpen} page={page} onClose={closeFeedback} onRequestAuth={() => { setFeedbackOpen(false); navigate('account') }} />
      <DesktopCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} onSwitchToSpace={onSwitchToSpace} />
    </div>
  )
}
