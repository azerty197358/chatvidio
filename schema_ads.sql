-- ============================================================
-- ZoomDz — نظام الإعلانات المستهدف (آمن لمحركات البحث)
-- جدول الإعلانات + جدول مرات الظهور (قاعدة: مرة واحدة لكل طالب كل 24 ساعة)
-- شغّل هذا الملف في Supabase SQL Editor
-- ============================================================

-- جدول الإعلانات
create table if not exists ads (
  id bigserial primary key,
  advertiser_id bigint,                 -- الأستاذ/المدرسة المعلنة
  advertiser_name text,                 -- اسم المعلن (للعرض في لوحة الإدارة)
  title text,                           -- عنوان الإعلان
  content text,                         -- نص الإعلان
  image_url text,                       -- صورة البانر/اللافتة (اختياري)
  link_url text,                        -- رابط الوجهة (اختياري)
  ad_type text default 'static',        -- banner | static | notification
  placement text default 'between_posts', -- between_posts | comments | packages | courses | lessons_header
  education_level text default 'all',   -- المستوى المستهدف أو all
  start_date timestamptz,               -- تاريخ البدء
  end_date timestamptz,                 -- تاريخ الانتهاء
  status text default 'pending',        -- pending | active | paused
  price_paid numeric default 0,         -- السعر المحسوب (دج)
  impressions_count integer default 0,  -- عدد مرات الظهور
  clicks_count integer default 0,       -- عدد النقرات
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- جدول مرات الظهور — يضمن ظهور الإعلان لطالب واحد مرة واحدة كل 24 ساعة
create table if not exists ad_impressions (
  id bigserial primary key,
  ad_id bigint not null,
  student_id bigint not null,
  created_at timestamptz default now()
);

-- فهارس لتسريع المطابقة
create index if not exists idx_ads_active
  on ads (status, placement, education_level, start_date, end_date);

create index if not exists idx_ad_impressions_lookup
  on ad_impressions (student_id, ad_id, created_at desc);

-- صلاحيات الكتابة للخادم (مفتاح service_role يتجاوز RLS)
alter table ads disable row level security;
alter table ad_impressions disable row level security;

grant all on ads to anon, authenticated, service_role;
grant all on ad_impressions to anon, authenticated, service_role;
grant usage, select on sequence ads_id_seq to anon, authenticated, service_role;
grant usage, select on sequence ad_impressions_id_seq to anon, authenticated, service_role;

-- ============================================================
-- تشخيص سريع بعد التنفيذ (اختياري):
-- select status, count(*) from ads group by status;
-- select count(*) from ad_impressions;
-- ============================================================
