-- ============================================================
-- allow_exercise_posts_update.sql
-- السبب: تعديل التمارين/الفيديوهات كان «ينجح» في الواجهة لكن قاعدة
-- البيانات تتجاهله بصمت. يحدث هذا حين يكون RLS مفعّلاً على الجدول
-- بدون سياسة UPDATE (سياسة الإدراج لا تمنحك حق التحديث — كل سياسة
-- مستقلة عن الأخرى في Postgres).
--
-- هذا الملف آمن: ينشئ سياسة التحديث فقط إن كان RLS مفعّلاً فعلاً
-- وبدون أي سياسة UPDATE موجودة أصلاً. إن كان RLS غير مفعّل أو
-- توجد سياسة بالفعل فلا يغيّر شيئاً.
--
-- طريقة الاستعمال: Supabase → SQL Editor → الصق الملف → Run
-- (بديل بديل: ضبط مفتاح SUPABASE_SERVICE_ROLE_KEY في بيئة التشغيل
--  على Render/Railway يتجاوز RLS كلياً من جهة الخادم)
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename = 'exercise_posts'
          AND rowsecurity = true
    )
    AND NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'exercise_posts'
          AND cmd = 'UPDATE'
    ) THEN
        CREATE POLICY "exercise_posts_update_allowed" ON public.exercise_posts
            FOR UPDATE USING (true) WITH CHECK (true);
        RAISE NOTICE 'تم إنشاء سياسة UPDATE على exercise_posts — التعديلات ستُحفظ الآن';
    ELSE
        RAISE NOTICE 'RLS غير مفعّل على exercise_posts أو توجد سياسة UPDATE بالفعل — لا حاجة لهذا الإصلاح';
    END IF;
END $$;
