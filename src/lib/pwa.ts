import { useSyncExternalStore } from 'react'

export interface PwaInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface PwaState {
  installPrompt: PwaInstallPromptEvent | null
  waitingRegistration: ServiceWorkerRegistration | null
  installed: boolean
}

function isStandalone(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const appleStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return appleStandalone || window.matchMedia('(display-mode: standalone)').matches
}

let state: PwaState = {
  installPrompt: null,
  waitingRegistration: null,
  installed: isStandalone(),
}
const listeners = new Set<() => void>()

function publish(update: Partial<PwaState>): void {
  state = { ...state, ...update }
  listeners.forEach(listener => listener())
}

export function subscribePwa(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPwaSnapshot(): PwaState {
  return state
}

export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribePwa, getPwaSnapshot, getPwaSnapshot)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    publish({ installPrompt: event as PwaInstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => publish({ installPrompt: null, installed: true }))
}

function exposeWaitingUpdate(registration: ServiceWorkerRegistration): void {
  if (registration.waiting && navigator.serviceWorker.controller) {
    publish({ waitingRegistration: registration })
  }
}

function watchRegistration(registration: ServiceWorkerRegistration): void {
  exposeWaitingUpdate(registration)
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    if (!installing) return
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') exposeWaitingUpdate(registration)
    })
  })
}

export function initializePwa(): void {
  if (import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const register = (): void => {
    const serviceWorkerUrl = new URL('/sw.js', window.location.origin).href
    const appScope = new URL('/app/', window.location.origin).href
    void navigator.serviceWorker.getRegistrations()
      .then(async registrations => {
        const legacyAppRegistrations = registrations.filter(registration =>
          registration.scope === appScope &&
          [registration.active, registration.waiting, registration.installing].some(worker => worker?.scriptURL === serviceWorkerUrl),
        )
        await Promise.all(legacyAppRegistrations.map(registration => registration.unregister()))
        return navigator.serviceWorker.register(serviceWorkerUrl, { scope: '/', updateViaCache: 'none' })
      })
      .catch(() => navigator.serviceWorker.register(serviceWorkerUrl, { scope: '/', updateViaCache: 'none' }))
      .then(watchRegistration)
      .catch(() => undefined)
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

export async function promptPwaInstall(): Promise<void> {
  const deferredPrompt = state.installPrompt
  if (!deferredPrompt) return
  publish({ installPrompt: null })
  try {
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
  } catch {
    // The browser controls whether and when installation is available.
  }
}

export function activatePwaUpdate(): void {
  const waitingWorker = state.waitingRegistration?.waiting
  if (!waitingWorker || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  publish({ waitingRegistration: null })
}
