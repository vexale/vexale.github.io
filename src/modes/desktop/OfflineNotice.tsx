import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useDesktopMessages } from './i18n'

export default function OfflineNotice() {
  const messages = useDesktopMessages()
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)

  useEffect(() => {
    const markOnline = (): void => setOffline(false)
    const markOffline = (): void => setOffline(true)
    window.addEventListener('online', markOnline)
    window.addEventListener('offline', markOffline)
    return () => {
      window.removeEventListener('online', markOnline)
      window.removeEventListener('offline', markOffline)
    }
  }, [])

  if (!offline) return null
  return <p className="desk-offline-notice" role="status" aria-live="polite"><WifiOff size={15} aria-hidden="true" />{messages.shell.offlineNotice}</p>
}
