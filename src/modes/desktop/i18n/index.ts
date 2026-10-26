import { useLocale } from '../../../lib/i18n'
import { ar } from './ar'
import { en } from './en'

export type DesktopMessages = typeof en

export function useDesktopMessages(): DesktopMessages | typeof ar {
  const locale = useLocale()
  return locale === 'ar' ? ar : en
}
