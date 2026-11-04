import { getGoogleIdToken } from './googleAuth'
import type { Locale } from './i18n'
import { supabase } from './supabase'

export type StudyAction = 'summarize' | 'quiz' | 'answer' | 'theme'

export interface StudyAIRequest {
  action: StudyAction
  nodeTitle: string
  notes: string
  question?: string
  language?: Locale
  questionCount?: number
}

interface StudyAIResponse {
  answer?: unknown
  error?: unknown
}

const MAX_NOTE_CHARACTERS = 16_000
const MAX_QUESTION_CHARACTERS = 1_200
const genericArabicError = 'تعذّر إكمال طلب الذكاء الاصطناعي. تحقّق من الاتصال ونشر وظيفة notes-ai وإعداد أسرارها في Supabase.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function getServerErrorMessage(error: unknown): Promise<string | null> {
  if (!isRecord(error) || !(error.context instanceof Response)) return null
  try {
    const responseBody: unknown = await error.context.clone().json()
    return isRecord(responseBody) && typeof responseBody.error === 'string' ? responseBody.error : null
  } catch {
    return null
  }
}

function localizeServerError(message: string | null, language: Locale): string {
  if (language !== 'ar') return message ?? 'Something interrupted the request. Please try again.'
  const normalized = message?.toLowerCase() ?? ''
  if (normalized.includes('sign in') || normalized.includes('google session')) return 'سجّل الدخول بحساب Google أو أعد الاتصال لاستخدام المساعد.'
  if (normalized.includes('origin') || normalized.includes('workspace origin')) return 'عنوان الموقع غير مسموح به في إعداد ALLOWED_ORIGINS داخل Supabase.'
  if (normalized.includes('prepared') || normalized.includes('try again soon')) return 'خدمة المساعد لم تكتمل تهيئتها. تحقّق من أسرار Gemini وGoogle في إعداد Supabase.'
  if (normalized.includes('notes') || normalized.includes('passage')) return 'أضف ملاحظات أو اختر مقطعاً أقصر ثم أعد المحاولة.'
  if (normalized.includes('question')) return 'أدخل سؤالاً واضحاً ومحدداً ثم أعد المحاولة.'
  if (normalized.includes('verified google')) return 'استخدم حساب Google موثّقاً ثم أعد تسجيل الدخول.'
  return genericArabicError
}

export async function requestStudyAI(request: StudyAIRequest): Promise<string> {
  const language = request.language ?? 'en'
  const message = (english: string, arabic: string): string => language === 'ar' ? arabic : english
  const googleIdToken = getGoogleIdToken()
  if (!googleIdToken) throw new Error(message('Sign in or reconnect your Google account to continue.', 'سجّل الدخول بحساب Google أو أعد الاتصال للمتابعة.'))
  if (!supabase) throw new Error(message('AI tools are not configured yet. Check the Supabase public URL and key.', 'لم يتم إعداد اتصال Supabase بعد. تحقّق من رابط المشروع ومفتاحه العام.'))

  const notes = request.notes.trim()
  const question = request.question?.trim() ?? ''
  if (request.action !== 'theme' && notes.length > MAX_NOTE_CHARACTERS) {
    throw new Error(message('Choose a focused passage to work with.', 'اختر مقطعاً أقصر للعمل عليه.'))
  }
  if (request.action !== 'answer' && request.action !== 'theme' && !notes) {
    throw new Error(message('Add some notes to this section to get started.', 'أضف بعض الملاحظات إلى هذا القسم أولاً.'))
  }
  if (request.action === 'answer' && !question) {
    throw new Error(message('What would you like to explore?', 'اكتب السؤال الذي تريد استكشافه.'))
  }
  if (request.action === 'answer' && question.length > MAX_QUESTION_CHARACTERS) {
    throw new Error(message('Could you make your question a little more focused?', 'اختصر السؤال واجعله أكثر تحديداً.'))
  }
  if (request.action === 'quiz' && request.questionCount !== undefined && (!Number.isInteger(request.questionCount) || request.questionCount < 2 || request.questionCount > 30)) {
    throw new Error(message('Choose between 2 and 30 questions.', 'اختر عدداً بين سؤالين و30 سؤالاً.'))
  }

  const { data, error } = await supabase.functions.invoke<StudyAIResponse>('notes-ai', {
      body: {
        action: request.action,
        nodeTitle: request.nodeTitle,
        notes,
        question,
        language,
        questionCount: request.questionCount,
      },
      headers: { Authorization: `Bearer ${googleIdToken}` },
    }).catch(async requestError => {
    const serverMessage = await getServerErrorMessage(requestError)
    throw new Error(localizeServerError(serverMessage, language), { cause: requestError })
  })

  if (error) {
    const serverMessage = await getServerErrorMessage(error)
    throw new Error(localizeServerError(serverMessage, language))
  }
  if (!data || typeof data.answer !== 'string' || !data.answer.trim()) {
    const message = typeof data?.error === 'string' ? data.error : ''
    throw new Error(localizeServerError(message || null, language))
  }
  return data.answer.trim()
}
