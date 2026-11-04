# 3D Library App - Context & Roadmap

## 🎯 Overview
An interactive workspace for notes, files, projects, and tasks, with AI assistance and 3D visual spaces.

## 🚀 Active Stack
- React / Vite / TypeScript
- Tailwind CSS
- Roo Code AI Assistant (Gemini API)

## خطة التنفيذ على staging
- تمر طلبات المتصفح إلى Gemini عبر Supabase Edge Function فقط؛ يبقى Gemini API key سراً خادمياً ولا يُقرأ أو يُطبع ملف `.env` المحلي.
- السمات ثلاثية الأبعاد تستخدم Three.js، وتحترم إعداد تقليل الحركة، وتُحفظ خياراتها عبر مخزن الإعدادات الحالي.
- وضع التركيز المفرد يعرض القسم النشط وحده مع أداة تنقل واضحة بين الأقسام.

## حالة ميزة المساعد الذكي
- ملاحظات كل فرع تُحفظ محلياً في IndexedDB بمفتاح معرّف العقدة.
- المساعد الذكي يستدعي Supabase Edge Function، ولا يرسل مفتاح Gemini إلى المتصفح.
- تُرسل الملاحظات إلى Gemini فقط بعد ضغط المستخدم على إجراء المساعد.
- تتحقق الوظيفة من Google ID token بتوقيع Google والجمهور والانتهاء قبل طلب النموذج.
- تُحفظ أسرار Gemini وإعدادات الوظيفة في Supabase، لا في ملفات العميل.

## 📌 Rules for AI Agent
- Before making major code changes, update this context file.
- Work incrementally: write small, testable chunks of code.
- Always check .clinerules for UI/UX guidelines before rendering components.

## GitHub Pages Deployment
- The project is hosted at the root domain `https://vexale.github.io/` and Vite uses relative asset URLs (`base: './'`).
- GitHub Pages must publish a compiled Vite `dist` artifact, not the source `master` tree; serving `index.html` from source exposes `/src/main.tsx` and causes module MIME and public-asset 404 errors.
- The GitHub Actions workflow builds with `npm ci` and `npm run build`, then publishes `dist` with the Pages artifact/deploy actions.
