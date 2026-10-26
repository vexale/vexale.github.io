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
const DesktopApp = lazy(() => import('./modes/desktop/DesktopApp'))

type WorkspaceMode = 'space' | 'office'
const WORKSPACE_MODE_KEY = 'vexale-workspace-mode-v1'

function readWorkspaceMode(): WorkspaceMode {
  if (typeof window === 'undefined') return 'space'
  try {
    return window.localStorage.getItem(WORKSPACE_MODE_KEY) === 'office' ? 'office' : 'space'
  } catch {
    return 'space'
  }
}

function WorkspaceRouter() {
  const [mode, setMode] = useState<WorkspaceMode>(readWorkspaceMode)
  const selectMode = useCallback((nextMode: WorkspaceMode): void => {
    setMode(nextMode)
    try {
      window.localStorage.setItem(WORKSPACE_MODE_KEY, nextMode)
    } catch {
      // يبقى تبديل الوضع فعالاً خلال الجلسة عند تعذر التخزين.
    }
  }, [])
  const switchToOffice = useCallback((): void => selectMode('office'), [selectMode])
  const switchToSpace = useCallback((): void => selectMode('space'), [selectMode])

  return mode === 'office'
    ? <Suspense fallback={null}><DesktopApp onSwitchToSpace={switchToSpace} /></Suspense>
    : <Layout onSwitchToOffice={switchToOffice} />
}

function Layout({ onSwitchToOffice }: { onSwitchToOffice: () => void }) {
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

      <AppHeader accent={accent} viewMode={settings.viewMode} onSwitchToOffice={onSwitchToOffice} onToggleViewMode={() => updateSettings({
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
        <WorkspaceRouter />
      </TreeProvider>
    </LibraryProvider>
  )
}
