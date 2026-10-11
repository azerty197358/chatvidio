-- =============================================================================
--  إيقاف النقاط المجانية للذكاء الاصطناعي
-- =============================================================================
--  الكود أصبح يبدأ كل حساب جديد بصفر، لكن قيمة المنح اليومي تُقرأ من
--  platform_settings / revenue_settings. إن كانت محفوظة فيها بقيمة أكبر من
--  صفر فستظل تُمنح. هذا السكربت يصفّرها.
--
--  ملاحظة: هذا لا يمسّ رصيد أي مستخدم. من اشترى نقاطاً يحتفظ بها.
--  لتصفير رصيد الجميع أيضاً (خطوات اختيارية في آخر الملف) راجع التعليقات.
--
--  التشغيل: Supabase > SQL Editor > New query > الصق > Run
-- =============================================================================

-- 1) تصفير المنح اليومي داخل إعداد المنصة المحفوظ
UPDATE platform_settings
SET value = jsonb_set(
             jsonb_set(
               COALESCE(value, '{}'::jsonb),
               '{student_free_ai_points}', '0'::jsonb, true
             ),
             '{teacher_free_ai_points}', '0'::jsonb, true
           ),
    updated_at = NOW()
WHERE key = 'revenue_settings';

-- 2) صفRow واحد للتأكد
SELECT key,
       value -> 'student_free_ai_points' AS student_free_ai_points,
       value -> 'teacher_free_ai_points' AS teacher_free_ai_points
FROM platform_settings
WHERE key = 'revenue_settings';

-- 3) قيمة صريحة للمجموعات المجانية: صفر
--    (نفس المنطق لو كان لديك مصدر آخر للمنح المجاني)
UPDATE platform_settings
SET value = jsonb_set(COALESCE(value, '{}'::jsonb), '{gift_box_free_ai_points}', '0'::jsonb, true),
    updated_at = NOW()
WHERE key = 'revenue_settings';

-- =============================================================================
--  خطوات اختيارية - لا تشغّلها إلا إذا أردت تصفير رصيد المستخدمين أيضاً
-- =============================================================================
--  تحذير: هذا يمحو ما اشتراه الناس.
--
-- UPDATE students SET ai_tokens = 0, last_ai_reset = NULL WHERE ai_tokens > 0;
-- UPDATE teachers SET ai_tokens = 0, last_ai_reset = NULL WHERE ai_tokens > 0;
--
--  أو ترحيل المنح المجاني إلى 3 نقاط بدل صفر (عكس ما طلبته):
--
-- UPDATE platform_settings
-- SET value = jsonb_set(
--              jsonb_set(COALESCE(value,'{}'::jsonb), '{student_free_ai_points}', '3'::jsonb, true),
--              '{teacher_free_ai_points}', '3'::jsonb, true),
--     updated_at = NOW()
-- WHERE key = 'revenue_settings';
-- =============================================================================