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

    let pusher = null;
    let pusherUserId = null;            // معرّف presence المستخدم عند إنشاء عميل Pusher
    let channel = null;
    let localStream = null;
    let peerConnections = new Map(); // userId -> RTCPeerConnection
    let currentRoom = null;
    let currentUserId = null;
    let currentRole = 'student';
    let reconnectAttempts = 0;
    let maxReconnectAttempts = 5;
    let reconnectTimer = null;
    let pingTimer = null;
    let currentToken = null;            // رمز JWT محفوظ لإعادة الاشتراك في قنوات presence
    let onRemoteStreamCallback = null;
    let onParticipantJoinedCallback = null;
    let onParticipantLeftCallback = null;
    let onConnectionStateCallback = null;
    let onChatMessageCallback = null;
    let onModerationCallback = null;
    let onScreenShareCallback = null;
    let knownParticipants = new Map(); // userId -> role (آخر قائمة مشاركة معروفة من الخادم)
    let healthSweepTimer = null;        // فحص دوري لصحة اتصالات الأقران
    let reapplyCapsTimer = null;        // إعادة تطبيق سقف البِت ريت عند تغيّر العدد
    let currentFacingMode = 'user';     // اتجاه الكاميرا الحالي (أمامية/خلفية)
    let micGainValue = 1.0;             // معامل تعزيز الميكروفون المُرسَل للطلاب
    let audioCtx = null;                // سياق صوتي لمسار التعزيز
    let micGainNode = null;             // عقدة الكسب المرتبطة بالمسار الخام

    function getSignalingUrl() {
        //  الافتراضي: نفس خادم المنصة (Signaling مدمج على /ws-signaling)
        //  يمكن تجاوزه عبر window.SIGNALING_SERVER_URL لو فُصل الخادم لاحقاً
        const base = (window.SIGNALING_SERVER_URL || window.location.origin);
        return base.replace(/\/$/, '');
    }

    function generateId() {
        return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    }

    //  إرسال رسالة إشارة عبر Pusher (أحداث العميل — تُبث للجميع عدا المرسل)
    function sendSignaling(msg) {
        if (!channel) return;
        try {
            msg.from = currentUserId;
            msg.fromRole = currentRole;
            msg.roomId = currentRoom;
            channel.trigger('client-signal', msg);
        } catch (e) { /* تجاهل */ }
    }

    async function connect(roomId, userId, role, token, opts) {
        currentRoom = roomId;
        currentUserId = userId || generateId();
        currentRole = role || 'student';
        if (token) currentToken = token;

        const PUSHER_KEY = window.PUSHER_KEY || '0ea10d39dca5fe77b6e5';
        const PUSHER_CLUSTER = window.PUSHER_CLUSTER || 'eu';
        const channelName = 'presence-room-' + currentRoom;

        return new Promise((resolve, reject) => {
            try {
                if (!window.Pusher) {
                    reject(new Error('مكتبة Pusher غير محمّلة'));
                    return;
                }

                // إنشاء عميل Pusher مرة واحدة (يُعاد إنشاؤه إن تغيّر معرّف الغرفة)
                if (pusher && pusherUserId && pusherUserId !== String(currentUserId)) {
                    try { pusher.disconnect(); } catch (e) { /* تجاهل */ }
                    pusher = null;
                }
                if (!pusher) {
                    pusher = new Pusher(PUSHER_KEY, {
                        cluster: PUSHER_CLUSTER,
                        authEndpoint: '/api/pusher/auth',
                        auth: {
                            headers: currentToken ? { 'Authorization': 'Bearer ' + currentToken } : {},
                            //  معرّف presence = معرّف الإشارة داخل الغرفة (نفس منطق خادم WebSocket القديم)
                            params: { user_id: String(currentUserId) }
                        },
                        forceTLS: true
                    });
                    pusherUserId = String(currentUserId);
                    //  حالة اتصال Pusher → إعلام واجهة البث وإعادة المحاولة عند الفشل
                    pusher.connection.bind('state_change', function (states) {
                        const s = states.current;
                        if (s === 'connected') {
                            reconnectAttempts = 0;
                            if (onConnectionStateCallback) onConnectionStateCallback('connected');
                        } else if (s === 'failed') {
                            if (onConnectionStateCallback) onConnectionStateCallback('disconnected');
                            attemptReconnect();
                        }
                    });
                }

                // إعادة الاشتراك إن كانت القناة مختلفة
                if (channel && channel.name === channelName) {
                    resolve();
                    return;
                }
                if (channel) {
                    try { channel.unbind_all(); } catch (e) {}
                    try { pusher.unsubscribe(channel.name); } catch (e) {}
                    channel = null;
                }

                channel = pusher.subscribe(channelName);

                channel.bind('pusher:subscription_error', function () {
                    reject(new Error('تعذر الاشتراك في قناة Pusher'));
                });

                // نجاح الاشتراك → رسالة 'joined' بقائمة الأعضاء
                channel.bind('pusher:subscription_succeeded', function (members) {
                    const participants = [];
                    const membersMap = (members && members.members) ? members.members : {};
                    Object.keys(membersMap).forEach(function (uid) {
                        participants.push({
                            userId: uid,
                            role: (membersMap[uid] && membersMap[uid].role) || 'student',
                            joinedAt: Date.now()
                        });
                    });
                    handleSignalingMessage({
                        type: 'joined',
                        roomId: currentRoom,
                        userId: currentUserId,
                        role: currentRole,
                        participants: participants
                    });
                    startHealthSweep();
                    if (onConnectionStateCallback) onConnectionStateCallback('connected');
                    resolve();
                });

                // انضمام/مغادرة عضو (presence)
                channel.bind('pusher:member_added', function (member) {
                    handleSignalingMessage({
                        type: 'participant-joined',
                        userId: String(member.id),
                        role: (member.info && member.info.role) || 'student'
                    });
                });
                channel.bind('pusher:member_removed', function (member) {
                    handleSignalingMessage({
                        type: 'participant-left',
                        userId: String(member.id)
                    });
                });

                // أحداث الإشارة: من الأقران (client-signal) ومن الخادم (signal)
                channel.bind('client-signal', function (msg) { handleSignalingMessage(msg); });
                channel.bind('signal', function (msg) { handleSignalingMessage(msg); });
            } catch (e) {
                reject(e);
            }
        });
    }

    function startPing() {
        // Pusher يحافظ على الاتصال بنبضه الداخلي — لا حاجة لنبض على مستوى التطبيق
        stopPing();
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
            if (!currentRoom || !currentUserId) return;
            try {
                //  Pusher يعيد الاتصال تلقائياً عادةً؛ إن بلغ "failed" نُشعله يدوياً
                if (pusher && pusher.connection && pusher.connection.state === 'failed') {
                    pusher.connect();
                }
                // تفريغ القناة القديمة ليعاد اشتراكها من جديد
                if (channel && pusher) {
                    try { channel.unbind_all(); } catch (e) { /* تجاهل */ }
                    try { pusher.unsubscribe(channel.name); } catch (e) { /* تجاهل */ }
                    channel = null;
                }
            } catch (e) { /* تجاهل */ }
            connect(currentRoom, currentUserId, currentRole, currentToken, { isReconnect: true }).catch(() => {});
        }, delay);
    }

    // ==========================================================================
    //  سلملة البِت ريت التكيّفية: كل طالب يحمل تدفّقاً مرسَلاً من الأستاذ
    //  (تولوجيا نجمية)، فكلما كثر المتصلون خُفِّض سقف الفيديو لأبقاء الرفع
    //  ضمن حدود الشبكة: ≤10 طلاب 700k (720p) | ≤30 طلاب 350k (480p) | >30 : 250k (360p)
    // ==========================================================================
    function videoBitrateForPeers() {
        const n = peerConnections.size;
        if (n <= 10) return 700000;
        if (n <= 30) return 350000;
        return 250000;
    }

    //  إعادة تطبيق السقف على كل الاتصالات عند تغيّر عدد المتصلين (مجمّعة وتيرة واحدة)
    function reapplyBitrateCapsSoon() {
        if (reapplyCapsTimer) return;
        reapplyCapsTimer = setTimeout(() => {
            reapplyCapsTimer = null;
            peerConnections.forEach((pc) => applyBitrateCaps(pc));
        }, 1200);
    }

    // ==========================================================================
    //  فحص صحة الاتصالات كل 15 ثانية: اتصال "فاشل" أو "منقطع" منذ مدة يُستعاد
    //  تلقائياً — الأستاذ يُعيد إنشاء الاتصال ويرسل عرضاً جديداً، والطالب يطلب
    //  مزامنة (sync-request بطلب عرض) فيُعيد الأستاذ بناء المسار كاملاً
    // ==========================================================================
    function startHealthSweep() {
        stopHealthSweep();
        healthSweepTimer = setInterval(runHealthSweep, 15000);
    }

    function stopHealthSweep() {
        if (healthSweepTimer) clearInterval(healthSweepTimer);
        healthSweepTimer = null;
    }

    function runHealthSweep() {
        //  لا استعادة بلا اتصال إشارات حي (تُعدَّل الحالة لاحقاً عند عودة ws)
        if (!channel || !peerConnections.size) return;
        const now = Date.now();

        peerConnections.forEach((pc, userId) => {
            const state = pc.connectionState;

            if (state === 'connected') {
                pc._zoomdzStaleSince = 0;
                return;
            }

            //  حالات تحتاج وقتاً للتعافي: فشل ICE يُعالَج بالمنعش أولاً (3 مرات)،
            //  والانقطاع مؤقت على الشبكات المتنقلة — سماحية 15/25 ثانية قبل التدخل
            if (state === 'failed' || state === 'disconnected' || state === 'connecting' || state === 'new') {
                if (!pc._zoomdzStaleSince) {
                    pc._zoomdzStaleSince = now;
                    return;
                }
                const staleFor = now - pc._zoomdzStaleSince;
                const limit = state === 'failed' ? 15000 : (state === 'disconnected' ? 25000 : 45000);
                if (staleFor < limit) return;

                pc._zoomdzStaleSince = 0;
                console.log(`[ZoomyRTC] Health sweep: recovering ${userId} (${state}, ${Math.round(staleFor / 1000)}s)`);
                recoverPeer(userId);
            }
        });
    }

    function recoverPeer(userId) {
        closePeerConnection(userId);
        if (currentRole === 'teacher') {
            //  الأستاذ المبادر يُنشئ اتصالاً جديداً ويرسل عرضاً فورياً
            createPeerConnection(userId, true);
        } else {
            //  الطالب يطلب مزامنة بطلب عرض — الخادم يمرّرها للأستاذ فيُعيد البناء
            sendSyncRequest();
        }
    }

    function sendSyncRequest() {
        if (!channel) return;
        //  بدون to مقصود: بثّ للغرفة — الأستاذ وحده من يستجيب، وهويته قد تتغيّر
        //  بعد إعادة تحميل صفحته فيصل الطلب لأي أستاذ متصل بالغرفة
        sendSignaling({
            type: 'sync-request',
            requestOffer: true,
            timestamp: Date.now()
        });
    }

    async function handleSignalingMessage(msg) {
        //  تجاهل رسائلنا الخاصة إن عادت إلينا (بعض قنوات البث تُعيد أحداث العميل لمرسليها)
        if (msg && msg.from && String(msg.from) === String(currentUserId)) return;
        //  تصفية الرسائل الموجّهة لمستخدم معيّن — أحداث العميل تُبث لجميع
        //  المشتركين في القناة، فيتولّى العضو تجاهل ما ليس له
        if (msg && msg.to && String(msg.to) !== String(currentUserId)) return;
        switch (msg.type) {
            case 'joined':
                console.log('[ZoomyRTC] Joined room:', msg.roomId, 'Participants:', msg.participants.length);
                //  تحديث قائمة المشاركين المعروفة (لتحديد هوية الأستاذ والعثور على من غاب)
                knownParticipants = new Map();
                const listedIds = new Set();
                (Array.isArray(msg.participants) ? msg.participants : []).forEach(function (p) {
                    if (!p || !p.userId) return;
                    knownParticipants.set(p.userId, p.role);
                    listedIds.add(p.userId);
                });
                //  إغلاق أي اتصال بأسماء لم تعد في الغرفة (أُعيد انضمامنا بعد انقطاع وخرج الآخرون)
                peerConnections.forEach(function (pc, uid) {
                    if (!listedIds.has(uid)) {
                        console.log('[ZoomyRTC] Closing stale peer (not in room):', uid);
                        closePeerConnection(uid);
                    }
                });
                //  الأستاذ ينشئ اتصالاً بالمشاركين الموجودين مسبقاً (طالب دخل قبل الأستاذ)
                if (currentRole === 'teacher') {
                    msg.participants.forEach(function (p) {
                        if (p && p.userId !== currentUserId && p.role === 'student') {
                            //  اتصال عالق بحالة فشل يُغلق أولاً ليُعاد عرضه من جديد
                            const existing = peerConnections.get(p.userId);
                            if (existing && existing.connectionState === 'failed') closePeerConnection(p.userId);
                            createPeerConnection(p.userId, true);
                        }
                    });
                }
                break;

            case 'participant-joined':
                console.log('[ZoomyRTC] Participant joined:', msg.userId, msg.role);
                if (msg.userId) knownParticipants.set(msg.userId, msg.role);
                if (onParticipantJoinedCallback) onParticipantJoinedCallback(msg.userId, msg.role);
                // إذا كنا نعلم، ننشئ اتصال للطالب الجديد
                if (currentRole === 'teacher') {
                    createPeerConnection(msg.userId, true);
                    reapplyBitrateCapsSoon(); // قد يتغيّر حجم السقف مع عدد المتصلين
                }
                break;

            case 'participant-left':
                console.log('[ZoomyRTC] Participant left:', msg.userId);
                if (msg.userId) knownParticipants.delete(msg.userId);
                closePeerConnection(msg.userId);
                if (currentRole === 'teacher') reapplyBitrateCapsSoon();
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
                //  طلب مزامنة من طالب: الأستاذ يُعيد إنشاء الاتصال ويرسل عرضاً جديداً
                //  (طلب العرض صريح requestOffer — يُستعمل بعد انقطاع أو انقعاد الاتصال)
                if (currentRole === 'teacher') {
                    if (msg.requestOffer) {
                        closePeerConnection(msg.from);
                        createPeerConnection(msg.from, true);
                    } else {
                        sendSyncData(msg.from);
                    }
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

    // تحديد سقف البِت ريت لكل مسار مُرسَل حسب سلملة تكيّفية (videoBitrateForPeers):
    // ≤10 طلاب 700k | ≤30 طلاب 350k | >30 طلاب 250k — فترفع الأستاذ تدفّقاً واحداً
    // محدوداً لكل طالب بدل الجودة الكاملة، وتُعاد السلملة تلقائياً عند تغيّر العدد.
    async function applyBitrateCaps(pc) {
        try {
            const senders = pc.getSenders() || [];
            for (const sender of senders) {
                if (!sender.track) continue;
                const params = sender.getParameters();
                if (!params.encodings || !params.encodings.length) params.encodings = [{}];
                if (sender.track.kind === 'video') {
                    params.encodings[0].maxBitrate = videoBitrateForPeers();
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
            if (event.candidate && channel) {
                sendSignaling({
                    type: 'ice-candidate',
                    to: userId,
                    candidate: event.candidate
                });
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
            if (!initiator || !channel) return;
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendSignaling({
                    type: 'offer',
                    to: userId,
                    offer: pc.localDescription
                });
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
                if (channel) {
                    sendSignaling({
                        type: 'offer',
                        to: userId,
                        offer: pc.localDescription
                    });
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
            if (channel) {
                sendSignaling({
                    type: 'answer',
                    to: userId,
                    answer: pc.localDescription
                });
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
                await syncMicGain();
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
                await syncMicGain();
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

    // ==========================================================================
    //  تبديل الكاميرا الأمامية/الخلفية (الهاتف): يُشغّل الكاميرا الجديدة أولاً
    //  ثم يستبدل المسار في كل الاتصالات القائمة فوراً (معيبسة WebRTC)
    // ==========================================================================
    async function flipCamera() {
        if (!localStream) return null;
        const oldTrack = localStream.getVideoTracks()[0];

        //  الأكثر موثوقية على الأندرويد: التنقل بين كاميرات الجهاز بـ device id
        //  (تظهر الكاميرا الأمامية والخلفية كجهازين منفصلين في enumerateDevices)
        let devices = [];
        try {
            devices = (await navigator.mediaDevices.enumerateDevices())
                .filter(function (d) { return d.kind === 'videoinput'; });
        } catch (e) { /* تجاهل — سنجرّب بالاتجاه */ }

        const currentFacing = currentFacingMode;
        const currentDeviceId = oldTrack && oldTrack.getSettings ? oldTrack.getSettings().deviceId : null;
        let constraints = null;
        if (devices.length >= 2) {
            let idx = -1;
            for (let i = 0; i < devices.length; i++) {
                if (devices[i].deviceId === currentDeviceId) { idx = i; break; }
            }
            const next = devices[(idx + 1) % devices.length];
            constraints = { video: { deviceId: { exact: next.deviceId } }, audio: false };
        } else {
            //  متصفحات تُخفي المعرّفات: تبديل حسب الاتجاه المطلوب
            constraints = { video: { facingMode: { ideal: currentFacing === 'user' ? 'environment' : 'user' } }, audio: false };
        }

        //  ⚠️ معظم هواتف أندرويد لا تسمح بتشغيل كاميرتين في نفس اللحظة —
        //  نُوقف الكاميرا القديمة أولاً ثم نفتح الجديدة، وإن فشلت نُعيد الأصلية
        //  فوراً حتى لا يبقى البث بلا صورة أبداً
        const wasEnabled = oldTrack ? oldTrack.enabled : true;
        if (oldTrack) {
            try { localStream.removeTrack(oldTrack); } catch (e) { /* تجاهل */ }
            try { oldTrack.stop(); } catch (e) { /* تجاهل */ }
        }

        let cam = null;
        try {
            cam = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
            //  إن فشل المعرّف المحدد جرّب الاتجاه البديل مباشرة
            try {
                cam = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: currentFacing === 'user' ? 'environment' : 'user' } },
                    audio: false
                });
            } catch (e2) {
                console.warn('[ZoomyRTC] flip camera unavailable:', e2.message);
                //  فشل كامل: إعادة الكاميرا الأصلية (بمعرّفها إن أمكن) لاستعادة البث كما كان
                try {
                    const back = await navigator.mediaDevices.getUserMedia({
                        video: currentDeviceId
                            ? { deviceId: { exact: currentDeviceId } }
                            : { facingMode: { ideal: currentFacing } },
                        audio: false
                    });
                    const backTrack = back.getVideoTracks()[0];
                    if (backTrack) {
                        backTrack.enabled = wasEnabled;
                        localStream.addTrack(backTrack);
                        await replaceTrack(backTrack);
                        peerConnections.forEach(function (pc) { applyBitrateCaps(pc); });
                    }
                } catch (e3) {
                    console.warn('[ZoomyRTC] camera restore failed:', e3.message);
                }
                return null;
            }
        }

        const newTrack = cam.getVideoTracks()[0];
        if (!newTrack) {
            cam.getTracks().forEach(function (t) { t.stop(); });
            return null;
        }

        //  تتبع الاتجاه الفعلي إن أبلغ عنه المتصفح
        const fs = newTrack.getSettings ? newTrack.getSettings().facingMode : null;
        if (fs === 'user' || fs === 'environment') currentFacingMode = fs;

        newTrack.enabled = wasEnabled;
        localStream.addTrack(newTrack);
        await replaceTrack(newTrack);
        //  إعادة تطبيق سقف البِت ريت على المسار الجديد
        peerConnections.forEach(function (pc) { applyBitrateCaps(pc); });
        console.log('[ZoomyRTC] Camera flipped ->', currentFacingMode);
        return newTrack;
    }

    // ==========================================================================
    //  تعزيز الميكروفون (Web Audio): يرفع/يخفض صوت الإرسال للطلاب فعلياً —
    //  1.0 = المسار الأصلي للمتصفح (أقل تدخّلاً) | غيره = مسار كسب مؤخَّر
    //  كتم الميكروفون يبقى فعّالاً لأن المسار الخام هو المصدر نفسه
    // ==========================================================================
    async function setMicGain(value) {
        const v = Math.min(3, Math.max(0.5, Number(value) || 1));
        micGainValue = v;
        if (!localStream) return micGainValue;
        const rawTrack = localStream.getAudioTracks()[0];
        if (!rawTrack) return micGainValue;

        try {
            if (v === 1) {
                //  العودة للوضع الأصلي: مسار المتصفح المعالَج (أقل ضجيجاً وتأخّراً)
                if (micGainNode) {
                    try { micGainNode.disconnect(); } catch (e) { /* تجاهل */ }
                    micGainNode = null;
                }
                await replaceTrack(rawTrack);
                return micGainValue;
            }

            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') await audioCtx.resume();

            //  تعديل حي إن كان المسار الموحّد نفسه ما يزال مستخدماً
            if (micGainNode && micGainNode._srcTrack === rawTrack) {
                micGainNode.gain.value = v;
                return micGainValue;
            }

            //  بناء المسار من جديد (مثلاً بعد إعادة getUserMedia)
            if (micGainNode) {
                try { micGainNode.disconnect(); } catch (e) { /* تجاهل */ }
                micGainNode = null;
            }
            const src = audioCtx.createMediaStreamSource(new MediaStream([rawTrack]));
            const dest = audioCtx.createMediaStreamDestination();
            micGainNode = audioCtx.createGain();
            micGainNode._srcTrack = rawTrack;
            micGainNode.gain.value = v;
            src.connect(micGainNode);
            micGainNode.connect(dest);
            await replaceTrack(dest.stream.getAudioTracks()[0]);
            console.log('[ZoomyRTC] Mic gain applied:', v + 'x');
        } catch (e) {
            console.warn('[ZoomyRTC] mic gain skipped:', e.message);
        }
        return micGainValue;
    }

    function getMicGain() { return micGainValue; }

    //  مزامنة مسار التعزيز بعد أي كاميرا/ميكروفون جديد (startMedia)
    async function syncMicGain() {
        if (micGainValue !== 1 && localStream) {
            try {
                if (micGainNode) { micGainNode.disconnect(); micGainNode = null; }
            } catch (e) { /* تجاهل */ }
            await setMicGain(micGainValue);
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
            if (channel) {
                sendSignaling({
                    type: 'toggle-media',
                    kind: 'video',
                    enabled: videoTrack.enabled
                });
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
            if (channel) {
                sendSignaling({
                    type: 'toggle-media',
                    kind: 'audio',
                    enabled: audioTrack.enabled
                });
            }
            return audioTrack.enabled;
        }
        return false;
    }

    //  حالة مشاركة الشاشة (لإيقافها فعلياً واستعادة الكاميرا بعد الانتهاء)
    let screenStreamRef = null;
    let preShareVideoTrack = null;

    async function shareScreen() {
        if (screenStreamRef) return screenStreamRef; //  مشاركة فعّالة بالفعل
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            const err = new Error('screen share unsupported on this device');
            err.name = 'NotSupportedError';
            throw err;
        }
        let screenStream = null;
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: true
            });
        } catch (firstErr) {
            //  الهواتف (أندرويد) لا تدعم التقاط صوت الشاشة — نجرّب فيديو فقط
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        }
        const screenTrack = screenStream.getVideoTracks()[0];
        if (!screenTrack) {
            screenStream.getTracks().forEach(function (t) { t.stop(); });
            throw new Error('no screen track available');
        }

        //  استبدال المسار الفيديو في جميع الاتصالات
        for (const [userId, pc] of peerConnections) {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) await sender.replaceTrack(screenTrack);
        }

        //  معاينة محلية: تظهر الشاشة في بلاطة الأستاذ — الكاميرا تُحفظ ولا تُوقف
        //  حتى تُستعاد فوراً عند إنهاء المشاركة
        if (localStream) {
            preShareVideoTrack = localStream.getVideoTracks()[0] || null;
            if (preShareVideoTrack) {
                try { localStream.removeTrack(preShareVideoTrack); } catch (e) { /* تجاهل */ }
            }
            try { localStream.addTrack(screenTrack); } catch (e) { /* تجاهل */ }
        }

        if (channel) {
            sendSignaling({ type: 'screen-share-start' });
        }

        screenStreamRef = screenStream;
        //  إيقاف المشاركة من شريط النظام في الجوال أو من متصفح سطح المكتب
        screenTrack.onended = function () { stopScreenShare(); };

        return screenStream;
    }

    async function stopScreenShare() {
        const screenStream = screenStreamRef;
        const screenTrack = screenStream ? screenStream.getVideoTracks()[0] : null;
        screenStreamRef = null;

        //  إزالة مسار الشاشة من المعاينة
        if (screenTrack && localStream) {
            try { localStream.removeTrack(screenTrack); } catch (e) { /* تجاهل */ }
        }

        //  إعادة مسار الكاميرا إلى الاتصالات والمعاينة
        const camTrack = (preShareVideoTrack && preShareVideoTrack.readyState === 'live')
            ? preShareVideoTrack
            : (localStream ? localStream.getVideoTracks()[0] : null);
        preShareVideoTrack = null;
        if (localStream && camTrack && localStream.getVideoTracks().indexOf(camTrack) === -1) {
            try { localStream.addTrack(camTrack); } catch (e) { /* تجاهل */ }
        }
        for (const [userId, pc] of peerConnections) {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender && camTrack) await sender.replaceTrack(camTrack);
        }

        //  إيقاف التقاط الشاشة فعلياً — يُنزل شريط «يتم تسجيل الشاشة» في الجوال
        if (screenStream) {
            screenStream.getTracks().forEach(function (t) { t.stop(); });
        }
        if (channel) {
            sendSignaling({ type: 'screen-share-stop' });
        }
    }

    function sendChatMessage(text, displayName) {
        if (channel) {
            sendSignaling({
                type: 'chat-message',
                text: text,
                sender: displayName || currentUserId,
                timestamp: Date.now()
            });
        }
    }

    function sendSyncData(toUserId) {
        // إرسال حالة المزامنة (شامل المسار الحالي والوسائط)
        if (channel) {
            sendSignaling({
                type: 'sync-data',
                to: toUserId,
                data: {
                    localStreamActive: !!(localStream && localStream.active),
                    videoEnabled: localStream?.getVideoTracks()[0]?.enabled ?? true,
                    audioEnabled: localStream?.getAudioTracks()[0]?.enabled ?? true
                },
                timestamp: Date.now()
            });
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
        stopHealthSweep();
        if (reapplyCapsTimer) clearTimeout(reapplyCapsTimer);
        reapplyCapsTimer = null;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectAttempts = maxReconnectAttempts; // منع إعادة الاتصال
        
        peerConnections.forEach((pc, userId) => {
            pc.close();
        });
        peerConnections.clear();

        if (micGainNode) { try { micGainNode.disconnect(); } catch (e) { /* تجاهل */ } micGainNode = null; }
        if (audioCtx) { try { audioCtx.close(); } catch (e) { /* تجاهل */ } audioCtx = null; }

        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }

        if (channel) {
            try { channel.unbind_all(); } catch (e) { /* تجاهل */ }
            try { if (pusher) pusher.unsubscribe(channel.name); } catch (e) { /* تجاهل */ }
            channel = null;
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
        flipCamera,
        setMicGain,
        getMicGain,
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