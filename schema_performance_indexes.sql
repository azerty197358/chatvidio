-- ============================================================
--  فهارس الأداء - شغّل هذا الملف في Supabase SQL Editor
--  آمن 100%: لا يفشل أبداً مهما كان شكل الجداول.
--  كل فهرس يُنشأ فقط إذا كان جدوله موجوداً وكل أعمدته موجودة،
--  وإلا يتخطّاه ويطبع ملاحظة تشرح السبب.
--  آمن للتشغيل أكثر من مرة (IF NOT EXISTS + فحص الأعمدة).
--  شغّله بعد النسخة الأولى إن فشلت: ما أُنشئ سابقاً سيُتخطّى تلقائياً.
-- ============================================================

DO $$
DECLARE
    r          RECORD;
    missing    TEXT;
    col_list   TEXT;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES

            -- ---------------------------------------------
            -- 1) الأساتذة
            -- ---------------------------------------------
            ('idx_teachers_status_created',      'teachers', ARRAY['status','created_at']::TEXT[],                    NULL::TEXT),
            ('idx_teachers_level_status',        'teachers', ARRAY['teaching_level','status']::TEXT[],               NULL::TEXT),
            ('idx_teachers_vip_certified',       'teachers', ARRAY['is_vip','is_certified','created_at']::TEXT[],     NULL::TEXT),
            ('idx_teachers_banned',              'teachers', ARRAY['is_banned']::TEXT[],                             'is_banned = false'),

            -- ---------------------------------------------
            -- 2) المجموعات
            -- ---------------------------------------------
            ('idx_group_members_student',        'group_members',   ARRAY['student_id','is_blocked']::TEXT[],      NULL::TEXT),
            ('idx_group_members_group',          'group_members',   ARRAY['group_id','is_blocked']::TEXT[],        NULL::TEXT),
            ('idx_group_messages_group_time',    'group_messages',  ARRAY['group_id','created_at']::TEXT[],       NULL::TEXT),
            ('idx_groups_teacher',               'groups',          ARRAY['teacher_id','created_at']::TEXT[],      NULL::TEXT),

            -- ---------------------------------------------
            -- 3) التمارين
            -- ---------------------------------------------
            ('idx_exercise_posts_created',       'exercise_posts',  ARRAY['created_at']::TEXT[],                   NULL::TEXT),
            ('idx_exercise_posts_teacher',       'exercise_posts',  ARRAY['teacher_id','created_at']::TEXT[],       NULL::TEXT),
            ('idx_exercise_bookmarks_user',      'exercise_bookmarks', ARRAY['user_id','user_type']::TEXT[],         NULL::TEXT),

            -- ---------------------------------------------
            -- 4) الباقات والدورات
            -- ---------------------------------------------
            ('idx_packages_teacher',             'packages',         ARRAY['teacher_id']::TEXT[],                  NULL::TEXT),
            ('idx_package_subs_package',         'package_subscriptions', ARRAY['package_id','created_at']::TEXT[],  NULL::TEXT),
            ('idx_package_subs_student',         'package_subscriptions', ARRAY['student_id','created_at']::TEXT[],  NULL::TEXT),
            ('idx_courses_teacher',              'courses',          ARRAY['teacher_id','created_at']::TEXT[],     NULL::TEXT),
            ('idx_courses_status_created',       'courses',          ARRAY['status','created_at']::TEXT[],         NULL::TEXT),
            ('idx_course_purchases_course',      'course_purchases', ARRAY['course_id','created_at']::TEXT[],      NULL::TEXT),

            -- ---------------------------------------------
            -- 5) الرسائل والإشعارات
            -- ---------------------------------------------
            ('idx_messages_pair_created',        'messages',      ARRAY['sender_id','sender_type','receiver_id','receiver_type','created_at']::TEXT[], NULL::TEXT),
            ('idx_messages_receiver_unread',     'messages',      ARRAY['receiver_id','receiver_type','is_read']::TEXT[], NULL::TEXT),
            ('idx_notifications_user',           'notifications', ARRAY['user_id','user_type','created_at']::TEXT[],     NULL::TEXT),
            ('idx_notifications_unread',         'notifications', ARRAY['user_id','is_read']::TEXT[],                  'is_read = false'),

            -- ---------------------------------------------
            -- 6) البحث بالاسم (شريط البحث في الأعلى)
            -- ---------------------------------------------
            ('idx_students_name_lower',          'students',     ARRAY['full_name']::TEXT[],   NULL::TEXT),
            ('idx_teachers_name_lower',          'teachers',     ARRAY['full_name']::TEXT[],   NULL::TEXT),

            -- ---------------------------------------------
            -- 7) العروض والحصص
            -- ---------------------------------------------
            ('idx_offers_teacher',               'offers',              ARRAY['teacher_id','created_at']::TEXT[], NULL::TEXT),
            ('idx_stream_subs_teacher',          'stream_subscriptions', ARRAY['teacher_id','created_at']::TEXT[], NULL::TEXT),
            ('idx_stream_subs_offer',            'stream_subscriptions', ARRAY['offer_id','created_at']::TEXT[],   NULL::TEXT),
            ('idx_sessions_offer',               'sessions',            ARRAY['offer_id','created_at']::TEXT[],    NULL::TEXT),
            ('idx_sessions_student',             'sessions',            ARRAY['student_id','created_at']::TEXT[],  NULL::TEXT)

        ) AS v(idx_name, tbl, cols, predicate)
    LOOP
        -- هل الجدول موجود أصلاً؟
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name = r.tbl) THEN
            RAISE NOTICE 'تخطّي % : الجدول % غير موجود', r.idx_name, r.tbl;
            CONTINUE;
        END IF;

        -- هل كل عمود من أعمدة الفهرس موجود؟
        SELECT string_agg(c.column_name, ', ' ORDER BY c.ord)
          INTO missing
          FROM unnest(r.cols) WITH ORDINALITY AS c(column_name, ord)
         WHERE NOT EXISTS (
                   SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name  = r.tbl
                      AND column_name = c.column_name
               );

        IF missing IS NOT NULL THEN
            RAISE NOTICE 'تخطّي % : الجدول % لا يملك العمود %', r.idx_name, r.tbl, missing;
            CONTINUE;
        END IF;

        -- كل شيء موجود: ابنِ قائمة الأعمدة ثم أنشئ الفهرس
        SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ord)
          INTO col_list
          FROM unnest(r.cols) WITH ORDINALITY AS c(column_name, ord);

        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)%s',
                       r.idx_name,
                       r.tbl,
                       col_list,
                       CASE WHEN r.predicate IS NULL THEN '' ELSE ' WHERE ' || r.predicate END);

        RAISE NOTICE 'تم إنشاء %', r.idx_name;
    END LOOP;
END $$;

-- ============================================================
--  تحديث إحصائيات Postgres حتى تختار الخطة أفضل مسار تنفيذي
-- ============================================================
DO $$
DECLARE
    t TEXT;
    tbls TEXT[] := ARRAY[
        'teachers', 'students', 'groups', 'group_members', 'group_messages',
        'exercise_posts', 'exercise_bookmarks', 'packages', 'package_subscriptions',
        'courses', 'course_purchases', 'messages', 'notifications',
        'offers', 'stream_subscriptions', 'sessions'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ANALYZE public.%I', t);
        END IF;
    END LOOP;
END $$;

-- ============================================================
--  للتحقق بعد التنفيذ:
--
--  SELECT tablename, indexname
--  FROM pg_indexes
--  WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
--  ORDER BY tablename, indexname;
--
--  يجب أن ترى كل الفهارس التي لم تتخطَّها رسائل "تم إنشاء".
-- ============================================================
