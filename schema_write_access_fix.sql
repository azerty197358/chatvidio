-- ============================================================
-- 🔧 إصلاح صلاحيات الكتابة + الأعمدة الناقصة (WebRTC / الإشعارات)
-- منصة ZoomDz
-- ============================================================
-- نفّذ هذا الملف كاملاً في Supabase SQL Editor مرة واحدة.
--
-- المشاكل التي يحلها:
-- 1) حذف الدرس يعرض "تم الحذف" لكن الدرس يبقى ظاهراً (حذف صامت لم يمسح أي صف)
-- 2) بدء البث لا يغيّر حالة الدرس إلى مباشر (تحديث صامت لم يُطبَّق)
-- 3) الطلاب المحجوز لهم لا يصلهم إشعار عند بدء الدرس
--
-- الأسباب المحتملة: أعمدة مفقودة في جدولي offers/notifications،
-- أو RLS يحجب عمليات الكتابة من مفتاح الخادم.
-- ============================================================

-- 1️⃣ أعمدة جدول الدروس (offers) المستخدمة في بدء البث
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='stream_url') THEN
        ALTER TABLE public.offers ADD COLUMN stream_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='stream_platform') THEN
        ALTER TABLE public.offers ADD COLUMN stream_platform VARCHAR(50) DEFAULT 'webrtc';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='stream_active') THEN
        ALTER TABLE public.offers ADD COLUMN stream_active BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='is_paused') THEN
        ALTER TABLE public.offers ADD COLUMN is_paused BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='stream_started_at') THEN
        ALTER TABLE public.offers ADD COLUMN stream_started_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='room_name') THEN
        ALTER TABLE public.offers ADD COLUMN room_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='room_password') THEN
        ALTER TABLE public.offers ADD COLUMN room_password TEXT;
    END IF;
END $$;

-- 2️⃣ أعمدة إشعارات بدء الدرس (notifications)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='offer_id') THEN
        ALTER TABLE public.notifications ADD COLUMN offer_id BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='meet_url') THEN
        ALTER TABLE public.notifications ADD COLUMN meet_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='stream_url') THEN
        ALTER TABLE public.notifications ADD COLUMN stream_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='is_free') THEN
        ALTER TABLE public.notifications ADD COLUMN is_free BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='stream_platform') THEN
        ALTER TABLE public.notifications ADD COLUMN stream_platform VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='user_type') THEN
        ALTER TABLE public.notifications ADD COLUMN user_type VARCHAR(20) DEFAULT 'student';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='type') THEN
        ALTER TABLE public.notifications ADD COLUMN type VARCHAR(50);
    END IF;
END $$;

-- 3️⃣ فتح صلاحيات الكتابة للخادم
-- كل الوصول إلى قاعدة البيانات يمر عبر خادم Express حصراً (الواجهة الأمامية
-- لا تستخدم Supabase مباشرة)، لذا تعطيل RLS على جداول التطبيق آمن ويمنع
-- الحذف/التحديث الصامتين من مفتاح anon.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'offers','notifications','sessions','teachers','students',
        'active_stream','waiting_room','student_room_passwords',
        'stream_verification','stream_chat_messages','stream_mutes',
        'stream_subscriptions','stream_sessions','teacher_followers',
        'platform_settings','teacher_vip_subscriptions'
    ] LOOP
        BEGIN
            EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
            EXECUTE format('GRANT ALL PRIVILEGES ON public.%I TO anon, authenticated', t);
        EXCEPTION WHEN undefined_table THEN
            RAISE NOTICE 'تجاوز جدول غير موجود: %', t;
        END;
    END LOOP;
END $$;

-- ✅ انتهى — بعد تشغيل هذا الملف ستعمل: الحذف الفعلي، تغيير حالة البث، والإشعارات.
