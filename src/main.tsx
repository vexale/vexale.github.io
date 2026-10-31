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
if (!rootElement) throw new Error('Application root is missing')

const root = createRoot(rootElement)
let previousAppState: boolean | undefined

function syncAppRoute(): void {
  const isAppRoute = window.location.hash.startsWith('#/')
  document.documentElement.dataset.vexaleView = isAppRoute ? 'app' : 'landing'
  rootElement.hidden = !isAppRoute
  if (landingElement) landingElement.hidden = isAppRoute

  if (previousAppState === isAppRoute) return
  previousAppState = isAppRoute
  root.render(
    isAppRoute ? (
      <StrictMode>
        <GlobalErrorBoundary>
          <App />
        </GlobalErrorBoundary>
      </StrictMode>
    ) : null,
  )
}

syncAppRoute()
window.addEventListener('hashchange', syncAppRoute)
