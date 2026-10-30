import type { ThemeId } from '../lib/settings'

export type SetupMode = 'space' | 'office'
export type SetupTemplateId = 'semester' | 'exam-week' | 'graduation' | 'blank'
export type SetupLocale = 'en' | 'ar'
export interface LocalizedText { en: string; ar: string }
export interface StarterTask { title: LocalizedText; children?: readonly StarterTask[] }
export interface SetupTemplate { id: SetupTemplateId; title: LocalizedText; description: LocalizedText; sections: readonly LocalizedText[]; tasks: readonly StarterTask[] }
export interface SpaceThemeChoice { id: ThemeId; title: LocalizedText; swatch: string }

export const FIRST_RUN_COPY = {
  en: {
    eyebrow: 'VEXALE · WORKSPACE SETUP',
    title: 'Set up your workspace',
    description: 'Choose a language, a place to work, and a starting point. You can change these later.',
    skip: 'Skip setup',
    back: 'Back',
    next: 'Continue',
    finish: 'Create workspace',
    languageStep: 'Language',
    modeStep: 'Mode',
    themeStep: 'Theme',
    templateStep: 'Template',
    languageTitle: 'Choose your language',
    languageDescription: 'This changes the language used throughout the workspace.',
    english: 'English',
    arabic: 'العربية',
    modeTitle: 'Where would you like to work?',
    modeDescription: 'Choose your starting view. You can switch between them at any time.',
    spaceTitle: 'Space',
    spaceDescription: 'A visual study space for notes, files, and study tools.',
    officeTitle: 'Office',
    officeDescription: 'A structured workspace for sections, tasks, and planning.',
    themeTitle: 'Choose a theme',
    spaceThemeDescription: 'Space themes shape the study canvas and its atmosphere.',
    officeThemeDescription: 'Office themes style your focused planning workspace.',
    templateTitle: 'Choose a starting template',
    templateDescription: 'Templates add sections and a starter task tree. Blank adds no template content.',
    sectionsLabel: 'sections',
    tasksLabel: 'starter tasks',
    taskLimit: 'This template would exceed the 200-task limit. Choose Blank or remove tasks first.',
    selected: 'Selected',
    stepOf: 'Step',
    of: 'of',
  },
  ar: {
    eyebrow: 'VEXALE · إعداد مساحة العمل',
    title: 'أعدّ مساحة عملك',
    description: 'اختر اللغة ومكان العمل ونقطة البداية. يمكنك تغيير هذه الخيارات لاحقاً.',
    skip: 'تخطي الإعداد',
    back: 'رجوع',
    next: 'متابعة',
    finish: 'إنشاء مساحة العمل',
    languageStep: 'اللغة',
    modeStep: 'الوضع',
    themeStep: 'السمة',
    templateStep: 'القالب',
    languageTitle: 'اختر اللغة',
    languageDescription: 'سيغيّر ذلك لغة مساحة العمل بأكملها.',
    english: 'English',
    arabic: 'العربية',
    modeTitle: 'أين تريد العمل؟',
    modeDescription: 'اختر طريقة العرض عند البدء. يمكنك التبديل بينهما في أي وقت.',
    spaceTitle: 'Space',
    spaceDescription: 'مساحة دراسة مرئية للملاحظات والملفات وأدوات الدراسة.',
    officeTitle: 'المكتب',
    officeDescription: 'مساحة منظمة للأقسام والمهام والتخطيط.',
    themeTitle: 'اختر سمة',
    spaceThemeDescription: 'تحدد سمات Space مظهر مساحة الدراسة وأجواءها.',
    officeThemeDescription: 'تحدد سمات المكتب مظهر مساحة التخطيط المركزة.',
    templateTitle: 'اختر قالب البداية',
    templateDescription: 'تضيف القوالب أقساماً وشجرة مهام أولية. لا يضيف القالب الفارغ أي محتوى جاهز.',
    sectionsLabel: 'أقسام',
    tasksLabel: 'مهام أولية',
    taskLimit: 'سيتجاوز هذا القالب حد 200 مهمة. اختر «فارغ» أو احذف بعض المهام أولاً.',
    selected: 'محدد',
    stepOf: 'الخطوة',
    of: 'من',
  },
} as const

