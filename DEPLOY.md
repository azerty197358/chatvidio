# النشر على Railway (تطوير واختبار) مع بقاء الإنتاج على Vercel

هذا الدليل يشرح تشغيل **نسختين من المنصة من نفس الكود**:

| | Vercel (الإنتاج) | Railway (التطوير والاختبار) |
|---|---|---|
| الهدف | تشغيل الموقع الفعلي للعملاء | تطوير وميزة واختبار دون لمس الإنتاج أو استهلاك خطة Vercel |
| كيف يعمل | `vercel.json` يوجّه كل الطلبات إلى الدالة `api/index.js` (بدون `listen`) | الخادم الكامل يستمع على المنفذ `PORT` الذي تحقنه Railway |
| الفرع | `main` | يُفضَّل فرع `dev` (انظر «سير العمل» أدناه) |
| البناء | `npm run build` (Vercel يكتشفه تلقائياً) | `npm run build` (محدَّد في `railway.json`) |
| التشغيل | الدالة serverless | `NODE_ENV=production npm start` (محدَّد في `railway.json`) |

> **لم يتغير أي شيء في إعدادات Vercel**: ملفا `vercel.json` و `api/index.js` كما هما،
> ونفس سكربتات البناء تعمل على المنصتين.

---

## كيف يكتشف `server.js` بيئة التشغيل؟

- **على Vercel** يضبط المنصة `VERCEL=1` → لا يوجد `listen` إطلاقاً؛ الدالة تستورد التطبيق مباشرة.
- **على Railway** يحقن المنصة منفذ `PORT` → يستمع `server.js` عليه (مع `0.0.0.0`)،
  ويكشف بيئة Railway عبر `RAILWAY_ENVIRONMENT_NAME` ويظهر ذلك في السجلات وفي `/api/health`
  (`platform: railway`).
- **محلياً** كل شيء يعمل افتراضياً على `http://localhost:3000` (`npm run dev`).

المهام الدورية (انتهاء العروض، التنظيف، انتهاء VIP) و`/ws-signaling` (إشارة WebRTC)
تعمل على Railway ضمن العملية نفسها — مثل أي خادم مستمر.

---

## خطوات النشر على Railway

