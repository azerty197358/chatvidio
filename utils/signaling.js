// ============================================================================
//  Signaling Server (WebRTC) — مدمج في خادم المنصة الرئيسي
//  يعمل على نفس منفذ Express (Render) عبر WebSocket
// ============================================================================
const url = require('url');

const rooms = new Map();        // roomId -> Set of participants
const participants = new Map(); // ws -> info

function broadcastToRoom(roomId, message, excludeWs = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    const data = JSON.stringify(message);
    room.forEach((p) => {
        if (p.ws !== excludeWs && p.ws.readyState === 1) {
            p.ws.send(data);
        }
    });
}

function removeParticipant(ws) {
    const info = participants.get(ws);
    if (!info) return;

    const room = rooms.get(info.roomId);
    if (room) {
        room.delete(info);
        if (room.size === 0) {
            rooms.delete(info.roomId);
        } else {
            broadcastToRoom(info.roomId, {
                type: 'participant-left',
                userId: info.userId,
                role: info.role
            });
        }
    }
    participants.delete(ws);
}

/**
 * إرفاق خادم الإشارات بخادم HTTP موجود (نفس المنفذ — لا خدمة إضافية)
 */
function attachSignalingServer(httpServer) {
    // استيراد ws بشكل كسول حتى لا يفشل التشغيل إن لم تكن الحزمة مثبتة
    let WebSocketServer;
    try {
        ({ WebSocketServer } = require('ws'));
    } catch (e) {
        console.warn('[Signaling] حزمة ws غير مثبتة — تم تخطي خادم الإشارات');
        return null;
    }

    const wss = new WebSocketServer({ server: httpServer, path: '/ws-signaling' });

    wss.on('connection', (ws, req) => {
        const parsed = url.parse(req.url, true);
        const { roomId, userId, role } = parsed.query;

        if (!roomId || !userId) {
            ws.close(4000, 'Missing roomId or userId');
            return;
        }

        const info = {
            ws,
            roomId: String(roomId).slice(0, 120),
            userId: String(userId).slice(0, 120),
            role: role === 'teacher' ? 'teacher' : 'student',
            joinedAt: Date.now()
        };

        participants.set(ws, info);
        if (!rooms.has(info.roomId)) rooms.set(info.roomId, new Set());
        rooms.get(info.roomId).add(info);

        ws.send(JSON.stringify({
            type: 'joined',
            roomId: info.roomId,
            userId: info.userId,
            role: info.role,
            participants: Array.from(rooms.get(info.roomId)).map((p) => ({
                userId: p.userId,
                role: p.role,
                joinedAt: p.joinedAt
            }))
        }));

        broadcastToRoom(info.roomId, {
            type: 'participant-joined',
            userId: info.userId,
            role: info.role
        }, ws);

        ws.on('message', (data) => {
            let message;
            try {
                message = JSON.parse(data.toString());
            } catch (e) {
                return;
            }
            if (!message || typeof message.type !== 'string') return;

            message.from = info.userId;
            message.fromRole = info.role;
            message.roomId = info.roomId;

            switch (message.type) {
                case 'offer':
                case 'answer':
                case 'ice-candidate':
                //  طلب/بيانات المزامنة: يمرّرها الخادم كما تمرّر العروض — الطالب
                //  يطلب العرض عند انقطاعه فيُعيد الأستاذ بناء المسار بالكامل
                case 'sync-request':
                case 'sync-data':
                    if (message.to) {
                        const room = rooms.get(info.roomId);
                        if (room) {
                            room.forEach((p) => {
                                if (p.userId === message.to && p.ws.readyState === 1) {
                                    p.ws.send(JSON.stringify(message));
                                }
                            });
                        }
                    } else {
                        broadcastToRoom(info.roomId, message, ws);
                    }
                    break;

                case 'toggle-media':
                case 'screen-share-start':
                case 'screen-share-stop':
                    broadcastToRoom(info.roomId, message, ws);
                    break;

                //  ملاحظة: الرسائل الكتابية (chat-message) لا تمر عبر WebSocket مباشرة
                //  بل عبر REST API (/api/stream/chat/send) لضمان الحفظ في قاعدة البيانات
                //  وإنفاذ كتم الأستاذ — ثم يُرسل الخادم النسخة النهائية عبر broadcastToRoom

                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    break;

                default:
                    break;
            }
        });

        ws.on('close', () => removeParticipant(ws));
        ws.on('error', () => removeParticipant(ws));

        const heartbeat = setInterval(() => {
            if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            } else {
                clearInterval(heartbeat);
            }
        }, 30000);
        ws.on('close', () => clearInterval(heartbeat));
    });

    console.log('✅ Signaling Server (WebRTC) مفعّل على مسار /ws-signaling');
    return wss;
}

/**
 * لقطة الغرف النشطة لواجهة إدارة المنصة (بدال فتح أي اتصال)
 * تُرجع معرف الغرفة وعدد المشاركين وحالة الأستاذ لكل غرفة WebRTC نشطة
 */
function getRoomsSnapshot() {
    const snapshot = [];
    for (const [roomId, room] of rooms.entries()) {
        const participantsList = [];
        let teacherOnline = false;
        room.forEach((p) => {
            if (p.role === 'teacher') teacherOnline = true;
            participantsList.push({ userId: p.userId, role: p.role, joinedAt: p.joinedAt });
        });
        snapshot.push({
            room_id: roomId,
            participants_count: participantsList.length,
            teacher_online: teacherOnline,
            participants: participantsList
        });
    }
    return snapshot;
}

module.exports = { attachSignalingServer, broadcastToRoom, getRoomsSnapshot };
