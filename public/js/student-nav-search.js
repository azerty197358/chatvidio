// ============================================================================
//  🔎 البحث عن الأساتذة والطلاب في الشريط العلوي - لوحة الطالب
//  نفس سلوك لوحة الأستاذ، مع كاش قصير حتى لا نطلق استعلاماً عند كل حرف.
// ============================================================================
(function () {
    'use strict';
    if (window.__studentNavSearchLoaded) return;
    window.__studentNavSearchLoaded = true;

    let navSearchDebounceTimer = null;
    let currentNavSearchFilter = 'all';
    let lastNavSearchQuery = '';
    let navSearchInflight = null;

    const RECENT_CACHE_KEY = 'nav_search_cache_v1';
    const RECENT_TTL = 5 * 60 * 1000;

    function esc(text) {
        const el = document.createElement('div');
        el.textContent = text === undefined || text === null ? '' : String(text);
        return el.innerHTML;
    }

    function token() {
        try { return localStorage.getItem('token') || sessionStorage.getItem('token') || ''; } catch (e) { return ''; }
    }

    function placeholderHtml(isMobile) {
        return '<div class="nav-search-placeholder">'
            + '<i class="fas fa-search" style="font-size:' + (isMobile ? '1.8rem' : '1.5rem') + '; color:#94a3b8; margin-bottom:6px;"></i>'
            + '<p>اكتب اسم الأستاذ أو الطالب للبحث الفوري...</p></div>';
    }

    window.openMobileSearchModal = function () {
        const modal = document.getElementById('mobileSearchModal');
        if (!modal) return;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        const input = document.getElementById('mobileNavSearchInput');
        if (input) setTimeout(function () { input.focus(); }, 100);
    };

    window.closeMobileSearchModal = function () {
        const modal = document.getElementById('mobileSearchModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    };

    window.openNavSearchResults = function () {
        const dropdown = document.getElementById('navSearchDropdown');
        if (!dropdown) return;
        dropdown.style.display = 'block';
        const input = document.getElementById('navSearchInput');
        if (input && !dropdown.dataset.loaded) {
            performNavUserSearch(input.value, false);
            dropdown.dataset.loaded = '1';
        }
    };

    window.closeNavSearchResults = function () {
        const dropdown = document.getElementById('navSearchDropdown');
        if (dropdown) dropdown.style.display = 'none';
    };

    window.setNavSearchFilter = function (filter, isMobile) {
        currentNavSearchFilter = filter;
        document.querySelectorAll('#navSearchDropdown .nav-filter-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.filter === filter);
        });
        document.querySelectorAll('#mobileSearchModal .mobile-filter-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.filter === filter);
        });
        const input = document.getElementById(isMobile ? 'mobileNavSearchInput' : 'navSearchInput');
        if (input) performNavUserSearch(input.value, !!isMobile);
    };

    window.handleNavUserSearch = function (val, isMobile) {
        const clearBtn = document.getElementById(isMobile ? 'mobileNavSearchClearBtn' : 'navSearchClearBtn');
        if (clearBtn) clearBtn.style.display = (val && String(val).trim()) ? 'flex' : 'none';

        const other = document.getElementById(isMobile ? 'navSearchInput' : 'mobileNavSearchInput');
        if (other) other.value = val;

        clearTimeout(navSearchDebounceTimer);
        navSearchDebounceTimer = setTimeout(function () { performNavUserSearch(val, !!isMobile); }, 250);
    };

    window.clearNavUserSearch = function (isMobile) {
        const input = document.getElementById(isMobile ? 'mobileNavSearchInput' : 'navSearchInput');
        if (input) { input.value = ''; input.focus(); }
        ['navSearchClearBtn', 'mobileNavSearchClearBtn'].forEach(function (id) {
            const b = document.getElementById(id);
            if (b) b.style.display = 'none';
        });
        performNavUserSearch('', !!isMobile);
    };

    function readCache(query, role) {
        try {
            const raw = localStorage.getItem(RECENT_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || Date.now() - parsed.at > RECENT_TTL) return null;
            if (parsed.query !== query || parsed.role !== role) return null;
            return parsed.users;
        } catch (e) { return null; }
    }

    function writeCache(query, role, users) {
        try {
            localStorage.setItem(RECENT_CACHE_KEY, JSON.stringify({ at: Date.now(), query: query, role: role, users: users }));
        } catch (e) {}
    }

    function renderResults(users) {
        if (!users || !users.length) {
            return '<div class="nav-search-placeholder">'
                + '<i class="fas fa-user-slash" style="font-size:1.5rem; color:#cbd5e1; margin-bottom:6px;"></i>'
                + '<p style="color:#64748b; font-weight:600;">لا توجد نتائج مطابقة</p></div>';
        }

        return users.map(function (u) {
            const isTeacher = u.user_role === 'teacher';
            const name = esc(isTeacher ? (u.full_name || 'أستاذ') : (u.name || u.full_name || 'طالب'));
            const avatar = u.profile_image || u.avatar || '/images/default-avatar.svg';
            const subject = isTeacher
                ? (u.subject || u.specialization || 'أستاذ')
                : (u.grade || u.education_level || 'طالب');
            const profileFn = isTeacher ? 'viewTeacherProfile' : 'showStudentProfile';
            const chatCall = 'startChatWithUser(' + Number(u.id) + ", '" + name.replace(/'/g, "\\'") + "', '" + String(avatar).replace(/'/g, "\\'") + "', '" + (isTeacher ? 'teacher' : 'student') + "')";

            return '<div class="nav-search-item" onclick="' + profileFn + '(' + Number(u.id) + '); closeNavSearchResults(); closeMobileSearchModal();">'
                + '<div class="nav-search-user-info">'
                + '<div class="nav-search-avatar-wrapper">'
                + '<img src="' + esc(avatar) + '" alt="' + name + '" class="nav-search-avatar" referrerpolicy="no-referrer" onerror="handleImageFallback(this)">'
                + '<span class="nav-role-mini-dot ' + (isTeacher ? 'teacher-dot' : 'student-dot') + '"></span>'
                + '</div>'
                + '<div class="nav-search-meta"><div class="nav-search-name-row">'
                + '<span class="nav-search-name">' + name + '</span>'
                + '<span class="nav-search-role-badge ' + (isTeacher ? 'teacher-badge' : 'student-badge') + '">'
                + '<i class="fas ' + (isTeacher ? 'fa-chalkboard-user' : 'fa-user-graduate') + '"></i> '
                + (isTeacher ? 'أستاذ' : 'طالب') + '</span>'
                + '</div>'
                + '<span class="user-subtitle">' + esc(subject) + '</span>'
                + '</div></div>'
                + '<div class="nav-search-actions">'
                + '<button type="button" class="nav-search-action-btn chat-action" onclick="event.stopPropagation(); closeNavSearchResults(); closeMobileSearchModal(); '
                + chatCall + '" title="مراسلة فورية"><i class="fas fa-comment-dots"></i> رسالة</button>'
                + '</div></div>';
        }).join('');
    }

    async function performNavUserSearch(query, isMobile) {
        const trimmed = String(query || '').trim();
        lastNavSearchQuery = trimmed;

        const desktopList = document.getElementById('navSearchResultsList');
        const mobileList = document.getElementById('mobileNavSearchResultsList');
        const dropdown = document.getElementById('navSearchDropdown');
        if (!isMobile && dropdown) dropdown.style.display = 'block';

        if (!trimmed && currentNavSearchFilter === 'all') {
            const html = placeholderHtml(isMobile);
            if (desktopList) desktopList.innerHTML = html;
            if (mobileList) mobileList.innerHTML = html;
            return;
        }

        const cached = readCache(trimmed, currentNavSearchFilter);
        if (cached) {
            const html = renderResults(cached);
            if (desktopList) desktopList.innerHTML = html;
            if (mobileList) mobileList.innerHTML = html;
            return;
        }

        const loading = '<div class="nav-search-placeholder"><i class="fas fa-circle-notch fa-spin" style="font-size:1.5rem; color:#2563eb; margin-bottom:6px;"></i><p>جاري البحث...</p></div>';
        if (desktopList) desktopList.innerHTML = loading;
        if (mobileList) mobileList.innerHTML = loading;

        try {
            const url = '/api/search/users?q=' + encodeURIComponent(trimmed)
                + '&role=' + encodeURIComponent(currentNavSearchFilter);
            const headers = token() ? { Authorization: 'Bearer ' + token() } : {};
            const res = await fetch(url, { headers: headers });
            const data = await res.json();
            if (lastNavSearchQuery !== trimmed) return;

            const users = (data && data.success && Array.isArray(data.users)) ? data.users : [];
            writeCache(trimmed, currentNavSearchFilter, users);
            const html = renderResults(users);
            if (desktopList) desktopList.innerHTML = html;
            if (mobileList) mobileList.innerHTML = html;
        } catch (e) {
            const html = '<div class="nav-search-placeholder"><i class="fas fa-exclamation-triangle" style="font-size:1.5rem; color:#ef4444; margin-bottom:6px;"></i>'
                + '<p style="color:#ef4444;">تعذّر البحث</p></div>';
            if (desktopList) desktopList.innerHTML = html;
            if (mobileList) mobileList.innerHTML = html;
        }
    }
    window.performNavUserSearch = performNavUserSearch;

    document.addEventListener('click', function (e) {
        const container = document.getElementById('navSearchContainer');
        if (container && !container.contains(e.target)) closeNavSearchResults();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeNavSearchResults();
            closeMobileSearchModal();
        }
    });
})();