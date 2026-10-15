-- ============================================================
-- SofizPay: أعمدة معرفات بوابة الدفع في wallet_transactions
-- شغّل هذا الملف في Supabase SQL Editor (آمن للتشغيل أكثر من مرة)
-- ============================================================

alter table public.wallet_transactions
    add column if not exists sofizpay_transaction_id text;

alter table public.wallet_transactions
    add column if not exists cib_transaction_id text;

-- فهرس للبحث السريع من ويب هوك البوابة
create index if not exists idx_wallet_transactions_cib_id
    on public.wallet_transactions (cib_transaction_id);

create index if not exists idx_wallet_transactions_sofiz_id
    on public.wallet_transactions (sofizpay_transaction_id);
