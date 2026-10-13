// ============================================================================
//  WebRTC Room Utils — يستبدل Zoom تماماً
//  لا يعتمد على أي API خارجي: الغرفة تُنشَأ محلياً وتُوصَل المتصفحات
//  عبر Signaling Server (WebSockets) المدمج في الخادم نفسه.
// ============================================================================
const crypto = require('crypto');

/**
 * معرّف غرفة ثابت لكل درس — الأستاذ والطلاب يصلون لنفس الغرفة دائماً
 */
function buildRoomId(offerId) {
    const safe = String(offerId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    return `offer_${safe || crypto.randomBytes(6).toString('hex')}`;
}

/**
 * رابط صفحة الغرفة المحلية (داخل المنصة)
 */
function buildRoomUrl(offerId, role = 'teacher') {
    return `/live-room.html?room=${encodeURIComponent(buildRoomId(offerId))}&role=${encodeURIComponent(role)}`;
}

/**
 * إنشاء "غرفة بث" — فوري ومجاني 100% (بدون أي نداء لخادم خارجي)
 * يحافظ على توقيع الدوال القديمة حتى تتوافق مع كل المسارات.
 * @returns {Promise<{success:boolean, url:string, room_name:string, platform:string, is_free:boolean}>}
 */
async function generateWebRTCRoom(offerId = null, subjectName = '') {
    const roomId = buildRoomId(offerId);
    return {
        success: true,
        url: `/live-room.html?room=${encodeURIComponent(roomId)}`,
        room_name: roomId,
        platform: 'webrtc',
        is_free: true,
        is_custom: false
    };
}

//  توافق مع الأسماء القديمة المستوردة في المسارات
const generateFreeStreamRoom = generateWebRTCRoom;
const generateGoogleMeetRoom = generateWebRTCRoom;
const generateZoomRoom = generateWebRTCRoom;

/**
 * تنسيق رابط اجتماع قديم (Google Meet / Zoom) محفوظ في قاعدة البيانات
 * الروابط الجديدة لن تمر من هنا أصلاً — هذه للتوافق مع البيانات القديمة فقط.
 */
function formatMeetOrZoomUrl(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    // رابط غرفة WebRTC المحلية — يُمرَّر كما هو
    if (trimmed.includes('/live-room.html')) return trimmed;

    if (/^https?:\/\//i.test(trimmed)) {
        if (/zoom\.(us|com)\//i.test(trimmed) || /meet\.google\.com/i.test(trimmed)) {
            return trimmed;
        }
        return null;
    }

    // رقم اجتماع Zoom (9-11 رقماً)
    if (/^\d{9,11}$/.test(trimmed)) {
        return `https://zoom.us/j/${trimmed}`;
    }

    return null;
}

const formatGoogleMeetUrl = formatMeetOrZoomUrl;
const formatZoomUrl = formatMeetOrZoomUrl;

//  لم يعد هناك إنشاء اجتماعات عبر API خارجي
async function createGoogleMeetRoomViaApi() { return null; }
async function createZoomMeetingViaApi() { return null; }
const GOOGLE_MEET_HOST_CREATE_URL = 'https://zoom.us/home#/meeting/new';

module.exports = {
    buildRoomId,
    buildRoomUrl,
    generateWebRTCRoom,
    generateFreeStreamRoom,
    generateGoogleMeetRoom,
    generateZoomRoom,
    formatMeetOrZoomUrl,
    formatGoogleMeetUrl,
    formatZoomUrl,
    createGoogleMeetRoomViaApi,
    createZoomMeetingViaApi,
    GOOGLE_MEET_HOST_CREATE_URL
};
