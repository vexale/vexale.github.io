import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.tsx'
import GlobalErrorBoundary from './components/GlobalErrorBoundary'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}

const rootElement = document.getElementById('root')
const landingElement = document.getElementById('vexale-landing')
const bootElement = document.getElementById('vexale-boot')
if (!rootElement) throw new Error('Application root is missing')

const root = createRoot(rootElement)
let previousAppState: boolean | undefined

function syncAppRoute(): void {
  const isAppRoute = window.location.hash.startsWith('#/')
  if (previousAppState === isAppRoute) return
  previousAppState = isAppRoute
  document.documentElement.dataset.vexaleView = isAppRoute ? 'app' : 'landing'
  rootElement.hidden = !isAppRoute
  if (landingElement) landingElement.hidden = isAppRoute
  if (bootElement) bootElement.hidden = !isAppRoute
  root.render(
    isAppRoute ? (
      <StrictMode>
        <GlobalErrorBoundary>
          <App />
        </GlobalErrorBoundary>
      </StrictMode>
    ) : null,
  )
  if (bootElement) bootElement.hidden = true
}

syncAppRoute()
window.addEventListener('hashchange', syncAppRoute)
