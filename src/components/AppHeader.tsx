import { useState } from 'react'
import { Columns3, Expand, Focus, Languages, Settings, UserRound } from 'lucide-react'
import { useGoogleAuth } from '../lib/googleAuth'
import { setLocale, tr, useLocale } from '../lib/i18n'
import type { ViewMode } from '../lib/settings'
import { sfx } from '../shared'

function ProfileBadge({ accent, onClick }: { accent: string; onClick: () => void }) {
  const locale = useLocale()
  const { user } = useGoogleAuth()
  const [brokenPicture, setBrokenPicture] = useState<string | null>(null)
  const avatar = user?.picture ?? ''
  const name = user?.name ?? ''
  const accountLabel = user ? tr(locale, `Account: ${name}`, `الحساب: ${name}`) : tr(locale, 'Guest account — sign in', 'حساب زائر — سجّل الدخول')

  return (
    <button type="button" data-tour="account" onClick={() => { sfx.click(); onClick() }} aria-label={accountLabel} title={user?.email ?? tr(locale, 'Sign in', 'تسجيل الدخول')} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pe-2 ps-1 transition hover:bg-white/10 active:scale-95 sm:pe-3">
      {user ? avatar && avatar !== brokenPicture ? (
        <img src={avatar} alt="" referrerPolicy="no-referrer" onError={() => setBrokenPicture(avatar)} className="h-7 w-7 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${accent}` }} />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-black" style={{ background: accent }}>{(name[0] ?? '?').toUpperCase()}</span>
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10"><UserRound size={15} /></span>
      )}
      <span className="hidden max-w-28 truncate text-xs sm:inline">{user ? name : tr(locale, 'Guest', 'زائر')}</span>
    </button>
  )
}

interface Props {
  accent: string
  viewMode: ViewMode
  onToggleViewMode: () => void
  onOpenSettings: () => void
  onOpenAuth: () => void
}

export default function AppHeader({ accent, viewMode, onToggleViewMode, onOpenSettings, onOpenAuth }: Props) {
  const locale = useLocale()
  const languageLabel = locale === 'en' ? 'العربية' : 'English'
  const modeLabel = viewMode === 'focus'
    ? tr(locale, 'Full', 'كامل')
    : viewMode === 'compact'
      ? tr(locale, 'Compact', 'مضغوط')
      : tr(locale, 'Single section', 'قسم واحد')
  const viewLabel = viewMode === 'focus'
    ? tr(locale, 'Switch to compact view', 'التبديل إلى العرض المضغوط')
    : viewMode === 'compact'
      ? tr(locale, 'Switch to single-section focus', 'التبديل إلى التركيز على قسم واحد')
      : tr(locale, 'Switch to full view', 'التبديل إلى العرض الكامل')
  const ViewIcon = viewMode === 'focus' ? Expand : viewMode === 'compact' ? Columns3 : Focus

  return (
    <header className="glass sticky top-0 z-20 rounded-none border-x-0 border-t-0">
      <div className="mx-auto flex h-14 w-full items-center justify-between gap-1 px-2 sm:gap-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={36} height={36} loading="eager" decoding="async" className="h-9 w-9 shrink-0 rounded-xl object-contain ring-1 ring-white/10 shadow-glow" />
          <h1 className="truncate bg-gradient-to-r from-violet-200 via-white to-sky-200 bg-clip-text text-lg font-semibold text-transparent sm:text-xl">vexale</h1>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button type="button" aria-label={tr(locale, 'Switch interface language', 'تبديل لغة الواجهة')} title={tr(locale, 'Switch language', 'تبديل اللغة')} onClick={() => { sfx.click(); setLocale(locale === 'en' ? 'ar' : 'en') }} className="flex h-11 min-w-11 items-center justify-center gap-0 rounded-full border border-white/10 bg-white/5 px-2 text-xs transition hover:bg-white/10 active:scale-95 sm:h-9 sm:min-w-0 sm:gap-1.5 sm:px-3">
            <Languages size={15} /><span className="hidden sm:inline">{languageLabel}</span>
          </button>
          <button type="button" aria-label={viewLabel} title={viewLabel} aria-pressed={viewMode === 'single-section'} onClick={() => { sfx.click(); onToggleViewMode() }} className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 text-xs transition hover:bg-white/10 active:scale-95 sm:h-9 sm:min-w-0 sm:px-3">
            <ViewIcon size={16} />
            <span className="hidden md:inline">{modeLabel}</span>
          </button>
          <button type="button" data-tour="settings" aria-label={tr(locale, 'Settings and support', 'الإعدادات والدعم')} aria-haspopup="dialog" title={tr(locale, 'Settings', 'الإعدادات')} onClick={() => { sfx.open(); onOpenSettings() }} className="group flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/10 active:scale-95 sm:h-9 sm:w-9">
            <Settings size={17} className="transition-transform duration-300 group-hover:rotate-90" />
          </button>
          <ProfileBadge accent={accent} onClick={onOpenAuth} />
        </div>
      </div>
    </header>
  )
}
