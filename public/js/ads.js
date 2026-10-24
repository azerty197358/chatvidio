// ============================================================
// ZoomDz — مكتبة عرض الإعلانات المستهدفة (آمنة لمحركات البحث)
// تطابق: الوقت + المستوى + الموضع والنوع — ومرة واحدة لكل طالب كل 24 ساعة (يفرضها الخادم)
// ============================================================
window.ZoomDzAds = (function () {
    'use strict';

    // مرآة معاملات التسعير من الخادم (للمعاينة الفورية في النموذج)
    var BASE_PRICE_PER_DAY = 100;
    var HIGH_WEIGHT_LEVELS = ['bac', '3eme_as', '4eme_am', 'bem'];
    var TYPE_MULTIPLIERS = { notification: 1.6, banner: 1.35, static: 1.0 };
    var PLACEMENT_MULTIPLIERS = { all: 1.29, lessons_header: 1.6, packages: 1.35, courses: 1.3, between_posts: 1.2, comments: 1.0 };
    // معامل المواسم من الأدمن (1.25 لموسم الامتحانات، 0.5 للصيف، 1 للإيقاف)
    var seasonalMultiplier = 1;

    var PLACEMENT_LABELS = {
        all: 'كل الأماكن (تلقائي)',
        between_posts: 'بين المنشورات',
        comments: 'قسم التعليقات',
        packages: 'صفحات الباقات',
        courses: 'صفحات الدورات',
        lessons_header: 'ترويسة الدروس'
    };
    var TYPE_LABELS = {
        banner: 'إعلان بانر (ترويسة)',
        static: 'إعلان لافتة مدمجة',
        notification: 'إشعار علوي ذكي'
    };

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function authHeaders() {
        try {
            var t = localStorage.getItem('token');
            return t ? { 'Authorization': 'Bearer ' + t } : {};
        } catch (e) { return {}; }
    }

    // جلب إعلان مطابق من الخادم (يعيد null إذا لا يوجد)
    async function match(placement) {
        try {
            var res = await fetch('/api/ads/match?placement=' + encodeURIComponent(placement || ''), {
                headers: authHeaders()
            });
            var d = await res.json();
            return (d && d.success && d.ad) ? d.ad : null;
        } catch (e) {
            return null;
        }
    }

    async function trackClick(id) {
        try {
            await fetch('/api/ads/' + id + '/click', { method: 'POST', headers: authHeaders() });
        } catch (e) {}
    }

    // أبعاد ثابتة لكل نوع إعلان لتتلاءم مع مواضعها (لابتوب + جوال) وتقليل اهتزاز التخطيط (CLS)
    // الصورة تُعرض كاملة (object-fit:contain) لا مقصوصة — بخلفية فاتحة تحفظ شكل البطاقة
    var TYPE_DIMS = {
        banner: 'aspect-ratio:4 / 1; max-height:200px; background:#f8fafc;',
        static: 'aspect-ratio:3 / 2; max-height:300px; background:#f8fafc;',
        notification: null
    };
    var TYPE_IMG_ATTRS = {
        banner: 'width="1200" height="300"',
        static: 'width="600" height="400"'
    };
    var LEVEL_LABELS = {
        all: 'جميع المستويات', bac: 'بكالوريا', '3eme_as': 'بكالوريا', '4eme_am': 'رابعة متوسط (BEM)', bem: 'رابعة متوسط (BEM)',
        '2eme_as': 'ثانية ثانوي', '1ere_as': 'أولى ثانوي', '5eme_pri': 'خامسة ابتدائي',
        '1ere_am': 'أولى متوسط', '2eme_am': 'ثانية متوسط', '3eme_am': 'ثالثة متوسط', '5eme_am': 'خامسة متوسط',
        '1ere_uni': 'أولى جامعي', '2eme_uni': 'ثانية جامعي', '3eme_uni': 'ثالثة جامعي',
        master: 'ماستر', doctorat: 'دكتوراه', vocational_all: 'التكوين المهني', other: 'مستوى آخر'
    };

    // بطاقة إعلان (بانر أو لافتة) — كلها نصوص مهربة
    function cardHtml(ad) {
        if (!ad) return '';
        var isBanner = ad.ad_type === 'banner';
        var link = ad.link_url ? String(ad.link_url) : '';
        var inner = '';

        var dimStyle = TYPE_DIMS[ad.ad_type] || TYPE_DIMS.static;
        var imgAttrs = TYPE_IMG_ATTRS[ad.ad_type] || TYPE_IMG_ATTRS.static;
        if (ad.image_url && dimStyle) {
            inner += '<img src="' + esc(ad.image_url) + '" alt="' + esc(ad.title) + '" loading="lazy" decoding="async" ' + imgAttrs + ' '
                + 'style="width:100%;object-fit:contain;border-radius:12px;margin-bottom:10px;padding:6px;box-sizing:border-box;' + dimStyle + '" '
                + 'onerror="this.style.display=\'none\';">';
        }
        inner += '<div style="font-weight:800;color:#0f172a;font-size:0.98rem;margin-bottom:4px;">'
            + '<i class="fas fa-bullhorn" style="color:#f59e0b;margin-left:6px;"></i>' + esc(ad.title) + '</div>';
        if (ad.content) {
            inner += '<div style="color:#475569;font-size:0.88rem;line-height:1.7;">' + esc(ad.content) + '</div>';
        }
        inner += '<div style="margin-top:10px;">'
            + '<span style="display:inline-flex;align-items:center;gap:6px;background:#eff6ff;color:#1e40af;'
            + 'padding:6px 14px;border-radius:20px;font-weight:800;font-size:0.8rem;border:1px solid #bfdbfe;">'
            + '<i class="fas fa-external-link-alt"></i> اعرف المزيد</span></div>';

        // حجز مساحة أدنى لمنع اهتزاز التخطيط عند تحميل الصورة (CLS)
        var cardStyle = isBanner
            ? 'background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1px solid #fde68a;border-radius:16px;padding:18px;margin:18px 0;box-shadow:0 4px 14px rgba(245,158,11,0.08);min-height:120px;'
            : 'background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin:18px 0;box-shadow:0 4px 14px rgba(0,0,0,0.05);min-height:150px;';

        var adTag = '<div style="text-align:left;margin-bottom:6px;">'
            + '<span style="font-size:0.65rem;color:#94a3b8;font-weight:700;">إعلان مموّل</span></div>';

        var body = adTag + inner;
        if (link && /^https?:\/\//i.test(link)) {
            return '<a href="' + esc(link) + '" target="_blank" rel="nofollow sponsored" '
                + 'data-ad-link="' + (ad.id || '') + '" style="text-decoration:none;color:inherit;display:block;" '
                + 'onclick="ZoomDzAds.trackClick(' + (ad.id || 0) + ');">'
                + '<div style="' + cardStyle + '">' + body + '</div></a>';
        }
        return '<div style="' + cardStyle + '">' + body + '</div>';
    }

    // عرض إعلان داخل عنصر محدد
    async function renderInto(el, placement) {
        if (!el) return;
        var ad = await match(placement);
        if (!ad) return;
        el.innerHTML = cardHtml(ad);
    }

    // إشعار علوي ذكي (يظهر مرة واحدة لكل طالب كل 24 ساعة — يفرضها الخادم)
    // يُستدعى مبكراً أثناء تحليل الصفحة (قبل body) — الطلب يبدأ فوراً والإظهار ينتظر body
    async function notify() {
        var ad = await match('notification');
        if (!ad) return;

        // الصورة إن وُجدت تُعرض أعلى الشريط (يجب أن يظهر الإعلان مع صورته)
        var barImage = '';
        if (ad.image_url) {
            barImage = '<img src="' + esc(ad.image_url) + '" alt="' + esc(ad.title)
                + '" loading="lazy" decoding="async" '
                + 'style="width:44px;height:44px;flex-shrink:0;border-radius:10px;object-fit:cover;border:1px solid rgba(255,255,255,0.35);" '
                + 'onerror="this.style.display=\'none\';">';
        }

        // شريط علوي لطيف يختفي تلقائياً
        var bar = document.createElement('div');
        bar.setAttribute('data-ad-notify', '1');
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;'
            + 'background:linear-gradient(135deg,#0f5cbf,#1d4ed8);color:#fff;'
            + 'padding:12px 16px;display:flex;align-items:center;gap:10px;justify-content:center;'
            + 'box-shadow:0 6px 20px rgba(15,92,191,0.35);font-family:Cairo,sans-serif;'
            + 'animation:zoomdzAdSlideDown 0.35s ease;';
        var link = ad.link_url && /^https?:\/\//i.test(ad.link_url)
            ? '<a href="' + esc(ad.link_url) + '" target="_blank" rel="nofollow sponsored" '
                + 'onclick="ZoomDzAds.trackClick(' + (ad.id || 0) + ');" '
                + 'style="color:#fff;text-decoration:underline;font-weight:800;margin-right:8px;white-space:nowrap;">اعرف المزيد</a>'
            : '';
        bar.innerHTML = '<i class="fas fa-bell" style="flex-shrink:0;"></i>'
            + barImage
            + '<span style="font-weight:700;font-size:0.9rem;">' + esc(ad.title)
            + (ad.content ? ' — ' + esc(ad.content) : '') + '</span>'
            + link
            + '<button onclick="this.parentElement.remove()" '
            + 'style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:50%;'
            + 'width:26px;height:26px;cursor:pointer;flex-shrink:0;margin-right:8px;">✕</button>';

        // أنيميشن الدخول
        var style = document.createElement('style');
        style.textContent = '@keyframes zoomdzAdSlideDown{from{transform:translateY(-100%);opacity:0;}to{transform:translateY(0);opacity:1;}}';
        document.head.appendChild(style);
        // body قد لا يكون جاهزاً عند الاستدعاء المبكر — ننتظره قبل الإضافة
        if (document.body) {
            document.body.appendChild(bar);
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                if (document.body && !bar.parentElement) document.body.appendChild(bar);
            });
        }

        // إخفاء تلقائي بعد 10 ثوانٍ (كما طلب صاحب الموقع)
        setTimeout(function () {
            if (bar && bar.parentElement) {
                bar.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                bar.style.transform = 'translateY(-100%)';
                bar.style.opacity = '0';
                setTimeout(function () { if (bar.parentElement) bar.remove(); }, 320);
            }
        }, 10000);
    }

    // معاينة سعر فورية (مرآة المعادلة من الخادم)
    function pricePreview(input) {
        var start = new Date(input.start_date);
        var end = new Date(input.end_date);
        var days = 1;
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
        }
        var levelWeight = HIGH_WEIGHT_LEVELS.indexOf(input.education_level) !== -1 ? 2.5 : 1.0;
        var typeMultiplier = TYPE_MULTIPLIERS[input.ad_type] || 1.0;
        var placementMultiplier = PLACEMENT_MULTIPLIERS[input.placement] || 1.0;
        var total = Math.round(BASE_PRICE_PER_DAY * days * levelWeight * typeMultiplier * placementMultiplier * seasonalMultiplier);
        return { days: days, levelWeight: levelWeight, typeMultiplier: typeMultiplier, placementMultiplier: placementMultiplier, seasonalMultiplier: seasonalMultiplier, total: total };
    }

    // جلب معامل التسعير الموسمي الحالي من الخادم
    async function loadSeasonal() {
        try {
            var res = await fetch('/api/ads/seasonal');
            var d = await res.json();
            if (d && d.success && d.seasonal && typeof d.seasonal.multiplier === 'number' && d.seasonal.multiplier > 0) {
                seasonalMultiplier = d.seasonal.multiplier;
            }
        } catch (e) {}
        return seasonalMultiplier;
    }

    return {
        match: match,
        cardHtml: cardHtml,
        renderInto: renderInto,
        notify: notify,
        trackClick: trackClick,
        pricePreview: pricePreview,
        loadSeasonal: loadSeasonal,
        getSeasonalMultiplier: function () { return seasonalMultiplier; },
        LEVEL_LABELS: LEVEL_LABELS,
        PLACEMENT_LABELS: PLACEMENT_LABELS,
        TYPE_LABELS: TYPE_LABELS
    };
})();
