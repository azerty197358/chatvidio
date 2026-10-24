
// ============================================================================
//  حالة الكتابة في المحادثة الجماعية - "يكتب الآن"
//  نفس سلوك الرسائل المباشرة: إشارة عند الكتابة، توقّف عند الإرسال أو
//  السكون، واستعلام قصير يعرض نقاط الطرف الآخر.
// ============================================================================
let groupChatTypingFlag = false;
let groupChatTypingLastSent = 0;
let groupChatTypingIdleTimer = null;
let groupChatTypingPoll = null;
let groupChatTypingGroup = null;
let groupChatTypingMyName = '';

function groupChatTypingSend(isTyping) {
    const groupId = activeChatGroupId;
    if (!groupId) return;
    try {
        if (typeof fetchWithAuth === 'function') {
            fetchWithAuth('/api/groups/' + groupId + '/typing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    is_typing: !!isTyping,
                    user_name: groupChatTypingMyName || ''
                })
            }).catch(function () {});
        } else {
            fetch('/api/groups/' + groupId + '/typing', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify({ is_typing: !!isTyping, user_name: groupChatTypingMyName || '' })
            }).catch(function () {});
        }
    } catch (e) {}
    groupChatTypingFlag = !!isTyping;
    groupChatTypingLastSent = Date.now();
}

function groupChatTypingStop() {
    if (groupChatTypingIdleTimer) { clearTimeout(groupChatTypingIdleTimer); groupChatTypingIdleTimer = null; }
    if (groupChatTypingFlag) groupChatTypingSend(false);
}

function groupChatTypingOnInput() {
    if (!activeChatGroupId) return;
    const ta = document.getElementById('chatInputMessage');
    const hasText = ta && String(ta.value || '').trim().length > 0;
    if (!hasText) { groupChatTypingStop(); return; }

    const now = Date.now();
    // إشارة كل ثانيتين كحد أقصى حتى لا نغرق الخادم
    if (!groupChatTypingFlag || (now - groupChatTypingLastSent) > 2000) {
        groupChatTypingSend(true);
    }
    if (groupChatTypingIdleTimer) clearTimeout(groupChatTypingIdleTimer);
    groupChatTypingIdleTimer = setTimeout(groupChatTypingStop, 3000);
}

// ابدأ/أوقف الاستعلام عند فتح المجموعة أو تغييرها
function groupChatTypingWatch(groupId) {
    groupChatTypingStop();
    if (groupChatTypingPoll) { clearInterval(groupChatTypingPoll); groupChatTypingPoll = null; }
    groupChatTypingGroup = groupId || null;
    groupChatTypingRender([]);
    if (!groupId) return;
    groupChatTypingPoll = setInterval(groupChatTypingAsk, 9000);
    groupChatTypingAsk();
}

