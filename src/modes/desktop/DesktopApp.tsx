import { useLayoutEffect, useState } from 'react'
import { BookOpen, Building2, LifeBuoy, MessageSquare, Monitor, Palette, ShieldCheck, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { setLocale, useLocale } from '../../lib/i18n'
import { useSettings } from '../../lib/settings'
import { useDesktopMessages } from './i18n'
import { useDesktopPreferences } from './preferences'
import type { DesktopPage } from './types'
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
  const currentPage = messages.pages[page]

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
    }
  }, [preferences, spaceSettings.theme])

  const toggleLocale = (): void => setLocale(locale === 'ar' ? 'en' : 'ar')

  return (
    <div className="desk-app" data-desktop-page={page} lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="desk-topbar">
        <div className="desk-brand">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={32} height={32} className="desk-brand-mark" />
          <span className="desk-brand-name">{messages.appName}</span>
          <span className="desk-workspace-label">{messages.shell.workspaceLabel}</span>
        </div>
        <div className="desk-topbar-actions">
          <button type="button" className="desk-button" aria-label={messages.language.switch} onClick={toggleLocale}>
            <span>{messages.language.nextLabel}</span>
          </button>
          <button type="button" className="desk-button" aria-label={messages.mode.switchToSpace} onClick={onSwitchToSpace}>
            <Monitor size={17} aria-hidden="true" />
            <span>{messages.mode.space}</span>
          </button>
        </div>
      </header>

      <aside className="desk-sidebar" aria-label={messages.navigation.primary}>
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
              onClick={() => setPage(id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{messages.navigation[id]}</span>
            </button>
          ))}
        </nav>
        <div className="desk-sidebar-spacer" />
      </aside>

      <main className="desk-main" id="main-content">
        <div className="desk-page">
          <header className="desk-page-header">
            <h1 className="desk-page-title">{currentPage.title}</h1>
            <p className="desk-page-description">{currentPage.description}</p>
          </header>
          {page === 'library' ? (
            <section className="desk-welcome" aria-labelledby="desk-welcome-title">
              <h2 id="desk-welcome-title" className="desk-welcome-title">{messages.shell.welcomeTitle}</h2>
              <p className="desk-welcome-copy">{messages.shell.welcomeBody}</p>
            </section>
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
