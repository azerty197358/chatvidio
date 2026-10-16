// ============================================================================
//  مكتبة WebRTC للمنصة - تعمل مع Signaling Server على Render
//  تستبدل Zoom/Agora تماماً - اتصال مباشر بين المتصفحات
// ============================================================================
(function () {
    'use strict';
    if (window.ZoomyRTC) return;

    const CONFIG = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:stun.voipgateway.com' },
            { urls: 'stun:stun.sipgate.net' },
            // TURN عام مجاني (Open Relay) — يمرّر الوسائط فقط عندما يتعذّر
            // الاتصال المباشر، فيتصل الطلاب الذين يُخفيهم مشغّلهم الخلفي (NAT صارم)
            { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }
        ],
        iceCandidatePoolSize: 10
    };

    let ws = null;
    let localStream = null;
    let peerConnections = new Map(); // userId -> RTCPeerConnection
    let currentRoom = null;
    let currentUserId = null;
    let currentRole = 'student';
    let reconnectAttempts = 0;
    let maxReconnectAttempts = 5;
    let reconnectTimer = null;
    let pingTimer = null;
    let onRemoteStreamCallback = null;
    let onParticipantJoinedCallback = null;
    let onParticipantLeftCallback = null;
    let onConnectionStateCallback = null;
    let onChatMessageCallback = null;
    let onModerationCallback = null;
    let onScreenShareCallback = null;

    function getSignalingUrl() {
        //  الافتراضي: نفس خادم المنصة (Signaling مدمج على /ws-signaling)
        //  يمكن تجاوزه عبر window.SIGNALING_SERVER_URL لو فُصل الخادم لاحقاً
        const base = (window.SIGNALING_SERVER_URL || window.location.origin);
        return base.replace(/\/$/, '');
    }

    function generateId() {
        return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    }

    async function connect(roomId, userId, role, token) {
        if (ws) disconnect();

        currentRoom = roomId;
        currentUserId = userId || generateId();
        currentRole = role || 'student';

        const wsUrl = getSignalingUrl()
            .replace('https://', 'wss://')
            .replace('http://', 'ws://');

        const params = new URLSearchParams({
            roomId: currentRoom,
            userId: currentUserId,
            role: currentRole
        });
        if (token) params.set('token', token);

        return new Promise((resolve, reject) => {
            try {
                ws = new WebSocket(`${wsUrl}/ws-signaling?${params.toString()}`);

                const connectTimeout = setTimeout(() => {
                    if (ws.readyState !== 1) {
                        reject(new Error('Connection timeout'));
                        ws.close();
                    }
                }, 10000);

                ws.onopen = () => {
                    clearTimeout(connectTimeout);
                    reconnectAttempts = 0;
                    console.log('[ZoomyRTC] Connected to signaling server');
                    startPing();
                    if (onConnectionStateCallback) onConnectionStateCallback('connected');
                    resolve();
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        handleSignalingMessage(msg);
                    } catch (e) {
                        console.warn('[ZoomyRTC] Message parse error:', e.message);
                    }
                };

                ws.onclose = (event) => {
                    clearTimeout(connectTimeout);
                    console.log('[ZoomyRTC] Disconnected:', event.code, event.reason);
                    stopPing();
                    if (onConnectionStateCallback) onConnectionStateCallback('disconnected');
                    attemptReconnect();
                };

                ws.onerror = (err) => {
                    clearTimeout(connectTimeout);
                    console.warn('[ZoomyRTC] WebSocket error');
                    reject(new Error('Connection failed'));
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    function startPing() {
        stopPing();
        pingTimer = setInterval(() => {
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            }
        }, 25000);
    }

    function stopPing() {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
    }

    function attemptReconnect() {
        if (reconnectAttempts >= maxReconnectAttempts) {
            console.log('[ZoomyRTC] Max reconnection attempts reached');
            return;
        }
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        console.log(`[ZoomyRTC] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
        reconnectTimer = setTimeout(() => {
            if (currentRoom && currentUserId) {
                connect(currentRoom, currentUserId, currentRole).catch(() => {});
            }
        }, delay);
    }

    async function handleSignalingMessage(msg) {
        switch (msg.type) {
            case 'joined':
                console.log('[ZoomyRTC] Joined room:', msg.roomId, 'Participants:', msg.participants.length);
                //  الأستاذ ينشئ اتصالاً بالمشاركين الموجودين مسبقاً (طالب دخل قبل الأستاذ)
                if (currentRole === 'teacher' && Array.isArray(msg.participants)) {
                    msg.participants.forEach(function (p) {
                        if (p && p.userId !== currentUserId && p.role === 'student') {
                            createPeerConnection(p.userId, true);
                        }
                    });
                }
                break;

            case 'participant-joined':
                console.log('[ZoomyRTC] Participant joined:', msg.userId, msg.role);
                if (onParticipantJoinedCallback) onParticipantJoinedCallback(msg.userId, msg.role);
                // إذا كنا نعلم، ننشئ اتصال للطالب الجديد
                if (currentRole === 'teacher') {
                    createPeerConnection(msg.userId, true);
                }
                break;

            case 'participant-left':
                console.log('[ZoomyRTC] Participant left:', msg.userId);
                closePeerConnection(msg.userId);
                if (onParticipantLeftCallback) onParticipantLeftCallback(msg.userId);
                break;

            case 'offer':
                await handleOffer(msg);
                break;

            case 'answer':
                await handleAnswer(msg);
                break;

            case 'ice-candidate':
                await handleIceCandidate(msg);
                break;

            case 'toggle-media':
                if (onConnectionStateCallback) onConnectionStateCallback('media-changed', msg);
                break;

            case 'chat-message':
                if (onChatMessageCallback) onChatMessageCallback(msg);
                break;

            case 'mute-student':
                //  حدث إدارة (كتم/فك كتم طالب) يبثه الخادم عبر REST API
                if (onModerationCallback) onModerationCallback(msg);
                break;

            case 'screen-share-start':
            case 'screen-share-stop':
                if (onScreenShareCallback) onScreenShareCallback(msg);
                break;

            case 'pong':
                break;

            case 'sync-request':
                // طلب مزامنة من طالب
                if (currentRole === 'teacher') {
                    sendSyncData(msg.from);
                }
                break;

            case 'sync-data':
                // استلام بيانات المزامنة
                if (onConnectionStateCallback) onConnectionStateCallback('sync-received', msg);
                break;

            default:
                console.log('[ZoomyRTC] Unknown message:', msg.type);
        }
    }

    // تحديد سقف البِت ريت لكل مسار مُرسَل: الأستاذ يرفع تدفّقاً واحداً محدوداً
    // لكل طالب (≈700 كيلوبت للفيديو +64 للصوت) بدل الجودة الكاملة لكل طالب.
    // هذه أهم إجراءات الاستيعاب: تخفض رفع الأستاذ من ≈2 ميغابت للطالب إلى
    // أقل من ميغابت، فتصمد الحصص الطويلة وأعداد الطلاب الأكبر دون قطع البث.
    async function applyBitrateCaps(pc) {
        try {
            const senders = pc.getSenders() || [];
            for (const sender of senders) {
                if (!sender.track) continue;
                const params = sender.getParameters();
                if (!params.encodings || !params.encodings.length) params.encodings = [{}];
                if (sender.track.kind === 'video') {
                    params.encodings[0].maxBitrate = 700000;
                } else if (sender.track.kind === 'audio') {
                    params.encodings[0].maxBitrate = 64000;
                }
                await sender.setParameters(params);
            }
        } catch (e) {
            console.warn('[ZoomyRTC] bitrate caps skipped:', e.message);
        }
    }

    async function createPeerConnection(userId, initiator) {
        if (peerConnections.has(userId)) return peerConnections.get(userId);

        const pc = new RTCPeerConnection(CONFIG);
        peerConnections.set(userId, pc);

        pc.onicecandidate = (event) => {
            if (event.candidate && ws && ws.readyState === 1) {
                ws.send(JSON.stringify({
                    type: 'ice-candidate',
                    to: userId,
                    candidate: event.candidate
                }));
            }
        };

        pc.ontrack = (event) => {
            console.log('[ZoomyRTC] Remote track from', userId);
            if (onRemoteStreamCallback) {
                onRemoteStreamCallback(userId, event.streams[0]);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`[ZoomyRTC] Connection with ${userId}:`, pc.connectionState);
            if (pc.connectionState === 'connected') {
                pc._zoomdzIceRetries = 0;
            } else if (pc.connectionState === 'failed') {
                // حصة قد تمتد لأربع ساعات: بدل قطع الاتصال عند أول انقطاع،
                // نُعيد مسار ICE تلقائياً حتى3 مرات (صمود أكبر للموبايل والشبكات المتقلّبة)
                if (!pc._zoomdzIceRetries) pc._zoomdzIceRetries = 0;
                if (pc._zoomdzIceRetries < 3) {
                    pc._zoomdzIceRetries++;
                    console.log(`[ZoomyRTC] ICE restart #${pc._zoomdzIceRetries} for ${userId}`);
                    try { pc.restartIce(); } catch (e) { closePeerConnection(userId); }
                } else {
                    closePeerConnection(userId);
                }
            }
        };

        // بعد إنعاش ICE يُطلق المتصفح حدث negotiationneeded — المبادر (الأستاذ)
        // يُرسل عرضاً جديداً لاستعادة الاتصال بنفس الغرفة دون إعادة انضمام
        pc.addEventListener('negotiationneeded', async () => {
            if (!initiator || !ws || ws.readyState !== 1) return;
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                ws.send(JSON.stringify({
                    type: 'offer',
                    to: userId,
                    offer: pc.localDescription
                }));
            } catch (e) {
                console.warn('[ZoomyRTC] renegotiation failed:', e.message);
            }
        });

        // إضافة المسارات المحلية
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
            applyBitrateCaps(pc);
        }

        // إذا كنا المبادرين، نرسل العرض
        if (initiator) {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                if (ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({
                        type: 'offer',
                        to: userId,
                        offer: pc.localDescription
                    }));
                }
            } catch (e) {
                console.error('[ZoomyRTC] Create offer error:', e.message);
            }
        }

        return pc;
    }

    async function handleOffer(msg) {
        const userId = msg.from;
        let pc = peerConnections.get(userId);
        if (!pc) {
            pc = await createPeerConnection(userId, false);
        }

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({
                    type: 'answer',
                    to: userId,
                    answer: pc.localDescription
                }));
            }
        } catch (e) {
            console.error('[ZoomyRTC] Handle offer error:', e.message);
        }
    }

    async function handleAnswer(msg) {
        const pc = peerConnections.get(msg.from);
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
            } catch (e) {
                console.error('[ZoomyRTC] Handle answer error:', e.message);
            }
        }
    }

    async function handleIceCandidate(msg) {
        const pc = peerConnections.get(msg.from);
        if (pc && msg.candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch (e) {
                console.error('[ZoomyRTC] ICE candidate error:', e.message);
            }
        }
    }

    async function startMedia(constraints) {
        if (constraints) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia(constraints);
                return localStream;
            } catch (e) {
                console.warn('[ZoomyRTC] custom constraints failed, trying defaults');
            }
        }

        //  سلسلة محاولات: فيديو كامل ثم فيديو بسيط ثم صوت فقط
        const attempts = [
            {
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
            },
            { audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 } } },
            { audio: true, video: true },
            { audio: true }
        ];

        for (let i = 0; i < attempts.length; i++) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia(attempts[i]);
                console.log('[ZoomyRTC] Local media started:',
                    localStream.getVideoTracks().length, 'video,',
                    localStream.getAudioTracks().length, 'audio');
                return localStream;
            } catch (e) {
                console.warn('[ZoomyRTC] getUserMedia attempt ' + (i + 1) + ' failed:', e.message);
            }
        }
        throw new Error('MEDIA_UNAVAILABLE');
    }

    async function replaceTrack(track) {
        if (!localStream) return;
        for (const [userId, pc] of peerConnections) {
            const senders = pc.getSenders();
            for (const s of senders) {
                if (s.track && s.track.kind === track.kind) {
                    await s.replaceTrack(track);
                }
            }
        }
    }

    /**
     *  ضمان وجود مسار فيديو حي: إن لم يُوجد (تعذّر في أول مرة)
     *  يُعاد طلب الكاميرا ويُستبدل المسار في كل الاتصالات الحالية
     */
    async function ensureVideo() {
        const current = localStream && localStream.getVideoTracks()[0];
        if (current && current.readyState === 'live' && current.enabled) {
            return current;
        }
        try {
            const camStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
            });
            const track = camStream.getVideoTracks()[0];
            if (!track) return null;
            if (current) {
                if (localStream) localStream.removeTrack(current);
                current.stop();
            }
            if (localStream) {
                localStream.addTrack(track);
            } else {
                localStream = camStream;
            }
            await replaceTrack(track);
            console.log('[ZoomyRTC] Video track restored');
            return track;
        } catch (e) {
            console.warn('[ZoomyRTC] ensureVideo failed:', e.message);
            return null;
        }
    }

    async function toggleCamera() {
        if (!localStream) return false;
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({
                    type: 'toggle-media',
                    kind: 'video',
                    enabled: videoTrack.enabled
                }));
            }
            return videoTrack.enabled;
        }
        return false;
    }

    async function toggleMicrophone() {
        if (!localStream) return false;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({
                    type: 'toggle-media',
                    kind: 'audio',
                    enabled: audioTrack.enabled
                }));
            }
            return audioTrack.enabled;
        }
        return false;
    }

    async function shareScreen() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: true
            });
            const screenTrack = screenStream.getVideoTracks()[0];
            
            // استبدال المسار الفيديو في جميع الاتصالات
            for (const [userId, pc] of peerConnections) {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) await sender.replaceTrack(screenTrack);
            }
            
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'screen-share-start' }));
            }
            
            screenTrack.onended = () => stopScreenShare();
            
            return screenStream;
        } catch (e) {
            console.error('[ZoomyRTC] Screen share error:', e.message);
            throw e;
        }
    }

    async function stopScreenShare() {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            for (const [userId, pc] of peerConnections) {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender && videoTrack) await sender.replaceTrack(videoTrack);
            }
        }
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'screen-share-stop' }));
        }
    }

    function sendChatMessage(text, displayName) {
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({
                type: 'chat-message',
                text: text,
                sender: displayName || currentUserId,
                timestamp: Date.now()
            }));
        }
    }

    function sendSyncData(toUserId) {
        // إرسال حالة المزامنة (شامل المسار الحالي والوسائط)
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({
                type: 'sync-data',
                to: toUserId,
                data: {
                    localStreamActive: !!(localStream && localStream.active),
                    videoEnabled: localStream?.getVideoTracks()[0]?.enabled ?? true,
                    audioEnabled: localStream?.getAudioTracks()[0]?.enabled ?? true
                },
                timestamp: Date.now()
            }));
        }
    }

    function closePeerConnection(userId) {
        const pc = peerConnections.get(userId);
        if (pc) {
            pc.close();
            peerConnections.delete(userId);
        }
    }

    function disconnect() {
        stopPing();
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectAttempts = maxReconnectAttempts; // منع إعادة الاتصال
        
        peerConnections.forEach((pc, userId) => {
            pc.close();
        });
        peerConnections.clear();

        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }

        if (ws) {
            ws.close();
            ws = null;
        }

        currentRoom = null;
        console.log('[ZoomyRTC] Disconnected');
    }

    // Event handlers
    function onRemoteStream(cb) { onRemoteStreamCallback = cb; }
    function onParticipantJoined(cb) { onParticipantJoinedCallback = cb; }
    function onParticipantLeft(cb) { onParticipantLeftCallback = cb; }
    function onConnectionState(cb) { onConnectionStateCallback = cb; }
    function onChatMessage(cb) { onChatMessageCallback = cb; }
    function onModeration(cb) { onModerationCallback = cb; }
    function onScreenShare(cb) { onScreenShareCallback = cb; }

    // Export
    window.ZoomyRTC = {
        connect,
        disconnect,
        startMedia,
        ensureVideo,
        toggleCamera,
        toggleMicrophone,
        shareScreen,
        stopScreenShare,
        sendChatMessage,
        getLocalStream: () => localStream,
        getPeerConnections: () => peerConnections,
        getCurrentRoom: () => currentRoom,
        getCurrentUserId: () => currentUserId,
        getSignalingUrl,
        onRemoteStream,
        onParticipantJoined,
        onParticipantLeft,
        onConnectionState,
        onChatMessage,
        onModeration,
        onScreenShare
    };
})();