function groupChatTypingAsk() {
    const groupId = activeChatGroupId || groupChatTypingGroup;
    if (!groupId) return;
    const ask = function (url, options) {
        if (typeof fetchWithAuth === 'function') return fetchWithAuth(url, options);
        return fetch(url, options);
    };
    ask('/api/groups/' + groupId + '/typing', { headers: { 'Content-Type': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (d) { groupChatTypingRender((d && d.typing) || []); })
        .catch(function () {});
}

function groupChatTypingRender(list) {
    const box = document.getElementById('groupChatTypingIndicator');
    if (!box) return;
    const arr = Array.isArray(list) ? list : [];
    if (arr.length === 0) { box.style.display = 'none'; box.innerHTML = ''; return; }

    let dots = '';
    for (let i = 0; i < 3; i++) {
        dots += '<span class="chat-typing-dot" style="width:6px;height:6px;border-radius:50%;background:#94a3b8;display:inline-block;"></span>';
    }
    const names = arr.map(function (u) {
        return escapeHtml((u && u.user_name) ? u.user_name : (u && u.user_type === 'teacher' ? 'أستاذ' : 'طالب'));
    });
    const label = names.length === 1 ? names[0] : (names.slice(0, -1).join('، ') + ' و' + names[names.length - 1]);

    box.style.display = 'flex';
    box.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;">' +
        '<span style="display:inline-flex;gap:3px;align-items:center;">' + dots + '</span>' +
        label + ' يكتب الآن…</span>';
}

window.addEventListener('beforeunload', function () { groupChatTypingStop(); });
window.groupChatTypingWatch = groupChatTypingWatch;
window.groupChatTypingStop = groupChatTypingStop;

// ============================================================================
// Front end for the typing indicator. Identical on both dashboards so the two
// sides behave the same.
//   - typing in the box tells the other person "يكتب الآن"
//   - sending, clearing or going idle turns it off
//   - a short poll shows the peer's dots while they type
// ============================================================================

// مؤشراتConversation المستعملة حالياً
let chatTypingPeer = { id: null, type: null };      // الشخص الآخر في المحادثة المفتوحة
let chatTypingTimer = null;                          // مؤقّت الإيقاف بعد السكون
let chatTypingPoll = null;                           // مؤقّت الاستعلام
let chatTypingLastSent = 0;                          // آخر مرة أرسلنا فيها
let chatTypingMyFlag = false;                        // هل نحن نكتب الآن؟

function chatTypingApiBase() {
    return (typeof API_BASE_URL !== 'undefined' && API_BASE_URL)
        ? API_BASE_URL + '/api/messages'
        : '/api/messages';
}

function chatTypingAuthHeaders() {
    try {
        if (typeof getAuthToken === 'function') {
            const t = getAuthToken();
            if (t) return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t };
        }
    } catch (e) {}
    return { 'Content-Type': 'application/json' };
}

// آخر مرة كُتب فيها في مربّع الرسالة
function chatTypingOnInput() {
    const peer = chatTypingPeer;
    if (!peer.id) return;
    const ta = document.getElementById('messageInput');
    const hasText = ta && String(ta.value || '').trim().length > 0;
    if (!hasText) { chatTypingStop(); return; }

    const now = Date.now();
    // لا نغرق الخادم: إشارة كل ثانيتين كحد أقصى
    if (!chatTypingMyFlag || (now - chatTypingLastSent) > 2000) {
        chatTypingSend(true);
    }

    // إيقاف تلقائي بعد ثلاث ثوانٍ من السكون
    if (chatTypingTimer) clearTimeout(chatTypingTimer);
    chatTypingTimer = setTimeout(chatTypingStop, 3000);
}

function chatTypingSend(isTyping) {
    const peer = chatTypingPeer;
    if (!peer.id) return;
    if (typeof fetchWithAuth === 'function') {
        fetchWithAuth(chatTypingApiBase() + '/typing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                peer_id: peer.id,
                peer_type: peer.type,
                is_typing: !!isTyping
            })
        }).catch(function () {});
    }
    chatTypingMyFlag = !!isTyping;
    chatTypingLastSent = Date.now();
}

function chatTypingStop() {
    if (chatTypingTimer) { clearTimeout(chatTypingTimer); chatTypingTimer = null; }
    if (chatTypingMyFlag) chatTypingSend(false);
}

// بدّل المحادثة المفتوحة وابدأ/وقف الاستعلام
function chatTypingWatch(peerId, peerType, peerName) {
    chatTypingStop();
    if (chatTypingPoll) { clearInterval(chatTypingPoll); chatTypingPoll = null; }
    chatTypingPeer = { id: peerId || null, type: peerType || null, name: peerName || '' };
    chatTypingRender(false);
    if (!peerId) return;
    chatTypingPoll = setInterval(chatTypingAsk, 9000);
    chatTypingAsk();
}

function chatTypingAsk() {
    const peer = chatTypingPeer;
    if (!peer.id) return;
    const myId = (typeof teacherId !== 'undefined' && teacherId) ? teacherId : ((typeof currentUserId !== 'undefined' && currentUserId) || null);
    const myType = 'teacher';
    if (!myId || Number(myId) < 1) return;

    const url = chatTypingApiBase() + '/typing/' + myId + '/' + myType + '/' + peer.id + '/' + peer.type;
    if (typeof fetchWithAuth === 'function') {
        fetchWithAuth(url).then(function (r) { return r.json(); })
            .then(function (d) { chatTypingRender(!!(d && d.is_typing)); })
            .catch(function () {});
    }
}

