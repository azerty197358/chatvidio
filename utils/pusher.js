// ============================================================
// ZoomDz — بث الرسائل والتسريع عبر Pusher.com
// (خلف خادم WebSocket على Render — أصبح النظام هجيناً: Vercel + Pusher)
// ============================================================
const logger = require('./logger');

const PUSHER_APP_ID = process.env.PUSHER_APP_ID || '2203482';
const PUSHER_KEY = process.env.PUSHER_KEY || '0ea10d39dca5fe77b6e5';
const PUSHER_SECRET = process.env.PUSHER_SECRET || 'b22466dd5ceef9519c24';
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || 'eu';

let pusherClient = null;

function getPusher() {
    if (pusherClient) return pusherClient;
    try {
        const Pusher = require('pusher');
        pusherClient = new Pusher({
            appId: PUSHER_APP_ID,
            key: PUSHER_KEY,
            secret: PUSHER_SECRET,
            cluster: PUSHER_CLUSTER,
            useTLS: true
        });
        return pusherClient;
    } catch (e) {
        logger.warn('⚠️ حزمة pusher غير متوفرة: ' + e.message);
        return null;
    }
}

// بث رسالة إلى قناة غرفة (باسم الحدث 'signal')
async function broadcastToRoom(channelName, eventName, data) {
    const pusher = getPusher();
    if (!pusher) return;
    try {
        const ev = eventName || 'signal';
        await pusher.trigger(channelName, ev, data);
    } catch (e) {
        logger.warn('⚠️ فشل البث عبر Pusher: ' + e.message);
    }
}

// مصادقة قناة private/presence لنقطة /api/pusher/auth
async function authenticateChannel(socketId, channelName, userData) {
    const pusher = getPusher();
    if (!pusher) return null;
    try {
        return pusher.authenticate(socketId, channelName, userData || undefined);
    } catch (e) {
        logger.warn('⚠️ مصادقة Pusher فشلت: ' + e.message);
        return null;
    }
}

// لقطة الغرف النشطة: قنوات presence-room- المشغولة + عدد المشتركين
async function getRoomsSnapshot() {
    const pusher = getPusher();
    if (!pusher || typeof pusher.get !== 'function') return [];
    try {
        const res = await pusher.get({
            path: '/channels',
            params: { filter_by_prefix: 'presence-room-' }
        });
        const body = (res && res.body !== undefined && res.body !== null) ? res.body : res;
        const channels = (body && body.channels) || {};
        return Object.keys(channels)
            .filter(name => channels[name] && channels[name].occupied)
            .map(name => ({
                room_id: name.replace(/^presence-room-/, ''),
                participants_count: channels[name].subscription_count || 0,
                member_count: channels[name].user_count || 0
            }));
    } catch (e) {
        logger.warn('⚠️ جلب الغرف النشطة من Pusher فشل: ' + e.message);
        return [];
    }
}

module.exports = {
    getPusher,
    broadcastToRoom,
    authenticateChannel,
    getRoomsSnapshot,
    PUSHER_CONFIG: { appId: PUSHER_APP_ID, key: PUSHER_KEY, cluster: PUSHER_CLUSTER }
};
