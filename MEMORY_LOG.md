# Project Memory Log & History

## 📝 Recent Progress
- [x] Configured Roo Code with Google Gemini API key.
- [x] Set up Taste Skill rules inside .clinerules.
- [x] Installed Playwright CLI testing package.
- [x] Created PROJECT_CONTEXT.md for project scope.
- [x] أُضيفت لوحة مساعد الذكاء الاصطناعي إلى محرر ملاحظات كل قسم: تلخيص، إنشاء أسئلة، وإجابات عن محتوى القسم.
- [x] أُنشئت Supabase Edge Function تتحقق من Google ID token وتستدعي Gemini دون كشف مفتاحه في المتصفح.
- [x] دُمج دعم مفتاح Supabase publishable مع الحفاظ على anon، وأُضيف تنبيه خصوصية قبل إرسال الملاحظات.

## 🐛 Known Issues & Lessons Learned
- يلزم ضبط أسرار `GEMINI_API_KEY` و`GOOGLE_CLIENT_ID` و`ALLOWED_ORIGINS` في Supabase ونشر الوظيفة لتفعيل الاستدعاءات الفعلية.
- تعذّر تشغيل البناء وESLint لأن جلسة الطرفية المحلية غير متاحة في هذا التشغيل؛ ظهرت الواجهة المحدّثة في المتصفح ولم تسجل أخطاء JavaScript.

## 🎯 Next Steps
- ضبط `VITE_SUPABASE_URL` ومفتاح `VITE_SUPABASE_PUBLISHABLE_KEY` أو `VITE_SUPABASE_ANON_KEY` محلياً إذا لم يكونا مضبوطين، ثم نشر وظيفة `notes-ai` وإعادة فحص البناء والوظيفة.
