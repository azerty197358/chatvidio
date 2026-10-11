// ============================================================================
//  المجموعات — لوحة الطالب
//  كود الإصلاحي الأصلي منقول من اللوحة، منتقلاً إلى أنماط
//  برموجات المجموعات الصيغة والدخول ومعاملة الطلاب والمرفقات
// ============================================================================
(function () {
    'use strict';

    if (window.__studentGroupsLoaded) return;
    window.__studentGroupsLoaded = true;

    // ---------- كاش قصير لقائمتان المجموعة ----------
    var GROUP_LIST_CACHE = {};
    var GROUP_LIST_TTL = 30 * 1000;

    function groupListFetch(url, options) {
        var opts = options || {};
        var headers = opts.headers || {};
        var key = url + '|' + (headers.Authorization || '');
        var hit = GROUP_LIST_CACHE[key];
        if (hit && Date.now() - hit.at < GROUP_LIST_TTL) {
            return Promise.resolve({
                ok: true, status: 200,
                json: function () { return Promise.resolve(hit.body); }
            });
        }
        return fetch(url, opts).then(function (res) {
            return res.json().then(function (data) {
                GROUP_LIST_CACHE[key] = { at: Date.now(), body: data };
                return { ok: true, status: 200, json: function () { return Promise.resolve(data); } };
            });
        });
    }

    // الانضماق وإرسال رسالة يحدّث القائمة في الحالة
    window.invalidateStudentGroupsCache = function () { GROUP_LIST_CACHE = {}; };
    // ---------- شريط الرد ----------
    var studentGroupReplyTo = null;

    Object.defineProperty(window, 'currentGroupReplyTo', {
        get: function () { return studentGroupReplyTo; },
        set: function (v) { studentGroupReplyTo = v; },
        configurable: true
    });

    window.startGroupReplyToMessage = function (msgId, senderName, text) {
        studentGroupReplyTo = { id: msgId, sender: senderName, text: text };
        var bar = document.getElementById('groupReplyBar');
        var to = document.getElementById('groupReplyBarTo');
        var label = document.getElementById('groupReplyBarText');
        if (to) to.textContent = 'رد على ' + (senderName || 'رسالة');
        if (label) label.textContent = String(text || '').slice(0, 90);
        if (bar) bar.style.display = 'flex';
    };

    window.cancelGroupChatReply = function () {
        studentGroupReplyTo = null;
        var bar = document.getElementById('groupReplyBar');
        if (bar) bar.style.display = 'none';
    };

    window.scrollToGroupMessage = function (msgId) {
        var el = document.getElementById('studentMsg_' + msgId);
        if (!el) return;
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
        var previous = el.style.boxShadow;
        el.style.boxShadow = '0 0 0 3px rgba(59,130,246,.55)';
        setTimeout(function () { el.style.boxShadow = previous; }, 1600);
    };
    var originalSend = window.sendStudentGroupChatMessage;


        let studentCurrentGroupTab = 'explore';
        let studentMyGroupsList = [];

        function switchStudentGroupTab(tab) {
            studentCurrentGroupTab = tab;
            const btnMy = document.getElementById('studentGroupTabMy');
            const btnExplore = document.getElementById('studentGroupTabExplore');

            if (tab === 'my') {
                if (btnMy) {
                    btnMy.style.background = 'white';
                    btnMy.style.color = '#1e293b';
                    btnMy.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
                    btnMy.style.fontWeight = '800';
                }
                if (btnExplore) {
                    btnExplore.style.background = 'transparent';
                    btnExplore.style.color = '#64748b';
                    btnExplore.style.boxShadow = 'none';
                    btnExplore.style.fontWeight = '700';
                }
            } else {
                if (btnExplore) {
                    btnExplore.style.background = 'white';
                    btnExplore.style.color = '#1e293b';
                    btnExplore.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
                    btnExplore.style.fontWeight = '800';
                }
                if (btnMy) {
                    btnMy.style.background = 'transparent';
                    btnMy.style.color = '#64748b';
                    btnMy.style.boxShadow = 'none';
                    btnMy.style.fontWeight = '700';
                }
            }
            loadGroups();
        }

        function handleStudentGroupSearch() {
            loadGroups();
        }

        async function joinStudentToGroup(groupId, groupName) {
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`/api/groups/${groupId}/join`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                const data = await response.json();
                if (response.ok) {
                    showToast('🎉 تم الانضمام للمجموعة بنجاح!', 'success');
                } else if (data.error) {
                    showToast(data.error, 'error');
                }
            } catch (e) {
                console.error(e);
            }
            enterStudentGroupChat(groupId, groupName, '');
        }

        async function loadGroups() {
            const isGuestUser = userData && (userData.is_guest || userData.id === -1);
            const list = document.getElementById('groupsList');
            const query = (document.getElementById('studentGroupSearchInput')?.value || '').trim();
            if (!list) return;

            if (isGuestUser && studentCurrentGroupTab === 'my') {
                list.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 40px 25px; background: white; border-radius: 16px; border: 2px dashed #cbd5e1;">
                        <div style="width: 60px; height: 60px; border-radius: 50%; background: #eff6ff; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; font-size: 1.6rem; color: var(--primary, #3b82f6);">
                            <i class="fas fa-users"></i>
                        </div>
                        <h3 style="color: #1e293b; margin: 0 0 8px 0; font-size: 1.2rem; font-weight: 800;">أنت تتصفح المنصة كزائر</h3>
                        <p style="color: #64748b; margin: 0 0 16px 0; max-width: 420px; margin-left: auto; margin-right: auto; line-height: 1.5; font-size: 0.92rem;">سجّل دخولك أو انقر على تبويب استكشاف المجموعات للبحث والانضمام.</p>
                        <button onclick="showGuestPrompt()" class="btn" style="background: var(--primary, #3b82f6); color: white; border: none; padding: 10px 22px; border-radius: 10px; font-weight: 700; font-size: 0.92rem; cursor: pointer;">
                            <i class="fas fa-sign-in-alt"></i> تسجيل الدخول / إنشاء حساب
                        </button>
                    </div>
                `;
                return;
            }

            if (studentCurrentGroupTab === 'my') {
                list.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 40px 20px;">
                        <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary, #3b82f6); margin-bottom: 10px;"></i>
                        <p style="margin: 0; font-weight: 600;">جاري تحميل مجموعاتك المشترك بها...</p>
                    </div>
                `;

                try {
                    const response = await groupListFetch('/api/groups/student', {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                    });
                    const groups = await response.json();
                    studentMyGroupsList = Array.isArray(groups) ? groups : [];
                    
                    let filtered = studentMyGroupsList;
                    if (query) {
                        const qLower = query.toLowerCase();
                        filtered = studentMyGroupsList.filter(g => 
                            (g.name && g.name.toLowerCase().includes(qLower))
                        );
                    }

                    if (filtered.length === 0) {
                        list.innerHTML = `
                            <div style="grid-column: 1/-1; text-align: center; padding: 50px 25px; background: white; border-radius: 16px; border: 2px dashed #cbd5e1;">
                                <div style="width: 65px; height: 65px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; font-size: 1.8rem; color: #94a3b8;">
                                    <i class="fas fa-users-slash"></i>
                                </div>
                                <h3 style="color: #1e293b; margin: 0 0 8px 0; font-size: 1.2rem; font-weight: 800;">${query ? 'لا توجد نتائج مطابقة لمجموعاتك' : 'لست منضماً لأي مجموعة حالياً'}</h3>
                                <p style="color: #64748b; margin: 0 0 16px 0; max-width: 420px; margin-left: auto; margin-right: auto; line-height: 1.5; font-size: 0.92rem;">يمكنك التبديل إلى تبويب "استكشاف كل المجموعات" للبحث عن مجموعة جديدة والانضمام إليها.</p>
                                <button onclick="switchStudentGroupTab('explore')" class="btn" style="background: var(--primary, #3b82f6); color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: 700; cursor: pointer;">
                                    <i class="fas fa-compass"></i> استكشاف المجموعات العامة
                                </button>
                            </div>
                        `;
                        return;
                    }

                    list.innerHTML = filtered.map(g => {
                        const escapedName = (g.name || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
                        const escapedImageUrl = g.image_url ? g.image_url.replace(/'/g, "\\'").replace(/"/g, '\\"') : '';
                        return `
                            <div class="group-card" style="border: 1px solid #e2e8f0; padding: 22px; border-radius: 16px; background: white; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04); display: flex; flex-direction: column; justify-content: space-between; gap: 16px;">
                                <div style="display: flex; align-items: center; gap: 14px;">
                                    ${g.image_url 
                                        ? `<img src="${g.image_url}" style="width: 56px; height: 56px; border-radius: 14px; object-fit: cover; border: 2px solid #e2e8f0;">` 
                                        : `<div style="width: 56px; height: 56px; border-radius: 14px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; color: white;"><i class="fas fa-users"></i></div>`
                                    }
                                    <div style="flex: 1; min-width: 0;">
                                        <h3 style="margin: 0 0 4px 0; font-size: 1.1rem; color: #0f172a; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${g.name}</h3>
                                        <div style="display: flex; gap: 6px;">
                                            <span style="display: inline-flex; align-items: center; gap: 5px; background: #ecfdf5; color: #059669; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">
                                                <i class="fas fa-check-circle"></i> عضو منضم
                                            </span>
                                            ${g.msg_count ? `<span style="display: inline-flex; align-items: center; background: #ef4444; color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.7rem; font-weight: 800;">${g.msg_count > 99 ? '+99' : g.msg_count} رسالة</span>` : ''}
                                        </div>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 8px; width: 100%;">
                                    <button onclick="enterStudentGroupChat(${g.id}, '${escapedName}', '${escapedImageUrl}')" class="btn" style="flex: 1; background: var(--primary, #3b82f6); color: white; border-radius: 10px; padding: 11px; font-weight: 700; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.92rem; box-shadow: 0 3px 8px rgba(59, 130, 246, 0.25); transition: all 0.2s;">
                                        <i class="fas fa-comments"></i> دخول المحادثة
                                    </button>
                                    <button onclick="openStudentGroupMembersModal(${g.id}, '${escapedName}', '${escapedImageUrl}')" class="btn" style="background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 10px; padding: 11px 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.88rem; transition: all 0.2s;" title="عرض أعضاء المجموعة">
                                        <i class="fas fa-users" style="color: #3b82f6;"></i> الأعضاء
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('');
                } catch (e) {
                    list.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 20px;">خطأ في تحميل المجموعات.</p>';
                }
            } else {
                // EXPLORE ALL GROUPS
                list.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 40px 20px;">
                        <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary, #3b82f6); margin-bottom: 10px;"></i>
                        <p style="margin: 0; font-weight: 600;">جاري البحث عن المجموعات...</p>
                    </div>
                `;

                try {
                    const token = localStorage.getItem('token');
                    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                    const res = await groupListFetch(`/api/groups/search?q=${encodeURIComponent(query)}`, { headers });
                    const groups = await res.json();

                    if (!Array.isArray(groups) || groups.length === 0) {
                        list.innerHTML = `
                            <div style="grid-column: 1/-1; text-align: center; padding: 50px 25px; background: white; border-radius: 16px; border: 2px dashed #cbd5e1;">
                                <div style="width: 65px; height: 65px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; font-size: 1.8rem; color: #94a3b8;">
                                    <i class="fas fa-search"></i>
                                </div>
                                <h3 style="color: #1e293b; margin: 0 0 8px 0; font-size: 1.2rem; font-weight: 800;">لم يتم العثور على أي مجموعات</h3>
                                <p style="color: #64748b; margin: 0; max-width: 400px; margin-left: auto; margin-right: auto; line-height: 1.5; font-size: 0.92rem;">جرب البحث بكلمات أخرى أو التأكد من اسم الأستاذ أو المادة.</p>
                            </div>
                        `;
                        return;
                    }

                    list.innerHTML = groups.map(g => {
                        const escapedName = (g.name || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
                        const isJoined = g.is_member;
                        const teacherTitle = g.teacher_name ? `الأستاذ: ${g.teacher_name}` : 'أستاذ المادة';

                        return `
                            <div class="group-card" style="border: 1px solid #e2e8f0; padding: 20px; border-radius: 16px; background: white; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04); display: flex; flex-direction: column; justify-content: space-between; gap: 14px;">
                                <div style="display: flex; align-items: flex-start; gap: 12px;">
                                    ${g.image_url 
                                        ? `<img src="${g.image_url}" style="width: 52px; height: 52px; border-radius: 14px; object-fit: cover; border: 2px solid #e2e8f0;">` 
                                        : `<div style="width: 52px; height: 52px; border-radius: 14px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; color: white;"><i class="fas fa-users"></i></div>`
                                    }
                                    <div style="flex: 1;">
                                        <h3 style="margin: 0 0 4px 0; font-size: 1.05rem; color: #0f172a; font-weight: 800;">${g.name}</h3>
                                        <div style="font-size: 0.8rem; color: #64748b; display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                                            <i class="fas fa-chalkboard-teacher" style="color: #3b82f6;"></i>
                                            <span>${teacherTitle}</span>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span onclick="openStudentGroupMembersModal(${g.id}, '${escapedName}', '${g.image_url || ''}')" style="font-size: 0.75rem; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 3px 10px; border-radius: 10px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" title="انقر لعرض أعضاء المجموعة">
                                                <i class="fas fa-users"></i> ${g.members_count} عضو (الأعضاء)
                                            </span>
                                            ${isJoined ? `
                                                <span style="font-size: 0.75rem; background: #ecfdf5; color: #059669; padding: 2px 8px; border-radius: 10px; font-weight: 700;">
                                                    <i class="fas fa-check"></i> عضو بالفعل
                                                </span>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>

                                ${isJoined ? `
                                    <button onclick="enterStudentGroupChat(${g.id}, '${escapedName}', '${g.image_url || ''}')" class="btn" style="width: 100%; background: #059669; color: white; border-radius: 10px; padding: 10px; font-weight: 700; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.9rem;">
                                        <i class="fas fa-comments"></i> دخول المحادثة
                                    </button>
                                ` : `
                                    <button onclick="joinStudentToGroup(${g.id}, '${escapedName}')" class="btn" style="width: 100%; background: var(--primary, #3b82f6); color: white; border-radius: 10px; padding: 10px; font-weight: 700; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.9rem; box-shadow: 0 3px 8px rgba(59, 130, 246, 0.25);">
                                        <i class="fas fa-user-plus"></i> الانضمام للمجموعة
                                    </button>
                                `}
                            </div>
                        `;
                    }).join('');
                } catch (e) {
                    list.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 20px;">حدث خطأ أثناء البحث عن المجموعات.</p>';
                }
            }
        }

        // ==========================================
        // STUDENT LIVE CHAT ENGINE
        // ==========================================
        let studentChatInterval = null;
        let activeStudentGroupId = null;
        Object.defineProperty(window, 'activeStudentGroupId', {
            get() { return activeStudentGroupId; },
            set(val) { activeStudentGroupId = val; },
            configurable: true
        });
        let selectedStudentGroupPdf = null;

        function handleStudentGroupPdfSelect(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            if (!file.type.includes('pdf') && !file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.pdf')) {
                showToast('يرجى اختيار ملف PDF أو صورة فقط', 'error');
                e.target.value = '';
                return;
            }

            if (file.size > 25 * 1024 * 1024) {
                showToast('حجم ملف الـ PDF كبير جداً (الحد الأقصى 25 ميغابايت)', 'error');
                e.target.value = '';
                return;
            }

            selectedStudentGroupPdf = file;
            const previewBar = document.getElementById('studentChatPdfPreviewBar');
            const nameEl = document.getElementById('studentChatPdfName');
            const sizeEl = document.getElementById('studentChatPdfSize');

            if (nameEl) nameEl.textContent = file.name;
            if (sizeEl) sizeEl.textContent = formatFileSize(file.size) + ' • جاهز للإرسال';
  if (previewBar) previewBar.style.display = 'flex';
  // إرسال الصورة أو الملف فوراً بعد الاختيار، بدون انتظار زر إضافي.
  void sendStudentGroupChatMessage();
  }

  function cancelStudentChatPdfAttachment() {
            selectedStudentGroupPdf = null;
            const fileInput = document.getElementById('studentChatPdfFileInput');
            if (fileInput) fileInput.value = '';
            const previewBar = document.getElementById('studentChatPdfPreviewBar');
            if (previewBar) previewBar.style.display = 'none';
        }

        function formatStudentMessageLinks(text, isSelf = false) {
            if (!text) return '';
            return autoLinkUrls(text, { isSelf: isSelf, linkColor: isSelf ? '#93c5fd' : '#2563eb' });
        }

        async function enterStudentGroupChat(groupId, groupName, groupImageUrl) {
            activeStudentGroupId = groupId;
            
            if (!groupName || groupName === '') {
                try {
                    const res = await fetch(`/api/groups/${groupId}/public`);
                    const gData = await res.json();
                    if (gData && gData.name) {
                        groupName = gData.name;
                        groupImageUrl = gData.image_url || '';
                    }
                } catch(e) {
                    console.error('Error fetching public group info:', e);
                }
            }

            document.getElementById('studentChatGroupName').textContent = groupName || 'المجموعة';
            const placeholder = document.getElementById('studentChatGroupImagePlaceholder');
            const img = document.getElementById('studentChatGroupImage');
            if (groupImageUrl) {
                img.src = groupImageUrl;
                img.style.display = 'block';
                placeholder.style.display = 'none';
            } else {
                img.style.display = 'none';
                placeholder.style.display = 'flex';
                // Set name in placeholder as well
                placeholder.textContent = groupName ? groupName.substring(0, 2) : '??';
            }
            
            document.getElementById('studentGroupsMainView').style.display = 'none';
            document.getElementById('studentGroupsChatView').style.display = 'flex';
            
            const isGuestUser = !userData || userData.is_guest || userData.id === -1;
            const guestNotice = document.getElementById('studentGuestNotice');
            const guestBadge = document.getElementById('studentChatGuestBadge');
            const guestJoinBtn = document.getElementById('studentGuestJoinBtn');
            const inputBar = document.getElementById('studentChatInputBar');
            const blockedNotice = document.getElementById('studentBlockedNotice');

            if (isGuestUser) {
                if (guestNotice) guestNotice.style.display = 'flex';
                if (guestBadge) guestBadge.style.display = 'inline-flex';
                if (guestJoinBtn) guestJoinBtn.style.display = 'inline-flex';
                if (inputBar) inputBar.style.display = 'none'; // Blocks input
                if (blockedNotice) blockedNotice.style.display = 'none';
            } else {
                if (guestNotice) guestNotice.style.display = 'none';
                if (guestBadge) guestBadge.style.display = 'none';
                if (guestJoinBtn) guestJoinBtn.style.display = 'none';
                // Only show input bar if they have joined/are member
                if (inputBar) inputBar.style.display = 'flex'; 
                await checkStudentMembershipAndStatus();
            }
            
            window.studentChatMessagesLimit = 20;
            window.studentChatHasMore = true;
            window.studentChatIsLoadingOlder = false;
            window.studentChatInitialScrollDone = false;
            if (typeof setupStudentChatScrollPagination === 'function') {
                setupStudentChatScrollPagination();
            }
            
            loadStudentChatMessages(false);
            if (studentChatInterval) clearInterval(studentChatInterval);
            studentChatInterval = setInterval(() => {
                if (!window.studentChatIsLoadingOlder) {
                    loadStudentChatMessages(false);
                }
            }, 3500);

            if (!isGuestUser) {
                setTimeout(() => {
                    const input = document.getElementById('studentChatInputMessage');
                    if (input) input.focus();
                }, 200);
            }
        }

        function exitStudentGroupChat() {
            activeStudentGroupId = null;
            window.studentChatMessagesLimit = 20;
            window.studentChatHasMore = true;
            window.studentChatIsLoadingOlder = false;
            window.studentChatInitialScrollDone = false;
            if (studentChatInterval) {
                clearInterval(studentChatInterval);
                studentChatInterval = null;
            }
            document.getElementById('studentGroupsChatView').style.display = 'none';
            document.getElementById('studentGroupsMainView').style.display = 'block';
            loadGroups();
        }

        async function checkStudentMembershipAndStatus() {
            if (!activeStudentGroupId) return;
            try {
                const response = await fetch(`/api/groups/${activeStudentGroupId}/members`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                const members = await response.json();
                
                const token = localStorage.getItem('token');
                let currentUserId = null;
                if (token) {
                    try {
                        const decoded = JSON.parse(atob(token.split('.')[1]));
                        currentUserId = decoded.userId || decoded.id;
                    } catch(e) {}
                }

                const me = Array.isArray(members) ? members.find(m => String(m.student_id) === String(currentUserId)) : null;
                if (me && me.is_blocked) {
                    document.getElementById('studentChatInputBar').style.display = 'none';
                    document.getElementById('studentBlockedNotice').style.display = 'block';
                } else {
                    document.getElementById('studentChatInputBar').style.display = 'flex';
                    document.getElementById('studentBlockedNotice').style.display = 'none';
                }
            } catch (err) {
                console.error("Error checking student block status:", err);
            }
        }

        function formatStudentChatTime(dateVal) {
            if (!dateVal) return '';
            try {
                let str = String(dateVal).trim();
                if (str.includes(', ') && !str.includes('T')) {
                    str = str.replace(', ', 'T');
                }
                if (!str.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(str)) {
                    str += 'Z';
                }
                const d = new Date(str);
                if (isNaN(d.getTime())) return '';
                return d.toLocaleTimeString('ar-DZ', {
                    hour: '2-digit',
                    minute: '2-digit' });
            } catch(e) {
                return '';
            }
        }

        window.studentChatMessagesLimit = 20;
        window.studentChatHasMore = true;
        window.studentChatIsLoadingOlder = false;
        window.studentChatInitialScrollDone = false;

        function setupStudentChatScrollPagination() {
            const messagesArea = document.getElementById('studentChatMessagesArea');
            if (!messagesArea || messagesArea._paginationAttached) return;
            messagesArea._paginationAttached = true;
            
            let scrollDebounce = null;
            messagesArea.addEventListener('scroll', () => {
                if (scrollDebounce) clearTimeout(scrollDebounce);
                scrollDebounce = setTimeout(() => {
                    if (messagesArea.scrollTop <= 60 && window.studentChatHasMore && !window.studentChatIsLoadingOlder) {
                        loadStudentChatMessages(true);
                    }
                }, 100);
            }, { passive: true });
        }

        window.loadOlderStudentGroupMessages = function() {
            if (window.studentChatHasMore && !window.studentChatIsLoadingOlder) {
                loadStudentChatMessages(true);
            }
        };

        async function loadStudentChatMessages(isOlderLoad = false) {
            window.loadStudentChatMessages = loadStudentChatMessages;
            if (!activeStudentGroupId) return;
            const messagesArea = document.getElementById('studentChatMessagesArea');
            if (!messagesArea) return;

            if (isOlderLoad) {
                if (window.studentChatIsLoadingOlder || !window.studentChatHasMore) return;
                window.studentChatIsLoadingOlder = true;
            } else if (window.studentChatIsLoadingOlder) {
                return;
            }

            // تحديث وقت آخر قراءة للمجموعة
            const uId = userData ? (userData.id || userData.userId) : null;
            if (uId) {
                localStorage.setItem(`group_last_read_${uId}_${activeStudentGroupId}`, new Date().toISOString());
                setTimeout(updateGroupsUnreadBadge, 100);
            }

            const previousScrollHeight = messagesArea.scrollHeight;
            const previousScrollTop = messagesArea.scrollTop;

            try {
                const fetchLimit = isOlderLoad ? ((window.studentChatMessagesLimit || 20) + 20) : (window.studentChatMessagesLimit || 20);
                const response = await fetch(`/api/groups/${activeStudentGroupId}/messages?limit=${fetchLimit}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                const messages = await response.json();
                
                if (isOlderLoad) {
                    window.studentChatMessagesLimit = fetchLimit;
                }

                const token = localStorage.getItem('token');
                let currentUserId = null;
                if (token) {
                    try {
                        const decoded = JSON.parse(atob(token.split('.')[1]));
                        currentUserId = decoded.userId || decoded.id;
                    } catch(e) {}
                }

                if (!Array.isArray(messages) || messages.length === 0) {
                    window.studentChatHasMore = false;
                    messagesArea.innerHTML = `
                        <div style="text-align: center; margin: auto; padding: 35px 25px; background: white; border-radius: 16px; max-width: 380px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); border: 1px solid #e2e8f0;">
                            <div style="width: 60px; height: 60px; border-radius: 50%; background: #eff6ff; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; font-size: 1.6rem; color: var(--primary, #3b82f6);">
                                <i class="fas fa-comments"></i>
                            </div>
                            <h4 style="color: #0f172a; margin: 0 0 6px 0; font-weight: 800; font-size: 1.15rem;">لا توجد رسائل بعد</h4>
                            <p style="color: #64748b; font-size: 0.9rem; margin: 0; line-height: 1.5;">اكتب رسالتك الأولى وتفاعل مع أستاذك وزملائك في المجموعة!</p>
                        </div>
                    `;
                    return;
                }

                if (messages.length < (window.studentChatMessagesLimit || 20)) {
                    window.studentChatHasMore = false;
                }

                if (!isOlderLoad && window.studentChatInitialScrollDone && window.isAnyChatAudioPlaying && window.isAnyChatAudioPlaying()) {
                    return;
                }

                const isScrolledToBottom = messagesArea.scrollHeight - messagesArea.clientHeight <= messagesArea.scrollTop + 90;

                let topBannerHtml = '';
                if (!window.studentChatHasMore && messages.length >= 20) {
                    topBannerHtml = `
                        <div style="text-align: center; padding: 6px 14px; margin-bottom: 12px; background: #e2e8f0; border-radius: 20px; font-size: 0.75rem; color: #64748b; font-weight: 600; width: fit-content; margin-inline: auto;">
                            <i class="fas fa-flag-checkered"></i> بداية محادثة المجموعة
                        </div>
                    `;
                } else if (window.studentChatHasMore) {
                    topBannerHtml = `
                        <div id="studentChatLoadOlderBtnWrapper" style="text-align: center; margin-bottom: 12px;">
                            <button type="button" onclick="loadOlderStudentGroupMessages()" style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 20px; padding: 6px 16px; font-size: 0.78rem; font-weight: 700; color: #475569; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.2s;" onmouseenter="this.style.background='#f1f5f9'" onmouseleave="this.style.background='#ffffff'">
                                <i class="fas fa-arrow-up" style="color: var(--primary, #3b82f6);"></i> تحميل 20 رسالة أقدم
                            </button>
                        </div>
                    `;
                }

                const messagesHtml = messages.map(m => {
                    const isSelf = String(m.sender_id) === String(currentUserId) && m.sender_type === 'student';
                    
                    const bubbleBg = isSelf 
                        ? 'background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff;' 
                        : 'background: #ffffff; color: #0f172a; border: 1px solid #e2e8f0;';
                    
                    const borderRadius = isSelf 
                        ? 'border-radius: 14px 14px 2px 14px;' 
                        : 'border-radius: 14px 14px 14px 2px;';
                    
                    const senderLabel = isSelf 
                        ? 'أنت' 
                        : (m.sender_type === 'teacher' ? `${m.sender_name} (أستاذ)` : m.sender_name);

                    const senderRoleBadge = isSelf
                        ? `<span style="background: rgba(255,255,255,0.2); color: #ffffff; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; font-weight: 700;">أنت</span>`
                        : (m.sender_type === 'teacher' 
                            ? `<span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; font-weight: 700;"><i class="fas fa-chalkboard-teacher" style="font-size:0.6rem; margin-left:2px;"></i> أستاذ</span>`
                            : `<span style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; font-weight: 700;">طالب</span>`);

                    const timeStr = formatStudentChatTime(m.created_at);
                    
                    const profileClick = m.sender_type === 'teacher' 
                        ? `showTeacherProfile(${m.sender_id})` 
                        : `showStudentProfile(${m.sender_id})`;

                    const avatarSrc = m.sender_avatar ? escapeHtml(m.sender_avatar) : '';
                    const avatarContent = avatarSrc
                        ? `<img src="${avatarSrc}" alt="${escapeHtml(m.sender_name)}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" referrerpolicy="no-referrer" onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\\'fas ${m.sender_type === 'teacher' ? 'fa-chalkboard-teacher' : 'fa-user'}\\\' style=\\\'color:${m.sender_type === 'teacher' ? '#2563eb' : '#64748b'}; font-size:0.75rem;\\\'></i>';">`
                        : `<i class="fas ${m.sender_type === 'teacher' ? 'fa-chalkboard-teacher' : 'fa-user'}" style="color: ${m.sender_type === 'teacher' ? '#2563eb' : '#64748b'}; font-size: 0.75rem;"></i>`;

                    return `
                        <div style="display: flex; gap: 8px; width: 100%; justify-content: ${isSelf ? 'flex-start' : 'flex-end'}; flex-direction: ${isSelf ? 'row-reverse' : 'row'}; align-items: flex-end; margin-bottom: 8px; position: relative;">
                            <!-- Avatar -->
                            <div onclick="${profileClick}" title="عرض ملف ${escapeHtml(m.sender_name)}" style="cursor: pointer; flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; background: #f1f5f9; border: 1.5px solid ${isSelf ? '#93c5fd' : '#e2e8f0'}; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.06); transition: transform 0.15s ease; overflow: hidden;" onmouseenter="this.style.transform='scale(1.1)'" onmouseleave="this.style.transform='scale(1)'">
                                ${avatarContent}
                            </div>

                            <!-- Bubble Container -->
                            <div style="max-width: min(94%, 480px); display: flex; flex-direction: column; gap: 2px; position: relative;">
                                ${!isSelf ? `
                                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 5px; padding: 0 4px;">
                                    <span onclick="${profileClick}" title="عرض ملف ${escapeHtml(m.sender_name)}" style="font-size: 0.76rem; color: ${m.sender_type === 'teacher' ? '#1d4ed8' : '#334155'}; font-weight: 800; cursor: pointer; transition: opacity 0.2s;" onmouseenter="this.style.opacity='0.75'" onmouseleave="this.style.opacity='1'">${escapeHtml(senderLabel)}</span>
                                    ${senderRoleBadge}
                                </div>
                                ` : ''}
                                
                                ${m.reply_to_id ? `<div onclick="scrollToGroupMessage('${m.reply_to_id}')" style="background: rgba(0,0,0,0.05); border-right: 3px solid ${isSelf ? '#ffffff' : '#2563eb'}; padding: 4px 8px; margin-bottom: 6px; border-radius: 4px; font-size: 0.78rem; cursor: pointer;" title="انقر للانتقال للرسالة الأصلية">
                                    <strong style="display: block; color: ${isSelf ? '#fff' : '#1e293b'};">${escapeHtml(m.reply_to_sender || 'مستخدم')}</strong>
                                    <span style="color: ${isSelf ? 'rgba(255,255,255,0.8)' : '#64748b'};">${escapeHtml(m.reply_to_text || '')}</span>
                                </div>` : ''}
                                <div id="msgBubble_${m.id}"
                                     class="${(m.message_type === 'audio' || m.file_type === 'audio' || m.audio_url) ? 'has-audio-player' : ''}"
                                     ondblclick="showGroupMsgEmojiPicker(event, '${m.id}')"
                                     oncontextmenu="handleGroupMsgLongPress(event, '${m.id}', ${isSelf})"
                                     ontouchstart="startGroupMsgTouchTimer(event, '${m.id}', ${isSelf})"
                                     ontouchend="clearGroupMsgTouchTimer()"
                                     ontouchmove="clearGroupMsgTouchTimer()"
                                     title="انقر مرتين للتفاعل بالإيموجي ${isSelf ? '- انقر مطولاً للحذف' : ''}"
                                     style="${bubbleBg} ${borderRadius} padding: 8px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); position: relative; ${(m.message_type === 'audio' || m.file_type === 'audio' || m.audio_url) ? 'min-width: min(280px, 92vw);' : 'min-width: 100px;'} word-break: break-word; cursor: pointer; user-select: none;">
                                    
                                    ${(m.message_type === 'audio' || m.file_type === 'audio' || m.audio_url)
                                        ? (typeof window.renderVoiceMessageHtml === 'function'
                                            ? window.renderVoiceMessageHtml(m, isSelf, { canDelete: isSelf, deleteJs: `confirmDeleteGroupMessage(event, '${m.id}')` })
                                            : `<audio controls src="${m.audio_url || m.file_url}"></audio>`)
                                        : (m.file_url ? renderPdfAttachmentHtml(m.file_url, m.file_name, m.file_size, isSelf) : '')}
                                    ${m.message ? `<p style="margin: 0; font-size: 0.88rem; white-space: pre-wrap; line-height: 1.45; text-align: right; word-break: break-word;">${formatStudentMessageLinks(m.message, isSelf)}</p>` : ''}
                                    
                                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 4px;">
                                        <span style="font-size: 0.66rem; color: ${isSelf ? 'rgba(255,255,255,0.75)' : '#94a3b8'}; font-weight: 600; direction: ltr;">
                                            ${timeStr}
                                        </span>
                                        ${isSelf ? '<i class="fas fa-check" style="font-size: 0.6rem; color: rgba(255,255,255,0.85);"></i>' : ''}
                                         <button onclick="startGroupReplyToMessage('${m.id}', '${escapeHtml(m.sender_name)}', '${escapeHtml(m.message || "مرفق")}')" title="رد على الرسالة" style="background: transparent; border: none; padding: 0 4px; color: ${isSelf ? 'rgba(255,255,255,0.85)' : '#64748b'}; cursor: pointer; font-size: 0.72rem; opacity: 0.8; transition: opacity 0.2s;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.8'">
                                             <i class="fas fa-reply"></i> رد
                                         </button>
                                        ${isSelf ? `
                                        <button onclick="confirmDeleteGroupMessage(event, '${m.id}')" title="حذف رسالتك" style="background: transparent; border: none; padding: 0 2px; color: rgba(255,255,255,0.85); cursor: pointer; font-size: 0.72rem; opacity: 0.8; transition: opacity 0.2s;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.8'">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                        ` : ''}
                                    </div>

                                    ${renderMsgReactionsHtml(m.id, m.reactions)}
                                </div>

                                <!-- Floating Emoji Picker -->
                                <div id="emojiPicker_${m.id}" class="group-msg-emoji-picker" style="display: none; position: absolute; top: -42px; ${isSelf ? 'left: 0;' : 'right: 0;'} background: #ffffff; border: 1px solid #cbd5e1; border-radius: 30px; padding: 4px 10px; box-shadow: 0 8px 20px rgba(0,0,0,0.12); gap: 8px; z-index: 100; align-items: center; animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                                    ${['👍', '❤️', '😂', '😮', '😢', '👏', '🔥'].map(emoji => `
                                        <span onclick="sendGroupMsgReaction('${m.id}', '${emoji}')" style="font-size: 1.25rem; cursor: pointer; transition: transform 0.15s;" onmouseenter="this.style.transform='scale(1.3)'" onmouseleave="this.style.transform='scale(1)'">${emoji}</span>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                messagesArea.innerHTML = topBannerHtml + messagesHtml;

                if (isOlderLoad) {
                    const newScrollHeight = messagesArea.scrollHeight;
                    messagesArea.scrollTop = newScrollHeight - previousScrollHeight + previousScrollTop;
                } else if (!window.studentChatInitialScrollDone || isScrolledToBottom) {
                    messagesArea.scrollTop = messagesArea.scrollHeight;
                    window.studentChatInitialScrollDone = true;
                }
            } catch (e) {
                console.error('Error loading student chat messages:', e);
            } finally {
                if (isOlderLoad) {
                    setTimeout(() => {
                        window.studentChatIsLoadingOlder = false;
                    }, 300);
                }
            }
        }

        let msgTouchTimer = null;

        function startGroupMsgTouchTimer(event, msgId, canDelete) {
            clearGroupMsgTouchTimer();
            msgTouchTimer = setTimeout(() => {
                handleGroupMsgLongPress(event, msgId, canDelete);
            }, 550);
        }

        function clearGroupMsgTouchTimer() {
            if (msgTouchTimer) {
                clearTimeout(msgTouchTimer);
                msgTouchTimer = null;
            }
        }

        function handleGroupMsgLongPress(event, msgId, canDelete) {
            if (event) {
                if (event.preventDefault) event.preventDefault();
                if (event.stopPropagation) event.stopPropagation();
            }
            clearGroupMsgTouchTimer();
            showGroupMsgActionSheet(msgId, canDelete);
        }

        function showGroupMsgEmojiPicker(event, msgId) {
            if (event) {
                if (event.stopPropagation) event.stopPropagation();
            }
            document.querySelectorAll('.group-msg-emoji-picker').forEach(el => el.style.display = 'none');

            const picker = document.getElementById(`emojiPicker_${msgId}`);
            if (picker) {
                picker.style.display = 'flex';
                setTimeout(() => {
                    if (picker.style.display === 'flex') picker.style.display = 'none';
                }, 6000);
            }
        }

        function renderMsgReactionsHtml(msgId, reactions) {
            if (!reactions) return '';
            let parsed = reactions;
            if (typeof parsed === 'string') {
                try { parsed = JSON.parse(parsed); } catch(e) { parsed = {}; }
            }
            const counts = {};
            Object.values(parsed).forEach(emoji => {
                if (emoji) counts[emoji] = (counts[emoji] || 0) + 1;
            });
            const entries = Object.entries(counts);
            if (entries.length === 0) return '';

            const items = entries.map(([emoji, count]) => `
                <span onclick="event.stopPropagation(); sendGroupMsgReaction('${msgId}', '${emoji}')" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 2px 7px; font-size: 0.75rem; color: #334155; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); transition: transform 0.15s;" onmouseenter="this.style.transform='scale(1.1)'" onmouseleave="this.style.transform='scale(1)'">
                    ${emoji} <span style="font-size: 0.7rem; color: #2563eb; font-weight: 800;">${count}</span>
                </span>
            `).join('');

            return `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; direction: rtl;">${items}</div>`;
        }

        async function sendGroupMsgReaction(msgId, emoji) {
            const picker = document.getElementById(`emojiPicker_${msgId}`);
            if (picker) picker.style.display = 'none';

            const targetGroupId = (typeof activeStudentGroupId !== 'undefined' && activeStudentGroupId) ? activeStudentGroupId : ((typeof activeChatGroupId !== 'undefined' && activeChatGroupId) ? activeChatGroupId : null);
            if (!targetGroupId) return;

            try {
                const res = await fetchWithAuth(`/api/groups/${targetGroupId}/messages/${msgId}/react`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ emoji })
                });
                const data = await res.json();
                if (data.success) {
                    if (typeof loadStudentChatMessages === 'function') loadStudentChatMessages();
                    if (typeof loadChatMessages === 'function') loadChatMessages();
                }
            } catch (e) {
                console.error('Error reacting to message:', e);
            }
        }

        async function confirmDeleteGroupMessage(event, msgId) {
            if (event) event.stopPropagation();
            if (!confirm('هل أنت متأكد من رغبتك في حذف هذه الرسالة من المجموعة؟')) return;

            const targetGroupId = (typeof activeStudentGroupId !== 'undefined' && activeStudentGroupId) ? activeStudentGroupId : ((typeof activeChatGroupId !== 'undefined' && activeChatGroupId) ? activeChatGroupId : null);
            if (!targetGroupId) return;

            try {
                const res = await fetchWithAuth(`/api/groups/${targetGroupId}/messages/${msgId}`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                if (data.error && !data.error.includes('مسبقاً') && !data.error.includes('انتظار') && !data.error.includes('غير موجودة')) {
                    if (typeof showToast === 'function') showToast(data.error, 'error');
                } else {
                    if (typeof showToast === 'function') showToast('🗑️ تم حذف الرسالة بنجاح', 'success');
                    if (typeof loadStudentChatMessages === 'function') loadStudentChatMessages();
                    if (typeof loadChatMessages === 'function') loadChatMessages();
                }
            } catch (e) {
                console.warn('Delete group message error:', e);
            }
        }

        function showGroupMsgActionSheet(msgId, canDelete) {
            let backdrop = document.getElementById('groupMsgActionBackdrop');
            if (!backdrop) {
                backdrop = document.createElement('div');
                backdrop.id = 'groupMsgActionBackdrop';
                backdrop.style.cssText = 'position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); z-index: 10000; display: flex; align-items: flex-end; justify-content: center; opacity: 0; transition: opacity 0.2s ease; padding: 12px;';
                document.body.appendChild(backdrop);
            }

            backdrop.onclick = (e) => {
                if (e.target === backdrop) hideGroupMsgActionSheet();
            };

            backdrop.innerHTML = `
                <div style="background: white; width: 100%; max-width: 420px; border-radius: 20px; padding: 18px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); direction: rtl; text-align: right; transform: translateY(20px); transition: transform 0.2s ease;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">
                        <h4 style="margin: 0; color: #0f172a; font-size: 1rem; font-weight: 800;">خيارات الرسالة</h4>
                        <button onclick="hideGroupMsgActionSheet()" style="background: #f1f5f9; border: none; width: 28px; height: 28px; border-radius: 50%; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div style="display: flex; justify-content: space-around; background: #f8fafc; padding: 10px; border-radius: 14px; border: 1px solid #e2e8f0; margin-bottom: 14px;">
                        ${['👍', '❤️', '😂', '😮', ', ', '👏', '🔥'].map(emoji => `
                            <span onclick="sendGroupMsgReaction('${msgId}', '${emoji}'); hideGroupMsgActionSheet();" style="font-size: 1.5rem; cursor: pointer; transition: transform 0.15s;" onmouseenter="this.style.transform='scale(1.3)'" onmouseleave="this.style.transform='scale(1)'">${emoji}</span>
                        `).join('')}
                    </div>

                    ${canDelete ? `
                    <button onclick="confirmDeleteGroupMessage(null, '${msgId}'); hideGroupMsgActionSheet();" style="width: 100%; padding: 12px; border-radius: 12px; border: none; background: #fef2f2; color: #dc2626; font-weight: 800; font-size: 0.95rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; transition: background 0.2s;" onmouseenter="this.style.background='#fee2e2'" onmouseleave="this.style.background='#fef2f2'">
                        <i class="fas fa-trash-alt"></i> حذف الرسالة من المجموعة
                    </button>
                    ` : ''}

                    <button onclick="hideGroupMsgActionSheet()" style="width: 100%; padding: 11px; border-radius: 12px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 700; font-size: 0.9rem; cursor: pointer;">
                        إلغاء
                    </button>
                </div>
            `;

            backdrop.style.display = 'flex';
            requestAnimationFrame(() => {
                backdrop.style.opacity = '1';
                if (backdrop.firstElementChild) backdrop.firstElementChild.style.transform = 'translateY(0)';
            });
        }

        function hideGroupMsgActionSheet() {
            const backdrop = document.getElementById('groupMsgActionBackdrop');
            if (backdrop) {
                backdrop.style.opacity = '0';
                if (backdrop.firstElementChild) backdrop.firstElementChild.style.transform = 'translateY(20px)';
                setTimeout(() => {
                    backdrop.style.display = 'none';
                }, 200);
            }
        }

        function handleStudentGroupCameraSelect(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) { showToast('يرجى اختيار صورة صالحة', 'error'); e.target.value = ''; return; }
            if (file.size > 25 * 1024 * 1024) { showToast('حجم الصورة كبير جداً (الحد الأقصى 25 ميغابايت)', 'error'); e.target.value = ''; return; }
            selectedStudentGroupPdf = file;
            const previewBar = document.getElementById('studentChatPdfPreviewBar');
            const nameEl = document.getElementById('studentChatPdfName');
            const sizeEl = document.getElementById('studentChatPdfSize');
            if (nameEl) nameEl.textContent = file.name;
            if (sizeEl) sizeEl.textContent = formatFileSize(file.size) + ' • صورة جاهزة للإرسال';
            if (previewBar) previewBar.style.display = 'flex';
            // إرسال المرفق مباشرة بعد اختياره لتجنب إعادة تنقل Android WebView.
            void sendStudentGroupChatMessage();
        }

        async function sendStudentGroupChatMessage() {
            if (!activeStudentGroupId) return;
            const input = document.getElementById('studentChatInputMessage');
            const sendBtn = document.getElementById('sendStudentChatBtn');
            const message = (input.value || '').trim();
            const pdfToSend = selectedStudentGroupPdf;

            if (!message && !pdfToSend) return;
            
            input.value = '';
            input.style.height = 'auto';
            cancelStudentChatPdfAttachment();
            
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }

            try {
                let uploadedFileUrl = null;
                let uploadedFileName = null;
                let uploadedFileSize = null;

                if (pdfToSend) {
                    const formData = new FormData();
                    formData.append('file', pdfToSend);

                    const uploadRes = await fetch(`/api/groups/${activeStudentGroupId}/upload-file`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        },
                        body: formData
                    });

                    const uploadData = await uploadRes.json();
                    if (!uploadRes.ok || uploadData.error) {
                        throw new Error(uploadData.error || 'فشل رفع ملف الـ PDF');
                    }

                    uploadedFileUrl = uploadData.file_url;
                    uploadedFileName = uploadData.file_name || pdfToSend.name;
                    uploadedFileSize = uploadData.file_size || pdfToSend.size;
                }

                const payload = {
                    message: message,
                    file_url: uploadedFileUrl,
                    file_name: uploadedFileName,
                    file_size: uploadedFileSize,
                    file_type: uploadedFileUrl ? (pdfToSend.type || (pdfToSend.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image')) : null,
                    reply_to_id: currentGroupReplyTo ? currentGroupReplyTo.id : null,
                    reply_to_sender: currentGroupReplyTo ? currentGroupReplyTo.sender : null,
                    reply_to_text: currentGroupReplyTo ? currentGroupReplyTo.text : null
                };

                const response = await fetch(`/api/groups/${activeStudentGroupId}/messages`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.error) {
                    showToast(data.error, 'error');
                } else {
                    cancelGroupChatReply();
                    await loadStudentChatMessages();
                    const messagesArea = document.getElementById('studentChatMessagesArea');
                    if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
                }
            } catch (err) {
                showToast(err.message || ' فشل إرسال الرسالة', 'error');
            } finally {
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
                }
                input.focus();
            }
        }

        function handleStudentChatInputKey(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendStudentGroupChatMessage();
            }
        }


        // ==========================================
        // STUDENT GROUP MEMBERS MODAL & LOGIC
        // ==========================================
        let currentStudentViewingGroupId = null;
        let currentStudentViewingGroupName = '';
        let cachedStudentGroupMembers = [];
        let currentStudentMemberFilter = 'all';

        async function openStudentGroupMembersModal(groupId, groupName, groupImageUrl) {
            const targetGroupId = groupId || activeStudentGroupId;
            const targetGroupName = groupName || document.getElementById('studentChatGroupName')?.textContent || 'المجموعة';
            if (!targetGroupId) return;

            currentStudentViewingGroupId = targetGroupId;
            currentStudentViewingGroupName = targetGroupName;
            
            const titleEl = document.getElementById('studentGroupMembersModalTitle');
            if (titleEl) titleEl.textContent = `أعضاء: ${targetGroupName}`;
            
            const searchInput = document.getElementById('studentMemberSearchInput');
            if (searchInput) searchInput.value = '';
            
            currentStudentMemberFilter = 'all';
            updateStudentMemberTabStyles();
            
            const modal = document.getElementById('studentGroupMembersModal');
            if (modal) modal.style.display = 'flex';
            
            await loadStudentGroupMembers();
        }

        function closeStudentGroupMembersModal() {
            const modal = document.getElementById('studentGroupMembersModal');
            if (modal) modal.style.display = 'none';
        }

        function setStudentMemberFilter(filter) {
            currentStudentMemberFilter = filter;
            updateStudentMemberTabStyles();
            filterStudentGroupMembersList();
        }

        function updateStudentMemberTabStyles() {
            const tabAll = document.getElementById('studentMemberTabAll');
            const tabTeachers = document.getElementById('studentMemberTabTeachers');
            const tabStudents = document.getElementById('studentMemberTabStudents');
            
            if (tabAll) {
                tabAll.style.background = currentStudentMemberFilter === 'all' ? '#eff6ff' : 'transparent';
                tabAll.style.color = currentStudentMemberFilter === 'all' ? '#1d4ed8' : '#64748b';
            }
            if (tabTeachers) {
                tabTeachers.style.background = currentStudentMemberFilter === 'teachers' ? '#eff6ff' : 'transparent';
                tabTeachers.style.color = currentStudentMemberFilter === 'teachers' ? '#1d4ed8' : '#64748b';
            }
            if (tabStudents) {
                tabStudents.style.background = currentStudentMemberFilter === 'students' ? '#eff6ff' : 'transparent';
                tabStudents.style.color = currentStudentMemberFilter === 'students' ? '#1d4ed8' : '#64748b';
            }
        }

        async function loadStudentGroupMembers() {
            const targetGroupId = currentStudentViewingGroupId || activeStudentGroupId;
            if (!targetGroupId) return;
            
            const container = document.getElementById('studentMembersListContainer');
            if (container) {
                container.innerHTML = '<div style="text-align: center; padding: 35px 20px; color: #64748b;"><i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary, #3b82f6); margin-bottom: 10px;"></i><p style="margin: 0; font-weight: 700; font-size: 0.95rem;">جاري جلب قائمة أعضاء المجموعة...</p></div>';
            }
            
            try {
                const token = localStorage.getItem('token');
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                const response = await fetch(`/api/groups/${targetGroupId}/members`, { headers });
                const members = await response.json();
                
                if (response.ok && Array.isArray(members)) {
                    cachedStudentGroupMembers = members;
                    
                    const totalCount = members.length;
                    const teachersCount = members.filter(m => m.is_teacher || m.is_owner).length;
                    const studentsCount = totalCount - teachersCount;
                    
                    const countEl = document.getElementById('studentGroupMembersModalCount');
                    if (countEl) countEl.textContent = `${totalCount} عضو منضم`;
                    
                    const chatHeaderCount = document.getElementById('studentChatHeaderMembersCount');
                    if (chatHeaderCount && activeStudentGroupId === targetGroupId) {
                        chatHeaderCount.textContent = totalCount;
                        chatHeaderCount.style.display = 'inline-block';
                    }
                    
                    const cAll = document.getElementById('countTabAll');
                    const cTeach = document.getElementById('countTabTeachers');
                    const cStud = document.getElementById('countTabStudents');
                    if (cAll) cAll.textContent = totalCount;
                    if (cTeach) cTeach.textContent = teachersCount;
                    if (cStud) cStud.textContent = studentsCount;
                    
                    filterStudentGroupMembersList();
                } else {
                    throw new Error(members.error || 'فشل جلب الأعضاء');
                }
            } catch(e) {
                console.error('Error fetching student group members:', e);
                if (container) {
                    container.innerHTML = '<div style="text-align: center; padding: 30px 20px; color: #ef4444; font-weight: 700;"><i class="fas fa-exclamation-circle fa-2x" style="margin-bottom: 8px; display: block;"></i>حدث خطأ أثناء تحميل بيانات الأعضاء.<br><button onclick="loadStudentGroupMembers()" class="btn" style="margin-top: 12px; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 6px 14px; border-radius: 8px; font-weight: 700; cursor: pointer;"><i class="fas fa-rotate"></i> إعادة المحاولة</button></div>';
                }
            }
        }

        function filterStudentGroupMembersList() {
            const term = (document.getElementById('studentMemberSearchInput')?.value || '').trim().toLowerCase();
            let filtered = cachedStudentGroupMembers;
            
            if (currentStudentMemberFilter === 'teachers') {
                filtered = filtered.filter(m => m.is_teacher || m.is_owner);
            } else if (currentStudentMemberFilter === 'students') {
                filtered = filtered.filter(m => !m.is_teacher && !m.is_owner);
            }
            
            if (term) {
                filtered = filtered.filter(m => (m.full_name || '').toLowerCase().includes(term));
            }
            
            renderStudentGroupMembers(filtered);
        }

        function renderStudentGroupMembers(members) {
            const container = document.getElementById('studentMembersListContainer');
            if (!container) return;
            
            if (members.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px; color: #64748b;">
                        <i class="fas fa-users-slash fa-3x" style="color: #cbd5e1; margin-bottom: 12px;"></i>
                        <h4 style="margin: 0 0 6px 0; color: #1e293b; font-weight: 700;">لا يوجد أعضاء مطابقين للبحث</h4>
                        <p style="margin: 0; font-size: 0.85rem; color: #94a3b8;">تأكد من كتابة الاسم بالشكل الصحيح أو تغيير تصنيف الفلترة.</p>
                    </div>
                `;
                return;
            }
            
            const currentUserId = (userData && userData.id) || null;
            
            container.innerHTML = members.map(m => {
                const isMemberOwner = !!m.is_owner;
                const isMemberTeacher = !!m.is_teacher;
                const isSelf = currentUserId && (String(currentUserId) === String(m.student_id));
                
                let roleBadge = '';
                if (isMemberOwner) {
                    roleBadge = '<span style="display: inline-flex; align-items: center; gap: 4px; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800;"><i class="fas fa-crown" style="color: #d97706;"></i> مالك المجموعة</span>';
                } else if (isMemberTeacher) {
                    roleBadge = '<span style="display: inline-flex; align-items: center; gap: 4px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800;"><i class="fas fa-chalkboard-teacher"></i> أستاذ</span>';
                } else {
                    roleBadge = '<span style="display: inline-flex; align-items: center; gap: 4px; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;"><i class="fas fa-user-graduate"></i> طالب</span>';
                }
                
                const avatarHtml = m.profile_image
                    ? `<img src="${m.profile_image}" style="width: 44px; height: 44px; border-radius: 12px; object-fit: cover; border: 1.5px solid #e2e8f0;">`
                    : `<div style="width: 44px; height: 44px; border-radius: 12px; background: ${isMemberTeacher ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'linear-gradient(135deg, #0ea5e9, #0284c7)'}; color: white; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; font-weight: 700;"><i class="fas ${isMemberTeacher ? 'fa-chalkboard-teacher' : 'fa-user-graduate'}"></i></div>`;
                    
                let actionBtn = '';
                if (isMemberTeacher) {
                    actionBtn = `<button onclick="showTeacherProfile(${m.student_id})" class="btn" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 6px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px; transition: all 0.2s;"><i class="fas fa-user"></i> الملف</button>`;
                } else if (!isSelf) {
                    actionBtn = `<button onclick="showStudentProfile(${m.student_id})" class="btn" style="background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px; transition: all 0.2s;"><i class="fas fa-user"></i> الملف</button>`;
                }
                
                return `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #ffffff; padding: 10px 14px; border-radius: 14px; border: 1px solid #e2e8f0; transition: all 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.02);" onmouseenter="this.style.borderColor='#cbd5e1'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)'" onmouseleave="this.style.borderColor='#e2e8f0'; this.style.boxShadow='0 2px 5px rgba(0,0,0,0.02)'">
                        <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                            <div style="position: relative; flex-shrink: 0;">
                                ${avatarHtml}
                            </div>
                            <div style="min-width: 0; flex: 1;">
                                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                    <span style="font-weight: 800; color: #0f172a; font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(m.full_name || 'عضو في المجموعة')}</span>
                                    ${isSelf ? '<span style="background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 1px 6px; border-radius: 8px; font-size: 0.7rem; font-weight: 800;">أنت</span>' : ''}
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                                    ${roleBadge}
                                </div>
                            </div>
                        </div>
                        <div>
                            ${actionBtn}
                        </div>
                    </div>
                `;
            }).join('');
        }

    // ---------- ما يستدعيه الواجهة دخال الإنجمال ----------
    window.sendStudentGroupChatMessage = function () {
        window.invalidateStudentGroupsCache();
        if (typeof updateGroupsUnreadBadge === 'function') {
            setTimeout(function () { updateGroupsUnreadBadge(); }, 400);
        }
        return originalSend.apply(this, arguments);
    };

    [
        'loadGroups', 'switchStudentGroupTab', 'handleStudentGroupSearch', 'joinStudentToGroup',
        'enterStudentGroupChat', 'exitStudentGroupChat', 'checkStudentMembershipAndStatus',
        'setupStudentChatScrollPagination', 'loadStudentChatMessages', 'loadStudentGroupMembers',
        'handleStudentChatInputKey', 'handleStudentGroupPdfSelect', 'handleStudentGroupCameraSelect',
        'cancelStudentChatPdfAttachment', 'openStudentGroupMembersModal', 'closeStudentGroupMembersModal',
        'setStudentMemberFilter', 'filterStudentGroupMembersList', 'formatStudentMessageLinks',
        'formatStudentChatTime', 'showGroupMsgActionSheet', 'hideGroupMsgActionSheet',
        'handleGroupMsgLongPress', 'showGroupMsgEmojiPicker', 'renderMsgReactionsHtml',
        'sendGroupMsgReaction', 'confirmDeleteGroupMessage'
    ].forEach(function (name) {
        if (typeof window[name] === 'function') return;
        try { window[name] = eval(name); } catch (e) { /* hoisted below */ }
    });
})();
