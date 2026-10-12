// ============================================================================
//  عميل Zoom الرسمي — بديل Agora و Google Meet
//  المصادقة: OAuth 2.0 بصلاحيات الحساب (account_credentials)
//  المرجع: https://developers.zoom.dev/docs/integrations/oauth-jwt/
//  الأسرار تُقرأ من بيئة التشغيل فقط، ولا تُكتب هنا ولا تُرفع.
// ============================================================================
const crypto = require('crypto');
const axios = require('axios');

const ZOOM_API = 'https://api.zoom.us/v2';
const ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token';

const ZOOM_CONFIG = {
    account_id: process.env.ZOOM_ACCOUNT_ID || '',
    client_id: process.env.ZOOM_CLIENT_ID || '',
    client_secret: process.env.ZOOM_CLIENT_SECRET || ''
};

//  رابط إنشاء اجتماع جديد بصفتك المضيف (يُفتح في نافذة المستخدم)
const ZOOM_HOST_CREATE_URL = 'https://zoom.us/home#/meeting/new';

//  رمز الوصول صالح ساعة كاملة؛ نخزّنه ونجدده قبل انتهائه بقليل
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * هل الأسرار الثلاثة مضبوطة؟ بدونها لا يمكن إنشاء اجتماع حقيقي.
 */
function isZoomConfigured() {
    return Boolean(
        ZOOM_CONFIG.account_id && ZOOM_CONFIG.account_id.trim() &&
        ZOOM_CONFIG.client_id && ZOOM_CONFIG.client_id.trim() &&
        ZOOM_CONFIG.client_secret && ZOOM_CONFIG.client_secret.trim()
    );
}

/**
 * الحصول على access_token صالح (مع تخزينه مؤقتاً حتى انتهاء صلاحيته)
 */
async function getAccessToken() {
    if (cachedToken && tokenExpiresAt > Date.now() + 60 * 1000) {
        return cachedToken;
    }

    if (!isZoomConfigured()) {
        console.error('[Zoom] الأسرار غير مضبوطة: ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET');
        return null;
    }

    const accountId = ZOOM_CONFIG.account_id.trim();
    const clientId = ZOOM_CONFIG.client_id.trim();
    const clientSecret = ZOOM_CONFIG.client_secret.trim();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
        const res = await axios.post(
            ZOOM_OAUTH_URL,
            `grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${basic}`
                },
                timeout: 15000
            }
        );

        if (res.data && res.data.access_token) {
            cachedToken = res.data.access_token;
            tokenExpiresAt = Date.now() + (Number(res.data.expires_in) || 3600) * 1000;
            return cachedToken;
        }
        console.error('[Zoom] لم يُرجع خادم التفويض رمز وصول');
    } catch (err) {
        const detail = err.response
            ? `${err.response.status} ${JSON.stringify(err.response.data)}`
            : err.message;
        console.error('[Zoom] فشل التفويض:', detail);
    }

    return null;
}

/**
 * إنشاء اجتماع Zoom حقيقي عبر API باسم المستخدم الرئيسي للحساب
 * @returns {{success:boolean, url?:string, meeting_id?:string, start_url?:string, platform:string, is_free:boolean, reason?:string}}
 */
async function createZoomMeetingViaApi(teacherId, subjectName = '', offerDate = null, durationMinutes = 60) {
    const token = await getAccessToken();
    if (!token) {
        return { success: false, reason: 'NOT_CONNECTED', platform: 'zoom', is_free: true };
    }

    try {
        const start = offerDate ? new Date(offerDate) : new Date();
        const mins = Math.min(300, Math.max(5, Number(durationMinutes) || 60));

        const payload = {
            topic: `حصة مباشرة: ${subjectName || 'درس منصة ZoomDz'}`,
            type: 2, // اجتماع مجدول
            start_time: new Date(start.getTime()).toISOString().slice(0, 19).replace('T', ' '),
            duration: mins,
            timezone: 'Africa/Algiers',
            settings: {
                host_video: true,
                participant_video: true,
                join_before_host: true,
                mute_upon_entry: false,
                waiting_room: false,
                auto_in_meeting_recording: 'none'
            }
        };

        const res = await axios.post(`${ZOOM_API}/users/me/meetings`, payload, {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 20000
        });

        const d = res.data;
        if (d && d.join_url) {
            console.log(`✅ تم إنشاء اجتماع Zoom للأستاذ ${teacherId}: ${d.join_url}`);
            return {
                success: true,
                url: d.join_url,
                start_url: d.start_url || '',
                meeting_id: String(d.id || ''),
                uuid: d.uuid || '',
                room_name: String(d.id || d.join_url),
                platform: 'zoom',
                is_free: true
            };
        }

        return { success: false, reason: 'NO_LINK_RETURNED', platform: 'zoom', is_free: true };
    } catch (err) {
        const detail = err.response
            ? `${err.response.status} ${JSON.stringify(err.response.data)}`
            : err.message;
        console.error('[Zoom] فشل إنشاء الاجتماع:', detail);
        return { success: false, reason: 'API_ERROR', platform: 'zoom', is_free: true, error: String(detail) };
    }
}

/**
 * التحقق من رابط Zoom أو رقم الاجتماع وتنسيقه
 * يقبل: https://zoom.us/j/1234567890 ، رابط اجتماع كامل، أو رقم من 9 إلى 11 رقماً
 */
