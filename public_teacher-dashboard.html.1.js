
// ============================================================================
//  ⏸️ إيقاف الاستقصاء عند الخمول
//  ---------------------------------------------------------------------------
//  كل مؤقتات هذه الصفحة تمرّ من هنا. عندما تكون التبويب مخفياً أو
//  الشاشة مطفأة نتوقف عن كل الطلبات، لأن لا أحد يرى النتيجة أصلاً.
//  هذا يخفض عدد الطلبات على الخادم إلى الصفر تقريباً لمن يترك
//  المنصة مفتوحة في خلفيةanotherDevice.
(function () {
    if (window.__zoomyIdlePaused) return;
    window.__zoomyIdlePaused = { active: 0, resumed: 0 };

    var nativeSetInterval = window.setInterval.bind(window);

    //  كل مؤقت يسجل نفسه ليُوقَف عند الخمول
    var registry = [];

    window.setInterval = function (fn, ms) {
        var delay = Math.max(ms || 0, 2000);
        var id = nativeSetInterval(function () {
            if (document.hidden) return;   //  لا أحد ينتظر هذه النتيجة
            try { fn(); } catch (e) {}
        }, delay);
        registry.push({ id: id, fn: fn, ms: delay, inner: null });
        return id;
    };

    function pauseAll() {
        if (document.hidden) return;
        registry.forEach(function (item) {
            try { window.clearInterval(item.id); } catch (e) {}
        });
    }

    function resumeAll() {
        if (!document.hidden) return;
        registry.forEach(function (item) {
            item.id = nativeSetInterval(function () {
                if (document.hidden) return;
                try { item.fn(); } catch (e) {}
            }, item.ms);
            window.__zoomyIdlePaused.resumed++;
        });
        window.__zoomyIdlePaused.active = registry.length;
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) pauseAll(); else resumeAll();
    }, { passive: true });

    window.addEventListener('pageshow', function () { resumeAll(); }, { passive: true });
    window.addEventListener('focus', function () { resumeAll(); }, { passive: true });

})();
