// ============================================================
// ZoomDz — إعدادات المنصة المشتركة (وضع الهجّين: Vercel للواجهة + Render للخادم)
// ------------------------------------------------------------
// - على الخادم نفسه (Render / localhost): كل شيء بنفس الأصل — لا تغيير إطلاقاً.
// - على Vercel: الواجهة الثابتة تُخدَم من هنا بسرعة، بينما تُوجَّه
//   طلبات /api تلقائياً إلى Render عبر إعادة الكتابة في vercel.json،
//   ويجب توجيه اتصال WebSocket (إشارة WebRTC والبث) صراحةً إلى Render
//   لأن إعادة كتابة Vercel لا تمرّر اتصالات WebSocket (Upgrade).
// ============================================================
(function () {
    'use strict';

    var RENDER_ORIGIN = 'https://chatvidio.onrender.com';
    var host = (window.location && window.location.hostname) || '';
    var onPlatformHost =
        host === '' ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        /\.onrender\.com$/i.test(host);

    window.ZoomDzConfig = window.ZoomDzConfig || {};
    window.ZoomDzConfig.renderOrigin = RENDER_ORIGIN;
    // true = الواجهة مخدومة من نفس خادم المنصة (Render/محلي) → نفس الأصل
    window.ZoomDzConfig.servedByRender = onPlatformHost;

    // خادم إشارات WebRTC والبث والدردشة اللحظية.
    // نص فارغ = "نفس الأصل" (سلوك webrtc.js الافتراضي دون أي تغيير).
    // على Vercel نحدّد Render صراحةً حتى تعمل الغرف والبث مباشرة.
    window.SIGNALING_SERVER_URL = onPlatformHost ? '' : RENDER_ORIGIN;

    // ============================================================
    // ✅ رفع الملفات (FormData) يذهب مباشرة إلى Render
    //    لأن Vercel يحدّ حجم طلب الدالة بـ 4.5MB كحد أقصى،
    //    بينما منصتنا تسمح برفع حتى 50MB (منشورات/باقات/مستندات).
    //    كل طلبات النصوص (JSON) تبقى عبر دالة Vercel لتوفير عرض النطاق على Render.
    // ============================================================
    (function () {
        try {
            if (onPlatformHost || typeof window.fetch !== 'function' || typeof FormData === 'undefined') return;
            var origFetch = window.fetch.bind(window);
            window.fetch = function (input, init) {
                try {
                    var url = typeof input === 'string' ? input : (input && input.url) || '';
                    var body = init && init.body;
                    var isForm = body instanceof FormData;
                    if (!isForm && body) {
                        try { isForm = Object.prototype.toString.call(body) === '[object FormData]'; } catch (e) {}
                    }
                    if (isForm && url.indexOf('/api/') === 0) {
                        var newUrl = RENDER_ORIGIN + url;
                        if (typeof input === 'string') {
                            input = newUrl;
                        } else {
                            input = new Request(newUrl, input);
                        }
                        init = init || {};
                        init.credentials = 'include'; // إرسال الكوكيز (جلسة/CSRF) عبر المصدر
                    }
                } catch (e) {}
                return origFetch(input, init);
            };
        } catch (e) {}
    })();
})();
