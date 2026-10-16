-- ============================================================
-- 📝 عمود سبب رفض الدورات والباقات
-- يظهر للأستاذ في إشعار المراجعة وبطاقة الدورة/الباقة
-- شغّل هذا الملف في Supabase SQL Editor (آمن للتكرار)
-- ============================================================

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN public.courses.rejection_reason IS
'سبب رفض الدورة من الإدارة — يظهر للأستاذ في إشعار المراجعة وبطاقة الدورة';
COMMENT ON COLUMN public.packages.rejection_reason IS
'سبب رفض الباقة من الإدارة — يظهر للأستاذ في إشعار المراجعة وبطاقة الباقة';

-- ✅ انتهى: الرفض من لوحة الإدارة يسأل عن السبب الآن، ويصل للأستاذ في إشعاراته
--    (بدون تشغيل الملف: الإشعار يحمل السبب دائماً — يُخفَّى فقط عرض السبب على البطاقة)