// النقاط الثلاث المتحركة + الاسم
function chatTypingRender(isTyping) {
    const box = document.getElementById('chatTypingIndicator');
    if (!box) return;
    if (!isTyping) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const peer = chatTypingPeer;
    const name = (peer && peer.name) ? peer.name : 'الطرف الآخر';
    box.style.display = 'flex';
    box.innerHTML =
        '<span style="display:inline-flex;align-items:center;gap:5px;font-size:0.78rem;font-weight:800;color:#64748b;">' +
        '<span style="display:inline-flex;gap:3px;align-items:center;">' +
        '<span class="chat-typing-dot" style="width:6px;height:6px;border-radius:50%;background:#94a3b8;display:inline-block;"></span>' +
        '<span class="chat-typing-dot" style="width:6px;height:6px;border-radius:50%;background:#94a3b8;display:inline-block;"></span>' +
        '<span class="chat-typing-dot" style="width:6px;height:6px;border-radius:50%;background:#94a3b8;display:inline-block;"></span>' +
        '</span>' +
        escapeHtml(name) + ' يكتب الآن…' +
        '</span>';
}

// أوقف كل شيء عند مغادرة الصفحة
window.addEventListener('beforeunload', function () { chatTypingStop(); });

    // ================================================================
// الرسائل المباشرة: إرسال بدون إعادة تحميل + وصول تلقائي
// ================================================================
let directChatPollTimer = null;
let directChatLastTopId = 0;
let directChatSending = false;

function stopDirectChatPolling() {
    if (directChatPollTimer) { clearInterval(directChatPollTimer); directChatPollTimer = null; }
}

function startDirectChatPolling() {
    stopDirectChatPolling();
    directChatLastTopId = 0;
    directChatPollTimer = setInterval(pollDirectChatQuietly, 15000);
}

// تحديث صامت: لا يمسح المحتوى ولا يظهر مؤشر تحميل،
// ويعيد الرسم فقط عند وصول رسالة جديدة فعلاً.
async function pollDirectChatQuietly() {
    const peer = (typeof currentChatTeacher !== 'undefined') ? currentChatTeacher : null;
    if (!peer || !peer.id || directChatSending) return;
    const view = document.getElementById('chatView');
    if (view && view.style.display === 'none') return;
    if (typeof directChatIsLoadingOlder !== 'undefined' && directChatIsLoadingOlder) return;
    const container = document.getElementById('chatMessages');
    if (!container) return;
    try {
        const typeParam = peer.type || 'teacher';
        const myId = (typeof teacherId !== 'undefined' && teacherId) ? teacherId
            : ((typeof studentId !== 'undefined' && studentId) ? studentId : null);
        const myType = (typeof teacherId !== 'undefined' && teacherId) ? 'teacher' : 'student';
        if (!myId) return;
        const res = await fetchWithAuth(`/api/messages/${myId}/${myType}/${peer.id}/${typeParam}?limit=5`);
        const msgs = await res.json();
        if (!Array.isArray(msgs) || msgs.length === 0) return;
        const topId = msgs[msgs.length - 1].id;
        if (String(topId) === String(directChatLastTopId)) return;
        directChatLastTopId = topId;
    if (typeof window.zoomySoundWatchMessages === 'function') window.zoomySoundWatchMessages(msgs, [myId]);
        await loadConversationMessages(peer.id, typeParam, true);
    } catch (e) { /* الشبكة قد تتذبذب - نتجاهل بصمت */ }
}

// فقاعة مؤقتة تظهر فور الضغط على إرسال، بلا انتظار الخادم
function appendOptimisticMessage(text, reply) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const loading = container.querySelector('[data-chat-loading]');
    if (loading) loading.remove();

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });

    let quote = '';
    if (reply && reply.text) {
        quote = '<div class="replied-quote-bubble">' +
            '<div class="replied-quote-author"><i class="fas fa-reply"></i> ' + escapeHtml(reply.name || 'رسالة سابقة') + '</div>' +
            '<div class="replied-quote-snippet">' + escapeHtml(String(reply.text).slice(0, 120)) + '</div>' +
            '</div>';
    }

    const wrap = document.createElement('div');
    wrap.className = 'message-bubble sent pending-send';
    wrap.style.opacity = '0.75';
    wrap.innerHTML = quote + '<div style="white-space:pre-wrap;overflow-wrap:break-word;">' + escapeHtml(text) + '</div>' +
        '<span style="position:absolute;bottom:6px;left:10px;font-size:0.66rem;opacity:0.8;">' + timeStr + '</span>';
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
}
    