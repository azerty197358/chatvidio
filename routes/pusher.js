// ============================================================
// ZoomDz — مصادقة قنوات Pusher (private/presence)
// نقطة النهاية التي يستدعيها عميل Pusher في المتصفح قبل الاشتراك
// ============================================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authenticateChannel } = require('../utils/pusher');
const logger = require('../utils/logger');

// أسماء القنوات المسموحة: presence-room-{offerId} أو private-room-{offerId}
const CHANNEL_RE = /^(presence|private)-room-[A-Za-z0-9_-]{1,100}$/;

router.post('/auth', authenticate, async (req, res) => {
    try {
        const socketId = String(req.body.socket_id || '');
        const channelName = String(req.body.channel_name || '');

        if (!socketId || !channelName) {
            return res.status(400).json({ error: 'socket_id و channel_name مطلوبان' });
        }
        if (!CHANNEL_RE.test(channelName)) {
            return res.status(403).json({ error: 'قناة غير مسموحة' });
        }

        const userId = String(req.user.userId);
        const role = req.user.role;

        //  معرّف الإشارة داخل الغرفة (مثلاً teacher_a1b2c3) يحدده العميل نفسه كما كان
        //  يفعل مع خادم WebSocket القديم — نتحقق من صيغته فقط ونستخدمه هوية presence
        let signalingId = String(req.body.user_id || userId).trim();
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(signalingId)) signalingId = userId;

        // قنوات presence تتطلب channel_data تعرف العضو
        let userData;
        if (channelName.startsWith('presence-')) {
            userData = {
                user_id: signalingId,
                user_info: {
                    role: role,
                    userId: signalingId,
                    jwtUserId: userId,
                    name: req.user.full_name || req.user.name || 'مستخدم'
                }
            };
        }

        const auth = await authenticateChannel(socketId, channelName, userData);
        if (!auth) {
            return res.status(500).json({ error: 'تعذر المصادقة' });
        }
        res.json(auth);
    } catch (e) {
        logger.warn('pusher auth error: ' + e.message);
        res.status(500).json({ error: 'حدث خطأ في المصادقة' });
    }
});

module.exports = router;