export const SPACE_THEME_CHOICES: readonly SpaceThemeChoice[] = [
  { id: 'space-live', title: { en: 'Live cosmos', ar: 'فضاء متحرك' }, swatch: '#7760c7' },
  { id: 'wave-field', title: { en: 'Particle waves', ar: 'موجات الجسيمات' }, swatch: '#25a6bd' },
  { id: 'orbit-drift', title: { en: 'Orbit drift', ar: 'مدارات متحركة' }, swatch: '#9770d0' },
  { id: 'liquid-velvet', title: { en: 'Liquid velvet', ar: 'مخمل سائل' }, swatch: '#c278a0' },
  { id: 'pastel-waves', title: { en: 'Pastel waves', ar: 'موجات باستيل' }, swatch: '#c99ddb' },
  { id: 'botanical-flow', title: { en: 'Botanical flow', ar: 'انسياب نباتي' }, swatch: '#68a784' },
  { id: 'rose-nebula', title: { en: 'Rose nebula', ar: 'سديم الورد' }, swatch: '#d579a5' },
  { id: 'moonlit-bloom', title: { en: 'Moonlit bloom', ar: 'زهر قمري' }, swatch: '#9a9ccc' },
  { id: 'cyber-grid', title: { en: 'Cyber grid', ar: 'شبكة سيبرانية' }, swatch: '#32bfb5' },
  { id: 'geometric-matrix', title: { en: 'Geometric matrix', ar: 'مصفوفة هندسية' }, swatch: '#75ac7e' },
  { id: 'tech-pulse', title: { en: 'Tech pulse', ar: 'نبض تقني' }, swatch: '#d89c4c' },
  { id: 'nova-drive', title: { en: 'Nova drive', ar: 'محرك نوفا' }, swatch: '#d97558' },
  { id: 'star-forge', title: { en: 'Star forge', ar: 'مسبك النجوم' }, swatch: '#82b2db' },
  { id: 'space-static', title: { en: 'Quiet cosmos', ar: 'فضاء هادئ' }, swatch: '#7887c4' },
  { id: 'solid', title: { en: 'Midnight', ar: 'منتصف الليل' }, swatch: '#596070' },
  { id: 'cats', title: { en: 'Velvet cats', ar: 'قطط مخملية' }, swatch: '#bd8b77' },
  { id: 'floral', title: { en: 'Rose garden', ar: 'حديقة الورد' }, swatch: '#c57e9c' },
  { id: 'butterflies', title: { en: 'Butterfly dusk', ar: 'غسق الفراشات' }, swatch: '#9699d3' },
  { id: 'dark-vintage', title: { en: 'Dark vintage', ar: 'عتيق داكن' }, swatch: '#aa874d' },
  { id: 'pastel-ai', title: { en: 'AI pastel studio', ar: 'استوديو باستيل AI' }, swatch: '#c88cb4' },
]

