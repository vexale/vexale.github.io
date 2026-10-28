import { useEffect, useLayoutEffect, useState } from 'react'
import { BookOpen, Building2, LifeBuoy, Maximize2, MessageSquare, Minimize2, Monitor, Palette, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, ShieldCheck, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { setLocale, useLocale } from '../../lib/i18n'
import { useSettings } from '../../lib/settings'
import { useDesktopMessages } from './i18n'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'
import type { DesktopPage } from './types'
import DesktopLibraryPage from './DesktopLibraryPage'
import DesktopSectionTree from './DesktopSectionTree'
import DesktopThemesPage from './DesktopThemesPage'
import './desktop.css'

interface DesktopAppProps {
  onSwitchToSpace: () => void
}

const NAV_ITEMS: readonly { id: DesktopPage; Icon: LucideIcon }[] = [
  { id: 'library', Icon: BookOpen },
  { id: 'account', Icon: UserRound },
  { id: 'settings', Icon: Palette },
  { id: 'support', Icon: LifeBuoy },
  { id: 'feedback', Icon: MessageSquare },
  { id: 'privacy', Icon: ShieldCheck },
]

const CONTENT_WIDTHS = {
  narrow: '760px',
  comfortable: '1040px',
  wide: '1440px',
} as const

const FONT_FAMILIES = {
  instrument: "'Instrument Sans', 'Noto Kufi Arabic', system-ui, sans-serif",
  noto: "'Noto Kufi Arabic', 'Instrument Sans', system-ui, sans-serif",
  system: "system-ui, 'Noto Kufi Arabic', sans-serif",
} as const

export default function DesktopApp({ onSwitchToSpace }: DesktopAppProps) {
  const locale = useLocale()
  const messages = useDesktopMessages()
  const spaceSettings = useSettings()
  const preferences = useDesktopPreferences()
  const [page, setPage] = useState<DesktopPage>('library')
  const [mobileDrawer, setMobileDrawer] = useState<'rail' | 'sections' | null>(null)
  const currentPage = messages.pages[page]
  const libraryPage = page === 'library'
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  const bothPanelsCollapsed = preferences.railCollapsed && preferences.sectionsCollapsed
  const railExpanded = isMobile ? mobileDrawer === 'rail' : !preferences.railCollapsed
  const sectionsExpanded = isMobile ? mobileDrawer === 'sections' : !preferences.sectionsCollapsed

  const toggleRail = (): void => {
    if (isMobile) setMobileDrawer(current => current === 'rail' ? null : 'rail')
    else updateDesktopPreferences({ railCollapsed: !preferences.railCollapsed })
  }
  const toggleSections = (): void => {
    if (!libraryPage) return
    if (isMobile) setMobileDrawer(current => current === 'sections' ? null : 'sections')
    else updateDesktopPreferences({ sectionsCollapsed: !preferences.sectionsCollapsed })
  }
  const toggleFocusLayout = (): void => {
    const collapsed = !bothPanelsCollapsed
    updateDesktopPreferences({ railCollapsed: collapsed, sectionsCollapsed: collapsed })
    setMobileDrawer(null)
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
    if (preferences.accentColor) {
      root.style.setProperty('--desk-accent', preferences.accentColor)
      root.style.setProperty('--desk-accent-soft', `color-mix(in srgb, ${preferences.accentColor} 20%, var(--desk-surface))`)
      root.style.setProperty('--desk-selection', `color-mix(in srgb, ${preferences.accentColor} 45%, var(--desk-surface))`)
    } else {
      root.style.removeProperty('--desk-accent')
      root.style.removeProperty('--desk-accent-soft')
      root.style.removeProperty('--desk-selection')
    }

    return () => {
      if (previousMode) root.dataset.mode = previousMode
      else delete root.dataset.mode
      root.dataset.theme = spaceSettings.theme
      delete root.dataset.reduceMotion
      delete root.dataset.sidebarPosition
      root.style.removeProperty('--desk-font-family')
      root.style.removeProperty('--desk-font-size')
      root.style.removeProperty('--desk-line-height')
      root.style.removeProperty('--desk-content-width')
      root.style.removeProperty('--desk-accent')
      root.style.removeProperty('--desk-accent-soft')
      root.style.removeProperty('--desk-selection')
    }
  }, [preferences, spaceSettings.theme])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const syncViewport = (): void => {
      setIsMobile(media.matches)
      if (!media.matches) setMobileDrawer(null)
    }
    media.addEventListener('change', syncViewport)
    return () => media.removeEventListener('change', syncViewport)
  }, [])

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      const key = event.key.toLowerCase()
      if (event.key === '\\') {
        event.preventDefault()
        const collapsed = !(preferences.railCollapsed && preferences.sectionsCollapsed)
        updateDesktopPreferences({ railCollapsed: collapsed, sectionsCollapsed: collapsed })
        setMobileDrawer(null)
      } else if (key === 'b' && event.shiftKey) {
        event.preventDefault()
        updateDesktopPreferences({ railCollapsed: !preferences.railCollapsed })
        setMobileDrawer(null)
      } else if (key === 'b') {
        event.preventDefault()
        updateDesktopPreferences({ sectionsCollapsed: !preferences.sectionsCollapsed })
        setMobileDrawer(null)
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [preferences.railCollapsed, preferences.sectionsCollapsed])

  const toggleLocale = (): void => setLocale(locale === 'ar' ? 'en' : 'ar')

  return (
    <div className="desk-app" data-desktop-page={page} data-rail-collapsed={preferences.railCollapsed} data-sections-collapsed={preferences.sectionsCollapsed} data-mobile-drawer={mobileDrawer ?? 'none'} lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="desk-topbar">
        <div className="desk-brand">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={32} height={32} className="desk-brand-mark" />
          <span className="desk-brand-name">{messages.appName}</span>
          <span className="desk-workspace-label">{messages.shell.workspaceLabel}</span>
        </div>
        <div className="desk-topbar-actions">
          <button type="button" className="desk-icon-button desk-panel-toggle desk-rail-toggle" aria-label={messages.shell.toggleRail} aria-controls="desk-sidebar" aria-expanded={railExpanded} title={`${messages.shell.toggleRail} · Ctrl+Shift+B`} onClick={toggleRail}>
            {railExpanded ? <PanelLeftClose size={17} aria-hidden="true" /> : <PanelLeftOpen size={17} aria-hidden="true" />}
          </button>
          <button type="button" className="desk-icon-button desk-panel-toggle desk-sections-toggle" aria-label={messages.shell.toggleSections} aria-controls="desk-section-pane" aria-expanded={sectionsExpanded} aria-disabled={!libraryPage} disabled={!libraryPage} title={`${messages.shell.toggleSections} · Ctrl+B`} onClick={toggleSections}>
            {sectionsExpanded ? <PanelRightClose size={17} aria-hidden="true" /> : <PanelRightOpen size={17} aria-hidden="true" />}
          </button>
          <button type="button" className="desk-icon-button desk-panel-toggle desk-focus-toggle" aria-label={messages.shell.focusLayout} aria-pressed={bothPanelsCollapsed} title={`${messages.shell.focusLayout} · Ctrl+\\`} onClick={toggleFocusLayout}>
            {bothPanelsCollapsed ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}
          </button>
          <button type="button" className="desk-button desk-language-toggle" aria-label={messages.language.switch} onClick={toggleLocale}>
            <span>{messages.language.nextLabel}</span>
          </button>
          <button type="button" className="desk-button desk-mode-switch" aria-label={messages.mode.switchToSpace} onClick={onSwitchToSpace}>
            <Monitor size={17} aria-hidden="true" />
            <span>{messages.mode.space}</span>
          </button>
        </div>
      </header>

      {mobileDrawer !== null && <button type="button" className="desk-drawer-backdrop" aria-label={messages.shell.closeDrawer} onClick={() => setMobileDrawer(null)} />}

      <aside id="desk-sidebar" className="desk-sidebar" aria-label={messages.navigation.primary} inert={isMobile ? mobileDrawer !== 'rail' : preferences.railCollapsed}>
        <div className="desk-sidebar-heading">
          <Building2 size={16} aria-hidden="true" />
          <span>{messages.navigation.workspace}</span>
        </div>
        <nav className="desk-navigation" aria-label={messages.navigation.primary}>
          {NAV_ITEMS.map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              className="desk-navigation-link"
              aria-current={page === id ? 'page' : undefined}
              onClick={() => { setPage(id); setMobileDrawer(null) }}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{messages.navigation[id]}</span>
            </button>
          ))}
        </nav>
        <div className="desk-sidebar-spacer" />
      </aside>

      {libraryPage && <aside id="desk-section-pane" className="desk-section-pane" aria-label={messages.sections.title} inert={isMobile ? mobileDrawer !== 'sections' : preferences.sectionsCollapsed}><DesktopSectionTree /></aside>}

      <main className={`desk-main ${libraryPage ? 'desk-main-with-sections' : 'desk-main-full'}`} id="main-content">
        <div className="desk-page">
          <header className="desk-page-header">
            <h1 className="desk-page-title">{currentPage.title}</h1>
            <p className="desk-page-description">{currentPage.description}</p>
          </header>
          {libraryPage ? (
            <DesktopLibraryPage />
          ) : page === 'settings' ? (
            <DesktopThemesPage />
          ) : (
            <section className="desk-welcome" aria-label={currentPage.title}>
              <p className="desk-welcome-copy">{currentPage.description}</p>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