1. سجّل الدخول إلى [railway.com](https://railway.com) عبر حساب GitHub.
2. **New Project → Deploy from GitHub repo** → اختر مستودع `chatvidio`.
3. يقرأ Railway ملف `railway.json` تلقائياً:
   - البناء: `npm run build` (اختبارات الجودة + Vite + esbuild)
   - التشغيل: `NODE_ENV=production npm start`
   - فحص الصحة: `GET /api/health` (مهلة 180 ثانية للإقلاع)
4. من **Service → Variables** أضف متغيرات البيئة (الجدول أدناه) — انسخها من إعدادات Vercel.
5. من **Service → Settings → Networking** اضغط **Generate Domain** لتحصل على رابط مؤقت
   مثل `https://<اسم-الخدمة>-<hash>.up.railway.app` (يدعم HTTPS تلقائياً)، أو اربط نطاق مخصص.
6. افتح `<رابطك>/api/health` — يجب أن ترى `"platform": "railway"` و`"port": ...`.

### سير العمل الموصى به (مهم جداً)

Push إلى `main` يعيد النشر **على المنصتين معاً** (Vercel يستخدم `main`). لضمان ألّا تلمس
تغييرات التطوير إنتاج Vercel إطلاقاً:

1. اربط خدمة Railway بفرع **`dev`**: من إعدادات الخدمة → **Source → Branch** → `dev`.
2. اعمل وادفع دائماً إلى `dev` → Railway تعيد النشر تلقائياً، وVercel لا يتأثر إطلاقاً.
3. عندما تجهز الميزة: ادمج `dev` إلى `main` → يُنشر على Vercel (إنتاج) ويعاد بناء نسخة Railway.

> نصيحة: إذا لم تعد تريد النشر التلقائي من Railway لكل دفعة، أوقف **Auto Deploy** من
> إعدادات الخدمة وانشر يدوياً من زر **Deploy** — أو استخدم أزرار Redeploy/rollbacks.

---

## متغيرات البيئة المطلوبة على Railway

انسخ قيمها **حرفياً** من إعدادات Vercel (Variables) — نفس القاعدة والخدمات.

### أساسي (بدونها لا تعمل المنصة)

| المتغير | الوصف |
|---|---|
| `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | الاتصال بقاعدة بيانات Supabase |
| `JWT_SECRET` | توقيع الجلسات — نفس قيمة الإنتاج |
| `ENCRYPTION_KEY` / `ENCRYPTION_IV` | تشفير البيانات الحساسة (hex). **ينبغي أن تكون مطابقة للإنتاج إذا شاركتما القاعدة** — بدونها يُولَّد مفتاح عشوائي كل إقلاع ولا تُفك البيانات القديمة. انظر `.env.example` لطريقة التوليد |
| `GEMINI_API_KEY` (أو `AI_GATEWAY_API_KEY`) | خدمات الذكاء الاصطناعي |
| `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER` | الإشارة اللحظية والدردشة الحية |

### البريد الإلكتروني (أضف ما تملكه على الأقل)

| `BREVO_API_KEY` (+ `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME`) | Brevo — أساسي |
| `RESEND_API_KEY` (+ `RESEND_SENDER_*`) | Resend — احتياطي |

### الروابط والنطاقات

| `PLATFORM_URL` | **غيّره** إلى رابط Railway العام (مثل `https://xxxx.up.railway.app`) لتصحيح الروابط داخل رسائل النسخة التجريبية |
| `PLATFORM_DOMAIN` | نطاق المنصة المقابل |
| `CORS_ORIGIN` | اختياري — نطاقات `*.railway.app` مسموحة أصلاً في الكود؛ أضف نطاقاً مخصصاً هنا إن ربطت نطاقاً خاصاً |

### حسب الحاجة

| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth — إن أردت اختبار تسجيل Google على Railway أضف رابط إعادة التوجيه لنطاق Railway في Google Cloud Console |
| `SOFIZPAY_SECRET_KEY` / `SOFIZPAY_ACCOUNT` / `SOFIZPAY_API_URL` / `SOFIZPAY_TRANSACTION_CHECK_URL` | الدفع — لاحظ أن روابط Webhooks تبقى موجَّهة إلى نطاق الإنتاج ما لم تغيّرها |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHANNEL` | التحقق من قناة تيليجرام |
| `RECAPTCHA_SECRET_KEY` | حماية النماذج |
| `LOG_LEVEL` | `DEBUG`/`INFO`/`WARN`/`ERROR` — مفيد للتشخيص |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` | بديل دخول الأدمن إن كان معتمداً على البيئة |

### لا تضبطها يدوياً

| `PORT` | تحقنه Railway تلقائياً — الخادم يلتزم به (انظر `railway.json`) |
| `NODE_ENV` | يُضبط `production` في أمر التشغيل داخل `railway.json` |

> ملف `.env` مُستبعد من Git (`.gitignore`) — لا يُرفع إلى أي منصة؛ متغيرات البيئة
> تُضبط من لوحات Vercel وRailway فقط.

---

## عزل بيانات التطوير (مهم)

- إن أردت نسخة اختبار **غير قابلة للتلف** أصلاً: أنشئ مشروع **Supabase منفصل** للتطوير
  ووجّه متغيرات Railway إليه (مع `ENCRYPTION_KEY/IV` خاصة به).
- إن شاركت القاعدة نفسها: تذكّر أن المهام الدورية تعمل الآن على **نسختين** (Vercel + Railway) —
  التحديثات متكرّرة التوجيه وآمنة، لكن الاختبارات التي تكتب بيانات (حجوزات، رسائل، مراجعات)
  ستظهر في بيانات الإنتاج.
- الرفع إلى التخزين يذهب في الحالتين إلى Supabase Storage (لا تخزين محلي دائم على Railway).

---

## استكشاف الأخطاء

| العَرَض | الحل |
|---|---|
| البناء يفشل | تحقق من سجلات البناء؛ إن فشلت اختبارات `prebuild` شغّلها محلياً: `npm run check:pages` وغيرها من سكربتات `package.json` |
| الموقع لا يستجيب / فحص الصحة يفشل | افتح **Deploy Logs** — يجب أن ترى سطر «Server running …» ثم «بيئة التشغيل: railway \| المنفذ: …». الإقلاع قد يستغرق ~15 ثانية (التوحيد الكبيرة) ومهلة الفحص 180 ثانية |
| رسائل CORS مرفوضة في السجل | أضف نطاقك في `CORS_ORIGIN` (نطاقات `*.railway.app` مدعومة أصلاً) |
| روابط بريد تحيل إلى نطاق قديم | عدّل `PLATFORM_URL` و`PLATFORM_DOMAIN` في بيئة Railway |
| بيانات مشفرة لا تُفك | `ENCRYPTION_KEY/IV` غير مطابقة لقيم الإنتاج — انسخها حرفياً |
| أخطاء بناء حزم native (sharp…) | تأكد من تحديث `package-lock.json`: `npm install --package-lock-only` ثم أعد الدفع |

---

## ملاحظات على تغييرات هذا الدليل

1. `server.js`: احترام متغير `PORT` من البيئة، وإضافة نطاقات `*.railway.app` و`*.up.railway.app`
   إلى قائمة CORS المسموحة، وتسجيل بيئة التشغيل في السجلات وفي `/api/health`
   (`platform` + `port`).
2. `railway.json` (جديد): أوامر البناء والتشغيل وفحص الصحة — لا يمس إعدادات Vercel.
3. `package.json`: سكربت `dev` أصبح `tsx server.js` (المنفذ الافتراضي 3000 يأتي من الكود
   مباشرة — يعمل على Windows وLinux معاً).
4. حُذف `bun.lock`: كان **تقديماً** لـ`package-lock.json` ويُجبر أداة بناء Railway على اختيار
   Bun بدل npm؛ المشروع يُدار بـnpm (سكربتات `package.json` و`vercel.json` كلها npm).
5. حُدِّث `package-lock.json` ليشمل حزمة `pusher` المضافة في `package.json` بدون تحديث للقفل
   (كان سيُفشل أي تثبيت حتمي `--frozen-lockfile` / `npm ci`).
6. أضيف `dist/` إلى `.gitignore`، ووثّقت `ENCRYPTION_KEY/IV` في `.env.example`.
