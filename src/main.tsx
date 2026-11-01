import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import { initializePwa } from './lib/pwa'
import App from './App.tsx'
import GlobalErrorBoundary from './components/GlobalErrorBoundary'

initializePwa()

const rootElement = document.getElementById('root')
const landingElement = document.getElementById('vexale-landing')
const bootElement = document.getElementById('vexale-boot')
if (!rootElement) throw new Error('Application root is missing')

const root = createRoot(rootElement)
let previousAppState: boolean | undefined
let splashObserver: MutationObserver | null = null

function showSplashUntilMounted(): void {
  if (!bootElement) return
  splashObserver?.disconnect()
  bootElement.hidden = false
  const hideSplash = (): void => {
    if (rootElement.childElementCount === 0) return
    bootElement.hidden = true
    splashObserver?.disconnect()
    splashObserver = null
  }
  hideSplash()
  if (bootElement.hidden) return
  splashObserver = new MutationObserver(hideSplash)
  splashObserver.observe(rootElement, { childList: true, subtree: true })
}

function syncAppRoute(): void {
  const isAppRoute = window.location.pathname.startsWith('/app/') || window.location.hash.startsWith('#/')
  if (previousAppState === isAppRoute) return
  previousAppState = isAppRoute
  document.documentElement.dataset.vexaleView = isAppRoute ? 'app' : 'landing'
  rootElement.hidden = !isAppRoute
  if (landingElement) landingElement.hidden = isAppRoute
  if (!isAppRoute) {
    splashObserver?.disconnect()
    splashObserver = null
    if (bootElement) bootElement.hidden = true
    root.render(null)
    return
  }

  showSplashUntilMounted()
  root.render(
    <StrictMode>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </StrictMode>,
  )
}

syncAppRoute()
window.addEventListener('hashchange', syncAppRoute)
