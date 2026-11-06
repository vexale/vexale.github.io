# إعداد المزامنة وتسجيل الدخول

هذه الخطوات مطلوبة مرة واحدة لتفعيل مزامنة Vexale عبر Supabase وتسجيل الدخول بواسطة Google.

## 1. تشغيل SQL

1. افتح مشروع Supabase الصحيح في لوحة التحكم.
2. افتح **SQL Editor** وأنشئ استعلاماً جديداً.
3. انسخ محتوى الملف `supabase/migrations/20261106101000_sync.sql` كاملاً إلى المحرر.
4. نفّذ الاستعلام عبر **Run**.
5. تحقق من إنشاء الجدول `public.sync_items` والحاوية الخاصة `vexale-files` ومن ظهور سياسات RLS الخاصة بهما.

لا تُشغّل ملف migration أكثر من مرة إذا كانت سياسات RLS موجودة مسبقاً، لأن أسماء السياسات ثابتة وقد ينتج عن ذلك خطأ duplicate policy. عند الحاجة، نفّذه على مشروع جديد أو أضف `drop policy if exists` يدوياً قبل إعادة التشغيل.

## 2. تفعيل Google في Supabase Auth

1. افتح **Authentication → Providers → Google**.
2. فعّل مزوّد **Google**.
3. أنشئ أو استخدم OAuth 2.0 Client ID من نوع **Web application** في Google Cloud Console.
4. الصق **Client ID** في حقل Supabase الخاص بـ Google.
5. الصق **Client Secret** في الحقل المقابل داخل Supabase، ثم احفظ الإعدادات.
6. في Google Cloud Console، أضف إلى **Authorized JavaScript origins** العناوين التالية حرفياً:
   - `http://localhost:5173`
   - `https://vexale.github.io`
7. في Google Cloud Console، أضف إلى **Authorized redirect URIs** عنوان إعادة التوجيه الخاص بـ Supabase، بصيغته الكاملة:
   - `https://<PROJECT-REF>.supabase.co/auth/v1/callback`
8. في Supabase افتح **Authentication → URL Configuration**، وأضف إلى **Redirect URLs**:
   - `http://localhost:5173`
   - `https://vexale.github.io`

استبدل `<PROJECT-REF>` بمعرّف مشروع Supabase الفعلي، ولا تضف مسافة أو شرطة مائلة زائدة. إذا كان التطبيق منشوراً بمسار GitHub Pages مثل `/3d-library-app/`، أضف أيضاً الأصل المستخدم فعلياً في المتصفح إلى Redirect URLs وفق إعداد النشر.

## 3. متغيرات البيئة

ضع القيم في بيئة التشغيل أو في ملف `.env` محلياً فقط؛ لا تضعها في المستودع ولا تعدّل هذا الملف لإضافة أسرار.

```dotenv
VITE_SUPABASE_URL=https://<PROJECT-REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<SUPABASE-PUBLISHABLE-KEY>
VITE_GOOGLE_CLIENT_ID=<GOOGLE-WEB-CLIENT-ID>.apps.googleusercontent.com
```

يقبل التطبيق `VITE_SUPABASE_PUBLISHABLE_KEY`، ويقبل `VITE_SUPABASE_ANON_KEY` كبديل قديم إذا لم يوجد المفتاح الأول. لا تستخدم service-role key في المتصفح.

بعد ضبط المتغيرات، أعد تشغيل خادم Vite أو أعد بناء النشر حتى يقرأ Vite القيم الجديدة.

## 4. السلوك عند توقف Supabase

يستمر التطبيق في العمل والحفظ المحلي عند توقف Supabase أو انقطاع الشبكة. تظهر حالة `الخادم غير متاح`، ولا توجد إعادة محاولة شبكية دورية؛ تتم المحاولة فقط عند ضغط زر الحالة، أو عند عودة الاتصال، أو عند تغيير البيانات/عودة التطبيق إلى الواجهة. البيانات المحلية لا تُفقد وتُرفع عند نجاح المحاولة التالية.
