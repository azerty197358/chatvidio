-- ============================================================
-- 🔧 إصلاح طلبات السحب: أعمدة الجدول + صلاحيات الكتابة
-- منصة ZoomDz — شغّل هذا الملف كاملاً في Supabase SQL Editor
-- (آمن للتشغيل أكثر من مرة — كل عبارة تتحقق أولاً)
-- ============================================================
-- يحل المشكلة: خطأ 500 "حدث خطأ" عند تأكيد طلب السحب في لوحة الأستاذ
-- (تعذر إنشاء صف في withdraw_requests — أعمدة ناقصة أو RLS يحجب الكتابة)

-- 1) الجدول كاملاً إن لم يكن موجوداً أصلاً
create table if not exists public.withdraw_requests (
    id bigint generated always as identity primary key,
    teacher_id bigint not null,
    amount numeric not null,
    original_amount numeric,
    fee_amount numeric,
    sofizpay_public_key text,
    ccp_account text,
    description text,
    status varchar(20) not null default 'pending',
    rejection_reason text,
    processed_at timestamptz,
    order_index integer default 0,
    created_at timestamptz default now()
);

-- 2) أعمدة تنقص جدولاً قديماً أُنشئ يدوياً
alter table public.withdraw_requests add column if not exists original_amount numeric;
alter table public.withdraw_requests add column if not exists fee_amount numeric;
alter table public.withdraw_requests add column if not exists sofizpay_public_key text;
alter table public.withdraw_requests add column if not exists ccp_account text;
alter table public.withdraw_requests add column if not exists description text;
alter table public.withdraw_requests add column if not exists rejection_reason text;
alter table public.withdraw_requests add column if not exists processed_at timestamptz;
alter table public.withdraw_requests add column if not exists order_index integer default 0;

-- 3) رابط الأستاذ (لازم لعرض الطلبات مع بيانات الأستاذ في لوحة الإدارة)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'withdraw_requests_teacher_id_fkey'
    ) THEN
        ALTER TABLE public.withdraw_requests
            ADD CONSTRAINT withdraw_requests_teacher_id_fkey
            FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'تعذر إضافة رابط الأستاذ (تحقق من نوع teachers.id): %', SQLERRM;
END $$;

-- 4️⃣ فتح صلاحيات الكتابة — كل الوصول إلى قاعدة البيانات يمر عبر
--    خادم Express حصراً، فالـ RLS هنا يحجب كتابة الخادم فقط ويسبب 500
alter table public.withdraw_requests disable row level security;
grant all privileges on public.withdraw_requests to anon, authenticated;

-- 5) فهرس لفحص الطلبات المعلقة وطلبات الأستاذ بسرعة
create index if not exists idx_withdraw_requests_teacher_status
    on public.withdraw_requests (teacher_id, status);

-- ✅ انتهى — بعد التشغيل: أعد تجربة "تأكيد عملية السحب" في لوحة الأستاذ

-- ============================================================
-- (اختياري) تشخيص أموال عالقة من المحاولات الفاشلة السابقة:
-- إذا نتجت صفوف، فهناك أستاذ خُصم رصيده دون إنشاء طلب — راجعها ثم
-- نفّذ عبارة التصحيح بعد التأكد:
--
-- SELECT t.id, t.full_name, t.balance, t.pending_withdraw
-- FROM teachers t
-- WHERE t.pending_withdraw > 0
--   AND NOT EXISTS (
--     SELECT 1 FROM withdraw_requests w
--     WHERE w.teacher_id = t.id AND w.status = 'pending'
--   );
--
-- UPDATE teachers t
-- SET balance = t.balance + t.pending_withdraw, pending_withdraw = 0
-- WHERE t.pending_withdraw > 0
--   AND NOT EXISTS (
--     SELECT 1 FROM withdraw_requests w
--     WHERE w.teacher_id = t.id AND w.status = 'pending'
--   );
-- ============================================================
