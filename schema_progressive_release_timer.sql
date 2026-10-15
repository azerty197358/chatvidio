-- ============================================================
-- ✅ مиграة: العدّاد التنازلي المحمي + التحرير التدريجي لمستحقات الأستاذ
--    شغّلها في Supabase SQL Editor — آمنة للتشغيل المتكرر
--    (كل عبارة IF NOT EXISTS / CREATE IF NOT EXISTS)
-- ============================================================

-- 1) أعمدة العدّاد على الخادم في جدول الدروس (offers)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='remaining_seconds') THEN
        ALTER TABLE public.offers ADD COLUMN remaining_seconds NUMERIC;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='total_seconds') THEN
        ALTER TABLE public.offers ADD COLUMN total_seconds NUMERIC;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='stream_started_at') THEN
        ALTER TABLE public.offers ADD COLUMN stream_started_at TIMESTAMPTZ;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='completion_percentage') THEN
        ALTER TABLE public.offers ADD COLUMN completion_percentage NUMERIC DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='actual_duration') THEN
        ALTER TABLE public.offers ADD COLUMN actual_duration NUMERIC DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='actual_live_seconds') THEN
        ALTER TABLE public.offers ADD COLUMN actual_live_seconds NUMERIC DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offers' AND column_name='total_released_amount') THEN
        ALTER TABLE public.offers ADD COLUMN total_released_amount NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

-- 2) جدول تحقق البث (لحظة البدء + مدد الإيقاف) — أساس حساب العدّاد والتحرير من الخادم
CREATE TABLE IF NOT EXISTS public.stream_verification (
    id BIGSERIAL PRIMARY KEY,
    offer_id BIGINT,
    teacher_id BIGINT,
    server_start_time TIMESTAMPTZ,
    last_pause_time TIMESTAMPTZ,
    total_paused_seconds NUMERIC DEFAULT 0,
    actual_live_seconds NUMERIC DEFAULT 0,
    total_duration_seconds NUMERIC DEFAULT 0,
    completion_percentage NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'started',
    created_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stream_verification' AND column_name='total_paused_seconds') THEN
        ALTER TABLE public.stream_verification ADD COLUMN total_paused_seconds NUMERIC DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stream_verification' AND column_name='last_pause_time') THEN
        ALTER TABLE public.stream_verification ADD COLUMN last_pause_time TIMESTAMPTZ;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stream_verification' AND column_name='server_start_time') THEN
        ALTER TABLE public.stream_verification ADD COLUMN server_start_time TIMESTAMPTZ;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stream_verification' AND column_name='actual_live_seconds') THEN
        ALTER TABLE public.stream_verification ADD COLUMN actual_live_seconds NUMERIC DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stream_verification' AND column_name='total_duration_seconds') THEN
        ALTER TABLE public.stream_verification ADD COLUMN total_duration_seconds NUMERIC DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stream_verification' AND column_name='completion_percentage') THEN
        ALTER TABLE public.stream_verification ADD COLUMN completion_percentage NUMERIC DEFAULT 0;
    END IF;
END $$;

-- 3) جدول حصص الخطة — مخزن التحرير التدريجي لكل حصة
CREATE TABLE IF NOT EXISTS public.stream_sessions (
    id BIGSERIAL PRIMARY KEY,
    offer_id BIGINT,
    teacher_id BIGINT,
    session_number INT DEFAULT 1,
    title TEXT,
    session_date TIMESTAMPTZ,
    duration_minutes INT,
    price_per_session NUMERIC(12,2) DEFAULT 0,
    platform_fee NUMERIC(12,2) DEFAULT 0,
    status TEXT DEFAULT 'pending',
    teacher_released_amount NUMERIC(12,2) DEFAULT 0,
    refund_amount NUMERIC(12,2) DEFAULT 0,
    is_escrow_released BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stream_sessions' AND column_name='teacher_released_amount') THEN
        ALTER TABLE public.stream_sessions ADD COLUMN teacher_released_amount NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stream_sessions' AND column_name='is_escrow_released') THEN
        ALTER TABLE public.stream_sessions ADD COLUMN is_escrow_released BOOLEAN DEFAULT false;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stream_sessions' AND column_name='refund_amount') THEN
        ALTER TABLE public.stream_sessions ADD COLUMN refund_amount NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

-- تصفية القيم القديمة NULL (ضرورية لعمل الحجز الشرطي المانع للتحرير المزدوج)
UPDATE public.stream_sessions SET teacher_released_amount = 0 WHERE teacher_released_amount IS NULL;
UPDATE public.offers SET total_released_amount = 0 WHERE total_released_amount IS NULL;

-- 4) جدول الجلسات (sessions): مبلغ الحجز وحالة الدفع ومستحقات الأستاذ
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='teacher_earned') THEN
        ALTER TABLE public.sessions ADD COLUMN teacher_earned NUMERIC(10,2) DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='completion_percentage') THEN
        ALTER TABLE public.sessions ADD COLUMN completion_percentage NUMERIC DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='actual_duration') THEN
        ALTER TABLE public.sessions ADD COLUMN actual_duration NUMERIC DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='partial_payment_note') THEN
        ALTER TABLE public.sessions ADD COLUMN partial_payment_note TEXT;
    END IF;
END $$;

UPDATE public.sessions SET teacher_earned = 0 WHERE teacher_earned IS NULL;

-- 5) سجل تحرير المستحقات (تدريجي + نهائي)
CREATE TABLE IF NOT EXISTS public.stream_escrow_releases (
    id BIGSERIAL PRIMARY KEY,
    offer_id BIGINT,
    teacher_id BIGINT,
    session_number INT DEFAULT 1,
    amount_released NUMERIC(12,2) DEFAULT 0,
    students_count INT DEFAULT 1,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6) جدول الاشتراكات (خطط الخطة)
CREATE TABLE IF NOT EXISTS public.stream_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    offer_id BIGINT,
    student_id BIGINT,
    teacher_id BIGINT,
    plan_type TEXT DEFAULT '1_day',
    total_sessions INT DEFAULT 1,
    completed_sessions INT DEFAULT 0,
    price_per_session NUMERIC(12,2) DEFAULT 0,
    platform_fee_per_session NUMERIC(12,2) DEFAULT 0,
    total_amount_paid NUMERIC(12,2) DEFAULT 0,
    teacher_total_escrow NUMERIC(12,2) DEFAULT 0,
    teacher_released_so_far NUMERIC(12,2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stream_subscriptions' AND column_name='teacher_released_so_far') THEN
        ALTER TABLE public.stream_subscriptions ADD COLUMN teacher_released_so_far NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stream_subscriptions' AND column_name='teacher_total_escrow') THEN
        ALTER TABLE public.stream_subscriptions ADD COLUMN teacher_total_escrow NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

-- 7) أعمدة رصيد الأستاذ (إن كانت مفقودة)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='pending_withdraw') THEN
        ALTER TABLE public.teachers ADD COLUMN pending_withdraw NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='total_earned') THEN
        ALTER TABLE public.teachers ADD COLUMN total_earned NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='balance') THEN
        ALTER TABLE public.teachers ADD COLUMN balance NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

-- ============================================================
-- ✅ انتهى — كل ما يحتاجه العدّاد المحمي والتحرير التدريجي جاهز
-- ============================================================
