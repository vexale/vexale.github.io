export type LocalizedText = { en: string; ar: string }

export type LegalSection = {
  heading: LocalizedText
  paragraphs: LocalizedText[]
}

export type LegalDocument = {
  summary: LocalizedText
  sections: LegalSection[]
}

export const LAST_UPDATED: LocalizedText = {
  en: 'October 29, 2026',
  ar: '29 أكتوبر 2026',
}

export const content: Record<'privacy' | 'terms', LegalDocument> = {
  privacy: {
    summary: {
      en: 'Vexale keeps your study workspace focused, transparent, and under your control.',
      ar: 'تحافظ Vexale على مساحة دراستك مركزة وشفافة وتحت سيطرتك.',
    },
    sections: [
      {
        heading: { en: 'Information stored on your device', ar: 'المعلومات المحفوظة على جهازك' },
        paragraphs: [{
          en: 'Sections, notes, preferences, and locally added files are stored in your browser on this device. Clearing local site data can remove this information.',
          ar: 'تُحفظ الأقسام والملاحظات والتفضيلات والملفات المضافة محلياً في متصفحك على هذا الجهاز. قد يؤدي مسح بيانات الموقع المحلية إلى إزالة هذه المعلومات.',
        }],
      },
      {
        heading: { en: 'Account and shared workspaces', ar: 'الحسابات ومساحات العمل المشتركة' },
        paragraphs: [{
          en: 'If you sign in or create a shared workspace, the services needed for authentication and collaboration receive the information required to provide those features.',
          ar: 'عند تسجيل الدخول أو إنشاء مساحة عمل مشتركة، تستقبل الخدمات اللازمة للمصادقة والتعاون المعلومات المطلوبة لتوفير هذه الميزات.',
        }],
      },
      {
        heading: { en: 'Your choices', ar: 'خياراتك' },
        paragraphs: [{
          en: 'You can disable anonymous analytics in this page and delete local data from the Account page. AI requests are sent only when you explicitly submit an AI action.',
          ar: 'يمكنك تعطيل التحليلات المجهولة من هذه الصفحة وحذف البيانات المحلية من صفحة الحساب. لا تُرسل طلبات الذكاء الاصطناعي إلا عند إرسال إجراء ذكاء اصطناعي صراحةً.',
        }],
      },
    ],
  },
  terms: {
    summary: {
      en: 'These terms describe the basic use of the Vexale study workspace.',
      ar: 'توضح هذه الشروط الاستخدام الأساسي لمساحة دراسة Vexale.',
    },
    sections: [
      {
        heading: { en: 'Use of the workspace', ar: 'استخدام مساحة العمل' },
        paragraphs: [{
          en: 'Use Vexale for lawful study and productivity purposes. You are responsible for the content you add and the people you invite to shared workspaces.',
          ar: 'استخدم Vexale لأغراض الدراسة والإنتاجية المشروعة. أنت مسؤول عن المحتوى الذي تضيفه والأشخاص الذين تدعوهم إلى مساحات العمل المشتركة.',
        }],
      },
      {
        heading: { en: 'AI-assisted features', ar: 'ميزات الذكاء الاصطناعي' },
        paragraphs: [{
          en: 'AI output may be incomplete or inaccurate. Review generated content before relying on it for important decisions or submissions.',
          ar: 'قد تكون مخرجات الذكاء الاصطناعي ناقصة أو غير دقيقة. راجع المحتوى المُنشأ قبل الاعتماد عليه في القرارات أو الإرساليات المهمة.',
        }],
      },
      {
        heading: { en: 'Changes and support', ar: 'التغييرات والدعم' },
        paragraphs: [{
          en: 'Features may change as Vexale improves. Contact support if you need help or want to request deletion of account-related data.',
          ar: 'قد تتغير الميزات مع تطوير Vexale. تواصل مع الدعم إذا احتجت إلى مساعدة أو رغبت في طلب حذف البيانات المرتبطة بالحساب.',
        }],
      },
    ],
  },
}
