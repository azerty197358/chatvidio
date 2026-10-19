// ============================================================
// ZoomDz — دالة Vercel الوحيدة (المنصة تعمل كلياً على Vercel + Pusher للحظية)
// ------------------------------------------------------------
// جميع المسارات (API + SSR) تصل إلى هذه الدالة عبر إعادة الكتابة في vercel.json:
//     /:path*   →   /api/index?p=:path
// Vercel يستدعي الدالة بمسار الطلب الأصلي كما هو (وأي طريقة HTTP وأي جسم)،
// ويضيف معاملي p وpath من إعادة الكتابة — نزيّلهما ويبقى الطلب Express كما هو.
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

module.exports = (req, res) => {
    //  تنظيف معاملي إعادة الكتابة (p وpath) المحقونة من vercel.json —
    //  يبقى المسار الأصلي وبقية معاملات الاستعلام كما أرسلها المتصفح
    try {
        if (typeof req.url === 'string') {
            const qIndex = req.url.indexOf('?');
            if (qIndex !== -1) {
                const params = new URLSearchParams(req.url.slice(qIndex + 1));
                params.delete('p');
                params.delete('path');
                const rest = params.toString();
                req.url = req.url.slice(0, qIndex) + (rest ? '?' + rest : '');
                req.originalUrl = req.url; // ليبني الوسيطات (CSRF والسجلات) على الطلب الحقيقي
            }
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
