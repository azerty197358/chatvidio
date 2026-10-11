-- ============================================================
--  حذف نظام المحفظ الذكي بالكامل
--  نفّذ هذا الملف في Supabase SQL Editor
--  آمن للتشغيل أكثر من مرة
-- ============================================================

-- 1) محرّك التكيّف (3 مراحل)
DROP TABLE IF EXISTS public.memo_attempts            CASCADE;
DROP TABLE IF EXISTS public.memo_challenge_items     CASCADE;
DROP TABLE IF EXISTS public.memo_mastered_words      CASCADE;
DROP TABLE IF EXISTS public.memo_student_level       CASCADE;

-- 2) خطة الحفظ اليومية
DROP TABLE IF EXISTS public.student_memo_daily_plan   CASCADE;
DROP TABLE IF EXISTS public.student_memo_daily_result CASCADE;

-- 3) سجلات التسميع النطق
DROP TABLE IF EXISTS public.student_memorization_progress CASCADE;
DROP TABLE IF EXISTS public.student_practice_sessions     CASCADE;
DROP TABLE IF EXISTS public.user_memorization_lessons     CASCADE;

-- 4) أي دوال أو عروض أو فهارس تخص الجداول المحذوفة اختفت معها
--    تلقائياً بسبب CASCADE أعلاه.

-- ============================================================
--  للتأكد من نجاح الحذف، نفّذ هذا الاستعلام بعده:
--
--  SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public'
--    AND table_name LIKE 'memo%'
--       OR table_name LIKE '%memorization%'
--       OR table_name LIKE '%practice_sessions%';
--
--  النتيجة المتوقعة: لا صفوف.

-- ============================================================
--  ملاحظة: بعد تنفيذ هذا الملف ارفع الخادم على Render مجدداً
--  حتى تُحذف المسارات من routes/student.js في الإنتاج.
-- ============================================================