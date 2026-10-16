-- ============================================================
-- 💬 ميزة الرد على رسائل الدردشة المباشرة (Stream Chat Replies)
-- شغّل هذا الملف في Supabase SQL Editor
-- ملاحظة: الكود يعمل بدون هذا الترحيل (الرد يظهر في البث الحالي)،
--         الترحيل يحفظ الردود في قاعدة البيانات لتعود بعد إعادة التشغيل
-- ============================================================

ALTER TABLE stream_chat_messages ADD COLUMN IF NOT EXISTS reply_to jsonb;

COMMENT ON COLUMN stream_chat_messages.reply_to IS
'بيانات الرسالة المُردود عليها: { id, sender, text } — مقتطف قصير يُخزن مع الرسالة';

-- فهرس بسيط لتسريع جلب رسائل حسب العرض (اختياري)
CREATE INDEX IF NOT EXISTS idx_stream_chat_messages_offer_created
    ON stream_chat_messages (offer_id, created_at);