function formatZoomUrl(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    //  روابط Jitsi ممنوعة من المنظومة
    if (trimmed.toLowerCase().includes('jit.si')) return null;

    //  رقم اجتماع صرف (9-11 رقماً)
    if (/^\d{9,11}$/.test(trimmed)) {
        return `https://zoom.us/j/${trimmed}`;
    }

    //  رابط zoom.us كامل
    if (/^https?:\/\/(www\.)?zoom\.us\//i.test(trimmed) || /^https?:\/\/(www\.)?zoom\.com\//i.test(trimmed)) {
        return trimmed.replace(/^http:/i, 'https:').replace(/\s+$/, '');
    }

    //  استخلاص الرابط من نص أطول
    const found = trimmed.match(/https?:\/\/(www\.)?zoom\.(us|com)\/[a-zA-Z0-9_\-/?=&%.]+/i);
    if (found) {
        return found[0].replace(/^http:/i, 'https:');
    }

    return null;
}

/**
 * التحقق من رابط Google Meet مخزّن قديم (توافق رجعي فقط)
 */
function formatGoogleMeetUrl(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (trimmed.toLowerCase().includes('jit.si')) return null;
    if (/^https?:\/\/meet\.google\.com\/[a-zA-Z0-9_-]+/i.test(trimmed)) {
        return trimmed.replace(/^http:/i, 'https:');
    }
    const m = trimmed.match(/https:\/\/meet\.google\.com\/[a-zA-Z0-9_-]+/i);
    return m ? m[0] : null;
}

/**
 * تنسيق رابط البث: Zoom أولاً (المنصة الآن)، ثم Meet المخزّن قديماً
 */
function formatMeetOrZoomUrl(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    const zoom = formatZoomUrl(trimmed);
    if (zoom) return zoom;

    //  روابط Meet المحفوظة قبل التحول تبقى صالحة
    const t = trimmed.toLowerCase();
    if (t.includes('meet.google.com')) {
        if (/^https?:\/\/meet\.google\.com\/[a-zA-Z0-9_-]+/i.test(trimmed)) {
            return trimmed.replace(/^http:/i, 'https:');
        }
        const m = trimmed.match(/https:\/\/meet\.google\.com\/[a-zA-Z0-9_-]+/i);
        return m ? m[0] : null;
    }

    return null;
}

/**
 * توليد رقم اجتماع Zoom صيغةً (9-11 رقماً، لا يبدأ بصفر)
 */
function generateZoomMeetingNumber() {
    let s = String(1 + Math.floor(Math.random() * 9)); // الرقم الأول 1-9
    for (let i = 0; i < 9; i++) s += Math.floor(Math.random() * 10);
    return s;
}

/**
 * توليد غرفة بث عبر Zoom: نعتمد رابطاً موجوداً وإلا أنشأنا اجتماعاً حقيقياً عبر API
 * (غير متزامنة: إنشاء الاجتماع يستدعي خادم Zoom)
 */
async function generateZoomRoom(offerId = null, subjectName = '', customUrl = '') {
    //  رابط أو رقم اجتماع مُدخل يدوياً
    const candidate = (typeof offerId === 'string' && (offerId.includes('http') || /^\d{9,11}$/.test(offerId)))
        ? offerId
        : (typeof customUrl === 'string' && customUrl ? customUrl : '');

    if (candidate) {
        const formatted = formatMeetOrZoomUrl(candidate);
        if (formatted) {
            return {
                url: formatted,
                start_url: formatted,
                room_name: formatted,
                platform: formatted.includes('zoom.') ? 'zoom' : 'google_meet',
                is_free: true,
                is_custom: true,
                success: true
            };
        }
    }

    //  إنشاء اجتماع حقيقي عبر API
    const created = await createZoomMeetingViaApi(String(offerId || ''), subjectName, null, 60);
    if (created && created.success && created.url) {
        return created;
    }

    //  فشل الإنشاء: لا نخترع رابطاً وهمياً، بل نُبلغ الباحث بأنه قابل لإعادة المحاولة
    return {
        success: false,
        url: null,
        room_name: null,
        platform: 'zoom',
        is_free: true,
        is_custom: false,
        reason: (created && created.reason) || 'NOT_CREATED',
        retryable: true
    };
}

/**
 * غرفة البث المجاني — اسمٌ محفوظ للتوافق، تنفّذ الآن عبر Zoom
 */
async function generateFreeStreamRoom(offerId = null, subjectName = '', customUrl = '') {
    return generateZoomRoom(offerId, subjectName, customUrl);
}

/**
 * اسمٌ محفوظ للتوافق مع الملفات القديمة
 */
async function generateGoogleMeetRoom(offerId = null, subjectName = '', customUrl = '') {
    return generateZoomRoom(offerId, subjectName, customUrl);
}

module.exports = {
    ZOOM_API,
    ZOOM_CONFIG,
    ZOOM_HOST_CREATE_URL,
    isZoomConfigured,
    getAccessToken,
    createZoomMeetingViaApi,
    formatZoomUrl,
    formatGoogleMeetUrl,
    formatMeetOrZoomUrl,
    generateZoomMeetingNumber,
    generateZoomRoom,
    generateFreeStreamRoom,
    generateGoogleMeetRoom
};
