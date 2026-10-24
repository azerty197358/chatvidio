
        // ==========================================
        // TEACHER GROUPS & LIVE CHAT ENGINE
        // ==========================================
        let allTeacherGroups = [];
        let currentManagingGroupId = null;
        let activeChatGroupId = null;
        Object.defineProperty(window, 'activeChatGroupId', {
            get() { return activeChatGroupId; },
            set(val) {
                activeChatGroupId = val;
                if (typeof groupChatTypingWatch === 'function') groupChatTypingWatch(val || null);
            },
            configurable: true
        });
        let activeChatGroupName = '';
        let activeChatGroupImageUrl = '';
        let chatInterval = null;
        let cachedGroupMembers = [];

        function autoResizeChatInput(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 110) + 'px';
        }

        function previewGroupImage(e) {
            const file = e.target.files[0];
            const emptyState = document.getElementById('groupImageEmptyState');
            const container = document.getElementById('groupImagePreviewContainer');
            const preview = document.getElementById('groupImagePreview');
            const fileNameSpan = document.getElementById('groupImageFileName');
            
            if (file) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    preview.src = evt.target.result;
                    if (fileNameSpan) fileNameSpan.textContent = file.name;
                    if (emptyState) emptyState.style.display = 'none';
                    if (container) container.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            } else {
                clearGroupImagePreview();
            }
        }

        function clearGroupImagePreview() {
            const fileInput = document.getElementById('groupImageFile');
            if (fileInput) fileInput.value = '';
            const emptyState = document.getElementById('groupImageEmptyState');
            const container = document.getElementById('groupImagePreviewContainer');
            if (emptyState) emptyState.style.display = 'flex';
            if (container) container.style.display = 'none';
        }

        function previewEditGroupImage(e) {
            const file = e.target.files[0];
            const emptyState = document.getElementById('editGroupImageEmptyState');
            const container = document.getElementById('editGroupImagePreviewContainer');
            const preview = document.getElementById('editGroupImagePreview');
            const fileNameSpan = document.getElementById('editGroupImageFileName');
            
            if (file) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    preview.src = evt.target.result;
                    if (fileNameSpan) fileNameSpan.textContent = file.name;
                    if (emptyState) emptyState.style.display = 'none';
                    if (container) container.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            } else {
                clearEditGroupImagePreview();
            }
        }

        function clearEditGroupImagePreview() {
            const fileInput = document.getElementById('editGroupImageFile');
            if (fileInput) fileInput.value = '';
            const emptyState = document.getElementById('editGroupImageEmptyState');
            const container = document.getElementById('editGroupImagePreviewContainer');
            if (emptyState) emptyState.style.display = 'flex';
            if (container) container.style.display = 'none';
        }

        function openEditGroupModal(groupId, currentName, currentImageUrl) {
            const modal = document.getElementById('editGroupModal');
            if (!modal) return;
            
            document.getElementById('editGroupId').value = groupId || '';
            document.getElementById('editGroupName').value = currentName || '';
            
            const currentImgWrapper = document.getElementById('editGroupCurrentImageWrapper');
            const currentImg = document.getElementById('editGroupCurrentImage');
            if (currentImageUrl) {
                if (currentImg) currentImg.src = currentImageUrl;
                if (currentImgWrapper) currentImgWrapper.style.display = 'flex';
            } else {
                if (currentImgWrapper) currentImgWrapper.style.display = 'none';
            }

            clearEditGroupImagePreview();
            modal.style.display = 'flex';
            setTimeout(() => {
                const input = document.getElementById('editGroupName');
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 100);
        }

        function openEditGroupModalFromChat() {
            if (!activeChatGroupId) return;
            openEditGroupModal(activeChatGroupId, activeChatGroupName, activeChatGroupImageUrl);
        }

        function closeEditGroupModal() {
            const modal = document.getElementById('editGroupModal');
            if (modal) modal.style.display = 'none';
            const form = document.getElementById('editGroupForm');
            if (form) form.reset();
            clearEditGroupImagePreview();
        }

        async function handleEditGroup(e) {
            e.preventDefault();
            const groupId = document.getElementById('editGroupId').value;
            const name = document.getElementById('editGroupName').value.trim();
            const imageFile = document.getElementById('editGroupImageFile').files[0];
            const btn = document.getElementById('submitEditGroupBtn');

            if (!groupId) {
                showToast('معرف المجموعة غير محدد', 'error');
                return;
            }
            if (!name) {
                showToast('يرجى كتابة اسم المجموعة', 'error');
                return;
            }

            const formData = new FormData();
            formData.append('name', name);
            if (imageFile) {
                formData.append('image_file', imageFile);
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري حفظ التعديل...';

            try {
                const response = await fetchWithAuth(`/api/groups/${groupId}`, {
                    method: 'PUT',
                    body: formData
                });
                const data = await response.json();
                if (!response.ok || data.error) {
                    showToast(data.error || 'حدث خطأ أثناء تعديل اسم المجموعة', 'error');
                    return;
                }

                showToast('🎉 تم تعديل اسم المجموعة بنجاح!', 'success');
                closeEditGroupModal();

                const updatedGroup = data.group;
                const newName = (updatedGroup && updatedGroup.name) ? updatedGroup.name : name;
                const newImg = (updatedGroup && updatedGroup.image_url) ? updatedGroup.image_url : null;

                // تحديث الذاكرة والواجهة إذا كانت المجموعة مفتوحة حالياً
                if (activeChatGroupId && String(activeChatGroupId) === String(groupId)) {
                    activeChatGroupName = newName;
                    const nameEl = document.getElementById('chatGroupName');
                    if (nameEl) nameEl.textContent = newName;
                    if (newImg) {
                        activeChatGroupImageUrl = newImg;
                        const imgEl = document.getElementById('chatGroupImage');
                        const placeholder = document.getElementById('chatGroupImagePlaceholder');
                        if (imgEl) {
                            imgEl.src = newImg;
                            imgEl.style.display = 'block';
                        }
                        if (placeholder) placeholder.style.display = 'none';
                    }
                }

                // تحديث قائمة المجموعات
                loadTeacherGroups();
            } catch (err) {
                console.error('Error updating group:', err);
                showToast('❌ حدث خطأ أثناء تعديل المجموعة', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> حفظ التعديلات';
            }
        }

        let teacherCurrentGroupTab = 'explore';

        function switchTeacherGroupTab(tab) {
            teacherCurrentGroupTab = tab;
            const btnMy = document.getElementById('teacherGroupTabMy');
            const btnExplore = document.getElementById('teacherGroupTabExplore');

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
            loadTeacherGroups();
        }

        function handleTeacherGroupSearch() {
            loadTeacherGroups();
        }

        async function joinTeacherToGroup(groupId, groupName) {
            try {
                const response = await fetchWithAuth(`/api/groups/${groupId}/join`, {
                    method: 'POST'
                });
                const data = await response.json();
                if (response.ok) {
                    showToast('🎉 تم الانضمام للمجموعة بنجاح!', 'success');
                } else if (data.error) {
                    showToast(data.error, 'error');
                    return;
                }
            } catch (e) {
                console.error(e);
                showToast('حدث خطأ أثناء الانضمام للمجموعة', 'error');
                return;
            }
            enterGroupChat(groupId, groupName, '', false);
        }

        async function updateGroupsUnreadBadge() {
            const token = localStorage.getItem('token');
            if (!token) return;
            
            let uId = null;
            try {
                const decoded = JSON.parse(atob(token.split('.')[1]));
                uId = decoded.userId || decoded.id;
            } catch(e) {}
            if (!uId) return;

            try {
                const response = await fetchWithAuth('/api/groups/teacher');
                if (!response.ok) return;
                const groups = await response.json();
                if (!Array.isArray(groups)) return;

                let unreadCount = 0;
                groups.forEach(g => {
                    if (!g.latest_message_time) return;

                    if (activeChatGroupId && String(activeChatGroupId) === String(g.id)) {
                        return;
                    }

                    const lastReadStr = localStorage.getItem(`group_last_read_${uId}_${g.id}`);
                    if (lastReadStr) {
                        if (new Date(g.latest_message_time) > new Date(lastReadStr)) {
                            unreadCount++;
                        }
                    } else {
                        unreadCount++;
                    }
                });

                const badge = document.getElementById('groupsBadge');
                const sBadge = document.getElementById('groupsBadgeSidebar');
                if (badge) {
                    if (unreadCount > 0) {
                        badge.textContent = unreadCount;
                        badge.style.display = 'inline-flex';
                    } else {
                        badge.style.display = 'none';
                    }
                }
                if (sBadge) {
                    if (unreadCount > 0) {
                        sBadge.textContent = unreadCount;
                        sBadge.style.display = 'inline-flex';
                    } else {
                        sBadge.style.display = 'none';
                    }
                }

                const mBadge = document.getElementById('mobileGroupsBadge');
                if (mBadge) {
                    if (unreadCount > 0) {
                        mBadge.textContent = unreadCount;
                        mBadge.style.display = 'inline-flex';
                    } else {
                        mBadge.style.display = 'none';
                    }
                }
            } catch(err) {
                if (err && err.message && (err.message.includes('Failed to fetch') || err.message.includes('انتهت صلاحية الجلسة'))) {
                    console.warn("⚠️ تعذر التحديث المباشر للمجموعات بسبب انقطاع الشبكة.");
                } else {
                    console.error("Error updating teacher groups unread badge:", err);
                }
            }
        }

        async function loadTeacherGroups() {
            const list = document.getElementById('teacherGroupsList');
            const countBadge = document.getElementById('teacherGroupsCountBadge');
            const query = (document.getElementById('teacherGroupsSearchInput')?.value || '').trim();
            if (!list) return;

            if (teacherCurrentGroupTab === 'my') {
                list.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 50px 20px;">
                        <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary, #3b82f6); margin-bottom: 12px;"></i>
                        <p style="margin: 0; font-weight: 600;">جاري تحميل مجموعاتك التعليمية...</p>
                    </div>
                `;
                
                try {
                    const response = await fetchWithAuth('/api/groups/teacher');
                    const groups = await response.json();
                    allTeacherGroups = Array.isArray(groups) ? groups : [];

                    let filtered = allTeacherGroups;
                    if (query) {
                        const term = query.toLowerCase();
                        filtered = allTeacherGroups.filter(g => (g.name || '').toLowerCase().includes(term));
                    }
                    
                    if (countBadge) {
                        countBadge.textContent = `${filtered.length} مجموعات`;
                    }

                    renderTeacherGroups(filtered);
                } catch (e) {
                    console.error('Error loading teacher groups:', e);
                    list.innerHTML = `
                        <div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 40px 20px; background: #fef2f2; border-radius: 12px; border: 1px solid #fecaca;">
                            <i class="fas fa-circle-exclamation fa-2x" style="margin-bottom: 10px;"></i>
                            <p style="margin: 0; font-weight: 700;">حدث خطأ أثناء تحميل المجموعات.</p>
                            <button onclick="loadTeacherGroups()" class="btn" style="margin-top: 12px; background: #ef4444; color: white; border: none; border-radius: 8px; padding: 6px 14px; font-size: 0.85rem; font-weight: 600; cursor: pointer;">إعادة المحاولة</button>
                        </div>
                    `;
                }
            } else {
                // EXPLORE ALL PUBLIC GROUPS
                list.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 50px 20px;">
                        <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary, #3b82f6); margin-bottom: 12px;"></i>
                        <p style="margin: 0; font-weight: 600;">جاري استكشاف المجموعات العامة...</p>
                    </div>
                `;

                try {
                    const response = await fetchWithAuth(`/api/groups/search?q=${encodeURIComponent(query)}`);
                    const groups = await response.json();

                    if (!Array.isArray(groups) || groups.length === 0) {
                        if (countBadge) countBadge.textContent = '0 مجموعات';
                        list.innerHTML = `
                            <div style="grid-column: 1/-1; text-align: center; padding: 50px 25px; background: white; border-radius: 16px; border: 2px dashed #cbd5e1;">
                                <div style="width: 70px; height: 70px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 2rem; color: #94a3b8;">
                                    <i class="fas fa-search"></i>
                                </div>
                                <h3 style="color: #1e293b; margin-bottom: 8px; font-size: 1.25rem; font-weight: 800;">لم يتم العثور على أي مجموعات</h3>
                                <p style="color: #64748b; margin-bottom: 22px; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.6; font-size: 0.95rem;">جرّب البحث بكلمات مختلفة أو إنشاء مجموعة تعليمية جديدة لطلابك.</p>
                            </div>
                        `;
                        return;
                    }

                    if (countBadge) {
                        countBadge.textContent = `${groups.length} مجموعات متاحة`;
                    }

                    list.innerHTML = groups.map(g => {
                        const escapedName = (g.name || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
                        const isJoined = g.is_member || g.is_owner;
                        const teacherTitle = g.teacher_name ? `الأستاذ: ${g.teacher_name}` : 'أستاذ المادة';

                        return `
                            <div class="group-card" style="border: 1px solid #e2e8f0; border-radius: 16px; background: white; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04); display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; padding: 22px; gap: 16px;">
                                <div>
                                    <div style="display: flex; align-items: flex-start; gap: 14px; margin-bottom: 12px;">
                                        ${g.image_url 
                                            ? `<img src="${g.image_url}" style="width: 58px; height: 58px; border-radius: 14px; object-fit: cover; border: 2px solid #e2e8f0;">` 
                                            : `<div style="width: 58px; height: 58px; border-radius: 14px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: white;"><i class="fas fa-users"></i></div>`
                                        }
                                        <div style="flex: 1;">
                                            <h3 style="margin: 0 0 5px 0; font-size: 1.15rem; color: #0f172a; font-weight: 800; line-height: 1.35;">${g.name}</h3>
                                            <div style="font-size: 0.85rem; color: #64748b; font-weight: 600; margin-bottom: 6px;">
                                                <i class="fas fa-chalkboard-teacher" style="color: #3b82f6;"></i> ${teacherTitle}
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                                <span style="display: inline-flex; align-items: center; gap: 6px; background: #eff6ff; color: #2563eb; padding: 3px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;">
                                                    <i class="fas fa-user-graduate"></i> ${g.members_count} عضو
                                                </span>
                                                ${g.is_owner ? `
                                                    <span style="background: #fef3c7; color: #b45309; padding: 3px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;">
                                                        <i class="fas fa-crown"></i> مالك المجموعة
                                                    </span>
                                                ` : isJoined ? `
                                                    <span style="background: #ecfdf5; color: #059669; padding: 3px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;">
                                                        <i class="fas fa-check"></i> منضم بالفعل
                                                    </span>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                ${isJoined ? `
                                    <button onclick="enterGroupChat(${g.id}, '${escapedName}', '${g.image_url || ''}')" class="btn" style="width: 100%; background: #059669; color: white; border-radius: 10px; padding: 11px; font-weight: 700; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.92rem;">
                                        <i class="fas fa-comments"></i> دخول المحادثة
                                    </button>
                                ` : `
                                    <button onclick="joinTeacherToGroup(${g.id}, '${escapedName}')" class="btn" style="width: 100%; background: var(--primary, #3b82f6); color: white; border-radius: 10px; padding: 11px; font-weight: 700; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.92rem; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
                                        <i class="fas fa-user-plus"></i> الانضمام للمجموعة
                                    </button>
                                `}
                            </div>
                        `;
                    }).join('');
                } catch (e) {
                    list.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 20px;">حدث خطأ أثناء استكشاف المجموعات.</p>';
                }
            }
        }

        function filterTeacherGroups() {
            handleTeacherGroupSearch();
        }

        function renderTeacherGroups(groups) {
            const list = document.getElementById('teacherGroupsList');
            if (!list) return;

            if (groups.length === 0) {
                list.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 50px 25px; background: white; border-radius: 16px; border: 2px dashed #cbd5e1;">
                        <div style="width: 70px; height: 70px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 2rem; color: #94a3b8;">
                            <i class="fas fa-users-rectangle"></i>
                        </div>
                        <h3 style="color: #1e293b; margin-bottom: 8px; font-size: 1.25rem; font-weight: 800;">لا توجد لديك مجموعات حتى الآن</h3>
                        <p style="color: #64748b; margin-bottom: 22px; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.6; font-size: 0.95rem;">قم بإنشاء مجموعة لمشاركة الإعلانات والدروس والتمارين مع طلابك والتواصل معهم في محادثة مباشرة تفاعلية.</p>
                        <button onclick="openCreateGroupModal()" class="btn" style="background: var(--primary, #3b82f6); color: white; border-radius: 10px; padding: 12px 24px; font-weight: 700; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
                            <i class="fas fa-plus"></i> إنشاء مجموعتك الأولى
                        </button>
                    </div>
                `;
                return;
            }

            list.innerHTML = groups.map(g => {
                const studentUrl = window.location.origin + '/student-dashboard.html?join_group=' + g.id;
                const escapedName = (g.name || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
                const escapedImageUrl = g.image_url ? g.image_url.replace(/'/g, "\\'").replace(/"/g, '\\"') : '';
                const memberCount = g.members_count || 0;
                const isOwner = !!g.is_owner;

                return `
                    <div class="group-card" style="border: 1px solid #e2e8f0; border-radius: 16px; background: white; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04); display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; transition: transform 0.2s, box-shadow 0.2s;">
                        <div style="padding: 22px;">
                            <!-- Header / Avatar -->
                            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px;">
                                <div style="display: flex; align-items: center; gap: 14px;">
                                    ${g.image_url 
                                        ? `<img src="${g.image_url}" style="width: 58px; height: 58px; border-radius: 14px; object-fit: cover; border: 2px solid #e2e8f0;">` 
                                        : `<div style="width: 58px; height: 58px; border-radius: 14px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: white;"><i class="fas fa-users"></i></div>`
                                    }
                                    <div>
                                        <h3 style="margin: 0 0 5px 0; font-size: 1.15rem; color: #0f172a; font-weight: 800; line-height: 1.35;">${g.name}</h3>
                                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                            <span style="display: inline-flex; align-items: center; gap: 6px; background: #eff6ff; color: #2563eb; padding: 3px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;">
                                                <i class="fas fa-users"></i> ${memberCount} ${memberCount === 1 ? 'عضو' : 'أعضاء'}
                                            </span>
                                            ${isOwner ? `
                                                <span style="background: #fef3c7; color: #b45309; padding: 3px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;">
                                                    <i class="fas fa-crown"></i> مالك المجموعة
                                                </span>
                                            ` : `
                                                <span style="background: #f1f5f9; color: #475569; padding: 3px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;">
                                                    <i class="fas fa-chalkboard-teacher"></i> أستاذ منضم
                                                </span>
                                            `}
                                        </div>
                                    </div>
                                </div>
                                ${isOwner ? `
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <button onclick="openEditGroupModal(${g.id}, '${escapedName}', '${escapedImageUrl}')" title="تعديل اسم وصورة المجموعة" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; transition: all 0.2s;" onmouseenter="this.style.background='#dbeafe'" onmouseleave="this.style.background='#eff6ff'">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button onclick="deleteTeacherGroup(${g.id}, '${escapedName}')" title="حذف المجموعة" style="background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; transition: all 0.2s;" onmouseenter="this.style.background='#fecaca'" onmouseleave="this.style.background='#fee2e2'">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                ` : ''}
                            </div>

                            <!-- Share Invitation Link -->
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 12px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span style="font-size: 0.8rem; color: #64748b; font-weight: 700;"><i class="fas fa-link" style="color: var(--primary, #3b82f6);"></i> رابط دعوة الطلاب:</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <input type="text" readonly value="${studentUrl}" id="share-link-${g.id}" style="flex-grow: 1; padding: 7px 10px; font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 6px; background: white; direction: ltr; font-family: monospace; color: #334155;">
                                    <button onclick="copyGroupShareLink(${g.id})" class="btn" style="padding: 7px 14px; font-size: 0.82rem; background: var(--primary, #3b82f6); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; white-space: nowrap; display: flex; align-items: center; gap: 5px;">
                                        <i class="fas fa-copy"></i> نسخ
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Card Action Footer -->
                        <div style="padding: 14px 22px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; gap: 10px;">
                            <button onclick="enterGroupChat(${g.id}, '${escapedName}', '${escapedImageUrl}', ${isOwner})" class="btn" style="flex: 2; background: var(--primary, #3b82f6); color: white; border-radius: 10px; padding: 11px; font-weight: 700; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.92rem; box-shadow: 0 3px 8px rgba(59, 130, 246, 0.25); transition: all 0.2s;">
                                <i class="fas fa-comments"></i> فتح المحادثة
                            </button>
                            <button onclick="openManageMembersModalDirect(${g.id}, '${escapedName}', ${isOwner})" class="btn" style="flex: 1.2; background: white; color: #334155; border: 1px solid #cbd5e1; border-radius: 10px; padding: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.88rem; transition: all 0.2s;">
                                <i class="fas ${isOwner ? 'fa-users-gear' : 'fa-users'}" style="color: #64748b;"></i> ${isOwner ? 'إدارة الطلاب' : 'الأعضاء'}
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function openCreateGroupModal() {
            if (!checkTeacherProfileComplete()) return;
            document.getElementById('createGroupModal').style.display = 'flex';
            document.getElementById('groupName').focus();
        }

        function closeCreateGroupModal() {
            document.getElementById('createGroupModal').style.display = 'none';
            document.getElementById('createGroupForm').reset();
            clearGroupImagePreview();
        }

        async function handleCreateGroup(e) {
            e.preventDefault();
            if (!checkTeacherProfileComplete()) return;
            const name = document.getElementById('groupName').value.trim();
            const imageFile = document.getElementById('groupImageFile').files[0];
            const btn = document.getElementById('submitCreateGroupBtn');

            if (!name) {
                showToast('يرجى إدخال اسم المجموعة', 'error');
                return;
            }

            const formData = new FormData();
            formData.append('name', name);
            if (imageFile) {
                formData.append('image_file', imageFile);
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإنشاء...';

            try {
                const response = await fetchWithAuth('/api/groups', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                if (data.error) {
                    showToast(data.error, 'error');
                } else {
                    showToast('🎉 تم إنشاء المجموعة بنجاح!', 'success');
                    closeCreateGroupModal();
                    loadTeacherGroups();
                }
            } catch (err) {
                showToast('❌ حدث خطأ أثناء إنشاء المجموعة', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> إنشاء المجموعة الآن';
            }
        }

        function copyGroupShareLink(groupId) {
            const input = document.getElementById(`share-link-${groupId}`);
            if (input) {
                input.select();
                navigator.clipboard.writeText(input.value).then(() => {
                    showToast('📋 تم نسخ رابط الدعوة! شاركه مع طلابك للانضمام.', 'success');
                }).catch(() => {
                    showToast('❌ فشل نسخ الرابط تلقائياً', 'error');
                });
            }
        }

        function copyCurrentGroupShareLink() {
            if (!activeChatGroupId) return;
            const link = window.location.origin + '/student-dashboard.html?join_group=' + activeChatGroupId;
            navigator.clipboard.writeText(link).then(() => {
                showToast('📋 تم نسخ رابط الدعوة بنجاح!', 'success');
            }).catch(() => {
                showToast('❌ فشل نسخ الرابط', 'error');
            });
        }

        async function deleteTeacherGroup(groupId, groupName) {
            if (!confirm(`هل أنت متأكد من رغبتك في حذف مجموعة "${groupName}" بالكامل؟\nسيتم حذف كافة الرسائل وسجلات الطلاب الخاصة بها نهائياً.`)) {
                return;
            }

            try {
                const response = await fetchWithAuth(`/api/groups/${groupId}`, {
                    method: 'DELETE'
                });
                const data = await response.json();
                if (data.error) {
                    showToast(data.error, 'error');
                } else {
                    showToast('🗑️ تم حذف المجموعة بنجاح', 'success');
                    if (activeChatGroupId === groupId) {
                        exitGroupChat();
                    } else {
                        loadTeacherGroups();
                    }
                }
            } catch (err) {
                showToast('❌ حدث خطأ أثناء حذف المجموعة', 'error');
            }
        }

        // ==========================================
        // LIVE CHAT LOGIC
        // ==========================================
        let activeChatGroupIsOwner = false;
        let currentManagingGroupIsOwner = false;

        async function enterGroupChat(groupId, groupName, groupImageUrl, isOwner) {
            groupChatTypingMyName = (userData && (userData.full_name || userData.name)) || '';
            if (typeof groupChatTypingWatch === 'function') groupChatTypingWatch(groupId);
            activeChatGroupId = groupId;
            activeChatGroupName = groupName || '';
            activeChatGroupImageUrl = groupImageUrl || '';
            currentManagingGroupId = groupId;
            
            // تُحلّ الملكية من teacher_id دائماً: الخادم لا يُرجع is_owner
            // إطلاقاً، والفحص القديم كان يعمل فقط عند غياب الاسم.
            activeChatGroupIsOwner = !!isOwner;
            try {
                const cached = (allTeacherGroups || []).find(g => String(g.id) === String(groupId));
                if (cached && cached.teacher_id !== undefined && cached.teacher_id !== null) {
                    const myTeacherId = (userData && (userData.id || userData.user_id))
                        || (typeof teacherId !== 'undefined' ? teacherId : null);
                    if (myTeacherId) activeChatGroupIsOwner = String(cached.teacher_id) === String(myTeacherId);
                }
            } catch (e) {}
            currentManagingGroupIsOwner = activeChatGroupIsOwner;
            
            if (!groupName || !activeChatGroupIsOwner) {
                try {
                    const res = await fetch(`/api/groups/${groupId}/public`);
                    const gData = await res.json();
                    if (gData && gData.name) {
                        groupName = gData.name;
                        groupImageUrl = gData.image_url || '';
                        activeChatGroupName = groupName;
                        activeChatGroupImageUrl = groupImageUrl;
                        if (gData && gData.teacher_id) {
                            const myId = (userData && (userData.id || userData.user_id))
                                || (typeof teacherId !== 'undefined' ? teacherId : null);
                            if (myId) activeChatGroupIsOwner = String(gData.teacher_id) === String(myId);
                            currentManagingGroupIsOwner = activeChatGroupIsOwner;
                        }
                    }
                } catch(e) {
                    console.error('Error fetching group data:', e);
                }
            }
            
            document.getElementById('chatGroupName').textContent = groupName || 'المجموعة التعليمية';
            const placeholder = document.getElementById('chatGroupImagePlaceholder');
            const img = document.getElementById('chatGroupImage');
            if (groupImageUrl) {
                img.src = groupImageUrl;
                img.style.display = 'block';
                placeholder.style.display = 'none';
            } else {
                img.style.display = 'none';
                placeholder.style.display = 'flex';
            }
            
            const manageBtn = document.getElementById('chatManageMembersBtn');
            if (manageBtn) {
                if (activeChatGroupIsOwner) {
                    manageBtn.innerHTML = '<i class="fas fa-users-gear" style="color: #60a5fa;"></i> إدارة الطلاب';
                } else {
                    manageBtn.innerHTML = '<i class="fas fa-users" style="color: #60a5fa;"></i> أعضاء المجموعة';
                }
            }

            const editBtn = document.getElementById('chatEditGroupNameBtn');
            const quickEditBtn = document.getElementById('chatQuickEditNameBtn');
            if (editBtn) {
                editBtn.style.display = activeChatGroupIsOwner ? 'inline-flex' : 'none';
            }
            if (quickEditBtn) {
                quickEditBtn.style.display = activeChatGroupIsOwner ? 'inline-flex' : 'none';
            }

            document.getElementById('groupsMainView').style.display = 'none';
            document.getElementById('groupsChatView').style.display = 'flex';
            
            const messagesArea = document.getElementById('chatMessagesArea');
            messagesArea.innerHTML = `
                <div style="text-align: center; margin: auto; padding: 40px; color: #64748b;">
                    <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary, #3b82f6); margin-bottom: 10px;"></i>
                    <p style="margin: 0; font-weight: 600;">جاري تحميل رسائل المحادثة...</p>
                </div>
            `;

            window.teacherChatMessagesLimit = 20;
            window.teacherChatHasMore = true;
            window.teacherChatIsLoadingOlder = false;
            window.teacherChatInitialScrollDone = false;
            if (typeof setupTeacherChatScrollPagination === 'function') {
                setupTeacherChatScrollPagination();
            }

            loadChatMessages(false);
            if (chatInterval) clearInterval(chatInterval);
            chatInterval = setInterval(() => {
                if (!window.teacherChatIsLoadingOlder) {
                    loadChatMessages(false);
                }
            }, 7000);

            setTimeout(() => {
                const input = document.getElementById('chatInputMessage');
                if (input) input.focus();
            }, 200);
        }

        function exitGroupChat() {
            if (typeof groupChatTypingWatch === 'function') groupChatTypingWatch(null);
            activeChatGroupId = null;
            activeChatGroupIsOwner = false;
            window.teacherChatMessagesLimit = 20;
            window.teacherChatHasMore = true;
            window.teacherChatIsLoadingOlder = false;
            window.teacherChatInitialScrollDone = false;
            const editBtn = document.getElementById('chatEditGroupNameBtn');
            const quickEditBtn = document.getElementById('chatQuickEditNameBtn');
            if (editBtn) editBtn.style.display = 'none';
            if (quickEditBtn) quickEditBtn.style.display = 'none';
            if (chatInterval) {
                clearInterval(chatInterval);
                chatInterval = null;
            }
            document.getElementById('groupsChatView').style.display = 'none';
            document.getElementById('groupsMainView').style.display = 'block';
            loadTeacherGroups();
        }

        let selectedTeacherGroupPdf = null;

        function handleTeacherGroupPdfSelect(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            if (!file.type.includes('pdf') && !file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.pdf')) {
                showToast('يرجى اختيار ملف PDF أو صورة فقط', 'error');
                e.target.value = '';
                return;
            }

            if (file.size > 25 * 1024 * 1024) {
                showToast('حجم ملف الـ PDF كبير جدا (الحد الأقصى 25 ميغابيت)', 'error');
                e.target.value = '';
                return;
            }

            selectedTeacherGroupPdf = file;
            const previewBar = document.getElementById('teacherChatPdfPreviewBar');
            const nameEl = document.getElementById('teacherChatPdfName');
            const sizeEl = document.getElementById('teacherChatPdfSize');

            if (nameEl) nameEl.textContent = file.name;
            if (sizeEl) sizeEl.textContent = formatFileSize(file.size) + ' • جاهز للإرسال للطلاب';
  if (previewBar) previewBar.style.display = 'flex';
  // إرسال الصورة أو الملف فوراً بعد الاختيار، بدون انتظار زر إضافي.
  void sendGroupChatMessage();
  }

  function cancelTeacherChatPdfAttachment() {
            selectedTeacherGroupPdf = null;
            const fileInput = document.getElementById('teacherChatPdfFileInput');
            if (fileInput) fileInput.value = '';
            const previewBar = document.getElementById('teacherChatPdfPreviewBar');
            if (previewBar) previewBar.style.display = 'none';
        }

        function formatMessageLinks(text, isSelf = false) {
            if (!text) return '';
            return autoLinkUrls(text, { isSelf: isSelf, linkColor: isSelf ? '#93c5fd' : '#2563eb' });
        }

        function formatTeacherChatTime(dateVal) {
            if (!dateVal) return '';
            try {
                let str = String(dateVal).trim();
                if (str.includes(' ') && !str.includes('T')) {
                    str = str.replace(' ', 'T');
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

        window.teacherChatMessagesLimit = 20;
        window.teacherChatHasMore = true;
        window.teacherChatIsLoadingOlder = false;
        window.teacherChatInitialScrollDone = false;

        function setupTeacherChatScrollPagination() {
            const messagesArea = document.getElementById('chatMessagesArea');
            if (!messagesArea || messagesArea._paginationAttached) return;
            messagesArea._paginationAttached = true;
            
            let scrollDebounce = null;
            messagesArea.addEventListener('scroll', () => {
                if (scrollDebounce) clearTimeout(scrollDebounce);
                scrollDebounce = setTimeout(() => {
                    if (messagesArea.scrollTop <= 60 && window.teacherChatHasMore && !window.teacherChatIsLoadingOlder) {
                        loadChatMessages(true);
                    }
                }, 100);
            }, { passive: true });
        }

        window.loadOlderTeacherGroupMessages = function() {
            if (window.teacherChatHasMore && !window.teacherChatIsLoadingOlder) {
                loadChatMessages(true);
            }
        };

        async function loadChatMessages(isOlderLoad = false) {
            window.loadChatMessages = loadChatMessages;
            if (!activeChatGroupId) return;
            const messagesArea = document.getElementById('chatMessagesArea');
            if (!messagesArea) return;

            if (isOlderLoad) {
                if (window.teacherChatIsLoadingOlder || !window.teacherChatHasMore) return;
                window.teacherChatIsLoadingOlder = true;
            } else if (window.teacherChatIsLoadingOlder) {
                return;
            }

            // تحديث وقت آخر قراءة للمجموعة
            const uId = userData ? (userData.id || userData.userId) : null;
            if (uId) {
                localStorage.setItem(`group_last_read_${uId}_${activeChatGroupId}`, new Date().toISOString());
                setTimeout(updateGroupsUnreadBadge, 100);
            }

            const previousScrollHeight = messagesArea.scrollHeight;
            const previousScrollTop = messagesArea.scrollTop;

            try {
                const fetchLimit = isOlderLoad ? ((window.teacherChatMessagesLimit || 20) + 20) : (window.teacherChatMessagesLimit || 20);
                const response = await fetchWithAuth(`/api/groups/${activeChatGroupId}/messages?limit=${fetchLimit}`);
                const messages = await response.json();
                if (typeof window.zoomySoundWatchMessages === 'function') {
                    const soundMeId = (function () {
                        try {
                            const tk = localStorage.getItem('token');
                            if (!tk) return null;
                            const dec = JSON.parse(atob(tk.split('.')[1]));
                            return dec.userId || dec.id || null;
                        } catch (e) { return null; }
                    })();
                    window.zoomySoundWatchMessages(messages, [soundMeId]);
                }
                
                if (isOlderLoad) {
                    window.teacherChatMessagesLimit = fetchLimit;
                }

                let currentUserId = null;
                const token = localStorage.getItem('token');
                if (token) {
                    try {
                        const decoded = JSON.parse(atob(token.split('.')[1]));
                        currentUserId = decoded.userId || decoded.id;
                    } catch(e) {}
                }

                if (!Array.isArray(messages) || messages.length === 0) {
                    window.teacherChatHasMore = false;
                    messagesArea.innerHTML = `
                        <div style="text-align: center; margin: auto; padding: 35px 25px; background: white; border-radius: 16px; max-width: 380px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); border: 1px solid #e2e8f0;">
                            <div style="width: 60px; height: 60px; border-radius: 50%; background: #eff6ff; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; font-size: 1.6rem; color: var(--primary, #3b82f6);">
                                <i class="fas fa-comments"></i>
                            </div>
                            <h4 style="color: #0f172a; margin: 0 0 6px 0; font-weight: 800; font-size: 1.15rem;">لا توجد رسائل بعد</h4>
                            <p style="color: #64748b; font-size: 0.9rem; margin: 0; line-height: 1.5;">ابدأ بكتابة أول رسالة أو توجيه لطلابك لبدء النقاش والتفاعل في المجموعة!</p>
                        </div>
                    `;
                    return;
                }

                if (messages.length < (window.teacherChatMessagesLimit || 20)) {
                    window.teacherChatHasMore = false;
                }

                if (!isOlderLoad && window.teacherChatInitialScrollDone && window.isAnyChatAudioPlaying && window.isAnyChatAudioPlaying()) {
                    return;
                }

                const isScrolledToBottom = messagesArea.scrollHeight - messagesArea.clientHeight <= messagesArea.scrollTop + 90;

                let topBannerHtml = '';
                if (!window.teacherChatHasMore && messages.length >= 20) {
                    topBannerHtml = `
                        <div style="text-align: center; padding: 6px 14px; margin-bottom: 12px; background: #e2e8f0; border-radius: 20px; font-size: 0.75rem; color: #64748b; font-weight: 600; width: fit-content; margin-inline: auto;">
                            <i class="fas fa-flag-checkered"></i> بداية محادثة المجموعة
                        </div>
                    `;
                } else if (window.teacherChatHasMore) {
                    topBannerHtml = `
                        <div id="teacherChatLoadOlderBtnWrapper" style="text-align: center; margin-bottom: 12px;">
                            <button type="button" onclick="loadOlderTeacherGroupMessages()" style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 20px; padding: 6px 16px; font-size: 0.78rem; font-weight: 700; color: #475569; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.2s;" onmouseenter="this.style.background='#f1f5f9'" onmouseleave="this.style.background='#ffffff'">
                                <i class="fas fa-arrow-up" style="color: var(--primary, #3b82f6);"></i> تحميل 20 رسالة أقدم
                            </button>
                        </div>
                    `;
                }

                const messagesHtml = messages.map(m => {
                    const isSelf = String(m.sender_id) === String(currentUserId) && m.sender_type === 'teacher';
                    // الأستاذ في لوحة تحكم الأستاذ هو مالك المجموعة دائماً ولديه صلاحية حذف أي رسالة في المجموعة
                    const canDelete = true;
                    
                    const bubbleBg = isSelf 
                        ? 'background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff;' 
                        : 'background: #ffffff; color: #0f172a; border: 1px solid #e2e8f0;';
                    
                    const borderRadius = isSelf 
                        ? 'border-radius: 14px 14px 2px 14px;' 
                        : 'border-radius: 14px 14px 14px 2px;';
                    
                    const senderLabel = isSelf 
                        ? 'الأستاذ (أنت)' 
                        : (m.sender_type === 'teacher' ? `${m.sender_name} (أستاذ)` : m.sender_name);

                    const senderRoleBadge = isSelf
                        ? `<span style="background: rgba(255,255,255,0.2); color: #ffffff; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; font-weight: 700;">معلم</span>`
                        : (m.sender_type === 'teacher' 
                            ? `<span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; font-weight: 700;"><i class="fas fa-chalkboard-teacher" style="font-size:0.6rem; margin-left:2px;"></i> أستاذ</span>`
                            : `<span style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; font-weight: 700;">طالب</span>`);

                    const timeStr = formatTeacherChatTime(m.created_at);
                    
                    const profileClick = m.sender_type === 'teacher' 
                        ? `viewTeacherProfile(${m.sender_id})` 
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
                                     oncontextmenu="handleGroupMsgLongPress(event, '${m.id}', activeChatGroupIsOwner)"
                                     ontouchstart="startGroupMsgTouchTimer(event, '${m.id}', true)"
                                     ontouchend="clearGroupMsgTouchTimer()"
                                     ontouchmove="clearGroupMsgTouchTimer()"
                                     title="انقر مرتين للتفاعل بالإيموجي - انقر مطولاً أو زر الحذف للحذف"
                                     style="${bubbleBg} ${borderRadius} padding: 8px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); position: relative; ${(m.message_type === 'audio' || m.file_type === 'audio' || m.audio_url) ? 'min-width: min(280px, 92vw);' : 'min-width: 100px;'} word-break: break-word; cursor: pointer; user-select: none;">
                                    
                                    ${(m.message_type === 'audio' || m.file_type === 'audio' || m.audio_url)
                                        ? (typeof window.renderVoiceMessageHtml === 'function'
                                            ? window.renderVoiceMessageHtml(m, isSelf, { canDelete: activeChatGroupIsOwner, deleteJs: `confirmDeleteGroupMessage(event, '${m.id}')` })
                                            : `<audio controls src="${m.audio_url || m.file_url}"></audio>`)
                                        : (m.file_url ? renderPdfAttachmentHtml(m.file_url, m.file_name, m.file_size, isSelf) : '')}
                                    ${m.message ? `<p style="margin: 0; font-size: 0.88rem; white-space: pre-wrap; line-height: 1.45; text-align: right; word-break: break-word;">${formatMessageLinks(m.message, isSelf)}</p>` : ''}
                                    
                                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
                                        <span style="font-size: 0.66rem; color: ${isSelf ? 'rgba(255,255,255,0.75)' : '#94a3b8'}; font-weight: 600; direction: ltr;">
                                            ${timeStr}
                                        </span>
                                        ${isSelf ? '<i class="fas fa-check" style="font-size: 0.6rem; color: rgba(255,255,255,0.85);"></i>' : ''}
                                         <button onclick="startGroupReplyToMessage('${m.id}', '${escapeHtml(m.sender_name)}', '${escapeHtml(m.message || "مرفق")}')" title="رد على الرسالة" style="background: transparent; border: none; padding: 0 4px; color: ${isSelf ? 'rgba(255,255,255,0.85)' : '#64748b'}; cursor: pointer; font-size: 0.72rem; opacity: 0.85; transition: opacity 0.2s;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.85'">
                                             <i class="fas fa-reply"></i> رد
                                         </button>
${activeChatGroupIsOwner ? `
                    <button onclick="confirmDeleteGroupMessage(event, '${m.id}')" title="حذف الرسالة من المجموعة" style="background: ${isSelf ? 'rgba(239, 68, 68, 0.3)' : '#fef2f2'}; color: ${isSelf ? '#ffffff' : '#dc2626'}; border: 1px solid ${isSelf ? 'rgba(239, 68, 68, 0.5)' : '#fca5a5'}; border-radius: 6px; padding: 3px 8px; font-size: 0.72rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.08);" onmouseenter="this.style.transform='scale(1.08)'" onmouseleave="this.style.transform='scale(1)'">
                    <i class="fas fa-trash-alt"></i> <span>حذف</span>
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
                } else if (!window.teacherChatInitialScrollDone || isScrolledToBottom) {
                    messagesArea.scrollTop = messagesArea.scrollHeight;
                    window.teacherChatInitialScrollDone = true;
                }
            } catch (e) {
                console.error('Error loading chat messages:', e);
            } finally {
                if (isOlderLoad) {
                    setTimeout(() => {
                        window.teacherChatIsLoadingOlder = false;
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

            const targetGroupId = (typeof activeChatGroupId !== 'undefined' && activeChatGroupId) ? activeChatGroupId : ((typeof activeStudentGroupId !== 'undefined' && activeStudentGroupId) ? activeStudentGroupId : null);
            if (!targetGroupId) return;

            try {
                const res = await fetchWithAuth(`/api/groups/${targetGroupId}/messages/${msgId}/react`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ emoji })
                });
                const data = await res.json();
                if (data.success) {
                    if (typeof loadChatMessages === 'function') loadChatMessages();
                    if (typeof loadStudentChatMessages === 'function') loadStudentChatMessages();
                }
            } catch (e) {
                console.error('Error reacting to message:', e);
            }
        }

        async function confirmDeleteGroupMessage(event, msgId) {
            if (!activeChatGroupIsOwner) { if (typeof showToast === 'function') showToast('حذف الرسائل متاح لمسؤول المجموعة فقط.', 'error'); return; }
            if (event) event.stopPropagation();
            if (!confirm('هل أنت متأكد من رغبتك في حذف هذه الرسالة من المجموعة؟')) return;

            const targetGroupId = (typeof activeChatGroupId !== 'undefined' && activeChatGroupId) ? activeChatGroupId : ((typeof activeStudentGroupId !== 'undefined' && activeStudentGroupId) ? activeStudentGroupId : null);
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
                    if (typeof loadChatMessages === 'function') loadChatMessages();
                    if (typeof loadStudentChatMessages === 'function') loadStudentChatMessages();
                }
            } catch (e) {
                console.warn('Delete group message error:', e);
            }
        }

        function showGroupMsgActionSheet(msgId, canDelete) {
            if (!activeChatGroupIsOwner) canDelete = false;
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
                        ${['👍', '❤️', '😂', '😐', '😢', '👏', '🔥'].map(emoji => `
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

        function handleTeacherGroupCameraSelect(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) { showToast('يرجى اختيار صورة صالحة', 'error'); e.target.value = ''; return; }
            if (file.size > 25 * 1024 * 1024) { showToast('حجم الصورة كبير جداً (الحد الأقصى 25 ميغابايت)', 'error'); e.target.value = ''; return; }
            selectedTeacherGroupPdf = file;
            const previewBar = document.getElementById('teacherChatPdfPreviewBar');
            const nameEl = document.getElementById('teacherChatPdfName');
            const sizeEl = document.getElementById('teacherChatPdfSize');
            if (nameEl) nameEl.textContent = file.name;
            if (sizeEl) sizeEl.textContent = formatFileSize(file.size) + ' • صورة جاهزة للإرسال';
            if (previewBar) previewBar.style.display = 'flex';
            // Android WebView may navigate when the hidden picker keeps focus.
            // Send immediately after selection so no second tap or form submit is needed.
            void sendGroupChatMessage();
        }

        async function sendGroupChatMessage() {
            if (!activeChatGroupId) return;
            groupChatTypingStop();
            const input = document.getElementById('chatInputMessage');
            const sendBtn = document.getElementById('sendChatMsgBtn');
            const message = (input.value || '').trim();
            const pdfToSend = selectedTeacherGroupPdf;

            if (!message && !pdfToSend) return;
            
            input.value = '';
            input.style.height = 'auto';
            cancelTeacherChatPdfAttachment();
            
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

                    const uploadRes = await fetch(`/api/groups/${activeChatGroupId}/upload-file`, {
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

                const response = await fetchWithAuth(`/api/groups/${activeChatGroupId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.error) {
                    showToast(data.error, 'error');
                } else {
                    cancelGroupChatReply();
                    await loadChatMessages();
                    const messagesArea = document.getElementById('chatMessagesArea');
                    if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
                }
            } catch (err) {
                showToast(err.message || '❌ فشل إرسال الرسالة', 'error');
            } finally {
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
                }
                input.focus();
            }
        }

        function handleChatInputKey(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendGroupChatMessage();
            }
        }

        // ==========================================
        // MANAGE MEMBERS MODAL LOGIC
        // ==========================================
        function openManageMembersModalDirect(groupId, groupName, isOwner) {
            currentManagingGroupId = groupId;
            if (typeof isOwner === 'boolean') {
                currentManagingGroupIsOwner = isOwner;
            } else {
                const found = (allTeacherGroups || []).find(g => String(g.id) === String(groupId));
                currentManagingGroupIsOwner = found ? !!found.is_owner : false;
            }
            const titlePrefix = currentManagingGroupIsOwner ? 'إدارة أعضاء' : 'أعضاء';
            document.getElementById('manageMembersTitle').textContent = `${titlePrefix}: ${groupName}`;
            document.getElementById('manageMembersModal').style.display = 'flex';
            loadGroupMembers();
        }

        function openManageMembersModal() {
            if (!activeChatGroupId) return;
            currentManagingGroupId = activeChatGroupId;
            currentManagingGroupIsOwner = activeChatGroupIsOwner;
            const titlePrefix = currentManagingGroupIsOwner ? 'إدارة أعضاء' : 'أعضاء';
            document.getElementById('manageMembersTitle').textContent = `${titlePrefix}: ${activeChatGroupName || 'المجموعة'}`;
            document.getElementById('manageMembersModal').style.display = 'flex';
            loadGroupMembers();
        }

        function closeManageMembersModal() {
            document.getElementById('manageMembersModal').style.display = 'none';
        }

        async function loadGroupMembers() {
            const targetGroupId = currentManagingGroupId || activeChatGroupId;
            if (!targetGroupId) return;

            const container = document.getElementById('membersListContainer');
            container.innerHTML = '<div style="text-align: center; padding: 30px; color: #64748b;"><i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary, #3b82f6); margin-bottom: 10px;"></i><p style="margin: 0; font-weight: 600;">جاري تحميل قائمة أعضاء المجموعة...</p></div>';
            
            try {
                const response = await fetchWithAuth(`/api/groups/${targetGroupId}/members`);
                const members = await response.json();
                cachedGroupMembers = Array.isArray(members) ? members : [];
                renderGroupMembers(cachedGroupMembers);
            } catch (e) {
                console.error('Error fetching group members:', e);
                container.innerHTML = '<div style="text-align: center; padding: 25px; color: #ef4444; font-weight: 700;">حدث خطأ أثناء تحميل بيانا الأعضاء.</div>';
            }
        }

        function filterGroupMembersList() {
            const term = (document.getElementById('memberSearchInput')?.value || '').trim().toLowerCase();
            if (!term) {
                renderGroupMembers(cachedGroupMembers);
                return;
            }
            const filtered = cachedGroupMembers.filter(m => 
                (m.full_name || '').toLowerCase().includes(term) || 
                (m.phone || '').includes(term)
            );
            renderGroupMembers(filtered);
        }

        function renderGroupMembers(members) {
            const container = document.getElementById('membersListContainer');
            if (!container) return;

            if (members.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px; color: #64748b;">
                        <i class="fas fa-user-slash fa-3x" style="color: #cbd5e1; margin-bottom: 12px;"></i>
                        <h4 style="margin: 0 0 6px 0; color: #1e293b; font-weight: 700;">لا يوجد أعضاء منضمون حتى الآن</h4>
                        <p style="margin: 0; font-size: 0.88rem; color: #94a3b8;">شارك رابط دعوة المجموعة مع طلابك وزملائك ليبدأوا بالانضمام والتفاعل معك فوراً.</p>
                    </div>
                `;
                return;
            }

            // الأستاذ في لوحة تحكم الأستاذ يملك كامل الصلاحيات لإدارة وطرد وحظر أعضاء مجموعاته
            const isOwnerManager = true;

            container.innerHTML = members.map(m => {
                const isMemberOwner = !!m.is_owner;
                const isMemberTeacher = !!m.is_teacher;

                const profileClickFn = isMemberTeacher 
                    ? `showTeacherProfileFromPost(${m.student_id}, true)` 
                    : `showStudentProfile(${m.student_id})`;

                const avatarHtml = m.profile_image 
                    ? `<img src="${m.profile_image}" onclick="${profileClickFn}" title="عرض الملف الشخصي" style="width: 46px; height: 46px; border-radius: 12px; object-fit: cover; border: 1.5px solid #e2e8f0; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">`
                    : `<div onclick="${profileClickFn}" title="عرض الملف الشخصي" style="width: 46px; height: 46px; border-radius: 12px; background: ${isMemberTeacher ? '#eff6ff' : '#e0f2fe'}; color: ${isMemberTeacher ? '#2563eb' : '#0284c7'}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 700; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'"><i class="fas ${isMemberTeacher ? 'fa-chalkboard-teacher' : 'fa-user-graduate'}"></i></div>`;
                
                let actionsHtml = '';
                if (!isMemberOwner) {
                    actionsHtml = m.is_blocked
                        ? `<button onclick="unblockStudent(${m.student_id})" class="btn" style="background: #10b981; color: white; border: none; border-radius: 8px; padding: 7px 14px; font-size: 0.82rem; cursor: pointer; font-weight: 700; display: flex; align-items: center; gap: 5px;"><i class="fas fa-user-check"></i> إلغاء الحظر</button>`
                        : `
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <button onclick="kickStudent(${m.student_id})" title="حذف وطرد العضو من المجموعة" class="btn" style="background: #fef2f2; color: #dc2626; border: 1.5px solid #fca5a5; border-radius: 8px; padding: 7px 14px; font-size: 0.82rem; cursor: pointer; font-weight: 800; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s; box-shadow: 0 1px 3px rgba(220,38,38,0.1);" onmouseenter="this.style.background='#fee2e2'" onmouseleave="this.style.background='#fef2f2'">
                                    <i class="fas fa-user-minus"></i> <span>حذف العضو</span>
                                </button>
                                <button onclick="blockStudent(${m.student_id})" title="حظر العضو نهائياً من المجموعة" class="btn" style="background: #0f172a; color: white; border: none; border-radius: 8px; padding: 7px 12px; font-size: 0.82rem; cursor: pointer; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s;">
                                    <i class="fas fa-ban"></i> حظر
                                </button>
                            </div>
                        `;
                } else {
                    actionsHtml = `<span style="background: #fef3c7; color: #b45309; font-weight: 700; font-size: 0.78rem; padding: 4px 10px; border-radius: 12px;"><i class="fas fa-crown"></i> مالك المجموعة</span>`;
                }

                const statusBadge = m.is_blocked 
                    ? `<span style="background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 20px; font-size: 0.72rem; font-weight: 700; margin-right: 8px;">محظور</span>`
                    : `<span style="background: #dcfce7; color: #16a34a; padding: 2px 8px; border-radius: 20px; font-size: 0.72rem; font-weight: 700; margin-right: 8px;">عضو نشط</span>`;

                return `
                    <div style="display: flex; align-items: center; justify-content: space-between; background: #f8fafc; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            ${avatarHtml}
                            <div>
                                <div style="display: flex; align-items: center;">
                                    <h4 onclick="${profileClickFn}" title="عرض الملف الشخصي" style="margin: 0; font-size: 0.95rem; color: #0f172a; font-weight: 700; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='#0f172a'">${m.full_name}</h4>
                                    ${statusBadge}
                                </div>
                            </div>
                        </div>
                        <div>
                            ${actionsHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function kickStudent(studentId) {
            const targetGroupId = currentManagingGroupId || activeChatGroupId;
            if (!targetGroupId) return;
            if (!confirm('هل أنت متأكد من رغبتك في طرد هذا الطالب من المجموعة؟ يمكنه الانضمام مجدداً في حال امتلكه لرابط الدعوة.')) return;

            try {
                const response = await fetchWithAuth(`/api/groups/${targetGroupId}/kick`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId })
                });
                const data = await response.json();
                if (data.error) {
                    showToast(data.error, 'error');
                } else {
                    showToast('👋 تم طرد الطالب بنجاح', 'success');
                    loadGroupMembers();
                }
            } catch (err) {
                showToast('❌ حدث خطأ أثناء طرد الطالب', 'error');
            }
        }

        async function blockStudent(studentId) {
            const targetGroupId = currentManagingGroupId || activeChatGroupId;
            if (!targetGroupId) return;
            if (!confirm('هل أنت متأكد من حظر هذا الطالب؟ لن يتمكن من النشر أو الانضمام مجدداً حتى تقوم برفع الحظر عنه.')) return;

            try {
                const response = await fetchWithAuth(`/api/groups/${targetGroupId}/block`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId })
                });
                const data = await response.json();
                if (data.error) {
                    showToast(data.error, 'error');
                } else {
                    showToast('🚫 تم حظر الطالب بنجاح', 'success');
                    loadGroupMembers();
                }
            } catch (err) {
                showToast('❌ حدث خطأ أثناء حظر الطالب', 'error');
            }
        }

        async function unblockStudent(studentId) {
            const targetGroupId = currentManagingGroupId || activeChatGroupId;
            if (!targetGroupId) return;

            try {
                const response = await fetchWithAuth(`/api/groups/${targetGroupId}/unblock`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId })
                });
                const data = await response.json();
                if (data.error) {
                    showToast(data.error, 'error');
                } else {
                    showToast('✅ تم إلغاء حظر الطالب بنجاح', 'success');
                    loadGroupMembers();
                }
            } catch (err) {
                showToast('❌ حدث خطأ أثناء إلغاء الحظر', 'error');
            }
        }

        // ============================================================
        // تم إلغاء فحص وتنبيه وجود إصدار جديد للمنصة عند الدخول
        // ============================================================
        async function checkPlatformVersion() {
            removeNewReleaseAlertBanner();
            return;
        }

        function showNewReleaseAlertBanner(version, note) {
            return;
        }

        function removeNewReleaseAlertBanner() {
            const banner = document.getElementById('newReleaseAlertBanner');
            if (banner) banner.remove();
        }

        function applyPlatformUpdate(version) {
            removeNewReleaseAlertBanner();
        }

        document.addEventListener('DOMContentLoaded', () => {
            removeNewReleaseAlertBanner();
        });

        // ================================================================
        // 🔍 TOP NAV USER SEARCH (TEACHERS & STUDENTS)
        // ================================================================
        let navSearchDebounceTimer = null;
        let currentNavSearchFilter = 'all';
        let lastNavSearchQuery = '';

        function openMobileSearchModal() {
            const modal = document.getElementById('mobileSearchModal');
            if (!modal) return;
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            const input = document.getElementById('mobileNavSearchInput');
            if (input) {
                setTimeout(() => {
                    input.focus();
                    if (!input.value.trim() && currentNavSearchFilter === 'all') {
                        performNavUserSearch('', true);
                    } else if (input.value.trim()) {
                        performNavUserSearch(input.value, true);
                    }
                }, 100);
            }
        }

        function closeMobileSearchModal() {
            const modal = document.getElementById('mobileSearchModal');
            if (modal) {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        }

        function setNavSearchFilter(filter, isMobile = false) {
            currentNavSearchFilter = filter;
            document.querySelectorAll('#navSearchDropdown .nav-filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filter === filter);
            });
            document.querySelectorAll('#mobileSearchModal .mobile-filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filter === filter);
            });
            const input = isMobile ? document.getElementById('mobileNavSearchInput') : document.getElementById('navSearchInput');
            if (input) {
                performNavUserSearch(input.value, isMobile);
            }
        }

        function handleNavUserSearch(val, isMobile = false) {
            const clearBtn = document.getElementById(isMobile ? 'mobileNavSearchClearBtn' : 'navSearchClearBtn');
            if (clearBtn) {
                clearBtn.style.display = val && val.trim() ? 'flex' : 'none';
            }
            if (isMobile) {
                const desktopInput = document.getElementById('navSearchInput');
                if (desktopInput) desktopInput.value = val;
            } else {
                const mobileInput = document.getElementById('mobileNavSearchInput');
                if (mobileInput) mobileInput.value = val;
            }
            clearTimeout(navSearchDebounceTimer);
            navSearchDebounceTimer = setTimeout(() => {
                performNavUserSearch(val, isMobile);
            }, 200);
        }

        function clearNavUserSearch(isMobile = false) {
            const input = document.getElementById(isMobile ? 'mobileNavSearchInput' : 'navSearchInput');
            if (input) {
                input.value = '';
                input.focus();
            }
            const clearBtn1 = document.getElementById('navSearchClearBtn');
            if (clearBtn1) clearBtn1.style.display = 'none';
            const clearBtn2 = document.getElementById('mobileNavSearchClearBtn');
            if (clearBtn2) clearBtn2.style.display = 'none';
            performNavUserSearch('', isMobile);
        }

        function openNavSearchResults() {
            const dropdown = document.getElementById('navSearchDropdown');
            if (dropdown) {
                dropdown.style.display = 'block';
                const input = document.getElementById('navSearchInput');
                if (input && (!dropdown.dataset.loaded || input.value.trim())) {
                    performNavUserSearch(input.value, false);
                    dropdown.dataset.loaded = '1';
                }
            }
        }

        function closeNavSearchResults() {
            const dropdown = document.getElementById('navSearchDropdown');
            if (dropdown) dropdown.style.display = 'none';
        }

        document.addEventListener('click', function(e) {
            const container = document.getElementById('navSearchContainer');
            if (container && !container.contains(e.target)) {
                closeNavSearchResults();
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeNavSearchResults();
                closeMobileSearchModal();
            }
        });

        async function performNavUserSearch(query, isMobile = false) {
            const trimmed = (query || '').trim();
            lastNavSearchQuery = trimmed;
            const desktopList = document.getElementById('navSearchResultsList');
            const mobileList = document.getElementById('mobileNavSearchResultsList');
            const dropdown = document.getElementById('navSearchDropdown');

            if (!isMobile && dropdown) {
                dropdown.style.display = 'block';
            }

            const placeholderEmpty = `
                <div class="nav-search-placeholder">
                    <i class="fas fa-search" style="font-size: ${isMobile ? '1.8rem' : '1.5rem'}; color: #94a3b8; margin-bottom: 6px;"></i>
                    <p>اكتب اسم الأستاذ أو الطالب للبحث الفوري...</p>
                </div>
            `;

            if (!trimmed && currentNavSearchFilter === 'all') {
                if (desktopList) desktopList.innerHTML = placeholderEmpty;
                if (mobileList) mobileList.innerHTML = placeholderEmpty;
                return;
            }

            const loadingHtml = `
                <div class="nav-search-placeholder">
                    <i class="fas fa-circle-notch fa-spin" style="font-size: 1.5rem; color: var(--primary); margin-bottom: 6px;"></i>
                    <p>جاري البحث...</p>
                </div>
            `;
            if (desktopList) desktopList.innerHTML = loadingHtml;
            if (mobileList) mobileList.innerHTML = loadingHtml;

            try {
                const token = localStorage.getItem('token') || sessionStorage.getItem('token');
                const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
                const url = `/api/public/search/users?q=${encodeURIComponent(trimmed)}&role=${encodeURIComponent(currentNavSearchFilter)}`;
                const res = await fetch(url, { headers });
                const data = await res.json();

                if (lastNavSearchQuery !== trimmed) return;

                if (!data.success || !data.users || data.users.length === 0) {
                    const noResultsHtml = `
                        <div class="nav-search-placeholder">
                            <i class="fas fa-user-slash" style="font-size: 1.5rem; color: #cbd5e1; margin-bottom: 6px;"></i>
                            <p style="color: #64748b; font-weight: 600;">لا توجد نتائج مطابقة لـ "${escapeHtml(trimmed)}"</p>
                        </div>
                    `;
                    if (desktopList) desktopList.innerHTML = noResultsHtml;
                    if (mobileList) mobileList.innerHTML = noResultsHtml;
                    return;
                }

                const resultsHtml = data.users.map(u => {
                    const isTeacher = u.user_role === 'teacher';
                    const name = escapeHtml(isTeacher ? (u.full_name || 'أستاذ') : (u.name || 'طالب'));
                    const avatar = u.profile_image || u.avatar || '/images/default-avatar.svg';
                    const badgeLabel = isTeacher ? 'أستاذ' : 'طالب';
                    const badgeClass = isTeacher ? 'teacher-badge' : 'student-badge';
                    const badgeIcon = isTeacher ? 'fa-chalkboard-user' : 'fa-user-graduate';
                    
                    let subtitle = '';
                    if (isTeacher) {
                        const subject = u.subject ? escapeHtml(u.subject) : 'أستاذ معتمد';
                        const rank = u.rank ? `<span style="color:#d97706; font-size:0.75rem;">• ${escapeHtml(u.rank)}</span>` : '';
                        subtitle = `<span class="user-subtitle"><i class="fas fa-book-open" style="font-size:0.75rem; margin-left:4px;"></i> ${subject} ${rank}</span>`;
                    } else {
                        const grade = u.grade ? escapeHtml(u.grade) : 'طالب مسجل';
                        const wilaya = u.wilaya ? `<span style="color:#64748b; font-size:0.75rem;">• ${escapeHtml(u.wilaya)}</span>` : '';
                        subtitle = `<span class="user-subtitle"><i class="fas fa-graduation-cap" style="font-size:0.75rem; margin-left:4px;"></i> ${grade} ${wilaya}</span>`;
                    }

                    const profileOnClick = isTeacher 
                        ? `viewTeacherProfile(${u.id})`
                        : `showStudentProfile(${u.id})`;

                    const chatBtn = `
                        <button type="button" class="nav-search-action-btn chat-action" onclick="event.stopPropagation(); closeNavSearchResults(); closeMobileSearchModal(); openDirectChat(${u.id}, '${name.replace(/'/g, "\\'")}', '${avatar.replace(/'/g, "\\'")}', '${isTeacher ? 'teacher' : 'student'}')" title="مراسلة فورية">
                            <i class="fas fa-comment-dots"></i> مراسلة
                        </button>
                    `;

                    const profileBtn = `
                        <button type="button" class="nav-search-action-btn profile-action" onclick="event.stopPropagation(); closeNavSearchResults(); closeMobileSearchModal(); ${profileOnClick}" title="عرض الملف">
                            <i class="fas ${isTeacher ? 'fa-user' : 'fa-id-card'}"></i> الملف
                        </button>
                    `;

                    return `
                        <div class="nav-search-item" onclick="${profileOnClick}; closeNavSearchResults(); closeMobileSearchModal();">
                            <div class="nav-search-user-info">
                                <div class="nav-search-avatar-wrapper">
                                    <img src="${avatar}" alt="${name}" class="nav-search-avatar" referrerpolicy="no-referrer" onerror="handleImageFallback(this)">
                                    <span class="nav-role-mini-dot ${isTeacher ? 'teacher-dot' : 'student-dot'}"></span>
                                </div>
                                <div class="nav-search-meta">
                                    <div class="nav-search-name-row">
                                        <span class="nav-search-name">${name}</span>
                                        <span class="nav-search-role-badge ${badgeClass}"><i class="fas ${badgeIcon}"></i> ${badgeLabel}</span>
                                    </div>
                                    ${subtitle}
                                </div>
                            </div>
                            <div class="nav-search-actions">
                                ${profileBtn}
                                ${chatBtn}
                            </div>
                        </div>
                    `;
                }).join('');

                if (desktopList) desktopList.innerHTML = resultsHtml;
                if (mobileList) mobileList.innerHTML = resultsHtml;

            } catch (e) {
                console.error('Error in nav user search:', e);
                const errorHtml = `
                    <div class="nav-search-placeholder">
                        <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; color: #ef4444; margin-bottom: 6px;"></i>
                        <p style="color: #ef4444;">حدث خطأ أثناء البحث</p>
                    </div>
                `;
                if (desktopList) desktopList.innerHTML = errorHtml;
                if (mobileList) mobileList.innerHTML = errorHtml;
            }
        }
    