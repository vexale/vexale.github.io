import { useLocale } from '../../../lib/i18n'
import { ar } from './ar'
import { en } from './en'

const messages = { en, ar }
type WidenMessages<T> = T extends readonly (infer U)[]
  ? ReadonlyArray<WidenMessages<U>>
  : T extends object
    ? { [K in keyof T]: WidenMessages<T[K]> }
    : string
export type DesktopMessages = WidenMessages<typeof messages.en>

export function useDesktopMessages(): DesktopMessages | typeof messages.ar {
  const locale = useLocale()
  return locale === 'ar' ? messages.ar : messages.en
}
