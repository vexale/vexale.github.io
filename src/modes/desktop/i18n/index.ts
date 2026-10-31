import { useLocale } from '../../../lib/i18n'
import { ar } from './ar'
import { en } from './en'

const messages = { en, ar }
export type DesktopMessages = typeof messages.en

export function useDesktopMessages(): DesktopMessages | typeof messages.ar {
  const locale = useLocale()
  return locale === 'ar' ? messages.ar : messages.en
}
