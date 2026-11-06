import { AlertTriangle, Check, CloudOff, RefreshCw } from 'lucide-react'
import { tr, useLocale } from '../lib/i18n'
import { retrySyncNow, useSyncStatus } from '../lib/sync'

export default function SyncStatusChip() {
  const locale = useLocale()
  const status = useSyncStatus()
  const label = status.phase === 'syncing'
    ? tr(locale, 'Syncing', 'جارٍ المزامنة')
    : status.phase === 'error'
      ? tr(locale, 'Sync error — retry', 'خطأ في المزامنة — أعد المحاولة')
      : status.phase === 'offline'
        ? tr(locale, 'Offline — saved on this device', 'دون اتصال — محفوظ على هذا الجهاز')
        : tr(locale, 'Synced', 'تمت المزامنة')
  const Icon = status.phase === 'syncing' ? RefreshCw : status.phase === 'error' ? AlertTriangle : status.phase === 'offline' ? CloudOff : Check

  return (
    <button
      type="button"
      onClick={retrySyncNow}
      aria-label={label}
      title={status.error ?? label}
      className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 text-xs transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-3"
      style={{ color: 'var(--accent)' }}
    >
      <Icon size={15} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
      {status.pendingCount > 0 && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">{status.pendingCount}</span>}
    </button>
  )
}
