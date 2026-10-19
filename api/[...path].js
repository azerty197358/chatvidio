// ============================================================
// ZoomDz — دالة Vercel (الهجين: Vercel للـ APIs + Render للإشارات والحالة)
// ------------------------------------------------------------
// تستضيف تطبيق Express كاملاً (كل الـ APIs النصية: تسجيل، دخول، بيانات، نصوص)
// لتستفيد من اشتراك Vercel المدفوع وتخفيف عرض النطاق عن Render.
//
// يُمرَّر إلى Render (خادم الإشارات والحالة — نصوص خفيفة جداً):
//   • /api/auth/*          رموز الاستعادة ومحاولات الدخول (ذاكرة عاملة واحدة)
//   • /api/stream/*        حالة البث والدردشة والنبضات والعدّادات
//   • /api/wallet/*        روابط الدفع تعتمد على مضيف الخادم
//   • /api/room/*          معلومات غرف الإشارة
//   • /api/teacher/request-withdraw-otp و /api/teacher/withdraw-request (رمز السحب)
//
// قبل ضبط متغيرات قاعدة البيانات على Vercel تمرّ كل الطلبات إلى Render
// (السلوك الحالي) — وعند إضافتها تبدأ الدالة بالعمل تلقائياً دون إعادة نشر.
// ============================================================
const https = require('https');
const { URL } = require('url');

const RENDER_ORIGIN = process.env.RENDER_API_ORIGIN || 'https://chatvidio.onrender.com';

let app = null;
function getApp() {
    if (!app) {
        app = require('../server');
    }
    return app;
}

// هل البيئة جاهزة للعمل على Vercel؟
const HAS_DB = !!(
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// المسارات التي يجب أن تبقى على Render (حالة في ذاكرة عاملة واحدة)
function needsRender(pathname) {
    if (/^\/api\/auth(\/|$)/.test(pathname)) return true;                 // روابط جوجل (نطاق الإعادة يعتمد على المضيف)
    if (/^\/api\/stream(\/|$)/.test(pathname)) return true;                // حالة البث والدردشة والنبضات والعدّادات
    if (/^\/api\/wallet(\/|$)/.test(pathname)) return true;                // روابط الدفع تعتمد على مضيف الخادم
    if (/^\/api\/room(\/|$)/.test(pathname)) return true;                  // معلومات غرف الإشارة
    // جلسات تسجيل الدخول ورموز الاستعادة (ذاكرة عاملة + محددات المعدل)
    if (pathname === '/api/login') return true;
    if (pathname === '/api/forgot-password') return true;
    if (pathname === '/api/verify-reset-token') return true;
    if (pathname === '/api/reset-password') return true;
    // رمز التحقق لسحب الأرباح
    if (pathname === '/api/teacher/request-withdraw-otp') return true;
    if (pathname === '/api/teacher/withdraw-request') return true;
    return false;
}

// تمرير الطلب إلى Render مع الحفاظ على الترويسات والجسم والاستجابة
function proxyToRender(req, res) {
    try {
        const target = new URL(req.url || '/', RENDER_ORIGIN);

        const headers = Object.assign({}, req.headers);
        headers.host = 'chatvidio.onrender.com';
        // نزيل مضيف Vercel حتى يبني الخادم روابط الإشارة/الدفع على نطاق Render كما كان سابقاً
        delete headers['x-forwarded-host'];
        delete headers['x-vercel-id'];
        delete headers['x-vercel-deployment-url'];

        const upstream = https.request({
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || 443,
            path: target.pathname + target.search,
            method: req.method,
            headers
        }, (up) => {
            res.statusCode = up.statusCode || 502;
            Object.keys(up.headers).forEach((k) => {
                const lk = k.toLowerCase();
                if (lk === 'connection' || lk === 'transfer-encoding' || lk === 'keep-alive') return;
                const v = up.headers[k];
                if (v !== undefined) res.setHeader(k, v);
            });
            up.pipe(res);
        });

        upstream.on('error', (e) => {
            console.error('[Vercel→Render] proxy error:', e.message);
            if (!res.headersSent) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
            }
            res.end(JSON.stringify({ success: false, error: 'تعذر الوصول إلى خادم الإشارات، يرجى المحاولة مرة أخرى' }));
        });

        req.pipe(upstream);
    } catch (e) {
        console.error('[Vercel→Render] proxy setup error:', e.message);
        if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        res.end(JSON.stringify({ success: false, error: 'تعذر تجهيز الطلب، يرجى المحاولة مرة أخرى' }));
    }
}

module.exports = (req, res) => {
    // ضمان أن المسار يبدأ بـ /api (دوال Vercel قد تحذف البادئة)
    try {
        if (typeof req.url === 'string' && req.url.indexOf('/api') !== 0) {
            req.url = '/api' + req.url;
        }
    } catch (e) {}

    // قبل ضبط متغيرات قاعدة البيانات على Vercel: كل شيء يمر إلى Render (السلوك الحالي)
    if (!HAS_DB) {
        return proxyToRender(req, res);
    }

    const pathname = String(req.url || '').split('?')[0];

    // المسارات ذات الحالة تبقى على Render
    if (needsRender(pathname)) {
        return proxyToRender(req, res);
    }

    // بقية الـ APIs تعمل على Vercel مباشرة
    return getApp()(req, res);
};
