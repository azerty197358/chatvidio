// ============================================================================
//  WebRTC Signaling Server - يعمل على Render (WebSocket دائم)
//  للتعامل مع إشارات WebRTC: offer/answer/ice-candidate
// ============================================================================
const http = require('http');
const { WebSocketServer } = require('ws');
const url = require('url');

const PORT = process.env.PORT || 3001;

// تخزين الغرف والمشاركين
const rooms = new Map(); // roomId -> Set of participants
const participants = new Map(); // ws -> { roomId, userId, role, metadata }

// إنشاء خادم HTTP بسيط
const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    // Health check endpoint
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok', 
            rooms: rooms.size,
            participants: participants.size,
            uptime: process.uptime()
        }));
        return;
    }
    
    // Room info endpoint
    if (req.url?.startsWith('/api/room/')) {
        const roomId = req.url.split('/api/room/')[1];
        const room = rooms.get(roomId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            roomId,
            exists: !!room,
            participantCount: room?.size || 0,
            participants: room ? Array.from(room).map(p => ({
                userId: p.userId,
                role: p.role,
                joinedAt: p.joinedAt
            })) : []
        }));
        return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
});

// WebSocket Server
const wss = new WebSocketServer({ server });

function broadcastToRoom(roomId, message, excludeWs = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const data = JSON.stringify(message);
    room.forEach(participant => {
        if (participant.ws !== excludeWs && participant.ws.readyState === 1) {
            participant.ws.send(data);
        }
    });
}

function getParticipantInfo(ws) {
    return participants.get(ws);
}

function removeParticipant(ws) {
    const info = participants.get(ws);
    if (!info) return;
    
    const room = rooms.get(info.roomId);
    if (room) {
        room.delete(info);
        if (room.size === 0) {
            rooms.delete(info.roomId);
            console.log(`Room ${info.roomId} deleted (empty)`);
        } else {
            // إشعار الباقين بخروج المشارك
            broadcastToRoom(info.roomId, {
                type: 'participant-left',
                userId: info.userId,
                role: info.role
            });
        }
    }
    participants.delete(ws);
    console.log(`Participant ${info.userId} left room ${info.roomId}`);
}

wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    
    // Parse query parameters for roomId, userId, role
    const parsedUrl = url.parse(req.url, true);
    const { roomId, userId, role, token } = parsedUrl.query;
    
    if (!roomId || !userId) {
        ws.close(4000, 'Missing roomId or userId');
        return;
    }
    
    // تسجيل المشارك
    const participantInfo = {
        ws,
        roomId,
        userId,
        role: role || 'student', // 'teacher' or 'student'
        joinedAt: Date.now(),
        metadata: {}
    };
    
    participants.set(ws, participantInfo);
    
    // إنشاء/الانضمام للغرفة
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
        console.log(`Room ${roomId} created`);
    }
    rooms.get(roomId).add(participantInfo);
    
    console.log(`Participant ${userId} (${role}) joined room ${roomId}. Room size: ${rooms.get(roomId).size}`);
    
    // إرسال تأكيد الانضمام
    ws.send(JSON.stringify({
        type: 'joined',
        roomId,
        userId,
        role,
        participants: Array.from(rooms.get(roomId)).map(p => ({
            userId: p.userId,
            role: p.role,
            joinedAt: p.joinedAt
        }))
    }));
    
    // إشعار الباقين بمشارك جديد
    broadcastToRoom(roomId, {
        type: 'participant-joined',
        userId,
        role
    }, ws);
    
    // التعامل مع الرسائل
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            const info = getParticipantInfo(ws);
            if (!info) return;
            
            // إضافة معلومات المرسل
            message.from = info.userId;
            message.fromRole = info.role;
            message.roomId = info.roomId;
            
            switch (message.type) {
                case 'offer':
                case 'answer':
                case 'ice-candidate':
                    // إعادة توجيه إلى مستخدم محدد أو الكل
                    if (message.to) {
                        // إرسال لمستخدم محدد
                        const room = rooms.get(info.roomId);
                        if (room) {
                            room.forEach(p => {
                                if (p.userId === message.to && p.ws.readyState === 1) {
                                    p.ws.send(JSON.stringify(message));
                                }
                            });
                        }
                    } else {
                        // بث للجميع في الغرفة (ماعدا المرسل)
                        broadcastToRoom(info.roomId, message, ws);
                    }
                    break;
                    
                case 'toggle-media':
                    // إشعار بتغيير حالة الكاميرا/الميكروفون
                    broadcastToRoom(info.roomId, message, ws);
                    break;
                    
                case 'chat-message':
                    // رسائل الدردشة داخل الغرفة
                    broadcastToRoom(info.roomId, message);
                    break;
                    
                case 'screen-share-start':
                case 'screen-share-stop':
                    broadcastToRoom(info.roomId, message, ws);
                    break;
                    
                case 'request-sync':
                    // طلب مزامنة من معلم جديد
                    broadcastToRoom(info.roomId, {
                        type: 'sync-request',
                        from: info.userId
                    }, ws);
                    break;
                    
                case 'sync-data':
                    // بيانات المزامنة (للمعلمين الجدد)
                    if (message.to) {
                        const room = rooms.get(info.roomId);
                        if (room) {
                            room.forEach(p => {
                                if (p.userId === message.to && p.ws.readyState === 1) {
                                    p.ws.send(JSON.stringify(message));
                                }
                            });
                        }
                    }
                    break;
                    
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    break;
                    
                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (e) {
            console.error('Message parse error:', e.message);
        }
    });
    
    ws.on('close', () => {
        removeParticipant(ws);
    });
    
    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
        removeParticipant(ws);
    });
    
    // Heartbeat
    const heartbeat = setInterval(() => {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        } else {
            clearInterval(heartbeat);
        }
    }, 30000);
    
    ws.on('close', () => clearInterval(heartbeat));
});

// تنظيف الغرف الفارغة دورياً
setInterval(() => {
    for (const [roomId, room] of rooms.entries()) {
        if (room.size === 0) {
            rooms.delete(roomId);
            console.log(`Cleaned empty room: ${roomId}`);
        }
    }
}, 60000);

server.listen(PORT, () => {
    console.log(`🚀 Signaling Server running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
});

module.exports = { server, wss, rooms, participants };