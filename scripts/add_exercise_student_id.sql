-- ============================================================
-- 🎬 دعم فيديوهات الطلاب داخل قسم الدروس والتمارين
--    يضيف عمود student_id لتمييز منشورات الطلاب (الفيديوهات)
--    عن منشورات الأساتذة — شغّل هذا الملف مرة واحدة من
--    Supabase → SQL Editor → New query → Run
--    (إن لم يُشغَّل تعمل الميزة أيضاً: فيديوهات الطلاب تُحفظ
--     بدون عمود الملكية ولا يمكنهم تعديلها أو حذفها لاحقاً)
-- ============================================================

ALTER TABLE exercise_posts ADD COLUMN IF NOT EXISTS student_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_exercise_posts_student_id ON exercise_posts(student_id);