export const SETUP_TEMPLATES: readonly SetupTemplate[] = [
  {
    id: 'semester',
    title: { en: 'Semester plan', ar: 'خطة الفصل الدراسي' },
    description: { en: 'Organize courses, deadlines, weekly study, and exam review.', ar: 'نظّم المقررات والمواعيد والدراسة الأسبوعية ومراجعة الاختبارات.' },
    sections: [
      { en: 'Semester overview', ar: 'نظرة عامة على الفصل' },
      { en: 'Courses and materials', ar: 'المقررات والمواد' },
      { en: 'Assignments and deadlines', ar: 'الواجبات والمواعيد' },
      { en: 'Review and exams', ar: 'المراجعة والاختبارات' },
    ],
    tasks: [
      { title: { en: 'Prepare the semester', ar: 'الاستعداد للفصل' }, children: [
        { title: { en: 'List all courses', ar: 'إدراج المقررات' } },
        { title: { en: 'Add key dates', ar: 'إضافة المواعيد المهمة' } },
        { title: { en: 'Set weekly study blocks', ar: 'تحديد أوقات الدراسة الأسبوعية' } },
      ] },
      { title: { en: 'Build a weekly study rhythm', ar: 'إنشاء روتين دراسة أسبوعي' }, children: [
        { title: { en: 'Review notes after class', ar: 'مراجعة الملاحظات بعد المحاضرة' } },
        { title: { en: 'Check upcoming assignments', ar: 'متابعة الواجبات القادمة' } },
        { title: { en: 'Plan a weekly reset', ar: 'تخطيط مراجعة أسبوعية' } },
      ] },
      { title: { en: 'Prepare for assessments', ar: 'الاستعداد للتقييمات' }, children: [
        { title: { en: 'Collect practice questions', ar: 'جمع أسئلة التدريب' } },
        { title: { en: 'Schedule review sessions', ar: 'جدولة جلسات المراجعة' } },
      ] },
    ],
  },
  {
    id: 'exam-week',
    title: { en: 'Exam week', ar: 'أسبوع الاختبارات' },
    description: { en: 'Map exam dates, focused revision, and the day-of checklist.', ar: 'رتّب مواعيد الاختبارات والمراجعة المركزة وقائمة يوم الاختبار.' },
    sections: [
      { en: 'Exam schedule', ar: 'جدول الاختبارات' },
      { en: 'Revision plan', ar: 'خطة المراجعة' },
      { en: 'Exam-day checklist', ar: 'قائمة يوم الاختبار' },
    ],
    tasks: [
      { title: { en: 'Plan the week', ar: 'تخطيط الأسبوع' }, children: [
        { title: { en: 'Confirm exam dates and locations', ar: 'تأكيد مواعيد الاختبارات ومواقعها' } },
        { title: { en: 'Rank subjects by readiness', ar: 'ترتيب المواد حسب الاستعداد' } },
        { title: { en: 'Leave time between exams', ar: 'ترك وقت بين الاختبارات' } },
      ] },
      { title: { en: 'Revise each subject', ar: 'مراجعة كل مادة' }, children: [
        { title: { en: 'Break topics into sessions', ar: 'تقسيم الموضوعات إلى جلسات' } },
        { title: { en: 'Complete practice questions', ar: 'حل أسئلة تدريبية' } },
        { title: { en: 'Review mistakes and gaps', ar: 'مراجعة الأخطاء والثغرات' } },
      ] },
      { title: { en: 'Prepare for exam day', ar: 'الاستعداد ليوم الاختبار' }, children: [
        { title: { en: 'Pack required materials', ar: 'تجهيز المستلزمات المطلوبة' } },
        { title: { en: 'Plan travel and rest', ar: 'تخطيط التنقل والراحة' } },
      ] },
    ],
  },
  {
    id: 'graduation',
    title: { en: 'Graduation project', ar: 'مشروع التخرج' },
    description: { en: 'Move from project scope and research to build, review, and delivery.', ar: 'انتقل من تحديد النطاق والبحث إلى التنفيذ والمراجعة والتسليم.' },
    sections: [
      { en: 'Project brief', ar: 'موجز المشروع' },
      { en: 'Research and references', ar: 'البحث والمراجع' },
      { en: 'Build and milestones', ar: 'التنفيذ والمراحل' },
      { en: 'Review and delivery', ar: 'المراجعة والتسليم' },
    ],
    tasks: [
      { title: { en: 'Define the project', ar: 'تحديد المشروع' }, children: [
        { title: { en: 'Confirm topic and scope', ar: 'تأكيد الموضوع والنطاق' } },
        { title: { en: 'Agree on success criteria', ar: 'تحديد معايير النجاح' } },
        { title: { en: 'Set milestones and owners', ar: 'تحديد المراحل والمسؤولين' } },
      ] },
      { title: { en: 'Research and build', ar: 'البحث والتنفيذ' }, children: [
        { title: { en: 'Collect sources and references', ar: 'جمع المصادر والمراجع' } },
        { title: { en: 'Create a first prototype', ar: 'إنشاء نموذج أولي' } },
        { title: { en: 'Gather feedback', ar: 'جمع الملاحظات' } },
      ] },
      { title: { en: 'Prepare final delivery', ar: 'الاستعداد للتسليم النهائي' }, children: [
        { title: { en: 'Review project requirements', ar: 'مراجعة متطلبات المشروع' } },
        { title: { en: 'Draft the presentation', ar: 'إعداد مسودة العرض' } },
        { title: { en: 'Submit final files', ar: 'تسليم الملفات النهائية' } },
      ] },
    ],
  },
  {
    id: 'blank',
    title: { en: 'Blank', ar: 'فارغ' },
    description: { en: 'Start with no template sections or tasks.', ar: 'ابدأ من دون أقسام أو مهام جاهزة.' },
    sections: [],
    tasks: [],
  },
]

export function countStarterTasks(tasks: readonly StarterTask[]): number {
  return tasks.reduce((total, task) => total + 1 + countStarterTasks(task.children ?? []), 0)
}
