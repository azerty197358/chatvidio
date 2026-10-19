// ============================================================
// ZoomDz — دالة Vercel (نظام هجين: Vercel للواجهة والـ APIs + Pusher للحظية)
// ------------------------------------------------------------
// تستضيف تطبيق Express كاملاً (كل الـ APIs النصية + مسارات SSR).
//
//  ⚠️ خدمة Render موقوفة — التوجيه إليها معطّل افتراضياً:
//  • RENDER_API_PROXY=1 يعيد التوجيه إلى Render تلقائياً لو عادت الخدمة.
//  • الإشارة اللحظية (WebRTC) والدردشة الحية عبر Pusher.com بلا WebSocket.
//  • مسارات SSR تصل هنا عبر علامة __ssr في إعادة الكتابة (vercel.json).
// ============================================================
const https = require('https');
const { URL } = require('url');

const RENDER_ORIGIN = process.env.RENDER_API_ORIGIN || 'https://chatvidio.onrender.com';

//  التوجيه إلى Render معطّل افتراضياً (الخدمة موقوفة والأنظمة عبر Pusher) —
//  فعّله صراحةً بـ RENDER_API_PROXY=1 فقط لو أُعيد تشغيل الخدمة لاحقاً
const USE_RENDER_PROXY = process.env.RENDER_API_PROXY === '1';

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

// المسارات التي تُمرَّر إلى Render (حالة في ذاكرة عاملة واحدة) — عند تفعيل البروكسي فقط
function needsRender(pathname) {
    if (!USE_RENDER_PROXY) return false;
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
    try {
        if (typeof req.url !== 'string') req.url = '/';
        //  مسارات SSR (sitemap.xml / صفحات الاستعادة...) تصل عبر إعادة الكتابة
        //  بعلامة __ssr — نزيّلها ونترك المسار كما هو دون فرض بادئة /api
        if (req.url.indexOf('/api/__ssr/') === 0) {
            req.url = req.url.substring('/api/__ssr'.length) || '/';
        } else if (req.url.indexOf('/api') !== 0) {
            // ضمان أن المسار يبدأ بـ /api (دوال Vercel قد تحذف البادئة)
            req.url = '/api' + req.url;
        }
    } catch (e) {}

    //  وضع قديم فقط عند تفعيل RENDER_API_PROXY وغياب متغيرات قاعدة البيانات
    if (USE_RENDER_PROXY && !HAS_DB) {
        return proxyToRender(req, res);
    }

    const pathname = String(req.url || '').split('?')[0];

    // المسارات ذات الحالة إلى Render (عند تفعيل البروكسي فقط — وافتراضياً معطّل)
    if (needsRender(pathname)) {
        return proxyToRender(req, res);
    }

    // بقية الـ APIs و SSR تعمل على Vercel مباشرة
    return getApp()(req, res);
};
