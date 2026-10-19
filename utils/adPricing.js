// ============================================================
// ZoomDz — محرك التسعير الذكي للإعلانات
// السعر = السعر الأساسي لليوم × عدد الأيام × وزن المستوى × معامل النوع × معامل الموضع
// ============================================================

const BASE_PRICE_PER_DAY = 100; // دج لكل يوم (قابلة للتعديل لاحقاً)

// المستويات ذات الوزن المرتفع (بكالوريا + رابعة متوسط BEM) — كثافة زيارات وقوة شرائية عالية
const HIGH_WEIGHT_LEVELS = ['bac', '3eme_as', '4eme_am', 'bem'];
const HIGH_WEIGHT = 2.5;
const NORMAL_WEIGHT = 1.0;

// معامل نوع الإعلان
const TYPE_MULTIPLIERS = {
    notification: 1.6, // إشعار علوي — ظهور مباشر مركّز
    banner: 1.35,      // بانر عريض في الترويسة
    static: 1.0        // لافتة مدمجة
};

// معامل موضع الظهور
const PLACEMENT_MULTIPLIERS = {
    // 📢 لا خيار موضع للحجز بعد الآن: الإعلان يظهر تلقائياً في كل المواضع
    //    (متوسط معاملات المواضع الخمسة: (1.6+1.35+1.3+1.2+1.0)/5 = 1.29)
    all: 1.29,
    lessons_header: 1.6,   // ترويسة الدروس
    packages: 1.35,        // صفحات الباقات
    courses: 1.3,          // صفحات الدورات
    between_posts: 1.2,    // بين المنشورات
    comments: 1.0          // قسم التعليقات
};

// تسميات عربية للواجهة
const LEVEL_LABELS = {
    all: 'جميع المستويات',
    bac: 'بكالوريا (3 ثانوي)',
    '3eme_as': 'بكالوريا (3 ثانوي)',
    '4eme_am': 'رابعة متوسط (BEM)',
    bem: 'رابعة متوسط (BEM)',
    '2eme_as': 'ثانية ثانوي',
    '1ere_as': 'أولى ثانوي',
    '5eme_pri': 'خامسة ابتدائي',
    '1ere_am': 'أولى متوسط',
    '2eme_am': 'ثانية متوسط',
    '3eme_am': 'ثالثة متوسط',
    '4eme_am ': 'رابعة متوسط',
    '5eme_am': 'خامسة متوسط',
    '1ere_uni': 'أولى جامعي',
    '2eme_uni': 'ثانية جامعي',
    '3eme_uni': 'ثالثة جامعي',
    master: 'ماستر',
    doctorat: 'دكتوراه',
    vocational_all: 'التكوين المهني',
    other: 'مستوى آخر'
};

const TYPE_LABELS = {
    banner: 'إعلان بانر (ترويسة)',
    static: 'إعلان لافتة مدمجة',
    notification: 'إشعار علوي ذكي'
};

const PLACEMENT_LABELS = {
    all: 'كل الأماكن (تلقائي)',
    between_posts: 'بين المنشورات',
    comments: 'قسم التعليقات',
    packages: 'صفحات الباقات',
    courses: 'صفحات الدورات',
    lessons_header: 'ترويسة الدروس'
};

/**
 * يحسب سعر الإعلان الكامل مع تفصيل المعادلة
 * @param {object} p { education_level, ad_type, placement, start_date, end_date, seasonalMultiplier }
 * @returns {object} { days, levelWeight, typeMultiplier, placementMultiplier, seasonalMultiplier, base, total, labels }
 */
function calculateAdPrice(p = {}) {
    const start = new Date(p.start_date);
    const end = new Date(p.end_date);
    let days = 1;
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    }
    const levelWeight = HIGH_WEIGHT_LEVELS.includes(p.education_level) ? HIGH_WEIGHT : NORMAL_WEIGHT;
    const typeMultiplier = TYPE_MULTIPLIERS[p.ad_type] || 1.0;
    const placementMultiplier = PLACEMENT_MULTIPLIERS[p.placement] || 1.0;
    // معامل المواسم (يضبطه الأدمن: 1.25 لموسم الامتحانات، 0.5 للصيف، 1 للإيقاف)
    const seasonalMultiplier = (typeof p.seasonalMultiplier === 'number' && p.seasonalMultiplier > 0)
        ? p.seasonalMultiplier : 1.0;
    const total = Math.round(BASE_PRICE_PER_DAY * days * levelWeight * typeMultiplier * placementMultiplier * seasonalMultiplier);

    return {
        days,
        levelWeight,
        typeMultiplier,
        placementMultiplier,
        seasonalMultiplier,
        base: BASE_PRICE_PER_DAY,
        total,
        labels: {
            level: LEVEL_LABELS[p.education_level] || p.education_level || 'جميع المستويات',
            type: TYPE_LABELS[p.ad_type] || p.ad_type,
            placement: PLACEMENT_LABELS[p.placement] || p.placement
        }
    };
}

module.exports = {
    BASE_PRICE_PER_DAY,
    HIGH_WEIGHT_LEVELS,
    HIGH_WEIGHT,
    NORMAL_WEIGHT,
    TYPE_MULTIPLIERS,
    PLACEMENT_MULTIPLIERS,
    LEVEL_LABELS,
    TYPE_LABELS,
    PLACEMENT_LABELS,
    calculateAdPrice
};
