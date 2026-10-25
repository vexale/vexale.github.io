import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import AppHeader from './components/AppHeader'
import TreeSidebar from './components/TreeSidebar'
import AIAssistant from './components/AIAssistant'
import SettingsModal from './components/SettingsModal'
import AuthModal from './components/AuthModal'
import OnboardingTour from './components/OnboardingTour'
import { LibraryProvider, TreeProvider, useTree } from './shared'
import { isAnimatedTheme, resolveAccent, updateSettings, useSettings } from './lib/settings'
import { activateWorkspaceFromInvite } from './lib/sharedWorkspace'
import { directionOf, useLocale } from './lib/i18n'

const SpaceBackground = lazy(() => import('./components/SpaceBackground'))

function Layout() {
  const locale = useLocale()
  const { accent: branchAccent } = useTree()
  const settings = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  const openSettings = useCallback((): void => setSettingsOpen(true), [])
  const closeSettings = useCallback((): void => setSettingsOpen(false), [])
  const openAuth = useCallback((): void => setAuthOpen(true), [])
  const closeAuth = useCallback((): void => setAuthOpen(false), [])
  const accent = resolveAccent(settings, branchAccent)

  useEffect(() => {
    activateWorkspaceFromInvite()
  }, [])

  return (
    <div lang={locale} dir={directionOf(locale)} data-view-mode={settings.viewMode} className="ui-app min-h-screen" style={{ '--accent': accent } as CSSProperties}>
      {isAnimatedTheme(settings.theme) && (
        <Suspense fallback={null}><SpaceBackground color={accent} theme={settings.theme} animationMode={settings.animationMode} /></Suspense>
      )}
      {settings.theme === 'space-static' && <div className="space-static" aria-hidden="true" />}

      <AppHeader accent={accent} viewMode={settings.viewMode} onToggleViewMode={() => updateSettings({
        viewMode: settings.viewMode === 'focus' ? 'compact' : settings.viewMode === 'compact' ? 'single-section' : 'focus',
      })} onOpenSettings={openSettings} onOpenAuth={openAuth} />
      <TreeSidebar />
      <AIAssistant />

      <SettingsModal open={settingsOpen} onClose={closeSettings} onRequestAuth={openAuth} />
      <AuthModal open={authOpen} onClose={closeAuth} />
      <OnboardingTour />
    </div>
  )
}

export default function App() {
  return (
    <LibraryProvider>
      <TreeProvider>
        <Layout />
      </TreeProvider>
    </LibraryProvider>
  )
}
