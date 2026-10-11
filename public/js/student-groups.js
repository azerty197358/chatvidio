// ============================================================================
//  👥 المجموعات - لوحة الطالب
//  هذا الملف كان مفقوداً: دوال المجموعات حُذفت من اللوحة ولم يكن هناك أي
//  سكربت يحمّلها، فكان التبويب فارغاً. كل ما تستدعيه الواجهة هنا معرّف.
//  الجلب يمر عبر ذاكرة مؤقتة قصيرة حتى لا يُثقل كل فتح للتبويب القاعدة.
// ============================================================================
(function () {
    'use strict';

    if (window.__studentGroupsLoaded) return;
    window.__studentGroupsLoaded = true;

    // ---------------------------------------------------------------
    // الحالة
    // ---------------------------------------------------------------
    let activeStudentGroupId = null;
    let activeStudentGroupName = '';
    let activeStudentGroupAvatar = '';
    let allStudentGroups = [];
    let studentGroupTab = 'explore';
    let studentGroupSearchTerm = '';
    let studentGroupMessagesLimit = 30;
    let studentGroupChatTimer = null;
    let selectedStudentGroupFile = null;
    let studentGroupReplyTo = null;
    let studentGroupsRequestId = 0;

    // ذاكرة مؤقتة في المتصفح: نرسم فوراً ثم نحدّث في الخلفية
    const CACHE_KEY = 'student_groups_cache_v1';
    const CACHE_TTL = 45 * 1000;

    window.activeStudentGroupId = null;

    function esc(text) {
        const el = document.createElement('div');
        el.textContent = text === undefined || text === null ? '' : String(text);
        return el.innerHTML;
    }

    function token() {
        try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
    }

    function authFetch(url, options) {
        const opts = options || {};
        const headers = opts.headers || {};
        const tk = token();
        if (tk) headers.Authorization = 'Bearer ' + tk;
        if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
        return fetch(url, Object.assign({}, opts, { headers: headers }));
    }

    // ---------------------------------------------------------------
    // 1) قائمة المجموعات
    // ---------------------------------------------------------------
    function readCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.at) return null;
            if (Date.now() - parsed.at > CACHE_TTL) return null;
            return parsed.groups || null;
        } catch (e) { return null; }
    }

    function writeCache(groups) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), groups: groups }));
        } catch (e) { /* الحصة ممتلئة - لا بأس */ }
    }

    window.loadGroups = async function (options) {
        const silent = options && options.silent;
        const list = document.getElementById('groupsList');
        const requestId = ++studentGroupsRequestId;

        // 1) ارسم من الذاكرة فوراً إن وجدنا نسخة حديثة
        const cached = readCache();
        if (cached && cached.length) {
            allStudentGroups = cached;
            renderStudentGroups();
        } else if (list && !silent) {
            list.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#64748b;">'
                + '<i class="fas fa-spinner fa-spin" style="font-size:1.6rem; margin-bottom:10px;"></i>'
                + '<p style="margin:0;">جاري تحميل المجموعات...</p></div>';
        }

        // 2) حدّث من الخادم دائماً
        try {
            const res = await authFetch('/api/groups/student');
            const data = await res.json();
            if (requestId !== studentGroupsRequestId) return; // طلب أحدث بدأ
            const groups = Array.isArray(data) ? data : (data && Array.isArray(data.groups) ? data.groups : []);
            allStudentGroups = groups;
            writeCache(groups);
            renderStudentGroups();
            updateGroupsBadge(groups);
        } catch (e) {
            if (requestId !== studentGroupsRequestId) return;
            if (!cached && list) {
                list.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#ef4444;">'
                    + '<i class="fas fa-exclamation-triangle" style="font-size:1.6rem; margin-bottom:10px;"></i>'
                    + '<p style="margin:0;">تعذّر تحميل المجموعات. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.</p>'
                    + '<button type="button" onclick="loadGroups()" style="margin-top:12px; background:#2563eb; color:#fff;'
                    + 'border:none; border-radius:8px; padding:8px 18px; font-weight:800; cursor:pointer;">إعادة المحاولة</button></div>';
            }
        }
    };

    function updateGroupsBadge(groups) {
        const badge = document.getElementById('groupsBadge');
        if (!badge) return;
        let unread = 0;
        const myId = currentStudentId();
        (groups || []).forEach(function (g) {
            if (!g.latest_message_time) return;
            if (String(g.id) === String(activeStudentGroupId)) return;
            const seen = localStorage.getItem('group_last_read_' + myId + '_' + g.id);
            if (!seen || new Date(g.latest_message_time) > new Date(seen)) unread++;
        });
        if (unread > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = unread > 99 ? '99+' : String(unread);
        } else {
            badge.style.display = 'none';
        }
    }

    function currentStudentId() {
        try {
            const tk = token();
            if (!tk) return 0;
            const decoded = JSON.parse(atob(tk.split('.')[1]));
            return decoded.userId || decoded.id || 0;
        } catch (e) { return 0; }
    }

    // ---------------------------------------------------------------
    // 2) العرض
    // ---------------------------------------------------------------
    window.switchStudentGroupTab = function (tab) {
        studentGroupTab = (tab === 'my') ? 'my' : 'explore';
        const explore = document.getElementById('studentGroupTabExplore');
        const mine = document.getElementById('studentGroupTabMy');
        if (explore) explore.classList.toggle('active', studentGroupTab === 'explore');
        if (mine) mine.classList.toggle('active', studentGroupTab === 'my');
        renderStudentGroups();
    };

    window.handleStudentGroupSearch = function () {
        const input = document.getElementById('studentGroupSearchInput');
        studentGroupSearchTerm = input ? String(input.value || '').trim().toLowerCase() : '';
        renderStudentGroups();
    };

    window.renderStudentGroups = function () {
        const list = document.getElementById('groupsList');
        if (!list) return;

        const term = studentGroupSearchTerm;
        let groups = allStudentGroups.slice();

        if (studentGroupTab === 'my') {
            groups = groups.filter(function (g) { return g.is_member !== false; });
        }
        if (term) {
            groups = groups.filter(function (g) {
                return (String(g.name || '').toLowerCase().indexOf(term) !== -1) ||
                       (String(g.description || '').toLowerCase().indexOf(term) !== -1) ||
                       (String(g.teacher_name || '').toLowerCase().indexOf(term) !== -1);
            });
        }

        if (!groups.length) {
            list.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:44px 20px; color:#64748b;">'
                + '<div style="width:64px;height:64px;border-radius:50%;background:#eff6ff;display:flex;align-items:center;'
                + 'justify-content:center;margin:0 auto 12px;"><i class="fas fa-users" style="font-size:1.6rem;color:#3b82f6;"></i></div>'
                + '<h4 style="margin:0 0 6px; color:#0f172a;">' + (term ? 'لا توجد نتائج' : 'لا توجد مجموعات بعد') + '</h4>'
                + '<p style="margin:0; font-size:0.9rem;">'
                + (term ? 'جرّب كلمة أخرى.' : 'مجموعات الأساتذة ستظهر هنا فور نشرها.') + '</p></div>';
            return;
        }

        list.innerHTML = groups.map(function (g) {
            const members = Number(g.members_count || 0);
            const msgs = Number(g.msg_count || 0);
            const when = g.latest_message_time
                ? esc(new Date(g.latest_message_time).toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' }))
                : esc(g.created_at ? new Date(g.created_at).toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' }) : 'جديد');

            return '<div class="group-card" data-group-id="' + Number(g.id) + '" style="background:#fff; border:1.5px solid #e2e8f0;'
                + ' border-radius:16px; overflow:hidden; cursor:pointer; transition:all .2s; display:flex; flex-direction:column;"'
                + ' onclick="enterStudentGroupChat(' + JSON.stringify(g).replace(/"/g, '&quot;') + ', &quot;&quot;, &quot;&quot;)">'
                + '<div style="height:96px; background:linear-gradient(135deg,#3b82f6,#1d4ed8); position:relative;">'
                + (g.image_url ? '<img src="' + esc(g.image_url) + '" style="width:100%;height:96px;object-fit:cover;" onerror="this.style.display=\'none\';">' : '')
                + '<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">'
                + '<i class="fas fa-users" style="font-size:2rem; color:rgba(255,255,255,0.85);"></i></div>'
                + '<span style="position:absolute; top:10px; left:10px; background:rgba(15,23,42,0.65); color:#fff; font-size:0.72rem;'
                + ' font-weight:800; padding:3px 10px; border-radius:20px;"><i class="fas fa-users"></i> ' + members + '</span>'
                + '</div>'
                + '<div style="padding:14px 16px 16px; flex:1; display:flex; flex-direction:column;">'
                + '<h4 style="margin:0 0 4px; font-size:1rem; font-weight:800; color:#0f172a;">' + esc(g.name || 'مجموعة') + '</h4>'
                + '<p style="margin:0 0 8px; font-size:0.82rem; color:#64748b; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2;'
                + ' -webkit-box-orient:vertical; overflow:hidden;">' + esc(g.description || '') + '</p>'
                + '<div style="margin-top:auto; display:flex; align-items:center; justify-content:space-between; font-size:0.75rem; color:#94a3b8;">'
                + '<span><i class="fas fa-chalkboard-user"></i> ' + esc(g.teacher_name || 'أستاذ') + '</span>'
                + '<span><i class="far fa-comments"></i> ' + msgs + ' · ' + when + '</span>'
                + '</div></div></div>';
        }).join('');
    };

    // ---------------------------------------------------------------
    // 3) دخول المحادثة
    // ---------------------------------------------------------------
    window.enterStudentGroupChat = async function (group, name, avatar) {
        const g = (group && typeof group === 'object') ? group : (group ? { id: group } : null);
        if (!g || !g.id) return;

        const mainView = document.getElementById('studentGroupsMainView');
        const chatView = document.getElementById('studentGroupsChatView');

        if (name || avatar) {
            // مسار المشاركة: نحتاج تفاصيل المجموعة أولاً
            try {
                const res = await authFetch('/api/groups/' + Number(g.id) + '/messages?limit=1');
                await res.json();
            } catch (e) {}
        }

        activeStudentGroupId = Number(g.id);
        window.activeStudentGroupId = activeStudentGroupId;
        activeStudentGroupName = name || g.name || 'المجموعة';
        activeStudentGroupAvatar = avatar || g.image_url || '';

        const nameEl = document.getElementById('studentChatGroupName');
        if (nameEl) nameEl.textContent = activeStudentGroupName;

        const img = document.getElementById('studentChatGroupImage');
        const ph = document.getElementById('studentChatGroupImagePlaceholder');
        if (img && ph) {
            if (activeStudentGroupAvatar) {
                img.src = activeStudentGroupAvatar;
                img.style.display = 'block';
                ph.style.display = 'none';
            } else {
                img.style.display = 'none';
                ph.style.display = 'flex';
            }
        }

        if (mainView) mainView.style.display = 'none';
        if (chatView) chatView.style.display = 'flex';

        studentGroupMessagesLimit = 30;
        try {
            localStorage.setItem('group_last_read_' + currentStudentId() + '_' + activeStudentGroupId,
                new Date().toISOString());
        } catch (e) {}

        cancelStudentChatPdfAttachment();
        cancelGroupChatReply();

        await loadStudentChatMessages();

        if (studentGroupChatTimer) clearInterval(studentGroupChatTimer);
        studentGroupChatTimer = setInterval(loadStudentChatMessages, 6000);

        updateGroupsBadge(allStudentGroups);
    };

    window.exitStudentGroupChat = function () {
        if (studentGroupChatTimer) { clearInterval(studentGroupChatTimer); studentGroupChatTimer = null; }
        activeStudentGroupId = null;
        window.activeStudentGroupId = null;
        studentGroupMessagesLimit = 30;
        cancelStudentChatPdfAttachment();
        cancelGroupChatReply();
        const mainView = document.getElementById('studentGroupsMainView');
        const chatView = document.getElementById('studentGroupsChatView');
        if (mainView) mainView.style.display = 'block';
        if (chatView) chatView.style.display = 'none';
        updateGroupsBadge(allStudentGroups);
    };

    // ---------------------------------------------------------------
    // 4) الرسائل
    // ---------------------------------------------------------------
    let studentChatLastMessageId = 0;

    window.loadStudentChatMessages = async function () {
        if (!activeStudentGroupId) return;
        const area = document.getElementById('studentChatMessagesArea');
        if (!area) return;

        try {
            const res = await authFetch('/api/groups/' + activeStudentGroupId + '/messages?limit=' + studentGroupMessagesLimit);
            const messages = await res.json();
            if (!Array.isArray(messages) || messages.length === 0) {
                if (!studentChatLastMessageId) {
                    area.innerHTML = '<div style="margin:auto; text-align:center; padding:34px 20px; color:#64748b;">'
                        + '<i class="fas fa-comments" style="font-size:2.4rem; opacity:0.35; margin-bottom:10px;"></i>'
                        + '<h4 style="margin:0 0 6px; color:#0f172a;">لا توجد رسائل بعد</h4>'
                        + '<p style="margin:0; font-size:0.9rem;">كن أول من يكتب في هذه المجموعة!</p></div>';
                }
                return;
            }

            const topId = messages[messages.length - 1].id;
            const isFirstPaint = !studentChatLastMessageId;
            if (!isFirstPaint && String(topId) === String(studentChatLastMessageId)) return;
            studentChatLastMessageId = topId;

            const meId = currentStudentId();
            const atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 140;

            area.innerHTML = messages.map(function (m) {
                const mine = String(m.sender_id) === String(meId) && m.sender_type === 'student';
                const time = m.created_at
                    ? new Date(m.created_at).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })
                    : '';

                let body = '';
                if (m.reply_to_text) {
                    body += '<div style="border-right:3px solid #3b82f6; padding:5px 9px; margin-bottom:6px; background:#eff6ff;'
                        + ' border-radius:6px; font-size:0.78rem; color:#475569;">'
                        + '<strong>' + esc(m.reply_to_sender || 'رد') + ':</strong> ' + esc(String(m.reply_to_text).slice(0, 90)) + '</div>';
                }

                if (m.text) body += '<div style="white-space:pre-wrap; overflow-wrap:break-word;">' + esc(m.text) + '</div>';

                if (m.file_url) {
                    const isImage = String(m.file_type || '').indexOf('image') === 0;
                    body += isImage
                        ? '<img src="' + esc(m.file_url) + '" style="max-width:100%; border-radius:10px; margin-top:6px;" onclick="window.open(\'' + esc(m.file_url) + '\',\'_blank\')">'
                        : '<a href="' + esc(m.file_url) + '" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:6px;'
                          + ' margin-top:6px; color:#1d4ed8; font-weight:700; font-size:0.85rem;"><i class="fas fa-file-pdf"></i> '
                          + esc(m.file_name || 'ملف') + '</a>';
                }

                return '<div style="display:flex; flex-direction:' + (mine ? 'row-reverse' : 'row') + '; align-items:flex-start; gap:8px;">'
                    + (mine ? '' :
                        '<img src="' + esc(m.sender_avatar || '/images/default-avatar.svg') + '" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;">')
                    + '<div style="max-width:78%; background:' + (mine ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : '#ffffff')
                    + '; color:' + (mine ? '#ffffff' : '#0f172a') + '; border-radius:14px; padding:9px 13px;'
                    + ' box-shadow:0 1px 3px rgba(15,23,42,0.08); font-size:0.9rem; line-height:1.55;">'
                    + (mine ? '' : '<div style="font-size:0.72rem; font-weight:800; color:#0284c7; margin-bottom:3px;">'
                        + esc(m.sender_name || 'طالب') + '</div>')
                    + body
                    + '<div style="font-size:0.65rem; opacity:0.75; margin-top:3px; text-align:left;">' + esc(time) + '</div>'
                    + '</div></div>';
            }).join('');

            if (isFirstPaint || atBottom) area.scrollTop = area.scrollHeight;
        } catch (e) { /* الشبكة قد تتذبذب */ }
    };

    window.handleStudentChatInputKey = function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendStudentGroupChatMessage();
        }
    };

    window.cancelGroupChatReply = function () {
        studentGroupReplyTo = null;
        const bar = document.getElementById('groupReplyBar');
        if (bar) bar.style.display = 'none';
    };

    window.startStudentGroupReply = function (msg) {
        studentGroupReplyTo = msg;
        const bar = document.getElementById('groupReplyBar');
        const to = document.getElementById('groupReplyBarTo');
        const text = document.getElementById('groupReplyBarText');
        if (to) to.textContent = 'رد على ' + (msg.sender_name || 'رسالة');
        if (text) text.textContent = String(msg.text || '').slice(0, 80);
        if (bar) bar.style.display = 'flex';
    };

    window.cancelStudentChatPdfAttachment = function () {
        selectedStudentGroupFile = null;
        const bar = document.getElementById('studentChatPdfPreviewBar');
        const input = document.getElementById('studentChatPdfFileInput');
        const cam = document.getElementById('studentChatCameraInput');
        if (bar) bar.style.display = 'none';
        if (input) input.value = '';
        if (cam) cam.value = '';
    };

    window.handleStudentGroupPdfSelect = function (event) {
        const file = event && event.target && event.target.files ? event.target.files[0] : null;
        if (!file) return;
        selectedStudentGroupFile = file;
        const bar = document.getElementById('studentChatPdfPreviewBar');
        const name = document.getElementById('studentChatPdfName');
        const size = document.getElementById('studentChatPdfSize');
        if (name) name.textContent = file.name;
        if (size) size.textContent = Math.max(1, Math.round(file.size / 1024)) + ' KB';
        if (bar) bar.style.display = 'flex';
    };

    window.handleStudentGroupCameraSelect = function (event) {
        window.handleStudentGroupPdfSelect(event);
    };

    window.sendStudentGroupChatMessage = async function () {
        if (!activeStudentGroupId) return;
        const input = document.getElementById('studentChatInputMessage');
        const btn = document.getElementById('sendStudentChatBtn');
        if (!input) return;

        const text = String(input.value || '').trim();
        const file = selectedStudentGroupFile;
        if (!text && !file) return;

        input.value = '';
        input.style.height = 'auto';
        const payload = {
            message: text,
            reply_to_id: studentGroupReplyTo ? studentGroupReplyTo.id : null,
            reply_to_sender: studentGroupReplyTo ? studentGroupReplyTo.sender_name : null,
            reply_to_text: studentGroupReplyTo ? studentGroupReplyTo.text : null
        };

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

        try {
            let res;
            if (file) {
                const form = new FormData();
                form.append('file', file);
                form.append('message', text);
                if (payload.reply_to_id) form.append('reply_to_id', payload.reply_to_id);
                res = await authFetch('/api/groups/' + activeStudentGroupId + '/messages', { method: 'POST', body: form });
            } else {
                res = await authFetch('/api/groups/' + activeStudentGroupId + '/messages', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
            }
            const data = await res.json();
            if (data && data.error) {
                if (typeof showToast === 'function') showToast(data.error, 'error');
            } else {
                cancelStudentChatPdfAttachment();
                cancelGroupChatReply();
                studentChatLastMessageId = 0; // أجبرنا على إعادة الرسم
                await loadStudentChatMessages();
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast('تعذّر إرسال الرسالة', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i>'; }
            input.focus();
        }
    };

    // ---------------------------------------------------------------
    // 5) الأعضاء
    // ---------------------------------------------------------------
    window.openStudentGroupMembersModal = async function () {
        if (!activeStudentGroupId) return;
        let body = '<p style="text-align:center; padding:20px; color:#64748b;"><i class="fas fa-spinner fa-spin"></i></p>';
        if (typeof showToast === 'function') { /* placeholder until the modal exists */ }

        try {
            const res = await authFetch('/api/groups/' + activeStudentGroupId + '/members');
            const data = await res.json();
            const members = Array.isArray(data) ? data : (data && data.members) || [];
            body = members.length
                ? '<div style="display:flex; flex-direction:column; gap:8px;">' + members.map(function (m) {
                    const name = m.full_name || m.name || 'عضو';
                    const avatar = m.profile_url || m.profile_image || '/images/default-avatar.svg';
                    return '<div style="display:flex; align-items:center; gap:10px; padding:8px 10px; background:#f8fafc;'
                        + ' border:1px solid #e2e8f0; border-radius:10px;">'
                        + '<img src="' + esc(avatar) + '" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">'
                        + '<div style="min-width:0;"><div style="font-weight:700; font-size:0.88rem; color:#0f172a;">' + esc(name) + '</div>'
                        + '<div style="font-size:0.72rem; color:#64748b;">' + (m.role === 'teacher' ? 'أستاذ' : 'طالب') + '</div></div></div>';
                }).join('') + '</div>'
                : '<p style="text-align:center; padding:20px; color:#94a3b8;">لا يوجد أعضاء بعد</p>';
        } catch (e) {
            body = '<p style="text-align:center; padding:20px; color:#ef4444;">تعذّر تحميل الأعضاء</p>';
        }

        if (typeof showModal === 'function') {
            showModal('أعضاء المجموعة', body);
        } else if (typeof showToast === 'function') {
            showToast('أعضاء المجموعة: ' + (body.indexOf('padding:8px') !== -1 ? 'تحميل' : 'لا يوجد'), 'info');
        } else {
            alert('أعضاء المجموعة');
        }
    };
})();