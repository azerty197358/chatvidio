
// rescued from the memorizer block: the groups badge still needs it
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
                const response = await fetch('/api/groups/student', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) return;
                const groups = await response.json();
                if (!Array.isArray(groups)) return;

                let unreadCount = 0;
                groups.forEach(g => {
                    // If there are no messages in this group, it can't be unread
                    if (!g.latest_message_time) return;

                    // If currently chatting in this group, it's not unread
                                        var openGroup = (typeof window.activeStudentGroupId !== "undefined") ? window.activeStudentGroupId : null;
                    if (openGroup && String(openGroup) === String(g.id)) {
                        return;
                    }

                    const lastReadStr = localStorage.getItem(`group_last_read_${uId}_${g.id}`);
                    if (lastReadStr) {
                        if (new Date(g.latest_message_time) > new Date(lastReadStr)) {
                            unreadCount++;
                        }
                    } else {
                        // Never read, but contains messages
                        unreadCount++;
                    }
                });

                // Update badge in top bar tab
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

                // Update badge in mobile drawer
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
                console.error("Error updating groups unread badge:", err);
            }
        }
