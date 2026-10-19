-- ============================================================
-- ZoomDz — إضافات نظام الإعلانات: سبب الرفض + إحصائيات مفصلة حسب المستوى
-- شغّل هذا الملف في Supabase SQL Editor (يمكن تشغيله أكثر من مرة بأمان)
-- ============================================================

-- سبب رفض الإعلان (يظهر للمعلن في لوحة الأستاذ)
alter table ads add column if not exists rejection_reason text;

-- المستوى الدراسي لكل ظهور (لحساب إحصائيات "من شاهد/نقر" حسب المستوى)
alter table ad_impressions add column if not exists student_level text;

-- جدول النقرات المفصّل (لحساب إحصائيات النقرات حسب المستوى)
create table if not exists ad_clicks (
  id bigserial primary key,
  ad_id bigint not null,
  student_id bigint not null,
  student_level text,
  created_at timestamptz default now()
);

create index if not exists idx_ad_clicks_ad on ad_clicks (ad_id);
create index if not exists idx_ad_impressions_ad on ad_impressions (ad_id, student_id);

alter table ad_clicks disable row level security;
grant all on ad_clicks to anon, authenticated, service_role;
grant usage, select on sequence ad_clicks_id_seq to anon, authenticated, service_role;

-- ============================================================
-- تشخيص سريع (اختياري):
-- select status, count(*) from ads group by status;
-- select count(*) from ad_clicks;
-- ============================================================
