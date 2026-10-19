// ============================================================
// ZoomDz — إعدادات المنصة المشتركة (Vercel للواجهة والـ APIs + Pusher للحظية)
// ------------------------------------------------------------
// - على الخادم نفسه (Render / localhost): كل شيء بنفس الأصل — لا تغيير إطلاقاً.
// - على Vercel: كل شيء (ثابت + APIs) من Vercel، والإشارة اللحظية عبر Pusher.
// - خدمة Render موقوفة: التحويل إليها معطّل افتراضياً (useRenderUploads).
// ============================================================
(function () {
    'use strict';

    var RENDER_ORIGIN = 'https://chatvidio.onrender.com';
    //  ⚠️ معطّل افتراضياً: Render موقوف — الرفع يذهب إلى نفس أصل Vercel.
    //  (حد Vercel لحجم الطلب4.5MB — الصور مضغوطة في المتصفح قبل الرفع.)
    //  فعّله يدوياً هنا فقط بعد استئناف خدمة Render.
    var useRenderUploads = false;
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
    window.ZoomDzConfig.useRenderUploads = useRenderUploads;

    //  إشارة WebRTC لم تعد عبر WebSocket خادم المنصة — بل عبر Pusher.com
    //  (نص فارغ = نفس الأصل، وwebrtc.js يبني عميل Pusher مباشرة).
    window.SIGNALING_SERVER_URL = '';

    // ============================================================
    // ✅ رفع الملفات (FormData) — فقط عند تفعيل useRenderUploads
    //    (Vercel يحدّ حجم طلب الدالة بـ4.5MB، ومنصتنا تسمح برفع حتى50MB
    //     عبر Render عند تشغيله — وإلا يبقى الرفع في نفس أصل Vercel).
    // ============================================================
    (function () {
        try {
            if (!useRenderUploads || onPlatformHost || typeof window.fetch !== 'function' || typeof FormData === 'undefined') return;
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
