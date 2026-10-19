// ============================================================
// ZoomDz — بث الرسائل إلى غرف البث
//   انتقل من WebSocket على Render إلى Pusher.com (النظام الهجين)
//   يُبقي التصدير متوافقاً مع routes/stream.js (broadcastToRoom)
// ============================================================
const { broadcastToRoom: pusherBroadcastToRoom } = require('./pusher');

// بث رسالة إلى غرفة البث المفتوحة (WebRTC) — عبر Pusher
//  اسم القناة يجب أن يماثل ما يبنيه العميل في webrtc.js: presence-room-{roomId}
function broadcastToRoom(roomId, message) {
    try {
        const channelName = /^presence-room-/.test(roomId) ? roomId : 'presence-room-' + roomId;
        pusherBroadcastToRoom(channelName, 'signal', message);
    } catch (e) {
        /* البث تكميلي — لا يُبطل الطلب */
    }
}

// لقطة الغرف النشطة عبر واجهة Pusher REST (قنوات presence-room- المشغولة)
function getRoomsSnapshot() {
    try {
        const { getRoomsSnapshot: fromPusher } = require('./pusher');
        return fromPusher(); // Promise<{ room_id, participants_count }>
    } catch (e) {
        return [];
    }
}

// خادم WebSocket لم يعد مستخدماً (النظام هجين الآن) — نُبقي التصدير للتوافق
function attachSignalingServer() {
    return null;
}

module.exports = { broadcastToRoom, getRoomsSnapshot, attachSignalingServer };
