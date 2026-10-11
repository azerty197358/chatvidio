/**
 * نقاط الذكاء الاصطناعي
 * =============================================================================
 * القاعدة الأولى: لا يمنح النظام نقاطاً مجانية إلا إذا رفع المالك الرقم
 * عمداً من لوحة الإعدادات. الافتراضي صفر، أي أن كل حساب جديد - طالباً كان
 * أو أستاذاً - يبدأ بلا رصيد ويشتري ما يحتاجه.
 *
 * القاعدة الثانية وهي الأهم: التجديد اليومي يضاف إلى الرصيد ولا يمسحه أبداً.
 * كان الكود يستبدل الرصيد كاملاً بقيمة المجاني، فمشترٍ واحد كان تفقد نقاطه
 * كلها في اليوم التالي. الآن المنع المجاني عنده صفر لا يحصل على شيء، ومن
 * رفعه في لوحة الإعدادات تُضاف نقاطه فوق رصيده ولا تُمحى.
 */

// ما يبدأ به أي حساب جديد عند التسجيل
const STARTING_AI_TOKENS = 0;

// ما يُمنح مجاناً كل يوم إن رفعه المالك من لوحة الإعدادات
const DEFAULT_FREE_AI_POINTS = 0;

/** يحوّل أي مدخل إلى عدد صحيح غير سالب */
function toCount(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.floor(n);
}

/** الرصيد كما هو، بلا قيم غريبة */
function safeTokens(value) {
    return toCount(value, 0);
}

/** ما يمنحه النظام مجاناً لهذا النوع من الحسابات */
function freeAiPoints(settings, role) {
    if (!settings || typeof settings !== 'object') return DEFAULT_FREE_AI_POINTS;
    const key = role === 'teacher' ? 'teacher_free_ai_points' : 'student_free_ai_points';
    if (settings[key] === null || settings[key] === undefined) return DEFAULT_FREE_AI_POINTS;
    return toCount(settings[key], DEFAULT_FREE_AI_POINTS);
}

/**
 * ما يحدث عند بداية يوم جديد.
 * granted === 0 يعني: لا يُضاف شيء، والرصيد يُترك كما هو تماماً.
 * لا يوجد أي مسار في هذه الدالة يُرجع رصيداً أقل مما كان.
 */
function dailyGrant(currentTokens, freePoints) {
    const current = safeTokens(currentTokens);
    const granted = toCount(freePoints, 0);
    if (granted <= 0) return { tokens: current, granted: 0 };
    return { tokens: current + granted, granted: granted };
}

module.exports = {
    STARTING_AI_TOKENS,
    DEFAULT_FREE_AI_POINTS,
    toCount,
    safeTokens,
    freeAiPoints,
    dailyGrant
};