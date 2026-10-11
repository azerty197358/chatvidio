-- ============================================================
--  علامات القراءة في الرسائل (تابع واحد / تابعان)
--  نفّذ هذا الملف في Supabase SQL Editor
--  آمن للتشغيل أكثر من مرة
-- ============================================================

-- 1) العمود: هل قُرئت الرسالة؟
--    التكرار:>false يعني أن التطبيق أضافه مسبقاً (ADD COLUMN IF NOT EXISTS)
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) متى قُرئت بالضبط (اختياري، لكن مفيد جداً للتقارير)
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- 3) فهرس سريع: "كل رسائلي غير المقروءة"
CREATE INDEX IF NOT EXISTS messages_is_read_idx
    ON public.messages (receiver_id, is_read)
    WHERE is_read = FALSE;

-- 4) الرسائل القديمة: consider مقروءة حتى لا تظهر كلها بلاخ与非مقروءة
UPDATE public.messages
SET is_read = TRUE
WHERE is_read = FALSE
  AND created_at < NOW() - INTERVAL '7 days';

-- ============================================================
--  كيف يعمل التطبيق مع هذا العمود؟
--  • عند الإرسال:      is_read = FALSE  → علامة واحدة  ✓
--  • عند فتح المحادثة: الخادم يحوّل رسائل الطرف الآخر إلى is_read = TRUE
--                       فيظهر للمُرسِل              ✓✓
--  • الرسالة المكتوبة لك أنت لا تُعرض لها علامة (تظهر للمرسل فقط)
-- ============================================================