// ============================================================================
//  📡 حالة الاتصال بالإنترنت
//  ---------------------------------------------------------------------------
//  ثلاث مشاكل تحلّ هنا مرة واحدة:
//   1) نعرف قطع الاتصال حتى لو قال navigator.onLine إنه متصل - نتبع نتيجة
//      الطلبات الحقيقية، وهو الأدق.
//   2) شريط ناعم يظهر عند القطع ويختفي عند العودة، بلا إعادة تحميل الصفحة.
//   3) الإشعارات المزعجة عن فشل الشبكة تُكتم عند القطع، لأن الشريط يقول
//      كل شيء ولا داعي لتكديس رسائل فوقه.
// ============================================================================
(function () {
    'use strict';
    if (window.ZoomyNet) return;

    var listeners = [];
    var online = (typeof navigator === 'undefined' || navigator.onLine !== false);

    //  فشلان متتاليان قبل أن نُعلن القطع: تفادي الاهتزاز بين عمليتين
    var FAILURES_BEFORE_OFFLINE = 2;
    var consecutiveFailures = 0;
    var SUCCESSES_TO_RECOVER = 1;

    var banner = null;
    var hideTimer = null;

    // ---------------------------------------------------------------------
    //  الشريط
    // ---------------------------------------------------------------------
    function ensureBanner() {
        if (banner && banner.isConnected) return banner;
        banner = document.getElementById('zoomyNetBanner');
        if (banner) return banner;

        banner = document.createElement('div');
        banner.id = 'zoomyNetBanner';
        banner.className = 'zoomy-net-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.innerHTML =
            '<i class="fas fa-wifi" aria-hidden="true"></i>' +
            '<span id="zoomyNetBannerText"></span>';
        (document.body || document.documentElement).appendChild(banner);
        return banner;
    }

    function paint(text, kind, autoHide) {
        var el = ensureBanner();
        var span = document.getElementById('zoomyNetBannerText');
        if (!span) return;

        span.textContent = text;
        // الأصناف مطابقة تماماً لأسماء ما في التنسيق
        var cls = kind === 'off' ? 'zoomy-net-off' : 'zoomy-net-on';
        el.className = 'zoomy-net-banner ' + cls;
        el.classList.add('zoomy-net-show');
        document.documentElement.classList.toggle('zoomy-net-offline', kind === 'off');

        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        if (autoHide) {
            hideTimer = setTimeout(function () {
                el.classList.remove('zoomy-net-show');
                hideTimer = null;
            }, 3200);
        }
    }

    function apply(isUp, announce) {
        if (online === isUp) return;
        online = isUp;
        consecutiveFailures = 0;

        if (isUp) {
            paint('تم الاتصال بالإنترنت', 'on', true);
        } else if (announce) {
            paint('انقطع الاتصال بالإنترنت', 'off', false);
        }
        listeners.forEach(function (fn) {
            try { fn(isUp); } catch (e) {}
        });
    }

    // ---------------------------------------------------------------------
    // 兩個 مصدران للحقيقة: المتصفح، ونتيجة الطلبات نفسها
    // ---------------------------------------------------------------------
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('offline', function () { apply(false, true); }, { passive: true });
        window.addEventListener('online', function () { apply(true, true); }, { passive: true });
    }

    function markFailure() {
        if (!online) return;
        consecutiveFailures++;
        if (consecutiveFailures >= FAILURES_BEFORE_OFFLINE) apply(false, true);
    }

    function markSuccess() {
        consecutiveFailures = 0;
        if (!online) apply(true, true);
        else if (banner && banner.classList.contains('zoomy-net-on')) {
            if (!hideTimer) paint('تم الاتصال بالإنترنت', 'on', true);
        }
    }

    window.ZoomyNet = {
        isOnline: function () { return online; },
        markFailure: markFailure,
        markSuccess: markSuccess,
        onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
    };

    /** هل هذا الخطأ خطأ شبكة/خادم عام لا يستحق إزعاج المستخدم؟ */
    window.isNetworkishError = function (message, status) {
        if (status && (status === 0 || status >= 500 || status === 502 || status === 503 || status === 504)) return true;
        var t = String(message == null ? '' : message).toLowerCase();
        var marks = ['failed to fetch', 'networkerror', 'network request failed', 'load failed',
            'fetch error', 'econnrefused', 'enotfound', 'etimedout', 'err_internet_disconnected',
            'err_network', 'the internet connection', 'تعذر إكمال العملية', 'خطأ في الاتصال'];
        for (var i = 0; i < marks.length; i++) { if (t.indexOf(marks[i]) !== -1) return true; }
        return false;
    };

    //  نبدأ بشكل صحيح: إن كان المتصفح يقول نحن غير متصلين
    if (typeof navigator !== 'undefined' && navigator.onLine === false) apply(false, true);
})();