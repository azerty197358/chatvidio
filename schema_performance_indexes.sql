-- ============================================================
--  فهارس الأداء - شغّل هذا الملف في Supabase SQL Editor
--  الفهارس هي ما يحوّل "استعلام يقرأ الجدول كاملاً" إلى "قراءة صفحات قليلة".
--  آمن للتشغيل أكثر من مرة: IF NOT EXISTS في كل سطر.
--  نفّذه مرة واحدة فقط - الخادم يستفيد منها تلقائياً بعد ذلك.
-- ============================================================

-- ------------------------------------------------------------
-- 1) الأساتذة: القائمة العامة + التصفية بالمستوى + الترتيب
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_teachers_status_created
    ON public.teachers (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teachers_level_status
    ON public.teachers (teaching_level, status);

CREATE INDEX IF NOT EXISTS idx_teachers_vip_certified
    ON public.teachers (is_vip DESC NULLS LAST, is_certified DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teachers_banned
    ON public.teachers (is_banned) WHERE is_banned = false;

-- ------------------------------------------------------------
-- 2) المجموعات: عضوية الطالب + رسائل المجموعة
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_group_members_student
    ON public.group_members (student_id, is_blocked);

CREATE INDEX IF NOT EXISTS idx_group_members_group
    ON public.group_members (group_id, is_blocked);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_time
    ON public.group_messages (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_groups_teacher
    ON public.groups (teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_groups_status
    ON public.groups (status) WHERE status = 'active';

-- ------------------------------------------------------------
-- 3) التمارين: القائمة + المرrelated{profiles} + الإشارات
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_exercise_posts_created
    ON public.exercise_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exercise_posts_teacher
    ON public.exercise_posts (teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exercise_posts_level
    ON public.exercise_posts (education_level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exercise_bookmarks_user
    ON public.exercise_bookmarks (user_id, user_type);

-- ------------------------------------------------------------
-- 4) الباقات والدورات
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_packages_teacher
    ON public.packages (teacher_id, is_active);

CREATE INDEX IF NOT EXISTS idx_package_subscriptions_package
    ON public.package_subscriptions (package_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_package_subscriptions_student
    ON public.package_subscriptions (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courses_teacher
    ON public.courses (teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courses_status_created
    ON public.courses (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_purchases_course
    ON public.course_purchases (course_id, created_at DESC);

-- ------------------------------------------------------------
-- 5) الرسائل والإشعارات: أعلى ما يكثر تحديثه
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_pair_created
    ON public.messages (sender_id, sender_type, receiver_id, receiver_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread
    ON public.messages (receiver_id, receiver_type, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON public.notifications (user_id, user_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON public.notifications (user_id, is_read) WHERE is_read = false;

-- ------------------------------------------------------------
-- 6) البحث عن مستخدمين (شريط البحث في الأعلى)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_students_name_lower
    ON public.students (lower(full_name) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_teachers_name_lower
    ON public.teachers (lower(full_name) text_pattern_ops);

-- ------------------------------------------------------------
-- 7) العروض والحصص
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_offers_teacher
    ON public.offers (teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stream_subscriptions_teacher
    ON public.stream_subscriptions (teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stream_subscriptions_offer
    ON public.stream_subscriptions (offer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_offer
    ON public.sessions (offer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_student
    ON public.sessions (student_id, created_at DESC);

-- ------------------------------------------------------------
-- 8) تحديث الإحصائيات
-- ------------------------------------------------------------
ANALYZE public.teachers;
ANALYZE public.students;
ANALYZE public.groups;
ANALYZE public.group_members;
ANALYZE public.group_messages;
ANALYZE public.exercise_posts;
ANALYZE public.packages;
ANALYZE public.courses;
ANALYZE public.messages;
ANALYZE public.notifications;

-- ============================================================
--  للتحقق بعد التنفيذ:
--
--  SELECT indexname, tablename
--  FROM pg_indexes
--  WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
--  ORDER BY tablename, indexname;
--
--  ============================================================
--  ملاحظة: في Supabase قد يستغرق بناء الفهارس على جداول كبيرة
--  بضع ثوانٍ. هذا طبيعي. لا تعِد التشغيل إلا عند إضافة فهارس جديدة.
-- ============================================================