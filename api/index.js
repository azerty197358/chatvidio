// ============================================================
// ZoomDz — دالة Vercel الوحيدة (المنصة تعمل كلياً على Vercel + Pusher للحظية)
// ------------------------------------------------------------
// جميع المسارات (API + SSR) تصل إلى هنا عبر إعادة الكتابة في vercel.json:
//     /:path*   →   /api/index?p=:path
// المسار الأصلي يمرّر في معامل p، وسلسلة الاستعلام تبقى كما هي.
// ثم يُعاد توجيه الطلب إلى تطبيق Express الكامل (server.js).
//
//  ⚠️ لم يعد هناك أي اعتماد على Render — الإشارة اللحظية عبر Pusher.com.
//  اسم الدالة index.js (لا أقواس) لضمان اكتشافها في كل خطط Vercel.
// ============================================================

let app = null;
let appError = null;

function getApp() {
    if (app) return app;
    if (appError) return null; // منع إعادة المحاولة في كل طلب (إخفاء الخطأ مرة واحدة)
    try {
        app = require('../server');
    } catch (e) {
        appError = e;
        console.error('[Vercel api] فشل تحميل تطبيق Express:', e && e.message);
    }
    return app;
}

// استخراج المسار الأصلي من ?p=... مع بقاء سلسلة الاستعلام مدمجة كما هي
function targetFromQuery(url) {
    const u = String(url || '');
    const qIndex = u.indexOf('?');
    const pathPart = qIndex === -1 ? u : u.slice(0, qIndex);
    const queryPart = qIndex === -1 ? '' : u.slice(qIndex + 1);
    if (pathPart !== '/api/index' && pathPart !== '/api/index/') return null;

    const params = new URLSearchParams(queryPart);
    let p = params.get('p') || '/';
    params.delete('p');
    if (p.charAt(0) !== '/') p = '/' + p;
    const rest = params.toString();
    return p + (rest ? '?' + rest : '');
}

module.exports = (req, res) => {
    try {
        const target = targetFromQuery(req.url);
        if (target) {
            req.url = target;
            //  ليبني الوسيطات (CSRF والسجلات ورسائل 404) على المسار الحقيقي لا على /api/index
            req.originalUrl = target;
        } else if (typeof req.url === 'string' && req.url.indexOf('/api') !== 0) {
            //  استدعاء مباشر للدالة من مسار غير /api → نضيف البادئة كما تتوقع Express
            req.url = '/api' + req.url;
        }
    } catch (e) {}

    const handler = getApp();
    if (!handler) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({
            success: false,
            error: 'تعذر تشغيل الخادم الداخلي على Vercel',
            detail: String((appError && appError.message) || 'unknown').slice(0, 200)
        }));
    }
    return handler(req, res);
};
