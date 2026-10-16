-- ============================================================
-- 💬 ميزة الرد على رسائل الدردشة المباشرة + جداول البث الجديدة
-- شغّل هذا الملف في Supabase SQL Editor
-- (آمن لإعادة التشغيل — كل شيء IF NOT EXISTS)
-- ============================================================

-- 1) جدول رسائل الدردشة المباشرة — إن لم يكن موجوداً
--    (بدونه كان حفظ الرسائل يفشل بصمت والدردشة تعتمد على الذاكرة فقط)
CREATE TABLE IF NOT EXISTS public.stream_chat_messages (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    offer_id    BIGINT NOT NULL,
    sender_id   BIGINT,
    sender_name TEXT DEFAULT '',
    sender_role TEXT DEFAULT 'student',
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) عمود الرد على رسالة سابقة (مقتطف { id, sender, text })
ALTER TABLE public.stream_chat_messages ADD COLUMN IF NOT EXISTS reply_to jsonb;

COMMENT ON COLUMN public.stream_chat_messages.reply_to IS
'بيانات الرسالة المُردود عليها: { id, sender, text } — مقتطف قصير يُخزن مع الرسالة';

-- 3) جدول كتم الطلاب في غرف البث (جديد — بدونه يضيع الكتم عند إعادة تشغيل الخادم)
CREATE TABLE IF NOT EXISTS public.stream_mutes (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    offer_id   BIGINT NOT NULL,
    student_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (offer_id, student_id)
);

-- 4) فهارس لتسريع الجلب
CREATE INDEX IF NOT EXISTS idx_stream_chat_messages_offer_created
    ON public.stream_chat_messages (offer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stream_mutes_offer
    ON public.stream_mutes (offer_id);

-- 5) صلاحيات الكتابة للخادم — نفس نمط schema_write_access_fix.sql
--    (كل الوصول يمر عبر خادم Express حصراً، وتعطيل RLS يمنع أي وصول مباشر بمفتاح anon)
ALTER TABLE public.stream_chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_mutes DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON public.stream_chat_messages TO anon, authenticated;
GRANT ALL PRIVILEGES ON public.stream_mutes TO anon, authenticated;

-- ✅ انتهى — بعدها: حفظ رسائل الدردشة يعمل تاريخياً، والردود محفوظة، والكتم يبقى بعد إعادة التشغيل
