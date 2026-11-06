# نتائج تدقيق المزامنة (SYNC-0)

## أماكن البيانات الحالية

| النوع | المصدر المحلي الحالي | ملاحظات الترحيل والمزامنة |
|---|---|---|
| الأقسام والفروع | `localStorage`، المفتاح `atelier-tree-v1`، في `src/shared.tsx` | شجرة متداخلة؛ الحذف يزيل العقدة من الشجرة مباشرة. يجب تحويل العقد إلى عناصر مستقلة ذات طوابع تحديث وعلامات حذف، مع الحفاظ على الشجرة الحالية للنسخة القديمة عند الترحيل. |
| المسار المفتوح | `localStorage`، المفتاح `atelier-path-v1`، في `src/shared.tsx` | حالة عرض محلية وليست محتوى مكتبة، فلا ينبغي مزامنتها افتراضياً. |
| الملاحظات | `IndexedDB`، قاعدة `atelier-library`، مخزن `notes`، مفتاح العقدة `nodeId` في `src/db.ts` | السجل يتضمن `updatedAt` بالفعل، لكنه لا يتضمن مالكاً أو علامة حذف؛ محررا الملاحظات المكتبي والمحمول يستخدمان واجهات التخزين نفسها. |
| المهام | `localStorage`، المفتاح `vexale-task-tree-v1`، في `src/modes/desktop/taskStore.ts` | الحذف يزيل المهمة وفروعها من المصفوفة. توجد عمليات استبدال وتراجع/إعادة، لذا يجب تسجيل التعديلات في طبقة واحدة كي لا تفوت الطابور. |
| الملفات وبياناتها | `IndexedDB`، قاعدة `atelier-library`، مخزن `items` في `src/db.ts` | الملف نفسه محفوظ كـ `File` مع المعرّف والقسم والاسم والنوع والحجم ووقت الإنشاء. مكوّن المكتبة يزيل السجلات فعلياً عند الحذف حالياً. |
| نصوص OCR | قاعدة `atelier-library`، مخزن `ocr` في `src/db.ts` | مفاتيحها معرّفات الملفات، وتُحفظ معها `updatedAt`؛ يجب أن تتبع namespace ورفع metadata دون إسقاط النص. |
| بطاقات المراجعة وسلسلة الأيام | `localStorage`، المفتاحان `vexale-review-cards-v1` و`vexale-review-streak-v1`، في `src/lib/reviewCards.ts` | البطاقات قابلة للتعديل/الحذف ضمنياً عبر إعادة الحفظ؛ سلسلة الأيام مؤشر مشتق/تفضيل محلي منفصل. |
| التفضيلات | مفاتيح متعددة: `vexale-office-preferences-v1` في `src/modes/desktop/preferences.ts`، و`atelier-settings-v1` و`atelier-appearance-v1` في `src/lib/settings.ts`، إلى جانب مخازن أدوات/تركيز أخرى | يلزم تحديد مجموعة التفضيلات التي تُزامن كعناصر `preferences` مع إبقاء بيانات الجلسة ومؤشرات العرض المحلية خارجها. |
| سلة المحذوفات | قاعدة `IndexedDB` مستقلة `atelier-trash`، المخزن `entries` في `src/lib/trash.ts` | تضم القسم المحذوف وفروعه وبيانات الملفات/ملفاتها، وتنتهي صلاحيتها بعد 30 يوماً؛ الإزالة النهائية وإفراغ السلة يحذفان سجلات محلياً. يجب تمثيل الحذف المتزامن بعلامة حذف لا بإسقاط tombstone. |

## حالة تسجيل الدخول وسبب التناقض

- `src/lib/googleAuth.ts` يملك متجراً مستقلاً (`useGoogleAuth`). يحفظ بيانات الملف الشخصي في `sessionStorage` مع إزالة أثر المفتاح القديم من `localStorage`، ويحتفظ برمز Google في الذاكرة فقط.
- واجهة الحساب في `src/modes/desktop/DesktopPages.tsx` تعتمد `useGoogleAuth()` لعرض اسم وصورة المستخدم وزر تسجيل الخروج. لذلك قد تعرض المستخدم مسجلاً دخوله استناداً إلى حالة Google المحلية.
- `src/lib/supabase.ts` ينشئ متجراً آخر عبر `useAuth()` ويستعيد جلسة Supabase من `sessionStorage`، لكن تدفق Google الحالي لا يستدعي `supabase.auth.signInWithIdToken`. نتيجة ذلك لا توجد هوية `auth.uid()` مرتبطة بتسجيل Google، وقد تُظهر أجزاء التطبيق التي تعتمد على Supabase حالة دخول مختلفة.
- Google Identity Services تُحمّل عبر `loadGsi()`، ثم يستدعي `renderGoogleButton()` الدالة `initialize()` عند كل رسم زر؛ لا توجد حراسة مشتركة مضمونة تمنع تكرار التهيئة.
- `src/lib/libraryApi.ts` يمرر رمز Google مباشرة إلى وظيفة API، ومسار المشاركة موجود في `DesktopPages.tsx` و`sharedWorkspace.ts`. هذا مسار منفصل عن جلسة Supabase ولا يحقق نموذج المزامنة المطلوب.

## ملفات مرجعية للخطوات التالية

- الهوية والجلسة: `src/lib/googleAuth.ts`، `src/lib/supabase.ts`، `src/components/AuthModal.tsx`، `src/modes/desktop/DesktopPages.tsx`.
- أقسام وملاحظات وملفات وOCR: `src/shared.tsx`، `src/db.ts`، `src/components/NotesEditor.tsx`، `src/modes/desktop/DesktopNoteEditor.tsx`.
- مهام وتفضيلات وبطاقات وسلة: `src/modes/desktop/taskStore.ts`، `src/modes/desktop/preferences.ts`، `src/lib/settings.ts`، `src/lib/reviewCards.ts`، `src/lib/trash.ts`.
- المصادقة السحابية القديمة والمشاركة: `src/lib/libraryApi.ts`، `src/lib/sharedWorkspace.ts`، `supabase/functions/library-api/index.ts`.
- PWA: `src/lib/pwa.ts` و`public/sw.js`.

## حدود التدقيق

هذا تدقيق ساكن للشفرة فقط؛ لم تُقرأ ملفات البيئة أو مفاتيحها، ولم تُرسل طلبات إلى Supabase أو Google، ولم تُنفذ أي تغييرات على قاعدة البيانات.