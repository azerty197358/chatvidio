
    function handleImageFallback(img) {
        if (!img) return;
        var originalUrl = img.getAttribute('data-original-url') || img.src;
        if (!img.dataset.proxied && originalUrl && originalUrl.startsWith('http')) {
            img.dataset.proxied = 'true';
            img.setAttribute('referrerpolicy', 'no-referrer');
            img.src = '/api/proxy-image?url=' + encodeURIComponent(originalUrl);
            return;
        }
        img.onerror = null;
        img.src = '/images/default-avatar.svg';
    }

    function setImgWithFallback(imgElement, url) {
        if (!imgElement) return;
        var cleanUrl = (url && url !== 'null' && url !== 'undefined' && String(url).trim() !== '') ? encodeURI(String(url).trim()) : '/images/default-avatar.svg';
        delete imgElement.dataset.proxied;
        imgElement.setAttribute('data-original-url', cleanUrl);
        imgElement.setAttribute('referrerpolicy', 'no-referrer');
        imgElement.src = cleanUrl;
    }
    // ================================================================
    // ✅ إعدادات أساسية
    // ================================================================

    let userData = null;
    let studentId = null;
    
    // Expose local variables to window object so external scripts like chat-audio.js can access them
    Object.defineProperty(window, 'studentId', {
        get() { return studentId; },
        set(val) { studentId = val; },
        configurable: true
    });
    Object.defineProperty(window, 'userData', {
        get() { return userData; },
        set(val) { userData = val; },
        configurable: true
    });
    let currentSection = 'posts';
    let currentBalance = 0;
    let notifications = [];
    let referralData = null;
    let authToken = null;
    let csrfToken = null;

    const API_BASE_URL = window.location.origin;

    console.log('🌐 API Base URL:', API_BASE_URL);

    // Lightbox State
    let currentLightboxImages = [];
    let currentLightboxIndex = 0;

    function openLightbox(images, index) {
        currentLightboxImages = images;
        currentLightboxIndex = index;
        const overlay = document.getElementById('lightboxOverlay');
        const img = document.getElementById('lightboxImg');
        const counter = document.getElementById('lightboxCounter');
        
        img.src = images[index];
        counter.innerText = `${index + 1} / ${images.length}`;
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    window.openLightbox = openLightbox;

    function closeLightbox(event) {
        if (event) event.stopPropagation();
        const overlay = document.getElementById('lightboxOverlay');
        if (overlay) overlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    window.closeLightbox = closeLightbox;

    function changeLightboxImage(direction, event) {
        if (event) event.stopPropagation();
        currentLightboxIndex += direction;
        if (currentLightboxIndex < 0) currentLightboxIndex = currentLightboxImages.length - 1;
        if (currentLightboxIndex >= currentLightboxImages.length) currentLightboxIndex = 0;
        
        const img = document.getElementById('lightboxImg');
        const counter = document.getElementById('lightboxCounter');
        img.src = currentLightboxImages[currentLightboxIndex];
        counter.innerText = `${currentLightboxIndex + 1} / ${currentLightboxImages.length}`;
    }
    window.changeLightboxImage = changeLightboxImage;

    // Close lightbox on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
        if (document.getElementById('lightboxOverlay') && document.getElementById('lightboxOverlay').style.display === 'flex') {
            if (e.key === 'ArrowRight') changeLightboxImage(1);
            if (e.key === 'ArrowLeft') changeLightboxImage(-1);
        }
    });

    // ✅ نفس قائمة المستويات المستخدمة في صفحة التسجيل
    const levelMap = {
        'primary_all': 'جميع مستويات الابتدائي',
        'primary_1': 'السنة الأولى ابتدائي',
        'primary_2': 'السنة الثانية ابتدائي',
        'primary_3': 'السنة الثالثة ابتدائي',
        'primary_4': 'السنة الرابعة ابتدائي',
        'primary_5': 'السنة الخامسة ابتدائي',
        '5eme_pri': 'خامسة ابتدائي',
        'middle_all': 'جميع مستويات المتوسط',
        '1ere_am': 'أولى متوسط',
        '2eme_am': 'ثانية متوسط',
        '3eme_am': 'ثالثة متوسط',
        '4eme_am': 'رابعة متوسط (BEM)',
        'bem': 'رابعة متوسط (BEM)',
        'secondary_all': 'جميع مستويات الثانوي',
        '1ere_as': 'أولى ثانوي',
        '2eme_as': 'ثانية ثانوي',
        '3eme_as': 'ثالثة ثانوي (BAC)',
        'bac': 'ثالثة ثانوي (BAC)',
        'university': 'جميع المستويات الجامعية',
        '1ere_uni': 'أولى جامعي (L1)',
        '2eme_uni': 'ثانية جامعي (L2)',
        '2ere_uni': 'ثانية جامعي (L2)',
        '3eme_uni': 'ثالثة جامعي (L3)',
        '3ere_uni': 'ثالثة جامعي (L3)',
        'master': 'ماستر',
        'doctorat': 'دكتوراه',
        'vocational_all': 'جميع مستويات التكوين المهني والمعاهد',
        'cap': 'شهادة الكفاءة المهنية (CAP)',
        'cmp': 'شهادة التحكم المهني (CMP)',
        'bt': 'شهادة التقني (BT)',
        'bts': 'شهادة التقني السامي (BTS)',
        'insfp': 'المعاهد الوطنية المتخصصة (INSFP)',
        'insta_uni': 'المعاهد الجامعية والتقنية (ISTA / LMD)',
        'other': 'مستوى آخر / ع م'
    };

    // ================================================================
    // ✅ دوال المصادقة والأخطاء
    // ================================================================

    window.appErrorsLog = [];
    let errorRepairCount = 0;
    let lastErrorTime = 0;

    function attemptAutoRepair(errorMsg, source) {
        if (!errorMsg) return;
        const lower = String(errorMsg).toLowerCase();
        // Ignore audio, microphone, media, recording, voice, upload, and network related issues - do NOT cancel recordings or reload!
        if (lower.includes('audio') || lower.includes('microphone') || lower.includes('mediarecorder') || 
            lower.includes('getusermedia') || lower.includes('notallowederror') || lower.includes('aborterror') ||
            lower.includes('notfounderror') || lower.includes('play()') || lower.includes('domexception') ||
            lower.includes('voice') || lower.includes('recording') || lower.includes('upload') ||
            lower.includes('blob') || lower.includes('network') || lower.includes('fetch')) {
            console.warn(`[AutoRepair] Ignored media/audio error from [${source}]:`, errorMsg);
            return;
        }

        const now = Date.now();
        if (now - lastErrorTime < 10000) {
            errorRepairCount++;
        } else {
            errorRepairCount = 1;
        }
        lastErrorTime = now;

        if (errorRepairCount > 5) {
            console.warn('⚠️ [AutoRepair] Consecutive UI crashes detected, refreshing state quietly...');
            sessionStorage.setItem('platform_recovery_attempts', '0');
            return;
        }

        console.log(`🔧 [AutoRepair] Handling non-critical issue from [${source}] quietly`);

        // Session or CSRF token refresh
        if (lower.includes('token') || lower.includes('authorization') || lower.includes('csrf')) {
            try {
                if (typeof getCsrfToken === 'function') getCsrfToken();
            } catch(e) {}
        }
    }

    function logAppError(source, err, statusCode = null, endpoint = '') {
        const errorMsg = typeof err === 'string' ? err : (err && err.message ? err.message : JSON.stringify(err));
        const time = new Date().toLocaleTimeString('ar-EG');
        const errObj = {
            id: Date.now() + Math.random(),
            source,
            message: errorMsg,
            statusCode,
            endpoint,
            time
        };
        window.appErrorsLog.unshift(errObj);
        if (window.appErrorsLog.length > 50) window.appErrorsLog.pop();

        console.error(`❌ [AppError][${source}]`, errObj);
        updateErrorDebugWidget();

        // Trigger auto-repair
        attemptAutoRepair(errorMsg, source);
    }

    function updateErrorDebugWidget() {
        const badge = document.getElementById('errorDebugBadge');
        const list = document.getElementById('errorDebugList');
        const count = window.appErrorsLog.length;

        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        if (list) {
            if (count === 0) {
                list.innerHTML = `
                    <div style="text-align: center; color: #94a3b8; padding: 30px; font-size: 0.9rem;">
                        <i class="fas fa-check-circle" style="color: #22c55e; font-size: 2rem; margin-bottom: 8px; display: block;"></i>
                        لا توجد أخطاء مسجلة حالياً
                    </div>`;
                return;
            }

            list.innerHTML = window.appErrorsLog.map(e => `
                <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px; padding: 12px; position: relative; text-align: right;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: 800; font-size: 0.8rem; color: #991b1b; background: #fee2e2; padding: 2px 8px; border-radius: 6px;">${escapeHtml(e.source)}</span>
                        <span style="font-size: 0.75rem; color: #7f1d1d; dir: ltr;">${escapeHtml(e.time)} ${e.statusCode ? `[HTTP ${e.statusCode}]` : ''}</span>
                    </div>
                    ${e.endpoint ? `<div style="font-size: 0.75rem; color: #475569; font-family: monospace; margin-bottom: 4px; word-break: break-all; dir: ltr; text-align: left;"><b>Route:</b> ${escapeHtml(e.endpoint)}</div>` : ''}
                    <div style="font-size: 0.83rem; color: #b91c1c; font-family: monospace; word-break: break-word; white-space: pre-wrap; background: white; padding: 8px; border-radius: 8px; border: 1px solid #fecaca; text-align: left; dir: ltr;">${escapeHtml(e.message)}</div>
                </div>
            `).join('');
        }
    }

    function toggleErrorDebugModal() {
        const modal = document.getElementById('errorDebugModal');
        if (!modal) return;
        const isHidden = modal.style.display === 'none' || !modal.style.display;
        modal.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) updateErrorDebugWidget();
    }

    function clearAppErrors() {
        window.appErrorsLog = [];
        updateErrorDebugWidget();
        if (typeof showToast === 'function') showToast('تم مسح سجل الأخطاء', 'success');
    }

    function copyAppErrors() {
        if (window.appErrorsLog.length === 0) {
            if (typeof showToast === 'function') showToast('لا توجد أخطاء لنسخها', 'info');
            return;
        }
        const text = JSON.stringify(window.appErrorsLog, null, 2);
        navigator.clipboard.writeText(text).then(() => {
            if (typeof showToast === 'function') showToast('تم نسخ سجل الأخطاء للحافظة', 'success');
        }).catch(err => {
            console.error('فشل النسخ:', err);
        });
    }

    window.addEventListener('error', function(e) {
        logAppError('Global Window Error', e.error || e.message);
    });

    window.addEventListener('unhandledrejection', function(e) {
        logAppError('Unhandled Promise Rejection', e.reason ? (e.reason.message || e.reason) : 'Promise rejected');
    });

    function getValidImageUrl(url, name, size = 120) {
        if (!url || url === 'null' || url === 'undefined' || String(url).trim() === '' || String(url).includes('default-avatar.png') || String(url).includes('placeholder')) {
            const cleanName = encodeURIComponent(name || 'مستخدم');
            return `https://ui-avatars.com/api/?name=${cleanName}&background=0f5cbf&color=fff&size=${size}&font-size=0.4`;
        }
        return url;
    }

    async function fetchPublicData(endpoint) {
        const fullUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
        const headers = {};
        const token = localStorage.getItem('token') || (typeof authToken !== 'undefined' ? authToken : '');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        try {
            const res = await fetch(fullUrl, { headers });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                let parsedErr = `HTTP ${res.status} ${res.statusText}`;
                try {
                    const jsonErr = JSON.parse(errText);
                    parsedErr = jsonErr.error || jsonErr.message || parsedErr;
                } catch(pErr) {
                    if (errText) parsedErr += `: ${errText.substring(0, 100)}`;
                }
                logAppError('Public API Error', parsedErr, res.status, endpoint);
                throw new Error(`HTTP ${res.status}: ${parsedErr}`);
            }
            return await res.json();
        } catch (err) {
            if (!err.message.startsWith('HTTP ')) {
                logAppError('Public API Network Error', err.message, null, endpoint);
            }
            throw err;
        }
    }

    function getCsrfTokenFromCookies() {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'csrf_token') {
                return value;
            }
        }
        return null;
    }

    function checkGuestAction() {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData.is_guest || userData.id === -1) {
            showToast('⚠️ أنت تتصفح كزائر. يرجى تسجيل الدخول أو إنشاء حساب للقيام بهذا الإجراء.', 'error');
            if (confirm('أنت تتصفح كزائر حالياً.\nللقيام بالمتابعة، النشر، أو المراسلة، يرجى تسجيل الدخول أو إنشاء حساب.\n\nهل ترغب في الانتقال لصفحة تسجيل الدخول / إنشاء حساب؟')) {
                exitGuestAndNavigate('/?login=true');
            }
            return true;
        }
        return false;
    }

    function isTokenExpired(tokenStr) {
        if (!tokenStr || typeof tokenStr !== 'string') return true;
        try {
            const parts = tokenStr.split('.');
            if (parts.length !== 3) return false;
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (payload && payload.exp) {
                const nowInSec = Math.floor(Date.now() / 1000);
                return nowInSec >= payload.exp;
            }
        } catch (e) {
            console.error('Error decoding token payload:', e);
        }
        return false;
    }

    function checkAndHandleAutoLogout(reason = 'يتم تسجيل الخروج الآن') {
        const uData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (uData.is_guest || uData.id === -1) return false;

        const token = localStorage.getItem('token');
        if (!token || isTokenExpired(token)) {
            if (window._isLoggingOut) return true;
            window._isLoggingOut = true;
            console.warn('🔒 التوكن منتهي الصلاحية! يتم تسجيل الخروج الآن...');
            localStorage.removeItem('token');
            localStorage.removeItem('userData');
            if (typeof showToast === 'function') {
                showToast('يتم تسجيل الخروج الآن', 'info');
            }
            setTimeout(() => {
                window.location.href = '/';
            }, 800);
            return true;
        }
        return false;
    }

    // فحص صلاحية التوكن بشكل دوري كل 15 ثانية
    setInterval(() => {
        checkAndHandleAutoLogout();
    }, 15000);

    function showGuestPrompt() {
        if (confirm('للانضمام للمجموعة، يرجى تسجيل الدخول أو إنشاء حساب.\nهل ترغب في الانتقال لصفحة تسجيل الدخول / إنشاء حساب؟')) {
            exitGuestAndNavigate('/?login=true');
        }
    }

    async function fetchWithAuth(url, options = {}) {
        const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
        
        const isGuestUser = userData && (userData.is_guest || userData.id === -1);

        if (!isGuestUser && checkAndHandleAutoLogout()) {
            throw new Error('انتهت صلاحية التوكن');
        }

        if (!authToken) {
            if (isGuestUser) {
                throw new Error('لا يوجد توكن للزائر');
            }
            console.error('❌ authToken غير موجود!');
            localStorage.removeItem('token');
            localStorage.removeItem('userData');
            logAppError('Auth', 'لا يوجد توكن - تم تسجيل الخروج');
            showToast('انتهت صلاحية الجلسة، جاري إعادة التوجيه...', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
            throw new Error('لا يوجد توكن');
        }
        
        const isFormData = options.body instanceof FormData;
        const headers = {
            'Authorization': `Bearer ${authToken}`,
            'X-CSRF-Token': csrfToken || getCsrfTokenFromCookies() || '',
            ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
            ...options.headers
        };
        
        // GET قراءة خلفية: فشله لا يستحق إزعاجاً. أما POST/PUT/DELETE
        // فإجراء طلبه المستخدم فيستحق رسالة.
        const method = String((options && options.method) || 'GET').toUpperCase();
        const isBackgroundRead = method === 'GET';
        try {
            const response = await fetch(fullUrl, {
                ...options,
                headers: headers
            })
.then(function (res) {
    if (window.ZoomyNet && window.ZoomyNet.markSuccess) window.ZoomyNet.markSuccess();
    return res;
}, function (err) {
    if (window.ZoomyNet && window.ZoomyNet.markFailure) window.ZoomyNet.markFailure();
    throw err;
});;;

            if (!response.ok) {
                const clone = response.clone();
                const errorData = await clone.json().catch(() => ({}));
                const errMsg = errorData.error || errorData.message || `HTTP ${response.status} ${response.statusText}`;

                logAppError('API Error', errMsg, response.status, url);

                if (response.status === 401) {
                    console.error('❌ خطأ 401:', errorData);
                    if (isGuestUser) {
                        console.warn('401 response for guest user - ignoring logout redirect');
                        throw new Error('غير مصرح به للزائر');
                    }
                    if (window._isLoggingOut) throw new Error('انتهت صلاحية الجلسة');
                    window._isLoggingOut = true;
                    showToast('يتم تسجيل الخروج الآن', 'info');
                    localStorage.removeItem('token');
                    localStorage.removeItem('userData');
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 1000);
                    throw new Error('انتهت صلاحية الجلسة');
                }

                if (response.status >= 500) {
                    // ✅ لا نقوم بإعادة تحميل الصفحة أبداً عند وجود خطأ — نعرض رسالة واضحة فقط
                    // حتى لا يفقد المستخدم بياناته أو عمليات الرفع الجارية.
                    // ⚠️ errMsg كان غير معرَّف — كل خطأ 5xx كان يُرمي ReferenceError
                    // ويخفي السبب الحقيقي عن المستخدم والسجل. نقرأ سبب الخادم بأمان.
                    let errMsg = 'Server Error';
                    try {
                        const errBody = await response.clone().json();
                        if (errBody && (errBody.error || errBody.message)) errMsg = errBody.error || errBody.message;
                    } catch (parseErr) { /* استجابة غير JSON */ }
                    logAppError('Server Error', errMsg, response.status, url);
                    // الخادم نائم أو مشغول: لا إعادة تحميل أبداً،
                    // ولا إشعار أثناء تبديل التبويب.
                    if (!isBackgroundRead && !(window.ZoomyNet && window.ZoomyNet.isOnline() === false)) {
                    }
                }

                if (response.status === 403) {
                    if (errorData.banned) {
                        showToast('⚠️ تم حظر حسابك من المنصة', 'error');
                        localStorage.removeItem('token');
                        localStorage.removeItem('userData');
                        setTimeout(() => {
                            window.location.href = '/';
                        }, 2000);
                        throw new Error('حساب محظور');
                    }
                    if (errorData.error && errorData.error.includes('CSRF')) {
                        await getCsrfToken();
                        const retryResponse = await fetch(fullUrl, {
                            ...options,
                            headers: {
                                ...headers,
                                'X-CSRF-Token': csrfToken
                            }
                        });
                        if (retryResponse.ok) {
                            return retryResponse;
                        }
                    }
                    throw new Error(errMsg || 'غير مصرح به (403)');
                }
            }

            return response;
        } catch (netErr) {
            //  لا إشعار ولا إعادة تحميل: انقطاع الاتصال يعرضه الشريط،
            //  وأي فشل آخر لا يقطع عمل المستخدم. التفصيل للمطوّر فقط.
            if (!netErr.message || (!netErr.message.includes('انتهت صلاحية الجلسة') && !netErr.message.includes('حساب محظور'))) {
                logAppError('Fetch Error', netErr.message, null, url);
            }            throw netErr;
        }
    }

    async function getCsrfToken() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/csrf-token`, {
                credentials: 'include'
            });
            const data = await response.json();
            csrfToken = data.csrfToken;
            return csrfToken;
        } catch (error) {
            console.error('خطأ في جلب CSRF Token:', error);
            logAppError('CSRF Token Fetch Error', error.message, null, '/api/csrf-token');
            return null;
        }
    }

    // ================================================================
    // ✅ NOTIFICATIONS
    // ================================================================

    async function loadNotifications() {
        try {
            const res = await fetchWithAuth(`/api/notifications/${studentId}/student`);
            const data = await res.json();
            notifications = data || [];
    if (typeof window.zoomySoundWatchNotifications === 'function') window.zoomySoundWatchNotifications(notifications, studentId);
            renderNotifications();
            updateNotifBadge();
        } catch (e) {
            if (e.message !== 'انتهت صلاحية الجلسة' && e.message !== 'حساب محظور') {
                console.error('خطأ في جلب الإشعارات:', e);
            }
        }
    }

    function renderNotifications() {
        const list = document.getElementById('notifList');
        if (!notifications || notifications.length === 0) {
            list.innerHTML = `
                <div class="notif-empty">
                    <i class="fas fa-bell-slash"></i>
                    لا توجد إشعارات
                </div>
            `;
            return;
        }

        let html = '';
        for (const notif of notifications.slice(0, 20)) {
            const isUnread = !notif.is_read;
            const time = new Date(notif.created_at);
            const timeStr = time.toLocaleString('ar', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });

            let iconClass = 'info';
            let icon = 'fa-bell';
            const title = notif.title || '';
            if (title.includes('منشور') || title.includes('درس')) {
                iconClass = 'info';
                icon = 'fa-bullhorn';
            } else if (title.includes('متابع')) {
                iconClass = 'info';
                icon = 'fa-user-plus';
            } else if (title.includes('حجز') || title.includes('حصة') || title.includes('تسجيل')) {
                iconClass = 'info';
                icon = 'fa-calendar-plus';
            } else if (title.includes('بدء') || title.includes('بث') || title.includes('مباشر')) {
                iconClass = 'success';
                icon = 'fa-video';
            } else if (title.includes('مكافأة') || title.includes('إحالة') || title.includes('صندوق') || title.includes('هدايا')) {
                iconClass = 'gift';
                icon = 'fa-gift';
            } else if (title.includes('رصيد') || title.includes('شحن') || title.includes('دفع')) {
                iconClass = 'success';
                icon = 'fa-money-bill-wave';
            } else if (title.includes('إلغاء') || title.includes('حظر')) {
                iconClass = 'danger';
                icon = 'fa-exclamation-circle';
            }

            const isStreamStartNotif = (title.includes('بدء') || title.includes('بث') || title.includes('مباشر') || title.includes('🔴')) && !title.includes('تم حجز') && !title.includes('تأكيد');
            const cleanMessage = (notif.message || '').replace(/\[(POST|STUDENT|TEACHER):\d+\]/g, '').trim();
            const hasGoogleMeet = notif.meet_url || (notif.stream_url && notif.stream_url.includes('meet.google.com')) || (notif.message && notif.message.includes('meet.google.com'));
            const meetUrlMatch = notif.meet_url || (notif.stream_url && notif.stream_url.includes('meet.google.com') ? notif.stream_url : null) || (notif.message && notif.message.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i) ? notif.message.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i)[0] : null);

            html += `
                <div class="notif-item ${isUnread ? 'unread' : ''}" onclick='markNotificationRead("${notif.id}", ${notif.offer_id || 'null'}, ${JSON.stringify(notif.message || '')}, ${JSON.stringify(notif.title || '')})'>
                    <div class="notif-icon ${iconClass}"><i class="fas ${icon}"></i></div>
                    <div class="notif-content">
                        <div class="notif-title">${escapeHtml(notif.title)}</div>
                        <div class="notif-message">${escapeHtml(cleanMessage)}</div>
                        <div class="notif-time">${timeStr}</div>
                        ${meetUrlMatch ? `
                            <div class="notif-action" style="margin-top:6px; display:flex; gap:6px;">
                                <a href="${meetUrlMatch}" target="_blank" onclick="event.stopPropagation(); markNotificationRead('${notif.id}', ${notif.offer_id || 'null'});" style="background: #2563eb; color: white; text-decoration: none; padding: 5px 12px; border-radius: 6px; font-weight: 700; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 5px;">
                                    <i class="fab fa-google"></i> فتح Google Meet مباشرة
                                </a>
                                <button onclick="event.stopPropagation(); navigator.clipboard.writeText('${meetUrlMatch}'); showToast('تم نسخ الرابط بنجاح!', 'success');" style="background:#f1f5f9; color:#1e293b; border:1px solid #cbd5e1; padding:5px 8px; border-radius:6px; font-size:0.75rem; cursor:pointer;">
                                    نسخ
                                </button>
                            </div>
                        ` : (notif.offer_id && isStreamStartNotif ? `
                            <div class="notif-action">
                                <button onclick="event.stopPropagation(); joinFromNotification(${notif.offer_id})">
                                    <i class="fas fa-video"></i> انضم الآن
                                </button>
                            </div>
                        ` : '')}
                    </div>
                </div>
            `;
        }
        list.innerHTML = html;
    }

    function updateNotifBadge() {
        const badge = document.getElementById('notifBadge');
        const unreadCount = notifications.filter(n => !n.is_read).length;
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    function toggleNotifications() {
        const dropdown = document.getElementById('notifDropdown');
        dropdown.classList.toggle('open');
        document.getElementById('profileDropdown').classList.remove('open');
        if (dropdown.classList.contains('open')) {
            loadNotifications();
        }
    }

    async function markNotificationRead(notifId, offerId, rawMessage = '', rawTitle = '') {
        const notifDropdown = document.getElementById('notifDropdown');
        if (notifDropdown) notifDropdown.classList.remove('open');

        try {
            const res = await fetchWithAuth(`/api/notifications/read/${notifId}`, {
                method: 'POST'
            });
            if (res.ok) {
                const notif = notifications.find(n => n.id == notifId);
                if (notif) notif.is_read = true;
                updateNotifBadge();
                renderNotifications();
            }
        } catch (e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                console.error('خطأ في تحديث الإشعار:', e);
            }
        }

        // 1. التوجيه للحصص أو البث المباشر
        const isStreamStartNotif = (rawTitle.includes('بدء') || rawTitle.includes('بث') || rawTitle.includes('مباشر') || rawTitle.includes('🔴')) && !rawTitle.includes('تم حجز') && !rawTitle.includes('تأكيد');
        if (offerId && isStreamStartNotif) {
            joinFromNotification(offerId);
            return;
        }

        if (offerId || rawTitle.includes('درس') || rawTitle.includes('حصة') || rawTitle.includes('عرض') || rawTitle.includes('حجز')) {
            showSection('offers');
            loadOffers().then(() => {
                if (offerId) {
                    setTimeout(() => {
                        const el = document.getElementById(`offer-card-${offerId}`);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.style.transition = 'all 0.5s ease';
                            el.style.boxShadow = '0 0 0 3px var(--primary), 0 8px 25px rgba(0,0,0,0.15)';
                            setTimeout(() => { el.style.boxShadow = ''; }, 3500);
                        }
                    }, 400);
                }
            });
            return;
        }

        // 2. التوجيه للمنشورات والتعليقات والإعجابات
        const postMatch = rawMessage.match(/\[POST:(\d+)\]/);
        if (postMatch || rawTitle.includes('منشور') || rawTitle.includes('إعجاب') || rawTitle.includes('تعليق')) {
            showSection('posts');
            const postId = postMatch ? postMatch[1] : null;
            loadStudentPosts().then(() => {
                if (postId) {
                    setTimeout(() => {
                        const el = document.getElementById(`post-card-${postId}`);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.style.transition = 'all 0.5s ease';
                            el.style.boxShadow = '0 0 0 3px var(--primary), 0 8px 25px rgba(0,0,0,0.15)';
                            setTimeout(() => { el.style.boxShadow = ''; }, 3500);
                        }
                    }, 400);
                }
            });
            return;
        }

        // 3. المعاملات المالية والرصيد
        if (rawTitle.includes('رصيد') || rawTitle.includes('شحن') || rawTitle.includes('دفع') || rawTitle.includes('معاملة') || rawTitle.includes('سحب') || rawMessage.includes('رصيد')) {
            showSection('transactions');
            return;
        }

        // 4. الإحالات والمكافآت
        if (rawTitle.includes('إحالة') || rawTitle.includes('مكافأة') || rawTitle.includes('صندوق') || rawTitle.includes('هدايا') || rawTitle.includes('هدية')) {
            showSection('referral');
            return;
        }

        // 5. الرسا ل والمحادثات
        if (rawTitle.includes('رسالة') || rawTitle.includes('محادثة') || rawTitle.includes('دردشة')) {
            showSection('messages');
            return;
        }

        // 6. الملفات الشخصية
        const teacherMatch = rawMessage.match(/\[TEACHER:(\d+)\]/);
        if (teacherMatch) {
            showTeacherProfile(teacherMatch[1]);
            return;
        }

        const studentMatch = rawMessage.match(/\[STUDENT:(\d+)\]/);
        if (studentMatch) {
            showStudentProfile(studentMatch[1]);
            return;
        }

        showSection('offers');
    }

    async function clearAllNotifications() {
        if (!notifications || notifications.length === 0) {
            showToast('سجل الإشعارات فارغ بالفعل', 'info');
            return;
        }
        if (!confirm('هل أنت تأكد من مسح جميع الإشعارات بالكامل؟')) return;

        try {
            let res = await fetchWithAuth(`/api/student/notifications/clear-all`, {
                method: 'DELETE'
            });
            if (!res.ok) {
                res = await fetchWithAuth(`/api/notifications/clear-all/${studentId}/student`, {
                    method: 'DELETE'
                });
            }
            const data = await res.json();
            if (data.success || res.ok) {
                notifications = [];
                updateNotifBadge();
                renderNotifications();
                showToast('تم مسح جميع الإشعارات بنجاح', 'success');
            } else {
                showToast(data.error || 'حدث خطأ في مسح الإشعارات', 'error');
            }
        } catch (e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ أثناء مسح الإشعارات', 'error');
            }
        }
    }

    async function markAllNotifications() {
        const unreadNotifs = notifications.filter(n => !n.is_read);
        if (unreadNotifs.length === 0) {
            showToast('لا توجد إشعارات غير مقروءة', 'warning');
            return;
        }
        for (const notif of unreadNotifs) {
            try {
                await fetchWithAuth(`/api/notifications/read/${notif.id}`, {
                    method: 'POST'
                });
                notif.is_read = true;
            } catch(e) { 
                if (e.message !== 'انتهت صلاحية الجلسة') console.error(e); 
            }
        }
        updateNotifBadge();
        renderNotifications();
        showToast('تم تحديد جميع الإشعارات كمقروءة', 'success');
    }

    async function joinFromNotification(offerId, directMeetUrl) {
        if (directMeetUrl && directMeetUrl.includes('meet.google.com')) {
            try {
                const newWindow = window.open(directMeetUrl, '_blank');
                if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                    window.location.href = directMeetUrl;
                }
            } catch(e) {
                window.location.href = directMeetUrl;
            }
            document.getElementById('notifDropdown').classList.remove('open');
            return;
        }

        try {
            const res = await fetchWithAuth(`/api/student/stream-status/${offerId}/${studentId}`);
            const data = await res.json();
            if (data.can_join && data.stream_url) {
                const rawUrl = data.meet_url || data.stream_url;
                const isGoogleMeetOrZoom = (rawUrl && (rawUrl.includes('meet.google.com') || rawUrl.includes('zoom.us') || rawUrl.includes('zoom.com') || rawUrl.includes('live-room.html'))) || data.stream_platform === 'google_meet' || data.stream_platform === 'zoom' || data.stream_platform === 'webrtc' || data.is_free;
                if (isGoogleMeetOrZoom) {
                    let meetUrl = (rawUrl && (rawUrl.includes('meet.google.com') || rawUrl.includes('zoom.us') || rawUrl.includes('zoom.com') || rawUrl.includes('live-room.html'))) ? rawUrl : null;
                    if (!meetUrl) {
                        meetUrl = rawUrl || `/api/join-zoom/${offerId}/${studentId}`;
                    }
                    try {
                        const newWindow = window.open(meetUrl, '_blank');
                        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                            window.location.href = meetUrl;
                        }
                    } catch(e) {
                        window.location.href = meetUrl;
                    }
                } else {
                    const token = localStorage.getItem('token');
                    const roomJoinUrl = `/api/join-zoom/${offerId}/${studentId}?token=${encodeURIComponent(token)}`;
                    try {
                        const newWindow = window.open(roomJoinUrl, '_blank');
                        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                            window.location.href = roomJoinUrl;
                        }
                    } catch(e) {
                        window.location.href = roomJoinUrl;
                    }
                }
            } else if (data.is_waiting) {
                showToast('⏳ جاري التحضير للبث، انتظر قليلاً...', 'warning');
            } else {
                showToast('البث غير متاح حالياً', 'warning');
                showSection('bookings');
            }
        } catch(e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ', 'error');
            }
        }
        document.getElementById('notifDropdown').classList.remove('open');
    }

    // ================================================================
    // ✅ PROFILE DROPDOWN
    // ================================================================

    function toggleProfileDropdown() {
        const dropdown = document.getElementById('profileDropdown');
        dropdown.classList.toggle('open');
        document.getElementById('notifDropdown').classList.remove('open');
    }

    function closeAllDropdowns() {
        document.getElementById('profileDropdown').classList.remove('open');
        document.getElementById('notifDropdown').classList.remove('open');
    }

    // ================================================================
    // ✅ TOAST
    // ================================================================

        // ================================================================
    //  إخفاء رسائل الخطأ: أي خطأ يُسجَّل في console للمطوّر،
    //  وما يراه المستخدم سطر هادئ واحد لا يكشف أي تفصيل تقني.
    // ================================================================// لا نص عرض بديل للخطأ: إشعار الخطأ لا يُرسَم على الشاشة

    function zoomyQuietError(text) {
        var t = String(text == null ? '' : text).toLowerCase();
        var marks = ['http', 'status', 'stack', 'error:', 'exception', 'undefined',
            'failed to fetch', 'network', 'timeout', 'sql', 'postgres', 'supabase',
            'syntaxerror', 'typeerror', 'referenceerror', 'cannot read',
            'is not a function', '429', '500', '502', '503'];
        for (var i = 0; i < marks.length; i++) { if (t.indexOf(marks[i]) !== -1) return true; }
        return false;
    }
function showToast(message, type = 'success') {
        // الحاوية قد تكون غائبة - ننشئها بدل رمي استثناء، لأن استثناء هنا
        // كان يوقف logout() قبل مسح التوكن.
        let container = document.getElementById('toastContainer');
        if (!container) {
            try {
                container = document.createElement('div');
                container.id = 'toastContainer';
                container.className = 'toast-container';
                (document.body || document.documentElement).appendChild(container);
            } catch (e) { return; }
        }
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-triangle-exclamation',
            info: 'fa-info-circle'
        };
        try {
            const toast = document.createElement('div');
            let shown = message;
            let kind = type;
            if (type === 'error') {
                //  لا رسالة خطأ على الشاشة إطلاقاً.
                //  التفصيل كامل في console للمطوّر، والمستخدم لا
                //  يرى شيئاً ولا ينقطع عمله. شريط الاتصال هو ما
                //  يخبره بالوضع إن كان الأمر اتصالاً.
                try { console.warn('[Zoomy]', message); } catch (e) {}
                return;
            }
            //  حتى لو جاء نص تقني على إشعار نجاح، نكتفي بصمت
            if (zoomyQuietError(message)) {
                try { console.warn('[Zoomy]', message); } catch (e) {}
                return;
            }
toast.className = `toast ${kind}`;
            toast.innerHTML = `<i class="fas ${icons[kind] || icons.info}"></i> ${shown}`;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-20px)';
                setTimeout(() => toast.remove(), 300);
            }, 4500);
        } catch (e) { console.warn('showToast:', e); }
    }

    // ================================================================
    // ✅ NAVIGATION
    // ================================================================

    function showSection(section) {
        currentSection = section;
        const sections = ['offers', 'posts', 'exercises', 'teachers', 'courses', 'groups', 'bookings', 'transactions', 'referral', 'messages', 'packages', 'profile', 'community-channels', 'ai-assistant'];
        sections.forEach(s => {
            const sectionId = (s === 'community-channels') ? 'communityChannelsSection' : (s === 'ai-assistant') ? 'aiAssistantSection' : (s + 'Section');
            const el = document.getElementById(sectionId);
            if (el) el.style.display = (s === section) ? 'block' : 'none';
        });

        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.section === section);
        });

        document.querySelectorAll('.mobile-bottom-item').forEach(item => {
            if (item.dataset.section) {
                item.classList.toggle('active', item.dataset.section === section);
            }
        });

        closeAllDropdowns();
        closeMobileDrawer();

        if (section === 'profile') updateProfileSection();
        else if (section === 'community-channels') loadCommunityChannels();
        else if (section === 'offers') loadOffers();
        else if (section === 'exercises') loadExercises();
        else if (section === 'posts') {
            localStorage.setItem('last_posts_view_time', new Date().toISOString());
            const b1 = document.getElementById('postsBadge');
            const b2 = document.getElementById('mobilePostsBadge');
            if (b1) b1.style.display = 'none';
            if (b2) b2.style.display = 'none';
            loadStudentPosts();
            loadSavedPostsSidebar();
        }
        else if (section === 'teachers') loadTeachers();
        else if (section === 'courses') loadStudentCourses();
        else if (section === 'groups') {
            const mainView = document.getElementById('studentGroupsMainView');
            const chatView = document.getElementById('studentGroupsChatView');
            if (activeStudentGroupId) {
                if (mainView) mainView.style.display = 'none';
                if (chatView) chatView.style.display = 'flex';
            } else {
                if (mainView) mainView.style.display = 'block';
                if (chatView) chatView.style.display = 'none';
            }
            loadGroups();
        }
        else if (section === 'bookings') loadMyBookings();
        else if (section === 'transactions') loadTransactions();
        else if (section === 'referral') loadReferralData();
        else if (section === 'messages') {
            const _msgAd = document.getElementById('studentMessagesAdSlot');
            if (!currentChatTeacher) {
                const cList = document.getElementById('conversationsList');
                const cView = document.getElementById('chatView');
                if (cList) cList.style.display = 'block';
                if (cView) cView.style.display = 'none';
                if (_msgAd) _msgAd.style.display = 'block';
                loadConversations();
            } else {
                if (_msgAd) _msgAd.style.display = 'none';
                loadConversations(true);
            }
        }
        else if (section === 'packages') loadStudentPackages();
    }

    function updateProfileSection() {
        if (!userData) return;
        const nameEl = document.getElementById('profileSectionName');
        if (nameEl) nameEl.textContent = userData.full_name || 'طالب';
        const emailEl = document.getElementById('profileSectionEmail');
        if (emailEl) emailEl.textContent = userData.email || '';
        const avatarEl = document.getElementById('profileSectionAvatar');
        if (avatarEl) setImgWithFallback(avatarEl, userData.profile_image || userData.profile_url || '/images/default-avatar.svg');
        const levelTextEl = document.getElementById('profileSectionLevelText');
        if (levelTextEl) {
            levelTextEl.textContent = 'المستوى الدراسي: ' + (levelMap[userData.education_level] || userData.education_level || 'غير محدد');
        }
        const balanceEl = document.getElementById('profileSectionBalance');
        if (balanceEl) balanceEl.textContent = (currentBalance || 0) + ' دج';
    }

    async function loadCommunityChannels() {
        const grid = document.getElementById('communityChannelsGrid');
        if (!grid) return;
        try {
            const res = await fetch('/api/settings/community_channels');
            const data = await res.json();
            const channels = (data && data.channels && Array.isArray(data.channels)) ? data.channels.filter(c => c.is_active !== false) : [];

            if (!channels.length) {
                grid.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #64748b; grid-column: 1 / -1; background: white; border-radius: 16px; border: 1px solid #e2e8f0;">
                        <i class="fas fa-bullhorn fa-2x" style="color: #94a3b8; margin-bottom: 10px;"></i>
                        <h4 style="margin: 0 0 6px 0; color: #1e293b;">لا توجد قنوات مفعلة حالياً</h4>
                        <p style="margin: 0; font-size: 0.88rem;">سيتم إضافة قنوات ومجموعات التواصل قريباً من قبل إدارة المنصة.</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = channels.map(ch => {
                const iconColor = ch.type === 'telegram' || ch.type === 'telegram_group' ? '#0088cc' : (ch.type === 'facebook' ? '#1877f2' : (ch.type === 'youtube' ? '#ff0000' : (ch.type === 'instagram' ? '#e1306c' : (ch.type === 'whatsapp' ? '#25d366' : '#2563eb'))));
                const btnBg = ch.type === 'telegram' || ch.type === 'telegram_group' ? 'linear-gradient(135deg, #0284c7, #0369a1)' : (ch.type === 'facebook' ? 'linear-gradient(135deg, #1877f2, #0d5cb6)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)');
                return `
                    <div class="channel-card" style="background: white; border-radius: 18px; padding: 22px; border: 1.5px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.04); display: flex; flex-direction: column; justify-content: space-between; gap: 16px; transition: transform 0.2s, box-shadow 0.2s;" onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 12px 30px rgba(0,0,0,0.08)'" onmouseleave="this.style.transform='none'; this.style.boxShadow='0 4px 20px rgba(0,0,0,0.04)'">
                        <div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                                <div style="width: 50px; height: 50px; background: #f0f9ff; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.6rem; color: ${iconColor}; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #e0f2fe;">
                                    <i class="${ch.icon || 'fas fa-bullhorn'}"></i>
                                </div>
                                <span style="background: #f1f5f9; color: #475569; font-size: 0.75rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; border: 1px solid #e2e8f0;">
                                    ${escapeHtml(ch.badge || 'رابط رسمي')}
                                </span>
                            </div>
                            <h4 style="margin: 0 0 6px 0; font-size: 1.1rem; color: #0f172a; font-weight: 800;">${escapeHtml(ch.name || 'قناة')}</h4>
                            <p style="margin: 0; font-size: 0.88rem; color: #64748b; line-height: 1.6;">${escapeHtml(ch.description || '')}</p>
                        </div>
                        <div>
                            <a href="${escapeHtml(ch.url)}" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; box-sizing: border-box; background: ${btnBg}; color: white; padding: 12px 18px; border-radius: 12px; font-weight: 800; font-size: 0.92rem; text-decoration: none; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.25); transition: opacity 0.2s;">
                                <i class="${ch.icon || 'fas fa-external-link-alt'}"></i>
                                <span>${escapeHtml(ch.btn_text || 'انضمام الآن')}</span>
                            </a>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error('Error loading community channels:', e);
            grid.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">تعذر تحميل القنوات حالياً</div>';
        }
    }
    window.loadCommunityChannels = loadCommunityChannels;

    function quickAskStudentAi(query) {
        const input = document.getElementById('studentProfileAiInput');
        if (input) {
            input.value = query;
            sendProfileAiMessage('student');
        }
    }
    window.quickAskStudentAi = quickAskStudentAi;

    function clearProfileAiMessages(role) {
        const messagesBox = document.getElementById('studentProfileAiMessages');
        if (messagesBox) {
            messagesBox.innerHTML = `
                <div style="background: rgba(255,255,255,0.06); border-radius: 14px; padding: 14px; border: 1px solid rgba(255,255,255,0.1); color: #e2e8f0; font-size: 0.9rem; line-height: 1.6;">
                    <div style="font-weight: 800; color: #38bdf8; margin-bottom: 4px;">مرحباً بك يا بطل! 👋</div>
                    أنا <strong>المساعد الذكي لمنصة ZoomDz</strong>، هنا لمساعدتك في كل ما يخص رحلتك التعليمية، حضور حصص اللايف، التمارين، شحن الرصيد، والباقات. اسألني أي سؤال تريده! 🚀
                </div>
            `;
        }
    }
    window.clearProfileAiMessages = clearProfileAiMessages;

    async function sendProfileAiMessage(role) {
        const input = document.getElementById('studentProfileAiInput');
        const messagesBox = document.getElementById('studentProfileAiMessages');
        const sendBtn = document.getElementById('studentProfileAiSendBtn');
        if (!input || !messagesBox) return;

        const query = input.value.trim();
        if (!query) return;

        input.value = '';

        // Append User Message
        const userMsg = document.createElement('div');
        userMsg.style.cssText = 'background: linear-gradient(135deg, #0284c7, #0369a1); color: white; border-radius: 14px 14px 2px 14px; padding: 10px 16px; align-self: flex-start; max-width: 85%; font-size: 0.9rem; line-height: 1.55; box-shadow: 0 4px 12px rgba(2,132,199,0.25);';
        userMsg.textContent = query;
        messagesBox.appendChild(userMsg);

        // Append Loading Indicator
        const loadingMsg = document.createElement('div');
        loadingMsg.id = 'studentProfileAiLoading';
        loadingMsg.style.cssText = 'background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #e2e8f0; border-radius: 14px 14px 14px 2px; padding: 10px 16px; align-self: flex-end; max-width: 85%; font-size: 0.88rem; display: flex; align-items: center; gap: 8px;';
        loadingMsg.innerHTML = '<i class="fas fa-spinner fa-spin" style="color: #38bdf8;"></i> <span>جاري التفكير وصياغة الإجابة...</span>';
        messagesBox.appendChild(loadingMsg);
        messagesBox.scrollTop = messagesBox.scrollHeight;

        if (sendBtn) sendBtn.disabled = true;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/platform-assistant', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (token || '')
                },
                body: JSON.stringify({ prompt: query, role: 'student' })
            });
            const data = await res.json();
            const loading = document.getElementById('studentProfileAiLoading');
            if (loading) loading.remove();

            const aiMsg = document.createElement('div');
            aiMsg.style.cssText = 'background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #f1f5f9; border-radius: 14px 14px 14px 2px; padding: 12px 16px; align-self: flex-end; max-width: 85%; font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap;';
            aiMsg.textContent = data.reply || 'شكراً لسؤالك! يمكنك تصفح أقسام المنصة كغرف اللايف والتمارين من القائمة الرئيسية.';
            messagesBox.appendChild(aiMsg);
            messagesBox.scrollTop = messagesBox.scrollHeight;
        } catch (e) {
            console.error('AI error:', e);
            const loading = document.getElementById('studentProfileAiLoading');
            if (loading) loading.remove();

            const errMsg = document.createElement('div');
            errMsg.style.cssText = 'background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; border-radius: 14px; padding: 10px 14px; align-self: flex-end; font-size: 0.85rem;';
            errMsg.textContent = '❌ تعذر الاتصال بالمساعد الذكي، يرجى التحقق من اتصالك بالإنترنت.';
            messagesBox.appendChild(errMsg);
        } finally {
            if (sendBtn) sendBtn.disabled = false;
        }
    }
    window.sendProfileAiMessage = sendProfileAiMessage;

    function toggleMobileDrawer() {
        const overlay = document.getElementById('mobileDrawerOverlay');
        const drawer = document.getElementById('mobileDrawer');
        if (!overlay || !drawer) return;
        const isActive = drawer.classList.contains('active');
        if (isActive) {
            closeMobileDrawer();
        } else {
            overlay.classList.add('active');
            drawer.classList.add('active');
            if (userData) {
                const nameEl = document.getElementById('drawerName');
                const emailEl = document.getElementById('drawerEmail');
                const balanceEl = document.getElementById('drawerBalance');
                const avatarEl = document.getElementById('drawerAvatar');
                if (nameEl) nameEl.textContent = userData.full_name || 'طالب';
                if (emailEl) emailEl.textContent = userData.email || '';
                if (balanceEl) balanceEl.textContent = `${currentBalance || 0} دج`;
                if (avatarEl) setImgWithFallback(avatarEl, userData.profile_image || userData.profile_url || '/images/default-avatar.svg');
            }
        }
    }

    function closeMobileDrawer() {
        const overlay = document.getElementById('mobileDrawerOverlay');
        const drawer = document.getElementById('mobileDrawer');
        if (overlay) overlay.classList.remove('active');
        if (drawer) drawer.classList.remove('active');
    }

    // ================================================================
    // ✅ نتيجة العودة من بوابة الدفع (?status=...&txn=...)
    //    تأخر تأكيد البنك طبيعي: نفحص الحالة بعد 5 ثوانٍ ثم فحصين كل
    //    10 ثوانٍ، وعند التأكيد نضيف الرصيد (ذرّياً — لا يُضاف مرتين)
    //    ونعرض رسال نجاح — بلا رسائل فشل إطلاقاً.
    // ================================================================
    var paymentStatusPollTimer = null;

    function stopPaymentStatusPolling() {
        if (paymentStatusPollTimer) {
            clearTimeout(paymentStatusPollTimer);
            paymentStatusPollTimer = null;
        }
    }

    function schedulePaymentStatusChecks(txnId, delaysLeft) {
        const delay = delaysLeft.shift();
        paymentStatusPollTimer = setTimeout(async function () {
            paymentStatusPollTimer = null;
            let keepChecking = true;
            try {
                const res = await fetchWithAuth('/api/wallet/deposit/status/' + encodeURIComponent(txnId));
                const data = await res.json();
                if (data && data.success) {
                    if (data.status === 'success') {
                        keepChecking = false;
                        if (typeof data.balance === 'number' && data.balance !== null) {
                            syncAllBalanceDisplays(data.balance);
                        }
                        showToast('✅ تم تأكيد الدفع بنجاح — تم إضافة ' + (data.amount != null ? data.amount + ' دج' : 'المبلغ') + ' إلى رصيدك', 'success');
                        if (typeof loadTransactions === 'function') loadTransactions();
                    } else if (data.status === 'failed' || data.status === 'canceled') {
                        keepChecking = false;
                        showToast('ℹ️ لم تكتمل عملية الدفع — لم يُخصم منك أي شيء', 'info');
                    }
                }
            } catch (e) { /* خطأ مؤقت — نواصل الفحص */ }
            if (!keepChecking) return;
            if (delaysLeft.length > 0) {
                schedulePaymentStatusChecks(txnId, delaysLeft);
            } else {
                showToast('ℹ️ استغرق تأكيد الدفع وقتاً أطول من المعتاد — سيُضاف الرصيد تلقائياً فور تأكيد البنك، تحقق من قائمة المعاملات بعد قليل', 'info');
            }
        }, delay);
    }

    function startPaymentStatusPolling(txnId) {
        if (!txnId || paymentStatusPollTimer) return;
        schedulePaymentStatusChecks(txnId, [5000, 10000, 10000]); // بعد 5 ثوانٍ ثم فحصان كل 10 ثوانٍ
    }

    function handlePaymentReturnStatus(paymentStatus, txnId) {
        try {
            const s = String(paymentStatus || '').toLowerCase();
            if (s === 'paid' || s === 'completed' || s === 'success') {
                showToast('✅ تمت عملية شحن الرصيد بنجاح — تظهر العملية في قائمة المعاملات', 'success');
            } else if (s === 'canceled' || s === 'cancelled' || s === 'failed' || s === 'declined') {
                showToast('ℹ️ لم تكتمل عملية الدفع وتم إلغاؤها — لم يُخصم أي شيء', 'info');
            } else if (s === 'pending') {
                showToast('ℹ️ جاري التحقق من حالة الدفع من البنك…', 'info');
                startPaymentStatusPolling(txnId);
            } else {
                showToast('ℹ️ تعذر تأكيد نتيجة الدفع — راجع قائمة المعاملات للتأكد', 'info');
            }
            try {
                const u = new URL(window.location.href);
                u.searchParams.delete('status');
                u.searchParams.delete('txn');
                window.history.replaceState({}, '', u);
            } catch (e) {}
        } catch (e) {}
    }

    // ================================================================
    // ✅ USER DATA
    // ================================================================

    async function loadUserData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const sharedPost = urlParams.get('post');
            const sharedOffer = urlParams.get('offer');
            const sharedCourse = urlParams.get('course');
            const sharedGroup = urlParams.get('join_group') || urlParams.get('group');
            const sharedExercise = urlParams.get('exercise');
            const sharedPackage = urlParams.get('package') || urlParams.get('view_package');
            const hasShared = sharedPost || sharedOffer || sharedCourse || sharedGroup || sharedExercise || sharedPackage;

            // ✅ حالة الدفع بعد العودة من البوابة
            const paymentReturnStatus = urlParams.get('status');
            if (paymentReturnStatus) handlePaymentReturnStatus(paymentReturnStatus, urlParams.get('txn'));

            let storedData = localStorage.getItem('userData');
            let token = localStorage.getItem('token');

            if (hasShared) {
                let isValidStudent = false;
                if (storedData && token) {
                    try {
                        const parsed = JSON.parse(storedData);
                        if (parsed && parsed.role === 'student' && !parsed.is_guest && parsed.id > 0) {
                            isValidStudent = true;
                        }
                    } catch(e) {}
                }

                if (!isValidStudent) {
                    let guestToken = token;
                    try {
                        const res = await fetch('/api/guest-token/student');
                        const data = await res.json();
                        if (res.ok && data.success && data.token) {
                            guestToken = data.token;
                        }
                    } catch(err) {
                        console.error('Failed to auto login guest student', err);
                    }
                    guestToken = guestToken || 'guest_token';
                    localStorage.setItem('token', guestToken);
                    const guestObj = {
                        id: -1,
                        role: 'student',
                        full_name: 'زائر',
                        email: 'guest@zoomdz.com',
                        is_guest: true
                    };
                    localStorage.setItem('userData', JSON.stringify(guestObj));
                    storedData = JSON.stringify(guestObj);
                    token = guestToken;
                }
            }

            const isGroupPath = window.location.pathname.includes('/group/');
            if (!storedData) {
                if (hasShared || isGroupPath) {
                    const guestObj = {
                        id: -1,
                        role: 'student',
                        full_name: 'زائر',
                        email: 'guest@zoomdz.com',
                        is_guest: true
                    };
                    localStorage.setItem('token', 'guest_token');
                    localStorage.setItem('userData', JSON.stringify(guestObj));
                    storedData = JSON.stringify(guestObj);
                    token = 'guest_token';
                } else {
                    localStorage.removeItem('token');
                    localStorage.removeItem('userData');
                    window.location.href = '/';
                    return;
                }
            }

            try {
                userData = JSON.parse(storedData);
            } catch (parseError) {
                localStorage.removeItem('token');
                localStorage.removeItem('userData');
                window.location.href = '/';
                return;
            }

            const isGuest = userData && (userData.is_guest || userData.id === -1);

            if (isGuest) {
                authToken = token || 'guest_token';
                studentId = -1;
                updateUI();
                return;
            }

            if (!isGuest && (checkAndHandleAutoLogout() || !token)) {
                localStorage.removeItem('token');
                localStorage.removeItem('userData');
                window.location.href = '/';
                return;
            }

            authToken = token;
            studentId = userData.id;

            if (!studentId || !authToken) {
                localStorage.removeItem('token');
                localStorage.removeItem('userData');
                window.location.href = '/';
                return;
            }

            try {
                await getCsrfToken();
            } catch(csrfErr) {}

            try {
                const res = await fetchWithAuth('/api/student/me');
                if (!res.ok) {
                    if (res.status === 401 || res.status === 403) {
                        if (hasShared) {
                            const guestObj = {
                                id: -1,
                                role: 'student',
                                full_name: 'زائر',
                                email: 'guest@zoomdz.com',
                                is_guest: true
                            };
                            userData = guestObj;
                            studentId = -1;
                            authToken = 'guest_token';
                            localStorage.setItem('token', authToken);
                            localStorage.setItem('userData', JSON.stringify(guestObj));
                            updateUI();
                            return;
                        }
                        localStorage.removeItem('token');
                        localStorage.removeItem('userData');
                        window.location.href = '/';
                        return;
                    }
                    return;
                }

                const data = await res.json();
                const studentData = data.student || data;

                if (!data.error && studentData.id) {
                    studentData.role = 'student';
                    userData = studentData;
                    studentId = studentData.id;
                    localStorage.setItem('userData', JSON.stringify(studentData));
                    updateUI();
                }
            } catch (e) {
                if (e.message === 'انتهت صلاحية الجلسة') window.location.href = '/';
            }

            if (!hasShared) {
                Promise.all([
                    loadWallet(),
                    loadNotifications(),
                    loadReferralData()
                ]).catch(() => {});
            } else if (sharedExercise) {
                showSection('exercises');
            }
        } catch(e) {
            if (e.message === 'انتهت صلاحية الجلسة') window.location.href = '/';
        }
    }

    function setupGuestUI() {
        const isGuest = userData && (userData.is_guest || userData.id === -1);
        if (isGuest) {
            // Hide navbar buttons
            const profileBtn = document.getElementById('profileBtn');
            if (profileBtn) profileBtn.style.display = 'none';
            const notifBtn = document.getElementById('notifBtn');
            if (notifBtn) notifBtn.style.display = 'none';
            const navBalance = document.querySelector('.nav-balance');
            if (navBalance) navBalance.style.display = 'none';
            
            // Show guestNavButtons
            const guestNavButtons = document.getElementById('guestNavButtons');
            if (guestNavButtons) {
                guestNavButtons.style.display = 'flex';
            }

            // Hide nav tabs for private sections
            const privateSections = ['transactions', 'referral', 'messages'];
            document.querySelectorAll('.nav-tab').forEach(tab => {
                const section = tab.getAttribute('data-section');
                if (privateSections.includes(section)) {
                    tab.style.display = 'none';
                }
                const onclickAttr = tab.getAttribute('onclick') || '';
                if (onclickAttr.includes('showDepositModal')) {
                    tab.style.display = 'none';
                }
            });

            // Hide mobile drawer user details / balance / deposit
            const drawerUser = document.querySelector('.mobile-drawer-user');
            if (drawerUser) {
                const drawerName = document.getElementById('drawerName');
                if (drawerName) drawerName.textContent = 'زائر';
                const drawerEmail = document.getElementById('drawerEmail');
                if (drawerEmail) drawerEmail.textContent = 'تصفح بدون حساب';
                const drawerBalance = document.getElementById('drawerBalance');
                if (drawerBalance) drawerBalance.style.display = 'none';
                const depositBtnInDrawer = drawerUser.querySelector('button');
                if (depositBtnInDrawer) depositBtnInDrawer.style.display = 'none';
            }

            // Hide private menu items in mobile drawer
            document.querySelectorAll('.mobile-drawer-menu-item').forEach(item => {
                const onclickText = item.getAttribute('onclick') || '';
                if (onclickText.includes('transactions') || onclickText.includes('referral') || onclickText.includes('messages') || onclickText.includes('toggleNotifications') || onclickText.includes('showEditProfileModal')) {
                    item.style.display = 'none';
                }
                // Change logout to login/register for guest
                if (onclickText.includes('logout()')) {
                    item.style.background = 'var(--primary-light)';
                    item.style.borderColor = 'var(--primary-soft)';
                    item.style.color = 'var(--primary)';
                    item.setAttribute('onclick', "exitGuestAndNavigate('/?login=true')");
                    const span = item.querySelector('span');
                    if (span) span.textContent = 'تسجيل الدخول / إنشاء حساب';
                    const icon = item.querySelector('i');
                    if (icon) {
                        icon.className = 'fas fa-sign-in-alt';
                        icon.style.color = 'var(--primary)';
                    }
                }
            });
        }
    }

    function updateUI() {
        if (!userData) return;
        const userName = userData.full_name || 'طالب';
        const userImage = userData.profile_image || userData.profile_url || '/images/default-avatar.svg';

        const navName = document.getElementById('navProfileName');
        if (navName) navName.textContent = userName.split(', ')[0];
        setImgWithFallback(document.getElementById('navProfileImg'), userImage);

        const sidebarName = document.getElementById('sidebarName');
        if (sidebarName) sidebarName.textContent = userName;
        const sidebarEmail = document.getElementById('sidebarEmail');
        if (sidebarEmail) sidebarEmail.textContent = userData.email || '';
        setImgWithFallback(document.getElementById('sidebarAvatar'), userImage);

        const levelDisplay = document.getElementById('educationLevelDisplay');
        const levelText = document.getElementById('educationLevelText');
        if (userData.education_level) {
            if (levelDisplay) levelDisplay.style.display = 'inline-block';
            if (levelText) levelText.textContent = levelMap[userData.education_level] || userData.education_level;
        } else {
            if (levelDisplay) levelDisplay.style.display = 'none';
        }

        const drawerName = document.getElementById('drawerName');
        if (drawerName) drawerName.textContent = userName;
        const drawerEmail = document.getElementById('drawerEmail');
        if (drawerEmail) drawerEmail.textContent = userData.email || '';
        const drawerAvatar = document.getElementById('drawerAvatar');
        if (drawerAvatar) setImgWithFallback(drawerAvatar, userImage);

        setupGuestUI();
    }

    // ================================================================
    // ✅ WALLET
    // ================================================================

    async function loadWallet() {
        try {
            const res = await fetchWithAuth(`/api/student/balance/${studentId}`);
            const data = await res.json();
            currentBalance = data.balance || 0;
            if (typeof syncAllBalanceDisplays === 'function') {
                syncAllBalanceDisplays(currentBalance);
            } else {
                const walletAmount = document.getElementById('walletAmount');
                if (walletAmount) walletAmount.textContent = currentBalance + ' دج';
                const navBalance = document.getElementById('navBalanceAmount');
                if (navBalance) navBalance.textContent = currentBalance;
                const drawerBalance = document.getElementById('drawerBalance');
                if (drawerBalance) drawerBalance.textContent = `${currentBalance} دج`;
            }
        } catch(e) { 
            if (e.message !== 'انتهت صلاحية الجلسة') {
                console.error('خطأ في تحميل المحفظة:', e);
            }
        }
    }

    // ================================================================
    // ================================================================
    // ✅ OFFERS & LESSON STATUS HELPER
    // ================================================================

    function parseAlgeriaDate(dateStr) {
        if (!dateStr) return null;
        if (typeof dateStr === 'string') {
            const trimmed = dateStr.trim();
            if (trimmed.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(trimmed)) {
                return new Date(trimmed);
            }
            const iso = trimmed.replace(', ', 'T');
            return new Date(`${iso}+01:00`);
        }
        return new Date(dateStr);
    }

    function formatOfferDateTime(dateObjOrStr) {
        const d = parseAlgeriaDate(dateObjOrStr);
        if (!d || isNaN(d.getTime())) return 'غير محدد';
        const datePart = d.toLocaleDateString('ar-DZ', {  });
        const timePart = d.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${datePart} - الساعة ${timePart}`;
    }

    function getOfferStatus(offer) {
        const now = new Date();
        const rawStatus = (offer.offer_status || offer.status || 'upcoming').toLowerCase();
        
        const offerDate = offer.offer_date ? parseAlgeriaDate(offer.offer_date) : null;
        const durationMs = ((offer.duration || 60) * 60 * 1000);
        
        const scheduleLength = Array.isArray(offer.sessions_schedule) ? offer.sessions_schedule.length : 0;
        const totalSessions = Math.max(1, Number(offer.total_sessions) || 0, scheduleLength);
        const completedCount = Number(offer.completed_sessions_count ?? offer.completed_sessions ?? 0);
        const isMultiSessionRemaining = totalSessions > 1 && completedCount < totalSessions;

        const isAllSessionsCompleted = completedCount >= totalSessions;

        const isExpired = offerDate ? ((offerDate.getTime() + durationMs) < now.getTime() && 
                          rawStatus !== 'live' && 
                          rawStatus !== 'teacher_ready' && 
                          rawStatus !== 'paused' &&
                          !isMultiSessionRemaining) : false;

        const isExplicitlyTerminated = ['completed', 'cancelled', 'ended'].includes(rawStatus) || (!!offer.completed_at && !isMultiSessionRemaining) || !!offer.force_ended_at || offer.terminated === true || offer.completed === true || isAllSessionsCompleted;
        const isTerminated = isExplicitlyTerminated || isExpired;

        if (isTerminated) {
            return {
                text: '✅ منتهي',
                code: 'ended',
                color: '#475569',
                bg: '#f1f5f9',
                border: '#cbd5e1',
                badgeHtml: '<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-check-circle" style="color:#64748b;"></i> منتهي</span>'
            };
        } else if (offer.stream_active === true || rawStatus === 'live') {
            return {
                text: '🔴 بث مباشر',
                code: 'live',
                color: '#dc2626',
                bg: '#fef2f2',
                border: '#fca5a5',
                badgeHtml: '<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-broadcast-tower"></i> بث مباشر الآن</span>'
            };
        } else if (rawStatus === 'teacher_ready' || rawStatus === 'paused') {
            return {
                text: '🎥 جاهز للبث',
                code: 'ready',
                color: '#0284c7',
                bg: '#f0f9ff',
                border: '#bae6fd',
                badgeHtml: '<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-video"></i> جاهز للبث</span>'
            };
        } else {
            return {
                text: '⏳ قادم',
                code: 'upcoming',
                color: '#d97706',
                bg: '#fef3c7',
                border: '#fde68a',
                badgeHtml: '<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; background: #fef3c7; color: #d97706; border: 1px solid #fde68a; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-hourglass-half"></i> قادم</span>'
            };
        }
    }

    async function loadOffers(silent = false) {
        const container = document.getElementById('offersList');
        if (!silent && container) {
            container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
        }
        try {
            let myBookingsMap = {};
            if (studentId && !userData?.is_guest) {
                try {
                    const bookingsRes = await fetchWithAuth(`/api/student/sessions/${studentId}`);
                    if (bookingsRes.ok) {
                        const bookingsData = await bookingsRes.json();
                        if (Array.isArray(bookingsData)) {
                            bookingsData.forEach(b => {
                                if (b.offer_id) {
                                    myBookingsMap[b.offer_id] = b;
                                }
                            });
                        }
                    }
                } catch(e) {
                    console.warn('تعذر جلب حجوزات الطالب:', e);
                }
            }

            window.myOffersBookingsMap = myBookingsMap;

            const res = await fetch(`${API_BASE_URL}/api/offers`);
            const rawOffers = await res.json();
            
            // ✅ تصفية وتصنيف الدروس بوضوح حسب الحالة (بث مباشر -> جاهز -> قادم -> منتهي)
            let offers = (rawOffers || []).filter(offer => offer.status !== 'cancelled');
            window.latestOffersData = offers;
            offers.sort((a, b) => {
                const statusA = getOfferStatus(a).code;
                const statusB = getOfferStatus(b).code;
                const priority = { 'live': 1, 'ready': 2, 'upcoming': 3, 'ended': 4 };
                return (priority[statusA] || 9) - (priority[statusB] || 9);
            });
            
            filterStudentOffers();
            loadFreeOffersSidebar(offers);
        } catch(e) { 
            console.error('خطأ في تحميل الدروس:', e);
            if (!silent) showToast('حدث خطأ في تحميل الدروس', 'error'); 
        }
    }

    function filterStudentOffers() {
        const offers = window.latestOffersData || [];
        const bookingsMap = window.myOffersBookingsMap || {};
        const q = (document.getElementById('offerSearchInput')?.value || '').trim().toLowerCase();
        const levelVal = document.getElementById('offerLevelFilter')?.value || 'all';

        let filtered = offers;

        // 1. التصفية حسب المستوى
        if (levelVal === 'my_level' && userData && userData.education_level) {
            const studentLevel = userData.education_level;
            const middleLevels = ['1ere_am', '2eme_am', '3eme_am', '4eme_am', 'bem'];
            const primaryLevels = ['primary_1', 'primary_2', 'primary_3', 'primary_4', 'primary_5', '5eme_pri'];
            const secondaryLevels = ['1ere_as', '2eme_as', '3eme_as', 'bac'];
            const universityLevels = ['1ere_uni', '2eme_uni', '3eme_uni', 'master', 'doctorat'];

            filtered = filtered.filter(offer => {
                if (!offer.education_level || offer.education_level === '') return true;
                const oLevel = offer.education_level;
                if (studentLevel === oLevel) return true;
                if (middleLevels.includes(studentLevel) && oLevel === 'middle_all') return true;
                if (studentLevel === 'middle_all' && (middleLevels.includes(oLevel) || oLevel === 'middle_all')) return true;
                if (primaryLevels.includes(studentLevel) && oLevel === 'primary_all') return true;
                if (studentLevel === 'primary_all' && (primaryLevels.includes(oLevel) || oLevel === 'primary_all')) return true;
                if (secondaryLevels.includes(studentLevel) && oLevel === 'secondary_all') return true;
                if (studentLevel === 'secondary_all' && (secondaryLevels.includes(oLevel) || oLevel === 'secondary_all')) return true;
                if (universityLevels.includes(studentLevel) && oLevel === 'university') return true;
                if (studentLevel === 'university' && (universityLevels.includes(oLevel) || oLevel === 'university')) return true;
                return false;
            });
        } else if (levelVal !== 'all' && levelVal !== 'my_level') {
            const middleLevels = ['1ere_am', '2eme_am', '3eme_am', '4eme_am', 'bem'];
            const primaryLevels = ['primary_1', 'primary_2', 'primary_3', 'primary_4', 'primary_5', '5eme_pri'];
            const secondaryLevels = ['1ere_as', '2eme_as', '3eme_as', 'bac'];
            const universityLevels = ['1ere_uni', '2eme_uni', '3eme_uni', 'master', 'doctorat'];

            filtered = filtered.filter(offer => {
                if (!offer.education_level) return true;
                const oLevel = offer.education_level;
                if (oLevel === levelVal) return true;
                if (levelVal === 'middle_all' && (middleLevels.includes(oLevel) || oLevel === 'middle_all')) return true;
                if (levelVal === 'primary_all' && (primaryLevels.includes(oLevel) || oLevel === 'primary_all')) return true;
                if (levelVal === 'secondary_all' && (secondaryLevels.includes(oLevel) || oLevel === 'secondary_all')) return true;
                if (levelVal === 'university' && (universityLevels.includes(oLevel) || oLevel === 'university')) return true;
                if (middleLevels.includes(levelVal) && oLevel === 'middle_all') return true;
                if (primaryLevels.includes(levelVal) && oLevel === 'primary_all') return true;
                if (secondaryLevels.includes(levelVal) && oLevel === 'secondary_all') return true;
                if (universityLevels.includes(levelVal) && oLevel === 'university') return true;
                return false;
            });
        }

        // 2. البحث بعنوان الدرس، المادة، الوصف، أو اسم الأستاذ
        if (q) {
            filtered = filtered.filter(offer => {
                const title = (offer.title || offer.offer_title || offer.title_ar || offer.name || '').toLowerCase();
                const subject = (offer.subject_name || '').toLowerCase();
                const description = (offer.description || '').toLowerCase();
                const teacher = (offer.teacher_name || offer.teachers?.full_name || offer.teacher_full_name || '').toLowerCase();
                const levelName = (levelMap[offer.education_level] || offer.education_level || '').toLowerCase();
                return title.includes(q) || subject.includes(q) || description.includes(q) || teacher.includes(q) || levelName.includes(q);
            });
        }

        renderOffers(filtered, bookingsMap);
    }
    window.filterStudentOffers = filterStudentOffers;

    function renderOffers(offers, myBookingsMap = {}) {
        const container = document.getElementById('offersList');
        if (!offers || offers.length === 0) {
            const q = (document.getElementById('offerSearchInput')?.value || '').trim();
            const levelVal = document.getElementById('offerLevelFilter')?.value || 'all';
            let message = 'لا توجد دروس متاحة حالياً في المنصة';
            if (q || (levelVal !== 'all' && levelVal !== 'my_level')) {
                message = '🔍 لا توجد دروس مطابقة للبحث أو المستوى المحدد';
            } else if (levelVal === 'my_level' && userData && userData.education_level) {
                message = `لا توجد دروس متاحة لمستواك الدراسي (${levelMap[userData.education_level] || userData.education_level})`;
            }
            container.innerHTML = `<p style="text-align:center; padding:40px; color:#64748b; font-weight:700; font-size:0.95rem;">${message}</p>`;
            return;
        }
        let html = '';
        for (const offer of offers) {
            let targetOfferDate = offer.offer_date;
            if (Array.isArray(offer.sessions_schedule) && offer.sessions_schedule.length > 0) {
                const nextS = offer.sessions_schedule.find(s => s.status !== 'completed' && (s.session_date || s.date)) || offer.sessions_schedule[0];
                if (nextS && (nextS.session_date || nextS.date)) {
                    targetOfferDate = nextS.session_date || nextS.date;
                }
            }
            const offerDate = parseAlgeriaDate(targetOfferDate) || new Date();
            const isFree = offer.is_free === true || offer.is_free === 1;

            const teacherImage = offer.teacher_profile_image || '/images/default-avatar.svg';
            const statusInfo = getOfferStatus(offer);
            
            let levelDisplay = '';
            if (offer.education_level) {
                const levelName = levelMap[offer.education_level] || offer.education_level;
                levelDisplay = `<div class="offer-info"><i class="fas fa-graduation-cap"></i> المستوى: ${levelName}</div>`;
            }

            const userBooking = myBookingsMap[offer.id];
            const isBooked = !!userBooking && (userBooking.payment_status === 'paid' || userBooking.payment_status === 'pending_stream' || userBooking.is_free === true);

            let schedule = [];
            if (Array.isArray(offer.sessions_schedule)) {
                schedule = offer.sessions_schedule;
            } else if (typeof offer.sessions_schedule === 'string') {
                try { schedule = JSON.parse(offer.sessions_schedule); } catch(e) { schedule = []; }
            }
            const scheduleLength = schedule.length;
            const totalSessions = Math.max(1, Number(offer.total_sessions) || 0, scheduleLength);
            const planType = (offer.plan_type && offer.plan_type !== 'null' && offer.plan_type !== 'undefined')
                ? String(offer.plan_type)
                : (totalSessions > 1 ? '1_month' : '1_day');
            const sessionDuration = offer.duration || offer.session_duration || 60;
            const pricePerSession = isFree ? 0 : (offer.price_per_session !== undefined ? offer.price_per_session : (offer.price || 0));

            const feePerSession = isFree ? 0 : Math.round((sessionDuration / 45) * 50);
            const costPerSessionTotal = isFree ? 0 : (pricePerSession + feePerSession);
            const offerTotalCost = isFree ? 0 : (costPerSessionTotal * totalSessions);
            const canBook = (isFree || currentBalance >= offerTotalCost) && statusInfo.code !== 'ended';

            const planMap = {
                '1_day': 'حصة واحدة',
                '1_month': 'اشتراك شهري',
                '3_months': 'اشتراك 3 أشهر',
                '6_months': 'اشتراك 6 أشهر'
            };

            let actionBtnHtml = '';
            const isCancelled = !!userBooking && userBooking.payment_status === 'cancelled';

            if (isBooked && !isCancelled) {
                if (statusInfo.code === 'ended') {
                    actionBtnHtml = `<button class="book-btn" style="flex: 1; background: #64748b; color: white;" disabled><i class="fas fa-flag-checkered"></i> الدرس منتهي</button>`;
                } else if (statusInfo.code === 'live' || statusInfo.code === 'ready') {
                    actionBtnHtml = `<button class="book-btn" style="flex: 1; background: #059669; color: white; font-weight: 800; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35); display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="enterOrCheckStream(${offer.id})"><i class="fas fa-video" style="animation: pulse 1.5s infinite;"></i> دخول البث المباشر الآن</button>`;
                } else {
                    actionBtnHtml = `<button class="book-btn" style="flex: 1; background: #2563eb; color: white; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="enterOrCheckStream(${offer.id})"><i class="fas fa-check-circle"></i> تم الاشتراك - دخول البث</button>`;
                }
            } else if (isCancelled) {
                actionBtnHtml = `<button class="book-btn" style="flex: 1; background: #dc2626; color: white; font-weight: 800;" onclick="bookOffer(${offer.id}, ${isFree}, ${pricePerSession}, ${sessionDuration}, '${planType}', ${totalSessions})"><i class="fas fa-ticket-alt"></i> قم بالاشتراك (${offerTotalCost} دج)</button>`;
            } else {
                if (statusInfo.code === 'ended') {
                    actionBtnHtml = `<button class="book-btn" style="flex: 1; background: #64748b; color: white;" disabled>الدرس منتهي</button>`;
                } else if (statusInfo.code === 'live' || statusInfo.code === 'ready') {
                    if (isFree) {
                        actionBtnHtml = `<button class="book-btn" style="flex: 1; background: #059669; color: white; font-weight: 800; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35); display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="enterOrCheckStream(${offer.id})"><i class="fas fa-video" style="animation: pulse 1.5s infinite;"></i> دخول البث المباشر (مجاني)</button>`;
                    } else {
                        actionBtnHtml = `<button class="book-btn" style="flex: 1; background: #dc2626; color: white; font-weight: 800;" onclick="bookOffer(${offer.id}, ${isFree}, ${pricePerSession}, ${sessionDuration}, '${planType}', ${totalSessions}, true)" ${!canBook ? 'disabled' : ''}><i class="fas fa-video"></i> انضم للبث المباشر الآن — يُحسب وقتك الفعلي (${offerTotalCost} دج)</button>`;
                    }
                } else if (isFree) {
                    actionBtnHtml = `<button class="book-btn free" style="flex: 1;" onclick="enterOrCheckStream(${offer.id})"><i class="fas fa-gift"></i> دخول / تسجيل مجاني</button>`;
                } else if (canBook) {
                    const btnLabel = totalSessions > 1 ? `اشتراك بالخطة (${offerTotalCost} دج)` : `حجز (${offerTotalCost} دج)`;
                    actionBtnHtml = `<button class="book-btn" style="flex: 1;" onclick="bookOffer(${offer.id}, false, ${pricePerSession}, ${sessionDuration}, '${planType}', ${totalSessions})"><i class="fas fa-ticket-alt"></i> ${btnLabel}</button>`;
                } else {
                    actionBtnHtml = `<button class="book-btn" style="flex: 1;" disabled>رصيد غير كافٍ (${offerTotalCost} دج)</button>`;
                }
            }

            const isOfferCert = Boolean(offer.is_certified === true || offer.teacher_is_certified === true || offer.status === 'certified');
            const isVipTeacher = Boolean(offer.is_vip === true || offer.teacher_is_vip === true);

            let offerBadgeOverlay = '<span title="أستاذ موثق - شارة زرقاء 🔵" style="position: absolute; bottom: -2px; right: -2px; background: #2563eb; color: white; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.5rem; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(37,99,235,0.4); z-index: 2;"><i class="fas fa-check"></i></span>';
            let offerNameIcon = '<i class="fas fa-check-circle" style="font-size: 0.8rem; color: #2563eb;" title="أستاذ موثق 🔵"></i>';

            if (isVipTeacher) {
                offerBadgeOverlay = '<span title="أستاذ مرقى - التاج الذهبي 👑" style="position: absolute; bottom: -2px; right: -2px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.55rem; border: 1.5px solid white; box-shadow: 0 1px 4px rgba(217,119,6,0.4); z-index: 2;"><i class="fas fa-crown"></i></span>';
                offerNameIcon = '<i class="fas fa-crown" style="font-size: 0.8rem; color: #f59e0b;" title="التاج الذهبي 👑"></i>';
            } else if (isOfferCert) {
                offerBadgeOverlay = '<span title="أستاذ معتمد - شارة ذهبية 👑" style="position: absolute; bottom: -2px; right: -2px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.55rem; border: 1.5px solid white; box-shadow: 0 1px 4px rgba(217,119,6,0.4); z-index: 2;"><i class="fas fa-crown"></i></span>';
                offerNameIcon = '<i class="fas fa-crown" style="font-size: 0.8rem; color: #f59e0b;" title="أستاذ معتمد 👑"></i>';
            }

            const teacherOnClickAttr = offer.teacher_id ? "showTeacherProfile(" + offer.teacher_id + ")" : "";

            const planBadge = planType === '1_day'
                ? '<span style="background:#eff6ff; color:#1d4ed8; padding:3px 8px; border-radius:12px; font-size:0.72rem; font-weight:700; border:1px solid #bfdbfe;"><i class="fas fa-sun"></i> حصة واحدة</span>'
                : `<span style="background:#fdf4ff; color:#9333ea; padding:3px 8px; border-radius:12px; font-size:0.72rem; font-weight:700; border:1px solid #f0abfc;"><i class="fas fa-layer-group"></i> ${planMap[planType] || planType} (${totalSessions} حصص)</span>`;

            const vipBadgeHtml = isVipTeacher 
                ? '<span style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; border: 1px solid #d97706; margin-right: 4px; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 1px 4px rgba(217,119,6,0.3);"><i class="fas fa-crown"></i> التاج الذهبي</span>'
                : '';

            html += `
                <div class="offer-card" id="offer-card-${offer.id}" style="${isVipTeacher ? 'border: 2px solid #f59e0b; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.12);' : ''}">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 4px;">
                            <div>${statusInfo.badgeHtml} ${planBadge} ${vipBadgeHtml} ${userBooking ? '<span style="padding: 3px 8px; border-radius: 20px; font-size: 0.72rem; font-weight: 800; background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; margin-right: 4px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-check"></i> تم الاشتراك</span>' : ''}</div>
                            <div>${isFree ? '<span class="free-badge"><i class="fas fa-gift"></i> مجانية</span>' : `<span class="paid-badge"><i class="fas fa-money-bill"></i> ${offerTotalCost} دج</span>`}</div>
                        </div>

                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; cursor: pointer;" onclick="${teacherOnClickAttr}" title="عرض الملف الشخصي للأستاذ">
                            <div style="position: relative;">
                                <img src="${teacherImage}" data-original-url="${teacherImage}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: ${isOfferCert ? '2px solid #f59e0b' : '2px solid white'}; box-shadow:var(--shadow-sm); transition: transform 0.2s;" referrerpolicy="no-referrer" onerror="handleImageFallback(this)">
                                ${offerBadgeOverlay}
                            </div>
                            <div>
                                <div style="font-weight: 800; font-size: 0.9rem; color:var(--primary); display: flex; align-items: center; gap: 6px;">
                                    <span>${escapeHtml(offer.teacher_name || 'غير معروف')}</span>
                                    ${offerNameIcon}
                                </div>
                                <div style="font-size: 0.72rem; color: var(--gray-500);">${escapeHtml(offer.teacher_specialization || 'تخصص عام')}</div>
                            </div>
                        </div>

                        <div class="offer-title">${escapeHtml(offer.subject_name)}</div>
  <div class="offer-info"><i class="fas fa-calendar-alt"></i> موعد الحصة: ${formatOfferDateTime(targetOfferDate)}</div>
  <div class="offer-info"><i class="fas fa-clock"></i> مدة الحصة: ${offer.duration_minutes || offer.session_duration || sessionDuration} دقيقة</div>
  <div class="offer-info"><i class="fas fa-layer-group"></i> الخطة: ${escapeHtml(planMap[planType] || planType)} | الإجمالي: ${totalSessions} حصص</div>
  <div class="offer-info"><i class="fas fa-list-ol"></i> رقم الحصة: ${ (offer.session_number || offer.completed_sessions_count || 0) + 1 } | المكتملة: ${offer.completed_sessions ?? offer.completed_sessions_count ?? 0}</div>
  <div class="offer-info"><i class="fas fa-stopwatch"></i> المدة الفعلية: ${offer.actual_duration || 0} ثانية</div>
  <div class="offer-info"><i class="fas fa-video"></i> حالة البث: ${offer.stream_active ? '<span style="color:green">نشط</span>' : '<span style="color:red">غير نشط</span>'}</div>
  <div class="offer-info"><i class="fas fa-circle-info"></i> الحالة: ${escapeHtml(offer.status || rawStatus || 'upcoming')}</div>
                        ${levelDisplay}

                        ${!isFree ? `
                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; margin:8px 0; font-size:0.78rem; line-height:1.5;">
                                <div style="display:flex; justify-content:space-between; color:#475569;">
                                    <span>سعر الحصة للأستاذ:</span>
                                    <strong>${pricePerSession} دج</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; color:#475569;">
                                    <span>رسوم بث المنصة:</span>
                                    <strong>${feePerSession} دج (50 دج لكل 45 دقيقة)</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; color:#1e3a8a; font-weight:800; border-top:1px dashed #cbd5e1; margin-top:4px; padding-top:4px;">
                                    <span>المجموع الإجمالي (${totalSessions} ${totalSessions > 1 ? 'حصص' : 'حصة'}):</span>
                                    <span>${offerTotalCost} دج</span>
                                </div>
                            </div>
                        ` : ''}

                        ${totalSessions > 1 ? `
                            <button onclick="openStudentSessionsModal(${offer.id})" style="width:100%; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; padding:6px; border-radius:8px; font-size:0.8rem; font-weight:700; cursor:pointer; margin-bottom:8px; display:flex; align-items:center; justify-content:center; gap:6px;">
                                <i class="fas fa-calendar-days"></i> عرض جدول ومواعيد الحصص (${totalSessions} حصص)
                            </button>
                        ` : ''}

                        ${!isFree && !isBooked && currentBalance < offerTotalCost && statusInfo.code !== 'ended' ? `<div class="insufficient-balance"><i class="fas fa-exclamation-triangle"></i> رصيدك: ${currentBalance} دج (المطلوب: ${offerTotalCost} دج)</div>` : ''}
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: auto; width: 100%;">
                        ${actionBtnHtml}
                        <button onclick="shareOffer(${offer.id})" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 44px; transition: all 0.2s;" title="مشاركة">
                            <i class="fas fa-share-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;

        const urlParams = new URLSearchParams(window.location.search);
        const sharedOffer = urlParams.get('offer');
        if (sharedOffer) {
            setTimeout(() => {
                const el = document.getElementById(`offer-card-${sharedOffer}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.style.border = '3px solid var(--primary)';
                    el.style.boxShadow = '0 0 25px rgba(30, 64, 175, 0.5)';
                    showToast('📍 تم الانتقال للدرس المطلوب بنجاح', 'info');
                }
            }, 200);
        }
    }

    async function openStudentSessionsModal(offerId) {
        const modal = document.getElementById('studentSessionsScheduleModal');
        const headerEl = document.getElementById('studentSessionsModalHeader');
        const listEl = document.getElementById('studentSessionsModalList');
        if (!modal || !headerEl || !listEl) return;

        modal.style.display = 'block';
        document.getElementById('modalOverlay').style.display = 'block';
        headerEl.innerHTML = '<div style="text-align:center; color:#64748b;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل جدول الحصص...</div>';
        listEl.innerHTML = '';

        try {
            const res = await fetchWithAuth(`/api/offer/${offerId}/sessions`);
            const data = await res.json();
            if (!data.success) {
                headerEl.innerHTML = `<div style="color:#ef4444;">❌ ${data.error || 'تعذر تحميل جدول الحصص'}</div>`;
                return;
            }

            const offer = data.offer || {};
            
            // تصفية وتفادي تكرار الحصص (Deduplicate)
            const uniqueSessionsMap = new Map();
            (data.sessions || []).forEach(s => {
                if (!uniqueSessionsMap.has(s.session_number)) {
                    uniqueSessionsMap.set(s.session_number, s);
                } else {
                    const existing = uniqueSessionsMap.get(s.session_number);
                    if (s.status === 'completed' || s.is_completed) {
                        uniqueSessionsMap.set(s.session_number, s);
                    }
                }
            });
            const sessions = Array.from(uniqueSessionsMap.values()).sort((a, b) => a.session_number - b.session_number);

            let schedule = [];
            if (Array.isArray(offer.sessions_schedule)) {
                schedule = offer.sessions_schedule;
            } else if (typeof offer.sessions_schedule === 'string') {
                try { schedule = JSON.parse(offer.sessions_schedule); } catch(e) { schedule = []; }
            }
            const scheduleLength = schedule.length || sessions.length;
            const totalSessions = Math.max(1, Number(offer.total_sessions || data.total_sessions) || 0, scheduleLength);
            const planType = (offer.plan_type && offer.plan_type !== 'null' && offer.plan_type !== 'undefined')
                ? String(offer.plan_type)
                : ((data.plan_type && data.plan_type !== 'null') ? String(data.plan_type) : (totalSessions > 1 ? '1_month' : '1_day'));

            const planMap = {
                '1_day': 'يوم واحد',
                '1_month': 'اشتراك شهري',
                '3_months': 'اشتراك 3 أشهر',
                '6_months': 'اشتراك 6 أشهر'
            };

            const completedSessionsCount = Number(offer.completed_sessions_count || data.completed_sessions_count || 0);

            headerEl.innerHTML = `
                <h4 style="margin:0 0 4px 0; font-size:1.05rem; color:#1e293b; font-weight:800;">${escapeHtml(offer.subject_name)}</h4>
                <div style="font-size:0.82rem; color:#64748b;">
                    نوع الخطة: <strong>${planMap[planType] || planType}</strong> (${totalSessions} حصص) | مدة كل حصة: <strong>${offer.duration || 60} دقيقة</strong>
                </div>
            `;

            let sHtml = '';
            sessions.forEach(s => {
                const sDate = s.session_date ? new Date(s.session_date) : null;
                const formattedDate = sDate ? (sDate.toLocaleDateString('ar-DZ', {  }) + ' - ' + sDate.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', hour12: false })) : 'غير محدد';
                const isCompleted = s.status === 'completed' || s.is_completed || s.session_number <= completedSessionsCount;
                const isLive = s.status === 'live';

                sHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:${isCompleted ? '#f0fdf4' : '#ffffff'}; border:1px solid ${isCompleted ? '#bbf7d0' : '#e2e8f0'}; border-radius:10px; flex-wrap:wrap; gap:8px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:32px; height:32px; border-radius:50%; background:${isCompleted ? '#15803d' : '#2563eb'}; color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem;">
                                ${isCompleted ? '<i class="fas fa-check"></i>' : s.session_number}
                            </div>
                            <div>
                                <div style="font-weight:800; color:#1e293b; font-size:0.9rem;">الحصة رقم ${s.session_number}</div>
                                <div style="font-size:0.8rem; color:#64748b;"><i class="fas fa-calendar-day" style="color:#2563eb;"></i> ${formattedDate}</div>
                            </div>
                        </div>
                        <div>
                            ${isCompleted ? `
                                <span style="background:#dcfce7; color:#166534; font-weight:700; padding:4px 10px; border-radius:6px; font-size:0.75rem;">
                                    <i class="fas fa-check-circle"></i> مكتملة
                                </span>
                            ` : isLive ? `
                                <span style="background:#fee2e2; color:#dc2626; font-weight:700; padding:4px 10px; border-radius:6px; font-size:0.75rem; animation:pulse 1.5s infinite;">
                                    <i class="fas fa-video"></i> جارية الآن
                                </span>
                            ` : `
                                <span style="background:#f1f5f9; color:#475569; font-weight:700; padding:4px 10px; border-radius:6px; font-size:0.75rem;">
                                    <i class="fas fa-clock"></i> مبرمجة
                                </span>
                            `}
                        </div>
                    </div>
                `;
            });
            listEl.innerHTML = sHtml;
        } catch (err) {
            headerEl.innerHTML = `<div style="color:#ef4444;">❌ حدث خطأ في الاتصال: ${err.message}</div>`;
        }
    }
    window.openStudentSessionsModal = openStudentSessionsModal;

    function closeStudentSessionsModal() {
        const modal = document.getElementById('studentSessionsScheduleModal');
        if (modal) modal.style.display = 'none';
        document.getElementById('modalOverlay').style.display = 'none';
    }
    window.closeStudentSessionsModal = closeStudentSessionsModal;

    async function enterOrCheckStream(offerId) {
        if (checkGuestAction()) return;
        if (!studentId) {
            showToast('الرجاء تسجيل الدخول أولاً', 'error');
            return;
        }
        try {
            const res = await fetchWithAuth(`/api/student/stream-status/${offerId}/${studentId}`);
            const data = await res.json();
            if (data.can_join && data.stream_url) {
                const rawUrl = data.meet_url || data.stream_url;
                const isGoogleMeetOrZoom = (rawUrl && (rawUrl.includes('meet.google.com') || rawUrl.includes('zoom.us') || rawUrl.includes('zoom.com') || rawUrl.includes('live-room.html'))) || data.stream_platform === 'google_meet' || data.stream_platform === 'zoom' || data.stream_platform === 'webrtc' || data.is_free;
                if (isGoogleMeetOrZoom) {
                    let meetUrl = (rawUrl && (rawUrl.includes('meet.google.com') || rawUrl.includes('zoom.us') || rawUrl.includes('zoom.com') || rawUrl.includes('live-room.html'))) ? rawUrl : null;
                    if (!meetUrl) {
                        meetUrl = rawUrl || `/api/join-zoom/${offerId}/${studentId}`;
                    }
                    try {
                        const newWindow = window.open(meetUrl, '_blank');
                        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                            window.location.href = meetUrl;
                        }
                    } catch(e) {
                        window.location.href = meetUrl;
                    }
                    return;
                }
                joinLiveStream(offerId);
            } else if (data.is_waiting) {
                showToast('⏳ البث لم يبدأ بعد أو لم يفتح الأستاذ الغرفة، انتظر قليلاً...', 'warning');
            } else if (data.error && data.error.includes('لم تقم بحجز')) {
                const offerObj = (window.latestOffersData || []).find(o => o.id == offerId);
                if (offerObj) {
                    bookOffer(offerId, offerObj.is_free, offerObj.price_per_session || offerObj.price, offerObj.duration, offerObj.plan_type, offerObj.total_sessions);
                } else {
                    showToast(data.error, 'info');
                }
            } else {
                showToast(data.error || 'البث غير متاح حالياً', 'warning');
            }
        } catch(e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                joinLiveStream(offerId);
            }
        }
    }
    window.enterOrCheckStream = enterOrCheckStream;

    function shareOffer(offerId) {
        const shareUrl = `${window.location.origin}/offer/${offerId}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('📋 تم نسخ رابط الدرس بنجاح! يمكنك مشاركته الآن.', 'success');
        }).catch(err => {
            console.error('Failed to copy', err);
            showToast('⚠️ فشل نسخ الرابط تلقائياً، الرابط: ' + shareUrl, 'warning');
        });
    }
    window.shareOffer = shareOffer;

    async function bookOffer(offerId, isFree, pricePerSession = 0, duration = 60, planType = '1_day', totalSessions = 1, joiningLive = false) {
        if (checkGuestAction()) return;
        if (!studentId) { showToast('الرجاء تسجيل الدخول أولاً', 'warning'); return; }
        
        const platformFeePerSession = isFree ? 0 : Math.round((duration / 45) * 50);
        const costPerSession = isFree ? 0 : (pricePerSession + platformFeePerSession);
        const totalCost = isFree ? 0 : (costPerSession * totalSessions);

        if (currentBalance < totalCost) {
            showToast(`⚠️ رصيدك غير كافٍ! رصيدك: ${currentBalance} دج. الإجمالي المطلوب: ${totalCost} دج`, 'warning');
            return;
        }

        if (!isFree) {
            const planNames = {
                '1_day': 'حصة واحدة (يوم)',
                '1_month': 'اشتراك شهري (شهر)',
                '3_months': 'اشتراك 3 أشهر',
                '6_months': 'اشتراك 6 أشهر'
            };
            const planName = planNames[planType] || planType;

            if (joiningLive) {
                const lateConfirmMsg = `🔴 البث بدأ بالفعل — أنت تنضم الآن (دخول متأخر):
- الخطة: ${planName} (${totalSessions} ${totalSessions > 1 ? 'حصص' : 'حصة'})
- المبلغ المطلوب الآن: ${totalCost} دج (سعر الحصة + رسوم المنصة)

⏱️ العدالة الكاملة: يُحسب لك الوقت الفعلي من لحظة دخولك حتى نهاية البث بالضبط، ويُسترد لك تلقائياً عند نهاية البث ما لم تدرسه من سعر الحصة (رسوم المنصة ثابتة ولا تُسترد). ويُضاف للأستاذ فقط ما درسته فعلاً.

هل توافق على الانضمام وخصم ${totalCost} دج من رصيدك؟`;
                if (!confirm(lateConfirmMsg)) return;
            }

            const confirmMsg = `تفاصيل الاشتراك في البث:
- الخطة: ${planName} (${totalSessions} ${totalSessions > 1 ? 'حصص' : 'حصة'})
- سعر الحصة للأستاذ: ${pricePerSession} دج
- رسوم سيرفر البث للمنصة: ${platformFeePerSession} دج / حصة (50 دج لكل 45 دقيقة)
- المبلغ الإجمالي المطلوب: ${totalCost} دج

🔒 ضمان المنصة (Escrow): سيبقى المبلغ معلقاً بأمان في المنصة، ولن يستلمه الأستاذ إلا بعد إتمام وبث كل حصة من جدول الح ص.

هل توافق على تأكيد الاشتراك وخصم ${totalCost} دج من رصيدك؟`;
            if (!confirm(confirmMsg)) return;
        }

        showToast('⏳ جاري معالجة الاشتراك وتأمين الرصيد...', 'warning');
        try {
            const res = await fetchWithAuth('/api/booking/create', {
                method: 'POST',
                body: JSON.stringify({ offer_id: offerId, student_id: studentId })
            });
            const data = await res.json();
            if (data.success) {
                const successMsg = joiningLive
                    ? '✅ تم الحجز والانضمام إلى البث الجارٍ بنجاح! اضغط "دخول البث المباشر الآن" — يُحسب وقتك من لحظة دخولك حتى نهاية البث، ويُسترد لك تلقائياً ما لم تدرسه.'
                    : (totalSessions > 1 
                        ? `✅ تم تأكيد اشتراكك في الخطة بنجاح (${totalSessions} حصص)! تم حجز مقعدك وحفظ مستحقاتك في الضمان.`
                        : '✅ تم حجز هذا البث بنجاح، سيتم إشعارك فور انطلاق البث المباشر.');
                showToast(successMsg, 'success');
                alert(successMsg);
                loadWallet();
                loadMyBookings();
                loadOffers();
                loadNotifications();
            } else {
                if (data.insufficient_balance) {
                    showToast(` ️ رصيدك غير كافٍ! المبلغ المطلوب: ${data.needed} دج`, 'warning');
                } else {
                    showToast(data.error || 'تعذّر إتمام الحجز، حاول مرة أخرى', 'warning');
                }
            }
        } catch(e) { 
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('تعذّر الاتصال بالخادم، حاول مرة أخرى', 'warning');
            }
        }
    }
    window.bookOffer = bookOffer;

    // إعداد الإشعارات الفورية
    async function subscribeToPush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        
        // تسجيل الـ Service Worker إذا لم يكن مسجلاً
        try {
            await navigator.serviceWorker.register('/sw.js');
        } catch (e) { console.error('فشل تسجيل Service Worker:', e); }

        try {
            const registration = await navigator.serviceWorker.ready;
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return;
            
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: 'BB1Dcbh6jxa4PZCvCWX0-fq-MQD2SjeKq2uworSRnKmTRIiFhZlPsan1waIPDY3tjhxqaK_7Ww7rj2Ymmr3AF9w'
            });
            
            await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });
        } catch (err) {
            console.error('فشل الاشتراك في الإشعارات:', err);
        }
    }
    
    window.addEventListener('load', () => {
        subscribeToPush();
    });

    // ================================================================
    // ✅ TEACHERS - مع فلترة حسب المستوى الدراسي
    // ================================================================

    let allTeachersData = [];

    async function loadTeachers() {
        const container = document.getElementById('teachersList');
        if (!container) return;
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري تحميل الأساتذة...</div>';
        try {
            let rawData;
            try {
                //  المسار العام المُكاشّة30 ثانية (يقلّص استعلامات قاعدة البيانات)
                rawData = await fetchPublicData('/api/public/teachers');
            } catch (err) {
                console.warn('fetchPublicData /api/public/teachers failed, using fallback endpoint:', err);
                const res = await fetch(`${API_BASE_URL}/api/teachers`);
                rawData = await res.json();
            }
            allTeachersData = Array.isArray(rawData) ? rawData : (rawData.teachers || rawData.data || []);
            filterStudentTeachersByLevel();
        } catch(e) { 
            console.error('خطأ في تحميل الأساتذة:', e);
            container.innerHTML = '<p style="text-align:center; padding:30px; color:var(--gray-400);">حدث خطأ في تحميل الأساتذة. الرجاء إعادة المحاولة.</p>';
        }
    }

    function filterStudentTeachersByLevel() {
        const select = document.getElementById('studentTeacherLevelFilter');
        const filterVal = select ? select.value : 'all';
        let teachers = [...allTeachersData];

        if (filterVal === 'my_level' && userData && userData.education_level) {
            const studentLevel = userData.education_level;
            const middleLevels = ['1ere_am', '2eme_am', '3eme_am', '4eme_am', 'bem'];
            const primaryLevels = ['primary_1', 'primary_2', 'primary_3', 'primary_4', 'primary_5', '5eme_pri'];
            const secondaryLevels = ['1ere_as', '2eme_as', '3eme_as', 'bac'];
            const universityLevels = ['1ere_uni', '2eme_uni', '3eme_uni', 'master', 'doctorat'];

            const filtered = teachers.filter(teacher => {
                if (teacher.is_vip === true || teacher.teacher_is_vip === true) return true; // ⭐ يظهر لجميع المستويات إذا كان الأستاذ مرقى VIP
                if (!teacher.teaching_level || teacher.teaching_level === '' || teacher.teaching_level === 'other' || teacher.teaching_level === 'all') return true;
                const tLevel = teacher.teaching_level;

                if (studentLevel === tLevel) return true;

                if (middleLevels.includes(studentLevel) && (tLevel === 'middle_all' || middleLevels.includes(tLevel))) return true;
                if (studentLevel === 'middle_all' && (middleLevels.includes(tLevel) || tLevel === 'middle_all')) return true;

                if (primaryLevels.includes(studentLevel) && (tLevel === 'primary_all' || primaryLevels.includes(tLevel))) return true;
                if (studentLevel === 'primary_all' && (primaryLevels.includes(tLevel) || tLevel === 'primary_all')) return true;

                if (secondaryLevels.includes(studentLevel) && (tLevel === 'secondary_all' || secondaryLevels.includes(tLevel))) return true;
                if (studentLevel === 'secondary_all' && (secondaryLevels.includes(tLevel) || tLevel === 'secondary_all')) return true;

                if (universityLevels.includes(studentLevel) && (tLevel === 'university' || universityLevels.includes(tLevel))) return true;
                if (studentLevel === 'university' && (universityLevels.includes(tLevel) || tLevel === 'university')) return true;

                return false;
            });

            if (filtered.length > 0) {
                teachers = filtered;
            }
        }

        // فرز الأساتذة المعتمدين أولاً
        if (Array.isArray(teachers)) {
            teachers.sort((a, b) => {
                const aVip = (a.is_vip === true || a.teacher_is_vip === true) ? 1 : 0; const bVip = (b.is_vip === true || b.teacher_is_vip === true) ? 1 : 0; if (bVip !== aVip) return bVip - aVip; const aCert = (a.is_certified === true || a.status === 'certified') ? 1 : 0;
                const bCert = (b.is_certified === true || b.status === 'certified') ? 1 : 0;
                return bCert - aCert;
            });
        }
        renderTeachers(teachers);
    }
    window.filterStudentTeachersByLevel = filterStudentTeachersByLevel;

    function renderTeachers(teachers) {
        const container = document.getElementById('teachersList');
        if (!teachers || teachers.length === 0) {
            let message = 'لا يوجد أساتذة معتمدون حالياً';
            if (userData && userData.education_level) {
                message = `لا يوجد أساتذة متوافقون مع مستواك الدراسي (${levelMap[userData.education_level] || userData.education_level})`;
            }
            container.innerHTML = `<p style="text-align:center; padding:30px; color:var(--gray-400);">${message}</p>`;
            return;
        }
        let html = '';
        for (const teacher of teachers) {
            const teacherImage = getValidImageUrl(teacher.profile_image, teacher.full_name, 80);
            
            let levelDisplay = '';
            if (teacher.teaching_level) {
                const levelName = levelMap[teacher.teaching_level] || teacher.teaching_level;
                levelDisplay = `<div style="font-size:0.75rem; color:var(--primary); font-weight:700; margin-top:4px;"><i class="fas fa-graduation-cap"></i> ${levelName}</div>`;
            }

            // حساب التقييم
            let starsHtml = '';
            const avgRating = teacher.avg_rating || 0;
            const ratingsCount = teacher.ratings_count || 0;
            if (ratingsCount > 0) {
                starsHtml = `
                    <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin: 4px 0; color: #eab308; font-size: 0.82rem; font-weight: 800;">
                        <i class="fas fa-star" style="color:#eab308;"></i>
                        <span>${avgRating} (${ratingsCount} تقييم)</span>
                    </div>
                `;
            } else {
                starsHtml = `
                    <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin: 4px 0; color: var(--gray-400); font-size: 0.82rem; font-weight: 700;">
                        <i class="far fa-star"></i>
                        <span style="color:#94a3b8;">أستاذ معتمد</span>
                    </div>
                `;
            }
            
            const isTeacherCert = Boolean(teacher.is_certified === true || teacher.status === 'certified');
            const isTeacherVip = Boolean(teacher.is_vip === true);

            let tAvatarOverlay = '<span title="أستاذ موثق - شارة زرقاء 🔵" style="position: absolute; bottom: 0; right: 0; background: #2563eb; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; border: 2px solid white; box-shadow: 0 2px 5px rgba(37,99,235,0.4); z-index: 2;"><i class="fas fa-check"></i></span>';
            let tNameBadge = '<i class="fas fa-check-circle" style="font-size: 0.85rem; color: #2563eb;" title="أستاذ موثق 🔵"></i>';

            if (isTeacherVip) {
                tAvatarOverlay = '<span title="أستاذ مرقى - التاج الذهبي 👑" style="position: absolute; bottom: 0; right: 0; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; border: 2px solid white; box-shadow: 0 2px 6px rgba(217, 119, 6, 0.4); z-index: 2;"><i class="fas fa-crown"></i></span>';
                tNameBadge = '<i class="fas fa-crown" style="font-size: 0.85rem; color: #f59e0b;" title="التاج الذهبي 👑"></i>';
            } else if (isTeacherCert) {
                tAvatarOverlay = '<span title="أستاذ معتمد - شارة ذهبية 👑" style="position: absolute; bottom: 0; right: 0; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; border: 2px solid white; box-shadow: 0 2px 6px rgba(217, 119, 6, 0.4); z-index: 2;"><i class="fas fa-crown"></i></span>';
                tNameBadge = '<i class="fas fa-crown" style="font-size: 0.85rem; color: #f59e0b;" title="أستاذ معتمد 👑"></i>';
            }

            const vipTagHtml = isTeacherVip 
                ? '<div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 5px rgba(217,119,6,0.3); margin-bottom: 12px;"><i class="fas fa-crown"></i> التاج الذهبي VIP</div>'
                : '';
            const teacherBioHtml = teacher.bio
                ? '<div style="font-size:0.75rem; color:#64748b; margin-top:8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">' + escapeHtml(teacher.bio) + '</div>'
                : '';

            html += `
                <div class="teacher-card" onclick="showTeacherProfile(${teacher.id})" style="background: white; border-radius: 16px; padding: 20px; border: ${isTeacherVip ? '2.5px solid #f59e0b' : '1px solid #e2e8f0'}; box-shadow: ${isTeacherVip ? '0 6px 16px rgba(245, 158, 11, 0.15)' : '0 4px 12px rgba(0,0,0,0.03)'}; transition: transform 0.2s; display: flex; flex-direction: column; justify-content: space-between;">
                    <div style="text-align: center;">
                        ${vipTagHtml}
                        <div style="position: relative; display: inline-block; margin-bottom: 8px;">
                            <img src="${teacherImage}" data-original-url="${teacherImage}" class="teacher-avatar" referrerpolicy="no-referrer" onerror="handleImageFallback(this)" style="width: 68px; height: 68px; border-radius: 50%; object-fit: cover; border: ${isTeacherVip ? '3px solid #f59e0b' : isTeacherCert ? '3px solid #f59e0b' : '2px solid #2563eb'}; box-shadow: ${isTeacherVip || isTeacherCert ? '0 0 12px rgba(245, 158, 11, 0.4)' : '0 2px 8px rgba(37,99,235,0.2)'};">
                            ${tAvatarOverlay}
                        </div>
                        <div class="teacher-name" style="font-weight: 800; font-size: 1rem; color: #1e293b; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            <span>${escapeHtml(teacher.full_name || 'أستاذ')}</span>
                            ${tNameBadge}
                        </div>
                        ${starsHtml}
                        <div class="teacher-specialty" style="font-size: 0.82rem; color: #64748b; margin-top: 4px;"><i class="fas fa-book" style="color: var(--primary); margin-left:4px;"></i> ${escapeHtml(teacher.specialization || 'تخصص عام')}</div>
                        <div class="teacher-specialty" style="font-size: 0.8rem; color: #64748b; margin-top: 2px;"><i class="fas fa-briefcase" style="color: var(--primary); margin-left:4px;"></i> ${teacher.experience || '0'} سنة خبرة</div>
                        ${levelDisplay}
                        ${teacherBioHtml}
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 14px;">
                        <button onclick="event.stopPropagation(); showTeacherProfile(${teacher.id})" style="flex: 1; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; padding: 8px; border-radius: 10px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <i class="fas fa-eye"></i> الملف
                        </button>
                        <button onclick="event.stopPropagation(); startChatWithTeacher(${teacher.id}, '${escapeHtml(teacher.full_name || 'أستاذ')}', '${teacherImage}')" style="flex: 1; background: var(--primary); color: white; border: none; padding: 8px; border-radius: 10px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <i class="fas fa-envelope"></i> مراسلة
                        </button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    // ================================================================
    // ✅ TEACHER PROFILE
    // ================================================================

    
    function closeTeacherProfileModal() {
        const modal = document.getElementById('teacherProfileModal');
        if (modal) modal.style.display = 'none';
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.style.display = 'none';
    }
    window.closeTeacherProfileModal = closeTeacherProfileModal;

    async function showTeacherProfile(teacherId) {
        try {
            const modalBody = document.getElementById('teacherModalBody');
            if (modalBody) {
                modalBody.innerHTML = `<div style="text-align:center; padding:35px; color:#6b7280;"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;">جاري تحميل بيانات الأستاذ...</p></div>`;
            }
            document.getElementById('modalOverlay').style.display = 'block';
            document.getElementById('teacherProfileModal').style.display = 'block';

            let res;
            try {
                res = await fetchWithAuth(`/api/public/teacher/${teacherId}`);
            } catch (authErr) {
                console.warn('fetchWithAuth failed for teacher profile, fallback to fetch:', authErr);
                res = await fetch(`${API_BASE_URL}/api/public/teacher/${teacherId}`);
            }
            if (!res || !res.ok) {
                res = await fetch(`${API_BASE_URL}/api/public/teacher/${teacherId}`);
            }
            const data = await res.json();
            const t = data.teacher || (data && data.id ? data : null);

            if (t && t.full_name) {
                const img = t.profile_image || '/images/default-avatar.svg';
                
                let studentExistingRating = 0;
                let studentExistingReview = '';
                if (t.ratings && Array.isArray(t.ratings) && typeof studentId !== 'undefined') {
                    const myRating = t.ratings.find(r => r.student_id === studentId);
                    if (myRating) {
                        studentExistingRating = myRating.rating;
                        studentExistingReview = myRating.review || '';
                    }
                }

                let socialHtml = '';
                const socialLinks = [
                    { url: t.facebook_url, icon: 'fab fa-facebook', color: '#1877f2', name: 'Facebook' },
                    { url: t.instagram_url, icon: 'fab fa-instagram', color: '#e4405f', name: 'Instagram' },
                    { url: t.linkedin_url, icon: 'fab fa-linkedin-in', color: '#0a66c2', name: 'LinkedIn' },
                    { url: t.youtube_url, icon: 'fab fa-youtube', color: '#ff0000', name: 'YouTube' },
                    { url: t.twitter_url, icon: 'fab fa-x-twitter', color: '#000000', name: 'X' },
                    { url: t.website_url, icon: 'fas fa-globe', color: 'var(--primary)', name: 'Website' },
                ];
                
                const activeLinks = socialLinks.filter(l => l.url && l.url.trim());
                if (activeLinks.length > 0) {
                    socialHtml = activeLinks.map(l => `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" style="color:${l.color}; background:#f8fafc; border:1px solid #e2e8f0; width:38px; height:38px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:1.1rem; transition:transform 0.2s;" title="${l.name}"><i class="${l.icon}"></i></a>`).join('');
                }
                
                let teachingLevelDisplay = '';
                if (t.teaching_level) {
                    teachingLevelDisplay = levelMap[t.teaching_level] || t.teaching_level;
                }

                let starSelectorHtml = '';
                for (let i = 1; i <= 5; i++) {
                    const isStarred = i <= studentExistingRating;
                    const starClass = isStarred ? 'fas' : 'far';
                    const starColor = isStarred ? '#f59e0b' : '#cbd5e1';
                    starSelectorHtml += `<i class="rating-star ${starClass} fa-star" data-value="${i}" onclick="setRatingValue(${i})" style="font-size: 1.8rem; color: ${starColor}; cursor: pointer; transition: transform 0.2s; margin: 0 4px;"></i>`;
                }

                modalBody.innerHTML = `
                    <div style="text-align: center;">
                        <!-- Banner -->
                        <div style="position:relative; background:linear-gradient(135deg, var(--primary) 0%, #4f46e5 100%); height:110px;">
                            ${(() => {
                            const isCertModal = Boolean(t.is_certified === true || t.status === 'certified');
                            const isVipModal = Boolean(t.is_vip === true || t.teacher_is_vip === true);

                            let modalBadgeOverlay = '<span title="أستاذ موثق - شارة زرقاء 🔵" style="position: absolute; bottom: 0; right: 0; background: #2563eb; color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; border: 3px solid white; box-shadow: 0 2px 5px rgba(37, 99, 235, 0.4); z-index: 2;"><i class="fas fa-check"></i></span>';
                            let modalNameIcon = '<i class="fas fa-check-circle" style="font-size: 1.1rem; color: #2563eb;" title="أستاذ موثق (شارة زرقاء) 🔵"></i>';

                            if (isVipModal) {
                                modalBadgeOverlay = '<span title="أستاذ مرقى - التاج الذهبي 👑" style="position: absolute; bottom: 0; right: 0; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; border: 3px solid white; box-shadow: 0 2px 6px rgba(217, 119, 6, 0.5); z-index: 2;"><i class="fas fa-crown"></i></span>';
                                modalNameIcon = '<i class="fas fa-crown" style="font-size: 1.1rem; color: #f59e0b;" title="التاج الذهبي 👑"></i>';
                            } else if (isCertModal) {
                                modalBadgeOverlay = '<span title="أستاذ معتمد - شارة ذهبية 👑" style="position: absolute; bottom: 0; right: 0; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; border: 3px solid white; box-shadow: 0 2px 6px rgba(217, 119, 6, 0.5); z-index: 2;"><i class="fas fa-crown"></i></span>';
                                modalNameIcon = '<i class="fas fa-crown" style="font-size: 1.1rem; color: #f59e0b;" title="أستاذ معتمد (شارة ذهبية) 👑"></i>';
                            }

                            const borderStyle = isVipModal || isCertModal ? '4px solid #f59e0b' : '4px solid #2563eb';
                            const shadowStyle = isVipModal || isCertModal ? '0 4px 15px rgba(245, 158, 11, 0.4)' : '0 4px 15px rgba(0,0,0,0.15)';

                            return `<div style="position:absolute; bottom:-45px; left:50%; transform:translateX(-50%);">
                                <div style="position: relative; display: inline-block;">
                                    <img src="${escapeHtml(img)}" alt="avatar" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: ${borderStyle}; box-shadow: ${shadowStyle};" referrerpolicy="no-referrer" onerror="this.src='/images/default-avatar.svg'">
                                    ${modalBadgeOverlay}
                                </div>
                            </div>
                        </div>
                        <div style="padding: 52px 20px 0 20px;">
                            ${isVipModal ? '<div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 5px rgba(217,119,6,0.3); margin-bottom: 8px;"><i class="fas fa-crown"></i> التاج الذهبي VIP</div>' : ''}
                            <h3 style="font-weight: 850; color: #1e293b; font-size: 1.35rem; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                <span>${escapeHtml(t.full_name)}</span>
                                ${modalNameIcon}
                            </h3>`;
                        })()}
                            <div style="color: var(--primary); font-weight: 700; font-size: 0.92rem; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                                <i class="fas fa-book-open"></i>
                                <span>${escapeHtml(t.specialization || 'تخصص عام')}</span>
                            </div>

                            <!-- Rating Stars in Header -->
                            <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 12px; font-size: 0.85rem; color: #f59e0b;">
                                ${getStarsHtml(t.avg_rating || 0)}
                                <span style="color: #64748b; font-weight: 700; margin-right: 4px;">${t.avg_rating ? t.avg_rating.toFixed(1) : '0.0'} (${t.ratings_count || 0} تقييم)</span>
                            </div>

                            <!-- Action Buttons -->
                            <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap;">
                                <button class="follow-btn-${t.id}" onclick="toggleFollowTeacher(${t.id})" style="${t.is_following ? 'background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;' : 'background: var(--primary); color: white; border: none;'} padding: 8px 20px; border-radius: 25px; font-weight: 800; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s;">
                                    <i class="fas ${t.is_following ? 'fa-check-circle' : 'fa-user-plus'}"></i> <span>${t.is_following ? 'تتابعه' : 'متابعة'}</span>
                                </button>
                                <button onclick="closeTeacherProfileModal(); startChatWithTeacher(${t.id}, '${escapeHtml(t.full_name)}', '${escapeHtml(img)}'); showSection('messages');" style="background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; padding: 8px 20px; border-radius: 25px; font-weight: 800; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s;">
                                    <i class="fas fa-paper-plane" style="color: var(--primary);"></i> مراسلة
                                </button>
                                <button onclick="openReportModal('teacher', ${t.id}, '${escapeHtml(t.full_name)}')" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 8px 18px; border-radius: 25px; font-weight: 800; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;" title="إبلاغ عن الأستاذ">
                                    <i class="fas fa-flag"></i> إبلاغ
                                </button>
                            </div>

                            <!-- Custom Tabs -->
                            <div style="display: flex; border-bottom: 1px solid #f1f5f9; margin: 0 -20px; padding: 0 20px;">
                                <button onclick="switchTeacherProfileTab('info')" id="teacher-tab-info" style="flex: 1; padding: 12px; border: none; background: none; font-weight: 800; font-size: 0.9rem; color: var(--primary); border-bottom: 3px solid var(--primary); cursor: pointer; transition: 0.2s;">
                                    <i class="fas fa-info-circle" style="margin-left: 6px;"></i> معلومات
                                </button>
                                <button onclick="switchTeacherProfileTab('posts', ${t.id})" id="teacher-tab-posts" style="flex: 1; padding: 12px; border: none; background: none; font-weight: 700; font-size: 0.9rem; color: #64748b; border-bottom: 3px solid transparent; cursor: pointer; transition: 0.2s;">
                                    <i class="fas fa-newspaper" style="margin-left: 6px;"></i> المنشورات
                                </button>
                                <button onclick="switchTeacherProfileTab('ratings', ${t.id})" id="teacher-tab-ratings" style="flex: 1; padding: 12px; border: none; background: none; font-weight: 700; font-size: 0.9rem; color: #64748b; border-bottom: 3px solid transparent; cursor: pointer; transition: 0.2s;">
                                    <i class="fas fa-star" style="margin-left: 6px;"></i> التقييمات (${t.ratings_count || 0})
                                </button>
                            </div>
                        </div>

                        <div id="teacher-profile-content" style="padding: 20px; text-align: right; background: #fcfcfc; min-height: 200px;">
                            <!-- Tab Content: Info (Default) -->
                            <div id="teacher-content-info">
                                ${teachingLevelDisplay ? `
                                    <div style="display: inline-flex; align-items: center; gap: 6px; background: #eef2ff; color: #4338ca; padding: 4px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; margin-bottom: 16px; border: 1px solid #c7d2fe;">
                                        <i class="fas fa-graduation-cap"></i> ${escapeHtml(teachingLevelDisplay)}
                                    </div>
                                ` : ''}

                                <!-- Stats Row -->
                                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: white; padding: 14px; border-radius: 16px; border: 1px solid #f1f5f9; margin-bottom: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                                    <div style="text-align: center;">
                                        <div class="follower-count-${t.id}" style="font-size: 1.1rem; font-weight: 900; color: var(--primary);">${t.followers_count || 0}</div>
                                        <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">متابع</div>
                                    </div>
                                    <div style="text-align: center; border-right: 1px solid #f1f5f9; border-left: 1px solid #f1f5f9;">
                                        <div style="font-size: 1.1rem; font-weight: 900; color: #0284c7;">${t.posts_count || 0}</div>
                                        <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">منشور</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="font-size: 1.1rem; font-weight: 900; color: #16a34a;">${t.offers_count || 0}</div>
                                        <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">درس</div>
                                    </div>
                                </div>

                                ${t.bio ? `
                                    <div style="background: white; padding: 16px; border-radius: 16px; border: 1px solid #f1f5f9; margin-bottom: 18px;">
                                        <div style="font-weight: 800; color: #1e293b; font-size: 0.9rem; margin-bottom: 8px; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; display: inline-block;">
                                            <i class="fas fa-user-tag" style="color: var(--primary); margin-left: 6px;"></i> النبذة التعريفية
                                        </div>
                                        <p style="font-size: 0.92rem; color: #4b5563; line-height: 1.7; margin: 0; text-align: justify;">${escapeHtml(t.bio)}</p>
                                    </div>
                                ` : ''}

                                <div style="background: white; padding: 16px; border-radius: 16px; border: 1px solid #f1f5f9;">
                                    <div style="font-weight: 800; color: #1e293b; font-size: 0.9rem; margin-bottom: 12px;">
                                        <i class="fas fa-share-nodes" style="color: var(--primary); margin-left: 6px;"></i> قنوات التواصل
                                    </div>
                                    <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
                                        ${socialHtml || '<p style="text-align:center; color:#94a3b8; font-size:0.85rem;">لا توجد روابط تواصل اجتماعي متوفرة</p>'}
                                    </div>
                                </div>
                            </div>

                            <!-- Tab Content: Posts (Hidden by default) -->
                            <div id="teacher-content-posts" style="display: none;">
                                <div id="teacher-profile-posts-list" style="text-align: center; padding: 20px;">
                                    <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary);"></i>
                                    <p style="margin-top: 10px; color: #64748b;">جاري تحميل المنشورات...</p>
                                </div>
                            </div>

                            <!-- Tab Content: Ratings (Hidden by default) -->
                            <div id="teacher-content-ratings" style="display: none;">
                                <!-- Add/Edit Rating Form -->
                                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px; text-align: right;">
                                    <h4 style="font-size: 0.95rem; font-weight: 800; color: #1e293b; margin: 0 0 12px 0;">أضف أو عدّل تقييمك للأستاذ</h4>
                                    
                                    <!-- Stars Input Selector -->
                                    <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px; direction: ltr;">
                                        ${starSelectorHtml}
                                    </div>
                                    <input type="hidden" id="student-rating-score" value="${studentExistingRating}">

                                    <!-- Comment textarea -->
                                    <textarea id="student-rating-review" placeholder="اكتب مراجعتك أو رأيك الصادق في الأستاذ هنا لمساعدة الطلاب الآخرين..." style="width: 100%; height: 80px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font-family: 'Cairo', sans-serif; font-size: 0.85rem; resize: none; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='#cbd5e1'">${escapeHtml(studentExistingReview)}</textarea>
                                    
                                    <button onclick="submitTeacherRating(${t.id})" style="background: var(--primary); color: white; border: none; padding: 8px 18px; border-radius: 8px; font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 0.85rem; cursor: pointer; margin-top: 10px; display: block; width: 100%; text-align: center; transition: background 0.2s;">
                                        <i class="fas fa-paper-plane" style="margin-left: 6px;"></i> إرس ل التقييم
                                    </button>
                                </div>

                                <!-- Reviews List -->
                                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                                    <h4 style="font-size: 0.95rem; font-weight: 800; color: #1e293b; margin: 0 0 12px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">مر جعات الطلاب (${t.ratings_count || 0})</h4>
                                    <div id="teacher-profile-reviews-list">
                                        ${renderReviewsListHtml(t.ratings)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>`;
            } else {
                if (modalBody) modalBody.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">الأستاذ غير موجود</div>`;
            }
        } catch(e) {
            console.error('Error loading teacher profile:', e);
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ أثناء تحميل بروفايل الأستاذ', 'error');
            }
        }
    }

    function switchTeacherProfileTab(tab, tId) {
        const infoBtn = document.getElementById('teacher-tab-info');
        const postsBtn = document.getElementById('teacher-tab-posts');
        const ratingsBtn = document.getElementById('teacher-tab-ratings');
        const infoContent = document.getElementById('teacher-content-info');
        const postsContent = document.getElementById('teacher-content-posts');
        const ratingsContent = document.getElementById('teacher-content-ratings');
        
        if (!infoBtn || !postsBtn || !infoContent || !postsContent) return;

        const btns = [infoBtn, postsBtn, ratingsBtn].filter(Boolean);
        const contents = [infoContent, postsContent, ratingsContent].filter(Boolean);

        btns.forEach(btn => {
            btn.style.color = '#64748b';
            btn.style.borderBottom = '3px solid transparent';
            btn.style.fontWeight = '700';
        });
        contents.forEach(c => c.style.display = 'none');

        if (tab === 'info') {
            infoBtn.style.color = 'var(--primary)';
            infoBtn.style.borderBottom = '3px solid var(--primary)';
            infoBtn.style.fontWeight = '800';
            infoContent.style.display = 'block';
        } else if (tab === 'posts') {
            postsBtn.style.color = 'var(--primary)';
            postsBtn.style.borderBottom = '3px solid var(--primary)';
            postsBtn.style.fontWeight = '800';
            postsContent.style.display = 'block';
            if (tId) loadTeacherProfilePosts(tId);
        } else if (tab === 'ratings') {
            if (ratingsBtn && ratingsContent) {
                ratingsBtn.style.color = 'var(--primary)';
                ratingsBtn.style.borderBottom = '3px solid var(--primary)';
                ratingsBtn.style.fontWeight = '800';
                ratingsContent.style.display = 'block';
            }
        }
    }
    window.switchTeacherProfileTab = switchTeacherProfileTab;

    function scrollTabs(direction) {
        const navTabs = document.getElementById('navTabs');
        if (!navTabs) return;
        const scrollAmount = 180;
        if (direction === 'left') {
            navTabs.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        } else {
            navTabs.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    }

    function scrollBottomNav(direction) {
        const nav = document.getElementById('mobileBottomNav') || document.querySelector('.mobile-bottom-nav');
        if (!nav) return;
        const scrollAmount = 180;
        if (direction === 'left') {
            nav.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        } else {
            nav.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    }

    function getStarsHtml(rating) {
        let stars = '';
        const fullStars = Math.floor(rating);
        const halfStar = rating % 1 >= 0.5 ? 1 : 0;
        const emptyStars = 5 - fullStars - halfStar;
        
        for (let i = 0; i < fullStars; i++) {
            stars += '<i class="fas fa-star" style="color: #f59e0b; margin-left: 2px;"></i>';
        }
        if (halfStar) {
            stars += '<i class="fas fa-star-half-alt" style="color: #f59e0b; margin-left: 2px;"></i>';
        }
        for (let i = 0; i < emptyStars; i++) {
            stars += '<i class="far fa-star" style="color: #cbd5e1; margin-left: 2px;"></i>';
        }
        return stars;
    }

    function renderReviewsListHtml(ratings) {
        if (!ratings || ratings.length === 0) {
            return '<p style="text-align:center; color:#94a3b8; font-size:0.85rem; padding: 15px 0; margin:0;">لا توجد تقييمات أو مراجعات متوفرة حالياً لهذا الأستاذ</p>';
        }
        return ratings.map(r => {
            const studentImg = r.student_image || '/images/default-avatar.svg';
            const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
            return `
                <div style="border-bottom: 1px solid #f1f5f9; padding: 12px 0; display: flex; gap: 10px; align-items: flex-start; justify-content: space-between;">
                    <div style="display: flex; gap: 10px; align-items: flex-start; text-align: right; flex: 1;">
                        <img src="${escapeHtml(studentImg)}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1px solid #f1f5f9;" referrerpolicy="no-referrer" onerror="this.src='/images/default-avatar.svg'">
                        <div style="flex: 1;">
                            <div style="font-weight: 800; font-size: 0.85rem; color: #1e293b;">${escapeHtml(r.student_name || 'طالب')}</div>
                            <div style="color: #f59e0b; font-size: 0.75rem; margin: 3px 0;">
                                ${getStarsHtml(r.rating)}
                            </div>
                            ${r.review ? `<p style="font-size: 0.82rem; color: #4b5563; margin: 4px 0 0 0; line-height: 1.5; text-align: justify; word-break: break-word;">${escapeHtml(r.review)}</p>` : ''}
                        </div>
                    </div>
                    <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600; white-space: nowrap;">${dateStr}</div>
                </div>
            `;
        }).join('');
    }

    function setRatingValue(val) {
        document.getElementById('student-rating-score').value = val;
        const stars = document.querySelectorAll('.rating-star');
        stars.forEach(star => {
            const starVal = parseInt(star.getAttribute('data-value'));
            if (starVal <= val) {
                star.classList.remove('far');
                star.classList.add('fas');
                star.style.color = '#f59e0b';
            } else {
                star.classList.remove('fas');
                star.classList.add('far');
                star.style.color = '#cbd5e1';
            }
        });
    }
    window.setRatingValue = setRatingValue;

    async function submitTeacherRating(teacherId) {
        const rating = parseInt(document.getElementById('student-rating-score').value);
        const review = document.getElementById('student-rating-review').value.trim();
        
        if (!rating || rating < 1 || rating > 5) {
            showToast('الرجاء اختيار تقييم بين 1 و 5 نجوم', 'error');
            return;
        }
        
        try {
            const res = await fetchWithAuth('/api/student/rate-teacher', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teacher_id: teacherId, rating, review })
            });
            const data = await res.json();
            if (data.success) {
                showToast('تم إرسال تقييمك بنجاح', 'success');
                // Reload profile modal to reflect changes
                showTeacherProfile(teacherId);
                // Also update the general teachers list to refresh ratings
                if (typeof loadTeachers === 'function') {
                    loadTeachers();
                }
            } else {
                showToast(data.error || 'حدث خطأ أثناء حفظ التقييم', 'error');
            }
        } catch (e) {
            console.error('Error submitting rating:', e);
            showToast('حدث خطأ أثناء الاتصال بالخادم', 'error');
        }
    }
    window.submitTeacherRating = submitTeacherRating;

    async function loadTeacherProfilePosts(tId) {
        const list = document.getElementById('teacher-profile-posts-list');
        if (!list) return;
        
        try {
            let res;
            try {
                res = await fetchWithAuth(`/api/post?teacher_id=${tId}&limit=10`);
            } catch (authErr) {
                res = await fetch(`${API_BASE_URL}/api/post?teacher_id=${tId}&limit=10`);
            }
            if (!res || !res.ok) {
                res = await fetch(`${API_BASE_URL}/api/post?teacher_id=${tId}&limit=10`);
            }
            const data = await res.json();
            const posts = Array.isArray(data) ? data : (data.posts || data.data || []);
            
            if (posts.length === 0) {
                list.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: #94a3b8;">
                        <i class="fas fa-newspaper fa-3x" style="margin-bottom: 12px; opacity: 0.3;"></i>
                        <p style="font-weight: 700;">لا توجد منشورات لهذا الأستاذ حالياً</p>
                    </div>`;
                return;
            }
            
            list.style.textAlign = 'right';
            list.innerHTML = posts.map(p => renderPostCardHtml(p, userData?.id)).join('');
        } catch (e) {
            console.error('Error loading teacher profile posts:', e);
            list.innerHTML = `<p style="color: #ef4444; text-align: center;">فشل تحميل المنشورات</p>`;
        }
    }

    async function loadStudentProfilePosts(studentId) {
        const list = document.getElementById(`studentProfilePostsList_${studentId}`);
        if (!list) return;
        try {
            const res = await fetch(`/api/posts?student_id=${studentId}`);
            const data = await res.json();
            const posts = data.posts || [];
            if (posts.length === 0) {
                list.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8; font-size:0.9rem;">لا توجد منشورات لهذا الطالب حتى الآن</div>`;
                return;
            }
            list.style.textAlign = 'right';
            list.innerHTML = posts.map(p => renderPostCardHtml(p)).join('');
        } catch(e) {
            list.innerHTML = `<p style="color:#ef4444; text-align:center;">فشل تحميل منشورات الطالب</p>`;
        }
    }

    async function showStudentProfile(studentId) {
        if (!studentId) return;
        const modal = document.getElementById('viewStudentModal');
        const overlay = document.getElementById('modalOverlay');
        const body = document.getElementById('viewStudentModalBody');
        if (!modal || !body) return;

        if (overlay) overlay.style.display = 'block';
        modal.style.display = 'block';
        body.innerHTML = `<div style="text-align:center; padding:35px; color:#6b7280;"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;">جاري تحميل بيانات الطالب...</p></div>`;

        try {
            const res = await fetchWithAuth(`/api/student/public/student/${studentId}`);
            const data = await res.json();
            if (!data.success || !data.student) {
                body.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">تعذر جلب بيانات الطالب</div>`;
                return;
            }
            const s = data.student;
            const img = s.profile_image || '/images/default-avatar.svg';
            const isFollowing = s.is_following || false;
            body.innerHTML = `
                <div style="text-align:center;">
                    <img src="${escapeHtml(img)}" alt="avatar" style="width:90px; height:90px; border-radius:50%; object-fit:cover; border:3px solid var(--primary); margin-bottom:12px; box-shadow:0 4px 14px rgba(0,0,0,0.1);" referrerpolicy="no-referrer" onerror="this.src='/images/default-avatar.svg'">
                    <h3 style="font-weight:800; color:#1f2937; margin-bottom:4px; font-size:1.2rem;">${escapeHtml(s.full_name || 'طالب')}</h3>
                    <div class="student-followers-count-${s.id}" style="color:var(--primary); font-weight:700; font-size:0.9rem; margin-bottom:12px;"><i class="fas fa-user-graduate"></i> طالب بالمنصة (${s.followers_count || 0} متابع)</div>
                    ${s.education_level ? `<div style="font-size:0.88rem; color:#4b5563; background:#f8fafc; padding:10px 14px; border-radius:12px; display:inline-block; margin-bottom:16px; border:1px solid #e2e8f0;"><i class="fas fa-graduation-cap" style="color:var(--primary);"></i> <strong>المستوى التعليمي:</strong> ${escapeHtml(s.education_level)}</div>` : ''}
                    <div style="display:flex; gap:10px; justify-content:center; margin-top:8px; margin-bottom:20px; flex-wrap:wrap;">
                        <button onclick="document.getElementById('viewStudentModal').style.display='none'; if(document.getElementById('modalOverlay')) document.getElementById('modalOverlay').style.display='none'; startChatWithStudent(${s.id}, '${escapeHtml(s.full_name)}', '${escapeHtml(img)}'); showSection('messages');" style="background:var(--primary); color:white; border:none; padding:8px 22px; border-radius:20px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                            <i class="fas fa-paper-plane"></i> تواصل مع الطالب
                        </button>
                        <button class="student-follow-btn-${s.id}" onclick="toggleFollowStudent(${s.id})" style="${isFollowing ? 'background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;' : 'background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;'} padding: 8px 22px; border-radius: 20px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                            <i class="fas ${isFollowing ? 'fa-check-circle' : 'fa-user-plus'}"></i> <span>${isFollowing ? 'تتابعه' : 'متابعة'}</span>
                        </button>
                    </div>

                    <!-- STUDENT POSTS SECTION IN PROFILE -->
                    <div style="border-top:1px solid #e2e8f0; padding-top:16px; text-align:right;">
                        <h4 style="margin:0 0 12px 0; color:#1e293b; font-weight:800; font-size:1rem; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-newspaper" style="color:var(--primary);"></i> منشورات وملخصات الطالب
                        </h4>
                        <div id="studentProfilePostsList_${s.id}">
                            <div style="text-align:center; padding:20px; color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل المنشورات...</div>
                        </div>
                    </div>
                </div>`;

            loadStudentProfilePosts(s.id);
        } catch (e) {
            body.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">حدث خطأ أثناء جلب ملف الطالب</div>`;
        }
    }

    async function toggleFollowStudent(studentId) {
        try {
            const res = await fetchWithAuth('/api/student/toggle-follow', {
                method: 'POST',
                body: JSON.stringify({ student_id: studentId })
            });
            const data = await res.json();
            if (data.success) {
                const isFlw = data.is_following;
                showToast(data.message || (isFlw ? 'تمت المتابعة' : 'تم إلغاء المتابعة'), 'success');
                const btns = document.querySelectorAll(`.student-follow-btn-${studentId}`);
                btns.forEach(btn => {
                    btn.style.background = isFlw ? '#f0fdf4' : '#f1f5f9';
                    btn.style.color = isFlw ? '#166534' : '#334155';
                    btn.style.border = isFlw ? '1px solid #bbf7d0' : '1px solid #cbd5e1';
                    btn.innerHTML = `<i class="fas ${isFlw ? 'fa-check-circle' : 'fa-user-plus'}"></i> <span>${isFlw ? 'تتابعه' : 'متابعة'}</span>`;
                });
                const countEls = document.querySelectorAll(`.student-followers-count-${studentId}`);
                countEls.forEach(el => {
                    if (data.followers_count !== undefined) {
                        el.innerHTML = `<i class="fas fa-user-graduate"></i> طالب بالمنصة (${data.followers_count} متابع)`;
                    }
                });
            } else {
                showToast(data.error || 'حدث خ أ', 'error');
            }
        } catch (e) {
            console.error('Error toggling student follow:', e);
            showToast('حدث خطأ في الشبكة', 'error');
        }
    }
    window.toggleFollowStudent = toggleFollowStudent;

    var allStudentCourses = [];

    function isCourseLevelMatch(courseLevel, targetLevel) {
        if (!targetLevel || targetLevel === 'all') return true;
        if (!courseLevel) return false;
        if (courseLevel === targetLevel || courseLevel === 'other' || targetLevel === 'other') return true;

        const primaryLevels = ['primary_all', 'primary_1', 'primary_2', 'primary_3', 'primary_4', 'primary_5', '5eme_pri'];
        const middleLevels = ['middle_all', '1ere_am', '2eme_am', '3eme_am', '4eme_am', 'bem'];
        const secondaryLevels = ['secondary_all', '1ere_as', '2eme_as', '3eme_as', 'bac'];
        const uniLevels = ['university', 'uni_all', '1ere_uni', '2eme_uni', '3eme_uni', 'master', 'doctorat'];
        const vocationalLevels = ['vocational_all', 'cap', 'cmp', 'bt', 'bts', 'insfp', 'insta_uni'];

        if (targetLevel === 'vocational_all' && vocationalLevels.includes(courseLevel)) return true;
        if (courseLevel === 'vocational_all' && vocationalLevels.includes(targetLevel)) return true;

        if (targetLevel === 'primary_all' && primaryLevels.includes(courseLevel)) return true;
        if (targetLevel === 'middle_all' && middleLevels.includes(courseLevel)) return true;
        if (targetLevel === 'secondary_all' && secondaryLevels.includes(courseLevel)) return true;
        if ((targetLevel === 'university' || targetLevel === 'uni_all') && uniLevels.includes(courseLevel)) return true;

        if (courseLevel === 'primary_all' && primaryLevels.includes(targetLevel)) return true;
        if (courseLevel === 'middle_all' && middleLevels.includes(targetLevel)) return true;
        if (courseLevel === 'secondary_all' && secondaryLevels.includes(targetLevel)) return true;
        if ((courseLevel === 'university' || courseLevel === 'uni_all') && uniLevels.includes(targetLevel)) return true;

        return false;
    }

    let purchasedCourseIds = new Set();

    async function loadStudentCourses() {
        const container = document.getElementById('coursesList');
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
        try {
            const res = await fetch(`${API_BASE_URL}/api/course/public`);
            if (!res.ok) throw new Error('HTTP error!');
            const data = await res.json();
            allStudentCourses = data.courses || [];

            // جلب المشتريات الخاصة بالطالب
            try {
                const pRes = await fetchWithAuth(`${API_BASE_URL}/api/course/my-purchases`);
                if (pRes.ok) {
                    const pData = await pRes.json();
                    if (pData.success && Array.isArray(pData.purchases)) {
                        purchasedCourseIds = new Set(pData.purchases.map(id => String(id)));
                    }
                }
            } catch (pErr) {}

            const studentLevel = userData && userData.education_level;
            const levelLabel = document.getElementById('studentCourseLevelLabel');
            if (levelLabel) {
                levelLabel.textContent = studentLevel ? (levelMap[studentLevel] || studentLevel) : 'غير محدد';
            }
            filterStudentCoursesByLevel();
        } catch(e) {
            console.error('خطأ في تحميل الدورات:', e);
            showToast('حدث خطأ في تحميل الدورات', 'error');
            container.innerHTML = '<p style="text-align:center; padding:30px; color:var(--gray-400);">حدث خطأ في تحميل الدورات</p>';
        }
    }

    function filterStudentCoursesByLevel() {
        const filterEl = document.getElementById('studentCourseLevelFilter');
        const filterVal = filterEl ? filterEl.value : 'all';
        const studentLevel = userData && userData.education_level;

        let target = filterVal;
        if (filterVal === 'my_level') {
            target = studentLevel || 'all';
        }

        const filtered = allStudentCourses.filter(c => {
            if (c.teacher_is_vip === true || c.is_vip === true) return true; // ⭐ يظهر لجميع المستويات إذا كان الأستاذ مرقى VIP
            return isCourseLevelMatch(c.education_level, target);
        });
        renderStudentCourses(filtered);
    }

    function renderStudentCourses(courses) {
        const container = document.getElementById('coursesList');
        if (!courses || courses.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:30px; color:var(--gray-400);">لا توجد دورات متوفرة حالياً</p>';
            return;
        }
        let html = '<div class="courses-grid">';
        for (const c of courses) {
            const levelLabel = levelMap[c.education_level] || c.education_level || 'غير محدد';
            const isFree = c.is_free || parseFloat(c.price || 0) === 0;
            const isPurchased = isFree || purchasedCourseIds.has(String(c.id));
            const coursePrice = parseFloat(c.price || 0);
            const salesCount = Number(c.sales_count) || 0;
            const avgRating = Number(c.average_rating) || 5.0;
            const ratingsCount = Number(c.ratings_count) || 0;

            let actionAreaHtml = '';
            if (isPurchased) {
                actionAreaHtml = `
                    <a href="${escapeHtml(c.course_url)}" target="_blank" rel="noopener" style="background:#059669; color:white; padding:7px 12px; border-radius:8px; text-decoration:none; font-weight:800; display:inline-flex; align-items:center; gap:6px; font-size:0.8rem; margin-top:8px;">
                        <i class="fas fa-play-circle"></i> ${isFree ? 'مشاهدة الدورة (مجانية)' : 'مشاهدة الدورة (تم الشراء)'}
                    </a>
                    <button onclick="openRateCourseModal(${c.id}, '${escapeHtml(c.title).replace(/'/g, "\\'")}')" style="background:#fef3c7; color:#d97706; border:none; padding:7px 12px; border-radius:8px; font-weight:800; cursor:pointer; font-size:0.8rem; margin-top:8px; display:inline-flex; align-items:center; gap:6px;" title="تقييم الدورة">
                        <i class="fas fa-pencil-alt" style="color:#d97706;"></i> تقييم الدورة ✏️
                    </button>
                `;
            } else {
                actionAreaHtml = `
                    <button onclick="buyCourse(${c.id}, ${coursePrice}, '${escapeHtml(c.title).replace(/'/g, "\\'")}')" style="background:#2563eb; color:white; border:none; padding:8px 14px; border-radius:8px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:0.85rem; margin-top:8px;">
                        <i class="fas fa-shopping-cart"></i> شراء الدورة (${coursePrice} دج)
                    </button>
                `;
            }

            html += `
                <div class="course-card" id="course-card-${c.id}">
                    ${(c.thumbnail_url || c.image_url) ? `<img src="${escapeHtml(c.thumbnail_url || c.image_url)}" alt="${escapeHtml(c.title)}" style="width:100%; height:140px; object-fit:cover; border-radius:10px; margin-bottom:10px;" onerror="this.style.display='none'">` : ''}
                    <div style="display:flex; justify-content:space-between; align-items:start; gap:10px;">
                        <div style="flex:1; min-width:0;">
                            <h3 style="font-size:1rem; margin-bottom:4px; color:var(--gray-900);">${escapeHtml(c.title)}</h3>
                            <p style="font-size:0.8rem; color:var(--gray-600); margin-bottom:6px;">${parseContentWithLinks(c.description || '')}</p>
                            <p style="font-size:0.8rem; ${c.teacher_id ? 'cursor:pointer; color:var(--primary); font-weight:700;' : ''}" ${c.teacher_id ? `onclick="showTeacherProfile(${c.teacher_id})"` : ''} title="عرض الملف الشخصي للأستاذ"><strong>الأستاذ:</strong> ${escapeHtml(c.teacher_name || 'غير معروف')} ${c.teacher_id ? '<i class="fas fa-id-card" style="font-size: 0.72rem; opacity: 0.8;"></i>' : ''}</p>
                            <p style="font-size:0.8rem;"><strong>المستوى:</strong> ${escapeHtml(levelLabel)}</p>
                            <p style="font-size:0.8rem;"><strong>السعر:</strong> ${isFree ? 'مجاني' : coursePrice + ' دج'}</p>
                            
                            <!-- إحصائيات التقييم والمبيعات -->
                            <div onclick="openCourseReviewsModal(${c.id}, '${escapeHtml(c.title).replace(/'/g, "\\'")}')" style="display:flex; align-items:center; gap:12px; font-size:0.78rem; margin-top:6px; background:#f8fafc; padding:6px 10px; border-radius:8px; cursor:pointer;" title="انقر لعرض جميع مراجعات وتقييمات الطلاب">
                                <span style="color:#d97706; font-weight:800;"><i class="fas fa-star" style="color:#f59e0b;"></i> ${avgRating.toFixed(1)} (${ratingsCount} تقييم) <i class="fas fa-chevron-left" style="font-size:0.6rem; opacity:0.7;"></i></span>
                                <span style="color:#2563eb; font-weight:800;"><i class="fas fa-shopping-cart"></i> ${salesCount} مبيعات</span>
                            </div>

                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:6px;">
                                ${actionAreaHtml}
                                <a href="#" onclick="event.preventDefault(); shareCourse(${c.id})" style="color:var(--primary); text-decoration:none; font-weight:700; display:inline-flex; align-items:center; gap:4px; font-size:0.8rem; margin-top:8px;">
                                    <i class="fas fa-share-alt"></i> مشاركة
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;

        const urlParams = new URLSearchParams(window.location.search);
        const sharedCourse = urlParams.get('course');
        if (sharedCourse) {
            setTimeout(() => {
                const el = document.getElementById(`course-card-${sharedCourse}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.style.border = '3px solid var(--primary)';
                    el.style.boxShadow = '0 0 25px rgba(30, 64, 175, 0.5)';
                    showToast('📍 تم الانتقال للدورة المطلوبة بنجاح', 'info');
                }
            }, 200);
        }
    }

    async function buyCourse(courseId, price, title) {
        if (currentBalance < price) {
            showToast(`❌ رصيدك الحالي (${currentBalance} دج) غير كافٍ لشراء هذه الدورة (${price} دج)`, 'error');
            return;
        }

        if (!confirm(`هل أنت تأكد من إتمام شراء دورة "${title}" بمبلغ ${price} دج؟\n(سيتم خصم المبلغ مباشرة من محفظتك ويتم إضافة الأرباح للأستاذ بعد خصم عمولة المنصة 20%)`)) {
            return;
        }

        try {
            showToast('جاري إتمام عملية شراء الدورة...', 'info');
            const res = await fetchWithAuth(`/api/course/buy/${courseId}`, {
                method: 'POST'
            });
            const data = await res.json();
            if (!data.success) {
                showToast('❌ ' + (data.error || 'فشلت عملية الشراء'), 'error');
                return;
            }

            showToast('🎉 ' + data.message, 'success');
            if (data.course_url) {
                window.open(data.course_url, '_blank');
            }
            await loadUserData();
            await loadStudentCourses();
        } catch (err) {
            console.error('Error buying course:', err);
            showToast('حدث خطأ في الاتصال بالخادم', 'error');
        }
    }
    window.buyCourse = buyCourse;

    function shareCourse(courseId) {
        const shareUrl = `${window.location.origin}/course/${courseId}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('📋 تم نسخ رابط الدورة بنجاح! يمكنك مشاركته الآن.', 'success');
        }).catch(err => {
            console.error('Failed to copy', err);
            showToast('⚠️ فشل نسخ الرابط تلقائياً، الرابط: ' + shareUrl, 'warning');
        });
    }
    window.shareCourse = shareCourse;

    let currentCourseRatingSelected = 5;

    async function openRateCourseModal(courseId, courseTitle) {
        currentCourseRatingSelected = 5;
        try {
            const res = await fetchWithAuth(`/api/course/${courseId}/my-rating`);
            const data = await res.json();
            if (data.has_rated && data.rating) {
                showToast(`لقد قمت بتقييم هذه الدورة سابقاً بـ ${data.rating.rating} نجوم ⭐`, 'info');
                return;
            }
        } catch (e) {}

        const modalHtml = `
            <div id="rateCourseModal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.75); backdrop-filter:blur(6px); z-index:10001; display:flex; align-items:center; justify-content:center; padding:16px;">
                <div style="background:white; width:100%; max-width:480px; border-radius:20px; padding:24px; font-family:'Cairo', sans-serif; direction:rtl; text-align:center; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);">
                    <div style="width:60px; height:60px; border-radius:50%; background:#fef3c7; color:#d97706; display:flex; align-items:center; justify-content:center; font-size:28px; margin:0 auto 16px;">
                        <i class="fas fa-star"></i>
                    </div>
                    
                    <h3 style="font-size:1.2rem; font-weight:900; color:#0f172a; margin-bottom:6px;">تقييم الدورة</h3>
                    <p style="font-size:0.88rem; color:#64748b; margin-bottom:20px; line-height:1.5;">${courseTitle}</p>

                    <p style="font-size:0.85rem; font-weight:800; color:#334155; margin-bottom:10px;">اختر تقييمك (من 1 إلى 5 نجوم):</p>
                    <div id="courseRatingStarsRow" style="display:flex; justify-content:center; gap:10px; margin-bottom:20px; font-size:32px; color:#f59e0b; cursor:pointer;">
                        <i class="fas fa-star" onclick="setCourseStarRating(1)"></i>
                        <i class="fas fa-star" onclick="setCourseStarRating(2)"></i>
                        <i class="fas fa-star" onclick="setCourseStarRating(3)"></i>
                        <i class="fas fa-star" onclick="setCourseStarRating(4)"></i>
                        <i class="fas fa-star" onclick="setCourseStarRating(5)"></i>
                    </div>

                    <div style="margin-bottom:20px; text-align:right;">
                        <label style="font-size:0.82rem; font-weight:700; color:#475569; display:block; margin-bottom:6px;">رأيك أو ملاحظتك (اختياري):</label>
                        <textarea id="rateCourseReview" rows="3" placeholder="اكتب انطباعك عن الدورة..." style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:10px; font-family:'Cairo', sans-serif; font-size:0.88rem; outline:none; resize:none;"></textarea>
                    </div>

                    <div style="display:flex; gap:10px;">
                        <button onclick="document.getElementById('rateCourseModal').remove()" style="flex:1; background:#f1f5f9; color:#475569; border:none; padding:12px; border-radius:10px; font-weight:800; cursor:pointer;">إلغاء</button>
                        <button onclick="submitCourseRating(${courseId})" style="flex:1; background:linear-gradient(135deg, #d97706, #f59e0b); color:white; border:none; padding:12px; border-radius:10px; font-weight:800; cursor:pointer; box-shadow:0 4px 12px rgba(245,158,11,0.3);">إرسال التقييم</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        setCourseStarRating(5);
    }
    window.openRateCourseModal = openRateCourseModal;

    async function openCourseReviewsModal(courseId, courseTitle) {
        const modalId = 'courseReviewsModal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const modalHtml = `
            <div id="${modalId}" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.75); backdrop-filter:blur(6px); z-index:10001; display:flex; align-items:center; justify-content:center; padding:16px;">
                <div style="background:white; width:100%; max-width:560px; max-height:85vh; border-radius:20px; padding:24px; font-family:'Cairo', sans-serif; direction:rtl; text-align:right; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); display:flex; flex-direction:column;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:12px; margin-bottom:16px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:40px; height:40px; border-radius:50%; background:#fef3c7; color:#d97706; display:flex; align-items:center; justify-content:center; font-size:18px;">
                                <i class="fas fa-star"></i>
                            </div>
                            <div>
                                <h3 style="font-size:1.05rem; font-weight:900; color:#0f172a; margin:0;">تقييمات ومراجعات الدورة</h3>
                                <p style="font-size:0.8rem; color:#64748b; margin:0;">${escapeHtml(courseTitle)}</p>
                            </div>
                        </div>
                        <button onclick="document.getElementById('${modalId}').remove()" style="background:none; border:none; font-size:20px; color:#64748b; cursor:pointer;"><i class="fas fa-times"></i></button>
                    </div>

                    <div id="courseReviewsListContent" style="flex:1; overflow-y:auto; padding-right:4px;">
                        <div style="text-align:center; padding:30px; color:#6b7280;"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;">جاري تحميل المراجعات...</p></div>
                    </div>

                    <div style="border-top:1px solid #f1f5f9; padding-top:16px; margin-top:16px; text-align:center;">
                        <button onclick="document.getElementById('${modalId}').remove()" style="background:#f1f5f9; color:#475569; border:none; padding:10px 24px; border-radius:10px; font-weight:800; cursor:pointer;">إغلاق</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        try {
            const res = await fetch(`${API_BASE_URL}/api/course/${courseId}/reviews`);
            const data = await res.json();
            const listContainer = document.getElementById('courseReviewsListContent');
            if (!data.success || !data.reviews || data.reviews.length === 0) {
                listContainer.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b;"><i class="fas fa-comment-slash fa-2x" style="opacity:0.5; margin-bottom:10px;"></i><p>لا توجد مراجعات أو تقييمات لهذه الدورة حتى الآن.</p></div>';
                return;
            }

            let html = '<div style="display:flex; flex-direction:column; gap:12px;">';
            for (const r of data.reviews) {
                const dateStr = new Date(r.created_at).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric' });
                let starsHtml = '';
                for (let i = 1; i <= 5; i++) {
                    starsHtml += `<i class="fas fa-star" style="color:${i <= r.rating ? '#f59e0b' : '#cbd5e1'}; font-size:12px;"></i>`;
                }
                html += `
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <img src="${escapeHtml(r.student_image)}" alt="${escapeHtml(r.student_name)}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'">
                                <div>
                                    <h4 style="font-size:0.9rem; font-weight:800; color:#1e293b; margin:0;">${escapeHtml(r.student_name)}</h4>
                                    <span style="font-size:0.72rem; color:#64748b;">${dateStr}</span>
                                </div>
                            </div>
                            <div style="display:flex; gap:2px;">
                                ${starsHtml}
                            </div>
                        </div>
                        ${r.review ? `<p style="font-size:0.85rem; color:#334155; margin:0; line-height:1.5; background:white; padding:10px; border-radius:8px; border:1px solid #f1f5f9;">${escapeHtml(r.review)}</p>` : ''}
                    </div>
                `;
            }
            html += '</div>';
            listContainer.innerHTML = html;
        } catch (e) {
            console.error('Error fetching course reviews:', e);
            document.getElementById('courseReviewsListContent').innerHTML = '<div style="text-align:center; padding:30px; color:#ef4444;">حدث خطأ في تحميل المراجعات</div>';
        }
    }
    window.openCourseReviewsModal = openCourseReviewsModal;

    function setCourseStarRating(num) {
        currentCourseRatingSelected = num;
        const container = document.getElementById('courseRatingStarsRow');
        if (!container) return;
        const stars = container.querySelectorAll('i');
        stars.forEach((s, idx) => {
            if (idx < num) {
                s.className = 'fas fa-star';
                s.style.color = '#f59e0b';
            } else {
                s.className = 'far fa-star';
                s.style.color = '#cbd5e1';
            }
        });
    }
    window.setCourseStarRating = setCourseStarRating;

    async function submitCourseRating(courseId) {
        const review = document.getElementById('rateCourseReview')?.value || '';
        try {
            const res = await fetchWithAuth(`/api/course/rate/${courseId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: currentCourseRatingSelected, review })
            });
            const data = await res.json();
            if (!data.success) {
                showToast('❌ ' + (data.error || 'فشل تسجيل التقييم'), 'error');
                return;
            }

            showToast('🌟 تم تسجيل تقييمك للدورة بنجاح!', 'success');
            document.getElementById('rateCourseModal')?.remove();
            await loadStudentCourses();
        } catch (err) {
            showToast('❌ حدث خطأ أثناء إرسال التقييم', 'error');
        }
    }
    window.submitCourseRating = submitCourseRating;

    // ================================================================
    // ✅ BOOKINGS - مع درس كلمة المرور
    // ================================================================

    async function loadMyBookings(silent = false) {
        const container = document.getElementById('bookingsList');
        if (!silent && container) {
            container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
        }
        try {
            const res = await fetchWithAuth(`/api/student/sessions/${studentId}`);
            const bookings = await res.json();
            renderBookings(bookings);
            loadUpcomingBookings(bookings);
        } catch(e) { 
            if (!silent && e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ', 'error');
            }
        }
    }

    function renderBookings(bookings) {
        const container = document.getElementById('bookingsList');
        if (!bookings || bookings.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:30px; color:var(--gray-400);">لا توجد حجوزات حالياً</p>';
            return;
        }
        let html = '';
        for (const booking of bookings) {
            const offerDate = booking.offer_date ? new Date(booking.offer_date) : null;
            const isPaid = booking.payment_status === 'paid' || booking.payment_status === 'pending_stream' || booking.is_free === true;
            const statusInfo = getOfferStatus(booking);

            const isLive = statusInfo.code === 'live';
            const canJoin = isLive && isPaid && booking.stream_url;

            html += `
                <div class="booking-item" style="border-right: 4px solid ${statusInfo.border};">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
                        <div>${statusInfo.badgeHtml}</div>
                        <div style="font-size: 0.78rem; font-weight: 800; color: ${booking.is_free ? 'var(--secondary)' : 'var(--primary)'};">
                            ${booking.is_free ? '🎁 مجانية' : `💰 ${booking.price || 0} دج`}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; cursor: pointer;" onclick="${booking.teacher_id ? `showTeacherProfile(${booking.teacher_id})` : ''}" title="عرض الملف الشخصي للأستاذ">
                        <img src="${booking.teacher_profile || '/images/default-avatar.svg'}" data-original-url="${booking.teacher_profile || '/images/default-avatar.svg'}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border:2px solid white; box-shadow:var(--shadow-sm); transition: transform 0.2s;" referrerpolicy="no-referrer" onerror="handleImageFallback(this)">
                        <div>
                            <div style="font-weight: 800; font-size: 0.95rem; color:var(--primary); display: flex; align-items: center; gap: 4px;">
                                ${escapeHtml(booking.teacher_name || 'غير معروف')}
                                <i class="fas fa-id-card" style="font-size: 0.72rem; opacity: 0.8;"></i>
                            </div>
                            <div style="font-size: 0.72rem; color: var(--gray-500);">${escapeHtml(booking.teacher_specialization || 'غير محدد')}</div>
                            <div style="font-size: 0.82rem; font-weight: 800; color: var(--gray-900); margin-top:2px;">${escapeHtml(booking.subject_name || '')}</div>
                        </div>
                    </div>
                    <div style="font-size: 0.85rem; margin: 6px 0; color: var(--gray-700);"><i class="fas fa-calendar-alt" style="color:var(--gray-400); margin-left: 8px;"></i> موعد الحصة: ${formatOfferDateTime(booking.offer_date)}</div>
                    <div style="font-size: 0.85rem; margin: 6px 0; color: var(--gray-700);"><i class="fas fa-clock" style="color:var(--gray-400); margin-left: 8px;"></i> ${booking.duration || '0'} دقيقة</div>
                    ${canJoin ? `<button class="join-stream-btn" style="margin-top: 12px; width: 100%;" onclick="joinLiveStream('${booking.offer_id}')"><i class="fas fa-video"></i> انضم للبث المباشر الان</button>` : ''}
                    ${!canJoin && isLive ? '<div style="color:var(--danger); font-size:0.75rem; margin-top:8px; font-weight:700;">🔴 البث مباشر الآن! انتظر فتح الغرفة من الأستاذ...</div>' : ''}
                    ${statusInfo.code === 'ended' ? '<div style="color:var(--gray-600); font-size:0.75rem; margin-top:8px;"><i class="fas fa-check-circle" style="color:var(--secondary);"></i> مكتمل - هذا الدرس منتهي.</div>' : ''}
                    ${booking.session_progress ? `
                        <div style="background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 10px; padding: 10px; margin-top: 10px; font-size: 0.8rem; font-weight: 700;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <span>التقدم في الاشتراك:</span>
                                <span>${booking.session_progress.completed} / ${booking.session_progress.total} حصص</span>
                            </div>
                            <div style="height: 6px; background: var(--gray-200); border-radius: 3px; overflow: hidden; margin-bottom: 5px;">
                                <div style="height: 100%; width: ${(booking.session_progress.completed / booking.session_progress.total) * 100}%; background: var(--secondary);"></div>
                            </div>
                            <div style="font-size: 0.75rem; color: var(--gray-600); display:flex; flex-direction:column; gap:4px;">
                                <span>الحصة المنتهية: رقم ${booking.session_progress.completed_number || 'لا توجد'}</span>
                                <span>الحصة القادمة: رقم ${booking.session_progress.next_number || 'اكتمل الاشتراك'}</span>
                                ${booking.session_progress.next_date ? `<span>موعد القادمة: ${new Date(booking.session_progress.next_date).toLocaleString('ar-DZ', { hour12: false})}</span>` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        container.innerHTML = html;
    }

    function copyPassword(password) {
        navigator.clipboard.writeText(password).then(() => {
            showToast('✅ تم نسخ كلمة المرور!', 'success');
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = password;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('✅ تم نسخ كلمة المرور!', 'success');
        });
    }

    async function joinLiveStream(offerId, directMeetUrl) {
        if (!offerId && !directMeetUrl) {
            showToast('⚠️ لا يمكن الانضمام للبث', 'error');
            return;
        }

        if (directMeetUrl && directMeetUrl.includes('meet.google.com')) {
            try {
                const newWindow = window.open(directMeetUrl, '_blank');
                if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                    window.location.href = directMeetUrl;
                }
            } catch(e) {
                window.location.href = directMeetUrl;
            }
            return;
        }

        const offerObj = (window.latestOffersData || []).find(o => o.id == offerId);
        if (offerObj) {
            const rawLink = offerObj.meet_url || offerObj.stream_url;
            const isGoogleMeetOrZoom = (rawLink && (rawLink.includes('meet.google.com') || rawLink.includes('zoom.us') || rawLink.includes('zoom.com') || rawLink.includes('live-room.html'))) || offerObj.stream_platform === 'google_meet' || offerObj.stream_platform === 'zoom' || offerObj.stream_platform === 'webrtc' || offerObj.is_free;
            if (isGoogleMeetOrZoom) {
                const meetUrl = (rawLink && (rawLink.includes('meet.google.com') || rawLink.includes('zoom.us') || rawLink.includes('zoom.com') || rawLink.includes('live-room.html'))) ? rawLink : ('/api/join-zoom/' + offerId + '/' + studentId);
                try {
                    const newWindow = window.open(meetUrl, '_blank');
                    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                        window.location.href = meetUrl;
                    }
                } catch(e) {
                    window.location.href = meetUrl;
                }
                return;
            }
        }

        const token = localStorage.getItem('token');
        const roomJoinUrl = `/api/join-zoom/${offerId}/${studentId}?token=${encodeURIComponent(token)}`;
        try {
            const newWindow = window.open(roomJoinUrl, '_blank');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                window.location.href = roomJoinUrl;
            }
        } catch(e) {
            window.location.href = roomJoinUrl;
        }
    }

    // ================================================================
    // ================================================================
    // ✅ TRANSACTIONS & WALLET SYSTEM
    // ================================================================

    function renderTransactionsHtml(transactions) {
        if (!transactions || transactions.length === 0) {
            return `
                <div style="text-align: center; padding: 36px 16px; color: var(--gray-400);">
                    <div style="width: 58px; height: 58px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; font-size: 1.5rem; color: #94a3b8;">
                        <i class="fas fa-receipt"></i>
                    </div>
                    <p style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #64748b;">لا توجد معاملات سابقة حتى الآن</p>
                    <p style="margin: 4px 0 16px; font-size: 0.8rem; color: #94a3b8;">اشحن حسابك للبدء في حجز الحصص والدورات</p>
                    <button onclick="if(typeof closeTransactionsModal==='function') closeTransactionsModal(); showDepositModal();" style="background: linear-gradient(135deg, #0284c7, #2563eb); color: white; border: none; padding: 10px 22px; border-radius: 10px; font-weight: 800; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(37,99,235,0.35);">
                        <i class="fas fa-plus-circle"></i> شحن الرصيد الآن
                    </button>
                </div>
            `;
        }

        window.studentTransactionsMap = window.studentTransactionsMap || {};
        let html = '';
        for (const t of transactions) {
            const date = new Date(t.created_at);
            const formattedDate = date.toLocaleString('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const isDeposit = t.type === 'deposit' || t.type === 'credit' || t.type === 'deposit_manual' || t.type === 'manual_deposit';
            const isReferral = t.type === 'referral_gift' || t.type === 'gift_reward';
            
            let icon = isDeposit ? (t.type === 'deposit_manual' || t.type === 'manual_deposit' ? 'fa-money-bill-transfer' : 'fa-arrow-up') : 'fa-arrow-down';
            let color = isDeposit ? 'var(--secondary)' : 'var(--danger)';
            let bg = isDeposit ? 'var(--secondary-soft)' : 'var(--danger-soft)';
            let label = isDeposit ? (t.type === 'deposit_manual' || t.type === 'manual_deposit' ? 'شحن رصيد (بريدي موب)' : 'شحن رصيد') : 'خصم رصيد';
            
            if (isReferral) {
                icon = 'fa-gift';
                color = 'var(--gold-dark)';
                bg = 'var(--gold-soft)';
                label = 'مكافأة إحالة 🎁';
            }

            // تحديد حالة العملية
            let statusLabel = '';
            let statusColor = '';
            let statusBg = '';
            
            const status = (t.status || 'success').toLowerCase();
            if (status === 'success' || status === 'completed' || status === 'paid' || status === 'approved') {
                statusLabel = 'ناجحة';
                statusColor = 'var(--secondary)';
                statusBg = 'var(--secondary-soft)';
            } else if (status === 'failed' || status === 'error' || status === 'rejected') {
                statusLabel = status === 'rejected' ? 'مرفوضة' : 'فاشلة';
                statusColor = 'var(--danger)';
                statusBg = 'var(--danger-soft)';
            } else if (status === 'cancelled' || status === 'expired') {
                statusLabel = 'ملغاة';
                statusColor = 'var(--gray-600)';
                statusBg = 'var(--gray-200)';
            } else {
                statusLabel = 'قيد المراجعة';
                statusColor = 'var(--gold-dark)';
                statusBg = 'var(--gold-soft)';
            }

            const txObj = {
                id: t.id,
                amount: t.amount,
                type: t.type,
                status: statusLabel,
                statusColor: statusColor,
                statusBg: statusBg,
                date: formattedDate,
                desc: t.description || '',
                sofizId: t.sofizpay_transaction_id || ''
            };
            
            window.studentTransactionsMap[t.id] = txObj;

            html += `
                <div class="transaction-item" onclick="showTransactionDetailsByMappedId('${t.id}')" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--gray-100); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='transparent'">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: ${bg}; color: ${color}; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink:0;">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-weight: 800; color: var(--gray-900); font-size:0.9rem;">${label}</span>
                                <span style="font-size: 0.65rem; padding: 2px 8px; border-radius: 12px; font-weight: 700; background: ${statusBg}; color: ${statusColor};">
                                    ${statusLabel}
                                </span>
                            </div>
                            <div style="font-size: 0.72rem; color: var(--gray-400); margin-top:2px;">${formattedDate}</div>
                            <div style="font-size: 0.78rem; margin-top: 4px; color:var(--gray-500);">${t.description || ''}</div>
                        </div>
                    </div>
                    <div style="text-align: left;">
                        <div style="font-size: 1.1rem; font-weight: 900; color: ${color}">
                            ${isDeposit || isReferral ? '+' : '-'} ${t.amount || 0} دج
                        </div>
                        ${t.sofizpay_transaction_id ? `<div style="font-size: 0.6rem; color: var(--gray-300); margin-top: 4px;">#${t.sofizpay_transaction_id}</div>` : ''}
                    </div>
                </div>
            `;
        }
        return html;
    }

    function syncAllBalanceDisplays(bal) {
        if (bal === undefined || bal === null) return;
        currentBalance = bal;
        const navBal = document.getElementById('navBalanceAmount');
        if (navBal) navBal.textContent = currentBalance;
        const walletBal = document.getElementById('walletAmount');
        if (walletBal) walletBal.textContent = `${currentBalance} دج`;
        const drawerBal = document.getElementById('drawerBalance');
        if (drawerBal) drawerBal.textContent = `${currentBalance} دج`;
        const secWallet = document.getElementById('sectionWalletAmount');
        if (secWallet) secWallet.textContent = currentBalance;
        const modalWallet = document.getElementById('modalWalletAmount');
        if (modalWallet) modalWallet.textContent = `${currentBalance} دج`;
    }

    // ================================================================
    // ✅ فحص تلقائي للمعاملات المعلّقة عند عرض القائمة — يستدعي الخادم
    //    الذي يتحقق من بوابة الدفع ومن سجل Stellar العام ويضيف الرصيد
    //    فور ثبوت الدفع (بلا أي رسالة فشل — تأخر التأكيد طبيعي).
    // ================================================================
    var pendingDepositVerifyInFlight = false;
    async function verifyPendingDeposits(transactions) {
        if (pendingDepositVerifyInFlight || !Array.isArray(transactions)) return;
        const pendingRows = transactions.filter(t => t && t.status === 'pending').slice(0, 3);
        if (pendingRows.length === 0) return;
        pendingDepositVerifyInFlight = true;
        let healed = false, healedBalance = null;
        try {
            for (const row of pendingRows) {
                try {
                    const res = await fetchWithAuth('/api/wallet/deposit/status/' + encodeURIComponent(row.id));
                    const data = await res.json();
                    if (data && data.success && data.status === 'success') {
                        healed = true;
                        if (typeof data.balance === 'number' && data.balance !== null) healedBalance = data.balance;
                    }
                } catch (e) { /* خطأ مؤقت — نعيد المحاولة عند الفتح القادم */ }
            }
        } finally {
            pendingDepositVerifyInFlight = false;
        }
        if (healed) {
            if (healedBalance !== null) syncAllBalanceDisplays(healedBalance);
            showToast('✅ تم تأكيد الدفع بنجاح — أُضيف المبلغ إلى رصيدك', 'success');
            loadTransactions();
            if (typeof loadModalTransactions === 'function') loadModalTransactions();
        }
    }

    async function loadTransactions() {
        const container = document.getElementById('transactionsList');
        if (container) container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
        try {
            const res = await fetchWithAuth(`/api/student/balance/${studentId}`);
            const data = await res.json();
            if (data.balance !== undefined) {
                syncAllBalanceDisplays(data.balance);
            }
            const transactions = data.transactions || [];
            if (container) {
                container.innerHTML = renderTransactionsHtml(transactions);
            }
            verifyPendingDeposits(transactions);
        } catch(e) { 
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ في تحميل المعاملات', 'error');
            }
        }
    }

    async function openTransactionsModal() {
        if (checkGuestAction()) return;
        const overlay = document.getElementById('modalOverlay');
        const modal = document.getElementById('transactionsModal');
        if (overlay) overlay.style.display = 'block';
        if (modal) modal.style.display = 'block';

        syncAllBalanceDisplays(currentBalance);
        await loadModalTransactions();
    }

    function closeTransactionsModal() {
        const overlay = document.getElementById('modalOverlay');
        const modal = document.getElementById('transactionsModal');
        if (modal) modal.style.display = 'none';
        const depositModal = document.getElementById('depositModal');
        const editProfileModal = document.getElementById('editProfileModal');
        const anyOtherOpen = (depositModal && depositModal.style.display === 'block') ||
                             (editProfileModal && editProfileModal.style.display === 'block');
        if (overlay && !anyOtherOpen) {
            overlay.style.display = 'none';
        }
    }

    async function loadModalTransactions() {
        const container = document.getElementById('modalTransactionsList');
        if (!container) return;
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
        try {
            const res = await fetchWithAuth(`/api/student/balance/${studentId}`);
            const data = await res.json();
            if (data.balance !== undefined) {
                syncAllBalanceDisplays(data.balance);
            }
            const transactions = data.transactions || [];
            container.innerHTML = renderTransactionsHtml(transactions);
            verifyPendingDeposits(transactions);
        } catch(e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                container.innerHTML = '<p style="text-align:center; padding:20px; color:var(--danger);">تعذر تحميل العمليات</p>';
            }
        }
    }

    // ================================================================
    // ✅ SIDEBAR HELPERS
    // ================================================================

    function loadFreeOffersSidebar(offers) {
        const freeOffers = (offers || []).filter(o => o.is_free === 1 || o.is_free === true).slice(0, 5);
        const container = document.getElementById('freeOffersSidebar');
        if (!freeOffers || freeOffers.length === 0) {
            container.innerHTML = '<p style="font-size:0.75rem; color:var(--gray-400);">لا توجد دروس مجانية</p>';
            return;
        }
        let html = '';
        for (const offer of freeOffers) {
            const offerDate = new Date(offer.offer_date);
            html += `
                <div style="padding: 10px 0; border-bottom: 1px solid var(--gray-100); display: flex; flex-direction: column; gap:4px;">
                    <div style="font-weight: 700; font-size: 0.8rem; color:var(--gray-900);">${escapeHtml(offer.subject_name)}</div>
                    <div style="font-size: 0.7rem; color: var(--gray-500);"><i class="fas fa-clock" style="margin-left: 4px;"></i>${formatOfferDateTime(offer.offer_date)}</div>
                    <button style="background:var(--gradient-secondary); color:white; border:none; padding:4px 12px; border-radius:20px; font-size:0.7rem; margin-top:4px; cursor:pointer; font-weight:700; font-family:'Cairo'; transition:var(--transition); align-self: flex-start;" onclick="quickBookFree(${offer.id})">حجز مجاني</button>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    async function quickBookFree(offerId) {
        await bookOffer(offerId, true, 0);
    }

    function loadUpcomingBookings(bookings) {
        const upcoming = (bookings || []).filter(b => {
            const statusInfo = getOfferStatus(b);
            return (statusInfo.code === 'upcoming' || statusInfo.code === 'live' || statusInfo.code === 'ready') && (b.payment_status === 'paid' || b.is_free === true);
        }).slice(0, 5);
        const container = document.getElementById('upcomingBookings');
        if (!upcoming || upcoming.length === 0) {
            container.innerHTML = '<p style="font-size:0.75rem; color:var(--gray-400);">لا توجد حصص قادمة</p>';
            return;
        }
        let html = '';
        for (const b of upcoming) {
            const statusInfo = getOfferStatus(b);
            html += `
                <div style="padding: 10px 0; border-bottom: 1px solid var(--gray-100); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 700; font-size: 0.8rem; color:var(--gray-900);">${escapeHtml(b.subject_name || '')}</div>
                        <div style="font-size: 0.7rem; color: var(--gray-500);"><i class="fas fa-calendar-alt" style="margin-left:4px;"></i>${formatOfferDateTime(b.offer_date)}</div>
                    </div>
                    <div style="text-align: left;">
                        ${statusInfo.badgeHtml}
                        ${statusInfo.code === 'live' && b.stream_url ? `<button class="join-stream-btn" style="margin-top:4px; font-size:0.65rem; padding:3px 10px;" onclick="joinLiveStream('${b.offer_id}')">انضم</button>` : ''}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    // ================================================================
    // ✅ REFERRAL SYSTEM
    // ================================================================

    async function loadReferralData() {
        try {
            const createRes = await fetchWithAuth('/api/referral/create', {
                method: 'POST',
                body: JSON.stringify({ user_id: studentId, role: 'student' })
            });
            const createData = await createRes.json();
            if (createData.success) {
                var referralCode = createData.referral_code || 'غير متوفر';
                var referralLink = createData.referral_link || window.location.origin + '?ref=' + referralCode;
                document.getElementById('referralCodeText').textContent = referralCode;
                document.getElementById('referralCodeText').dataset.link = referralLink;
            }

            const infoRes = await fetchWithAuth(`/api/referral/info/${studentId}/student`);
            const infoData = await infoRes.json();
            if (infoData.success) {
                referralData = infoData;
                document.getElementById('referredCount').textContent = infoData.referred_count || 0;
                const chances = infoData.gift_box_chances || 0;
                const giftChancesEl = document.getElementById('giftChances');
                if (giftChancesEl) {
                    giftChancesEl.textContent = chances;
                }
                const giftChancesDisplayEl = document.getElementById('giftChancesDisplay');
                if (giftChancesDisplayEl) {
                    giftChancesDisplayEl.textContent = chances;
                }

                const giftBtn = document.getElementById('openGiftBtn');
                if (giftBtn) {
                    if (chances <= 0) {
                        giftBtn.disabled = true;
                        giftBtn.innerHTML = '<i class="fas fa-gift"></i> لا توجد فرص متاحة';
                    } else {
                        giftBtn.disabled = false;
                        giftBtn.innerHTML = `<i class="fas fa-gift"></i> فتح صندوق الهدايا (${chances} فرصة${chances > 1 ? 'ات' : ''})`;
                    }
                }

                const summaryContainer = document.getElementById('referralSummarySidebar');
                if (infoData.referred_count > 0) {
                    summaryContainer.innerHTML = `
                        <div style="font-size:0.85rem; color:var(--gray-900); font-weight:700; display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-users" style="color:var(--gold-dark);"></i> ${infoData.referred_count} محال
                        </div>
                        <div style="font-size:0.75rem; color:var(--gray-500); margin-top:4px;">
                            🎁 ${chances} فرصة صندوق هدايا
                        </div>
                    `;
                } else {
                    summaryContainer.innerHTML = `
                        <p style="font-size:0.75rem; color:var(--gray-400);">قم بدعوة الأصدقاء للحصول على مكافآت</p>
                    `;
                }

                renderRewardHistory(infoData.rewards || []);
            }
        } catch(e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                console.error('خطأ في تحميل بيانات الإحالة:', e);
            }
        }
    }

    function renderRewardHistory(rewards) {
        const container = document.getElementById('rewardHistory');
        if (!rewards || rewards.length === 0) {
            container.innerHTML = '<p style="color:var(--gray-400); font-size:0.85rem; padding: 12px 0;">لا توجد مكافآت سابقة</p>';
            return;
        }
        let html = '';
        for (const reward of rewards) {
            const date = new Date(reward.created_at);
            const isGift = reward.type === 'gift_box_reward';
            const isChance = reward.type === 'gift_box_chance';
            let icon = '🎁';
            let label = 'مكافأة';
            let amountText = '';
            
            if (isGift) {
                icon = '🎁';
                label = 'صندوق هدايا';
                amountText = reward.amount ? `${reward.amount} دج` : '0 دج';
            } else if (isChance) {
                icon = '✨';
                label = 'فرصة صندوق';
                amountText = '+1 فرصة';
            } else {
                icon = '💰';
                label = 'رصيد';
                amountText = reward.amount ? `+${reward.amount} دج` : '';
            }

            html += `
                <div class="reward-item">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span class="reward-icon">${icon}</span>
                        <div>
                            <span style="font-weight:700; color:var(--gray-800); font-size:0.85rem;">${label}</span>
                            <div style="font-size:0.7rem; color:var(--gray-400); margin-top:2px;">${date ? date.toLocaleDateString('ar') : ''}</div>
                        </div>
                    </div>
                    <div class="reward-amount">${amountText}</div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    function copyReferralCode() {
        const codeEl = document.getElementById('referralCodeText');
        const link = codeEl.dataset.link || `${window.location.origin}?ref=${codeEl.textContent.trim()}`;
        if (codeEl.textContent && codeEl.textContent !== 'جاري التحميل...' && codeEl.textContent !== 'غير متوفر') {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(link).then(() => {
                    showToast('✅ تم نسخ رابط الإحالة بنجاح!', 'success');
                }).catch(() => {
                    const textArea = document.createElement('textarea');
                    textArea.value = link;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    showToast('✅ تم نسخ رابط الإحالة بنجاح!', 'success');
                });
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = link;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('✅ تم نسخ رابط الإحالة بنجاح!', 'success');
            }
        } else {
            showToast('⚠️ يرجى تسجيل الدخول للحصول على رابط الإحالة', 'warning');
        }
    }

    function shareReferral() {
        const codeEl = document.getElementById('referralCodeText');
        const link = codeEl.dataset.link || `${window.location.origin}?ref=${codeEl.textContent.trim()}`;
        if (codeEl.textContent && codeEl.textContent !== 'جاري التحميل...' && codeEl.textContent !== 'غير متوفر') {
            const copyAction = (navigator.clipboard && navigator.clipboard.writeText)
                ? navigator.clipboard.writeText(link)
                : new Promise((resolve) => {
                    const textArea = document.createElement('textarea');
                    textArea.value = link;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    resolve();
                });

            copyAction.then(() => {
                showToast('✅ تم نسخ رابط الإحالة بنجاح! شاركه مع أصدقائك', 'success');
                if (navigator.share) {
                    navigator.share({
                        title: 'انضم إلى ZoomDz',
                        text: 'استخدم رابط الإحالة الخاص بي للانضمام إلى منصة ZoomDz واحصل على مكافآت!',
                        url: link
                    }).catch(() => {});
                }
            }).catch(() => {
                const textArea = document.createElement('textarea');
                textArea.value = link;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('✅ تم نسخ رابط الإحالة بنجاح! شاركه مع أصدقائك', 'success');
                if (navigator.share) {
                    navigator.share({
                        title: 'انضم إلى ZoomDz',
                        text: 'استخدم رابط الإحالة الخاص بي للانضمام إلى منصة ZoomDz واحصل على مكافآت!',
                        url: link
                    }).catch(() => {});
                }
            });
        } else {
            showToast('⚠️ يرجى تسجيل الدخول للحصول على رابط الإحالة', 'warning');
        }
    }

    // ================================================================
    // ✅ MYSTERY BOX (صندوق الهدايا اليومي)
    // ================================================================
    function closeMysteryBoxModal() {
        var modal = document.getElementById('mysteryBoxModal');
        if (modal) modal.style.display = 'none';
    }

    var currentMysteryBoxData = null;

    async function openMysteryBoxModal() {
        var modal = document.getElementById('mysteryBoxModal');
        var content = document.getElementById('mysteryBoxContent');
        if (!modal || !content) return;

        modal.style.display = 'flex';
        content.innerHTML = `
            <div style="text-align: center; padding: 25px 15px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2.2rem; color: #f59e0b;"></i>
                <p style="margin-top: 12px; color: #64748b; font-weight: 600;">جاري جلب حالة صندوق الهدايا...</p>
            </div>
        `;

        var token = localStorage.getItem('token');
        if (!token) {
            showToast('يرجى تسجيل الدخول أولاً', 'error');
            closeMysteryBoxModal();
            return;
        }

        try {
            var res = await fetch('/api/mystery-box/status', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            var data = await res.json();
            currentMysteryBoxData = data;

            renderMysteryBoxContent();
        } catch (err) {
            console.error('Error fetching mystery box status:', err);
            renderTelegramVerifyStep();
        }
    }

    function renderMysteryBoxContent() {
        var content = document.getElementById('mysteryBoxContent');
        if (!content || !currentMysteryBoxData) return;

        var data = currentMysteryBoxData;
        var chances = data.chances || 0;
        var canClaimDaily = data.is_verified && data.can_claim;
        var remainingHours = data.remaining_hours || 24;

        var html = '';

        // If the user has referral chances, show them prominently at the top
        if (chances > 0) {
            html += `
                <div style="background: linear-gradient(135deg, #fffbeb, #fef3c7); border: 2px dashed #f59e0b; padding: 16px; border-radius: 14px; margin-bottom: 20px; text-align: center; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.15);">
                    <div style="font-size: 2rem; margin-bottom: 6px;">🎁</div>
                    <h4 style="margin: 0 0 4px 0; color: #92400e; font-weight: 800; font-size: 1.1rem;">لديك ${chances} من فرص الإحالة!</h4>
                    <p style="margin: 0 0 12px 0; color: #b45309; font-size: 0.85rem; line-height: 1.4;">
                        يمكنك فتح هذا الصندوق الآن دون أي انتظار أو شروط تلغرام، وسيتم خصم فرصة واحدة فقط.
                    </p>
                    <button id="btnClaimChance" onclick="claimMysteryBoxReward(true)" 
                            style="width: 100%; padding: 12px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 10px; font-weight: 800; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 10px rgba(217, 119, 6, 0.3);">
                        <i class="fas fa-gift"></i> فتح صندوق الهدايا بالفرصة (${chances} متبقية)
                    </button>
                </div>
            `;
        }

        // Show Daily Box section
        if (canClaimDaily) {
            html += `
                <div style="text-align: center; padding: 10px 0; border-top: ${chances > 0 ? '1px solid #e2e8f0' : 'none'}; padding-top: ${chances > 0 ? '20px' : '0'};">
                    <div style="margin-bottom: 16px;">
                        <i class="fas fa-star" style="font-size: 4rem; color: #f59e0b; animation: bounce 1.5s infinite; filter: drop-shadow(0 10px 15px rgba(245, 158, 11, 0.4));"></i>
                    </div>

                    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 12px; border-radius: 12px; margin-bottom: 16px; font-weight: 600; font-size: 0.9rem;">
                        <i class="fas fa-check-circle" style="color: #22c55e; margin-left: 6px;"></i>
                        أنت مشترك ومتحقق! صندوق الهدية اليومية جاهز للفتح الآن 🎉
                    </div>

                    <button id="btnClaimReward" onclick="claimMysteryBoxReward(false)" 
                            style="width: 100%; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-weight: 800; font-size: 1.1rem; cursor: pointer; box-shadow: 0 6px 15px rgba(16, 185, 129, 0.35); transition: transform 0.2s;">
                        <i class="fas fa-gift"></i> فتح صندوق الهدايا اليومي المجاني 🎁
                    </button>
                </div>
            `;
        } else if (data.is_verified) {
            // Already claimed daily but verified
            html += `
                <div style="text-align: center; padding: 10px 0; border-top: ${chances > 0 ? '1px solid #e2e8f0' : 'none'}; padding-top: ${chances > 0 ? '20px' : '0'};">
                    <div style="width: 60px; height: 60px; background: #f1f5f9; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; margin-top: 10px;">
                        <i class="fas fa-clock" style="font-size: 2rem; color: #64748b;"></i>
                    </div>

                    <h4 style="margin: 0 0 6px 0; color: #1e293b; font-size: 1.1rem; font-weight: 800;">لقد فتحت الصندوق اليومي بالفعل!</h4>
                    <p style="margin: 0 0 16px 0; color: #64748b; font-size: 0.88rem; line-height: 1.5;">
                        يمكنك العودة لفتح صندوق هدايا مجاني جديد بعد <strong style="color: #d97706; font-size: 1rem;">${remainingHours} ساعة</strong>.
                    </p>

                    ${chances === 0 ? `
                        <div style="background: #fdf2f8; border: 1px dashed #fbcfe8; color: #9d174d; padding: 12px; border-radius: 12px; font-size: 0.85rem; line-height: 1.5; margin-bottom: 15px; text-align: right;">
                            <i class="fas fa-lightbulb" style="color: #db2777; margin-left: 6px;"></i>
                            <strong>نصيحة:</strong> قم بدعوة أصدقائك عبر رابط الإحالة الخاص بك للحصول على فرص إضافية لفتح الصناديق فوراً دون انتظار 24 ساعة!
                        </div>
                    ` : ''}

                    <button onclick="closeMysteryBoxModal()" style="width: 100%; padding: 12px; background: #cbd5e1; color: #1e293b; border: none; border-radius: 12px; font-weight: 700; cursor: pointer;">
                        إغلاق
                    </button>
                </div>
            `;
        } else {
            // Telegram verify step is required for daily free claim
            html += `
                <div style="border-top: ${chances > 0 ? '1px solid #e2e8f0' : 'none'}; padding-top: ${chances > 0 ? '20px' : '0'}; text-align: right;">
                    <h5 style="margin: 0 0 10px 0; color: #1e293b; font-weight: 800; font-size: 1rem;"><i class="fas fa-star" style="color:#f59e0b;"></i> للحصول على الهدية اليومية المجانية:</h5>
                    <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 14px; border-radius: 12px; margin-bottom: 12px; font-size: 0.88rem; line-height: 1.5;">
                        <i class="fab fa-telegram" style="color: #0088cc; font-size: 1.2rem; margin-left: 6px;"></i>
                        انضم إلى قناة المنصة الرسمية على التلغرام <strong>(@zoomdz1)</strong>.
                    </div>

                    <a href="https://t.me/zoomdz1" target="_blank" rel="noopener noreferrer" 
                       style="display: flex; align-items: center; justify-content: center; gap: 8px; background: linear-gradient(135deg, #0088cc, #006699); color: white; padding: 12px; border-radius: 12px; font-weight: 700; font-size: 0.95rem; text-decoration: none; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(0, 136, 204, 0.25);">
                        <i class="fab fa-telegram" style="font-size: 1.2rem;"></i>
                        الانضمام لقناة التلغرام الرسمية
                    </a>

                    <div style="margin-bottom: 12px; text-align: right;">
                        <label style="display: block; font-weight: 700; color: #334155; margin-bottom: 4px; font-size: 0.85rem;">
                            معرف التلغرام الرقمي (Telegram ID):
                        </label>
                        <p style="margin: 0 0 6px 0; font-size: 0.75rem; color: #64748b; line-height: 1.4;">
                            احصل على ID الرقمي الخاص بك ب رسال /start إلى البوت <a href="https://t.me/userinfobot" target="_blank" style="color:#0088cc; font-weight: bold; text-decoration: underline;">@userinfobot</a> في التلغرام.
                        </p>
                        <input type="text" id="telegramIdInput" placeholder="مثال: 123456789" 
                               style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.9rem; text-align: left; direction: ltr; box-sizing: border-box;">
                    </div>

                    <button id="btnVerifyTelegram" onclick="verifyTelegramJoin()" 
                            style="width: 100%; padding: 12px; background: linear-gradient(135deg, #cbd5e1, #94a3b8); color: #1e293b; border: none; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="fas fa-check-circle"></i> التحقق من الانضمام وتفعيل الهدية اليومية
                    </button>
                </div>
            `;
        }

        content.innerHTML = html;
    }

    function renderTelegramVerifyStep() {
        // Obsoleted by renderMysteryBoxContent but kept for simple fallback
        currentMysteryBoxData = { is_verified: false, can_claim: false, chances: 0 };
        renderMysteryBoxContent();
    }

    async function verifyTelegramJoin() {
        var telegramIdInput = document.getElementById('telegramIdInput');
        var telegramId = telegramIdInput ? telegramIdInput.value.trim() : '';

        var btn = document.getElementById('btnVerifyTelegram');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق عبر التلغرام...';
        }

        var token = localStorage.getItem('token');
        try {
            var res = await fetch('/api/mystery-box/verify-telegram', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ telegramId: telegramId })
            });
            var data = await res.json();

            if (data.success) {
                showToast(data.message || 'تم التحقق بنجاح!', 'success');
                if (currentMysteryBoxData) {
                    currentMysteryBoxData.is_verified = true;
                    currentMysteryBoxData.can_claim = true;
                } else {
                    currentMysteryBoxData = { is_verified: true, can_claim: true, chances: 0 };
                }
                renderMysteryBoxContent();
            } else {
                showToast(data.error || 'عذراً، يجب الانضمام لقناة المنصة أولاً', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-check-circle"></i> التحقق من الانضمام لقناة المنصة';
                }
            }
        } catch (err) {
            console.error('Verify telegram error:', err);
            showToast('عذراً، يجب الانضمام لقناة المنصة أولاً', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check-circle"></i> التحقق من الانضمام لقناة المنصة';
            }
        }
    }

    function renderReadyToClaimBox() {
        // Obsoleted by renderMysteryBoxContent but kept for simple fallback
        if (currentMysteryBoxData) {
            currentMysteryBoxData.is_verified = true;
            currentMysteryBoxData.can_claim = true;
        } else {
            currentMysteryBoxData = { is_verified: true, can_claim: true, chances: 0 };
        }
        renderMysteryBoxContent();
    }

    async function claimMysteryBoxReward(useChance) {
        useChance = !!useChance;
        var btnId = useChance ? 'btnClaimChance' : 'btnClaimReward';
        var btn = document.getElementById(btnId);

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري فتح الصندوق...';
        }

        var token = localStorage.getItem('token');
        try {
            var res = await fetch('/api/mystery-box/claim', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ useChance: useChance })
            });
            var data = await res.json();
            if (data.success) {
                renderSuccessReward(data.reward, data.new_balance);
                showToast(data.message, 'success');
                
                // Update local dashboard states
                if (typeof loadReferralData === 'function') loadReferralData();
                if (typeof loadWallet === 'function') loadWallet();
                if (typeof loadNotifications === 'function') loadNotifications();
            } else {
                showToast(data.error || 'تعذر فتح الصندوق', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = useChance 
                        ? `<i class="fas fa-gift"></i> فتح صندوق الهدايا بالفرصة` 
                        : '<i class="fas fa-gift"></i> فتح صندوق الهدايا اليومي المجاني 🎁';
                }
            }
        } catch (err) {
            console.error('Claim mystery box error:', err);
            showToast('حدث خطأ في الاتصال بالخادم', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = useChance 
                    ? `<i class="fas fa-gift"></i> فتح صندوق الهدايا بالفرصة` 
                    : '<i class="fas fa-gift"></i> فتح صندوق الهدايا اليومي المجاني 🎁';
            }
        }
    }

    function renderSuccessReward(reward, newBalance) {
        var content = document.getElementById('mysteryBoxContent');
        if (!content) return;
        content.innerHTML = `
            <div style="text-align: center; padding: 15px 0;">
                <div style="font-size: 4rem; margin-bottom: 15px;">🎉</div>
                <h2 style="color: #059669; font-size: 1.8rem; font-weight: 900; margin: 0 0 10px 0;">تهانينا الفائقة!</h2>
                
                <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); border: 2px solid #f59e0b; padding: 20px; border-radius: 16px; margin-bottom: 20px;">
                    <p style="margin: 0 0 6px 0; color: #78350f; font-weight: 700; font-size: 1rem;">ربحت في هدية اليوم:</p>
                    <div style="font-size: 2.5rem; font-weight: 900; color: #d97706; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        +${reward} <span style="font-size: 1.2rem;">دج</span>
                    </div>
                    <p style="margin: 8px 0 0 0; color: #92400e; font-size: 0.85rem;">تم إضافة المبلغ تلقائياً لرصيدك في المنصة!</p>
                </div>

                <button onclick="closeMysteryBoxModal()" style="width: 100%; padding: 14px; background: #334155; color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer;">
                    ممتاز، شكرًا لكم!
                </button>
            </div>
        `;
    }

    function renderClaimedBox(remainingHours) {
        var content = document.getElementById('mysteryBoxContent');
        if (!content) return;
        content.innerHTML = `
            <div style="text-align: center; padding: 15px 0;">
                <div style="width: 80px; height: 80px; background: #f1f5f9; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                    <i class="fas fa-clock" style="font-size: 2.5rem; color: #64748b;"></i>
                </div>

                <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 1.2rem; font-weight: 800;">لقد قمت بفتح صندوق اليوم بالفعل!</h4>
                <p style="margin: 0 0 20px 0; color: #64748b; font-size: 0.95rem; line-height: 1.6;">
                    يمكنك العودة لفتح صندوق هدايا جديد بعد <strong style="color: #d97706; font-size: 1.1rem;">${remainingHours} ساعة</strong>.
                </p>

                <button onclick="closeMysteryBoxModal()" style="width: 100%; padding: 14px; background: #cbd5e1; color: #1e293b; border: none; border-radius: 12px; font-weight: 700; cursor: pointer;">
                    إغلاق
                </button>
            </div>
        `;
    }

    async function openGiftBox() {
        const btn = document.getElementById('openGiftBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري فتح الصندوق...';
        
        try {
            const res = await fetchWithAuth('/api/referral/open-gift-box', {
                method: 'POST',
                body: JSON.stringify({ student_id: studentId })
            });
            const data = await res.json();
            
            if (data.success) {
                const resultModal = document.getElementById('giftResultModal');
                const overlay = document.getElementById('modalOverlay');
                
                let icon, amountClass, message;
                if (data.reward > 0) {
                    icon = '🎉';
                    amountClass = 'gold';
                    message = `تهانينا! حصلت على ${data.reward} دج! 🎊`;
                } else {
                    icon = '😅';
                    amountClass = 'gray';
                    message = 'لم يحالفك الحظ هذه المرة، جرب مرة أخرى!';
                }
                
                document.getElementById('giftResultAmount').innerHTML = `${data.reward > 0 ? '+' : ''}${data.reward} دج`;
                document.getElementById('giftResultAmount').className = `result-amount ${amountClass}`;
                document.getElementById('giftResultMessage').textContent = message;
                document.querySelector('#giftResultModal .big-icon').textContent = icon;
                
                overlay.style.display = 'block';
                resultModal.style.display = 'block';
                
                await loadReferralData();
                await loadWallet();
                await loadNotifications();
                
                showToast(data.message, data.reward > 0 ? 'success' : 'warning');
            } else {
                showToast(data.error || 'حدث خطأ', 'error');
            }
        } catch(e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ أثناء فتح الصندوق', 'error');
            }
        } finally {
            btn.disabled = false;
            const chances = referralData?.gift_box_chances || 0;
            if (chances > 0) {
                btn.innerHTML = `<i class="fas fa-gift"></i> فتح صندوق الهدايا (${chances} فرصة${chances > 1 ? 'ات' : ''})`;
            } else {
                btn.innerHTML = '<i class="fas fa-gift"></i> لا توجد فرص متاحة';
            }
        }
    }

    function closeGiftResult() {
        document.getElementById('modalOverlay').style.display = 'none';
        document.getElementById('giftResultModal').style.display = 'none';
    }

    // ================================================================
    // ✅ MESSAGES & CHAT
    // ================================================================
    let currentChatTeacher = null;
    Object.defineProperty(window, 'currentChatTeacher', {
        get() { return currentChatTeacher; },
        set(val) { currentChatTeacher = val; },
        configurable: true
    });
    let currentConversations = [];

    function startChatWithStudent(otherId, otherName, otherImage) {
        startChatWithUser(otherId, otherName, otherImage, 'student');
    }

    function startChatWithTeacher(otherId, otherName, otherImage) {
        startChatWithUser(otherId, otherName, otherImage, 'teacher');
    }

    window.startChatWithStudent = startChatWithStudent;
    window.startChatWithTeacher = startChatWithTeacher;

    function startChatWithUser(otherId, otherName, otherImage, otherType = 'teacher') {
        if (checkGuestAction && checkGuestAction()) return;
        currentChatTeacher = { id: otherId, name: otherName, image: otherImage || '/images/default-avatar.svg', type: otherType };
        chatTypingWatch(otherId, otherType, otherName);
        startDirectChatPolling();
        document.getElementById('conversationsList').style.display = 'none';
        document.getElementById('chatView').style.display = 'block';
        // إخفاء مساحة إعلان الرسائل داخل المحادثة الفردية (تظهر مرة أخرى عند العودة)
        var _msgAd = document.getElementById('studentMessagesAdSlot');
        if (_msgAd) _msgAd.style.display = 'none';

        const isStudent = otherType === 'student';
        const typeLabel = isStudent ? 'طالب' : 'أستاذ';
        const profileOnClick = isStudent ? `showStudentProfile(${otherId})` : `showTeacherProfile(${otherId})`;
        const iconClass = isStudent ? 'fa-user-graduate' : 'fa-chalkboard-teacher';

        document.getElementById('chatHeader').innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 2px solid var(--gray-200);">
                <img src="${currentChatTeacher.image}" data-original-url="${currentChatTeacher.image}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary); cursor: pointer;" referrerpolicy="no-referrer" onerror="handleImageFallback(this)" onclick="${profileOnClick}" title="عرض الملف الشخصي">
                <div style="cursor: pointer;" onclick="${profileOnClick}">
                    <div style="font-weight: 700; font-size: 0.95rem; color:var(--gray-800);">${escapeHtml(currentChatTeacher.name)}</div>
                    <div style="font-size: 0.75rem; color: var(--primary); font-weight: 600;"><i class="fas ${iconClass}"></i> ${typeLabel}</div>
                </div>
            </div>
        `;
        const inputEl = document.getElementById('messageInput');
        if (inputEl) inputEl.placeholder = `تواص  مع ${typeLabel}... اكتب رسالتك هنا`;

        loadConversationMessages(otherId, otherType);
        showSection('messages');
    }

    
    let directChatLimit = 20;
    let directChatHasMore = true;
    let directChatIsLoadingOlder = false;
    let activeDirectChatOtherId = null;
    let activeDirectChatOtherType = null;

    async function loadConversationMessages(otherId, otherType = 'teacher', silent = false, isOlderLoad = false) {
        window.loadConversationMessages = loadConversationMessages;
        const container = document.getElementById('chatMessages');
        if (!container) return;

        if (!container._paginationAttached) {
            container._paginationAttached = true;
            let scrollDebounce = null;
            container.addEventListener('scroll', () => {
                if (scrollDebounce) clearTimeout(scrollDebounce);
                scrollDebounce = setTimeout(() => {
                    if (container.scrollTop <= 60 && directChatHasMore && !directChatIsLoadingOlder) {
                        loadConversationMessages(activeDirectChatOtherId, activeDirectChatOtherType, false, true);
                    }
                }, 100);
            }, { passive: true });
        }

        if (isOlderLoad) {
            if (directChatIsLoadingOlder || !directChatHasMore) return;
            directChatIsLoadingOlder = true;
            directChatLimit += 20;
        } else {
            directChatLimit = 20;
            directChatHasMore = true;
            directChatIsLoadingOlder = false;
            activeDirectChatOtherId = otherId;
            activeDirectChatOtherType = otherType;
            if (!silent && !container.querySelector('.message-bubble')) {
                container.innerHTML = '<div class="loading" data-chat-loading="1" style="text-align:center; padding:20px; color:var(--gray-400);"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
            }
        }

        const previousScrollHeight = container.scrollHeight;
        const previousScrollTop = container.scrollTop;

        try {
            const typeParam = otherType || (currentChatTeacher ? currentChatTeacher.type : 'teacher');
            const res = await fetchWithAuth(`/api/messages/${studentId}/student/${otherId}/${typeParam}?limit=${directChatLimit}`);
            const messages = await res.json();
            
            if (!Array.isArray(messages) || messages.length < directChatLimit) {
                directChatHasMore = false;
            }
            
            renderChatMessages(messages, silent, isOlderLoad, previousScrollHeight, previousScrollTop);
            checkUnreadMessagesCount();
        } catch(e) { 
            if (e.message !== 'انتهت صلاحية الجلسة') { console.log(e); if (container) container.innerHTML = '<p style="text-align:center; padding:20px; color:var(--danger);">حدث خطأ في تحميل الرسائل</p>'; } 
        } finally {
            if (isOlderLoad) {
                setTimeout(() => { directChatIsLoadingOlder = false; }, 300);
            }
        }
    }

    

    let currentChatReply = null; // { id, name, text }

    function startReplyToMessage(msgId, senderName, messageText) {
        currentChatReply = {
            id: msgId,
            name: senderName,
            text: messageText
        };
        const bar = document.getElementById('replyPreviewBar');
        const toEl = document.getElementById('replyBarTo');
        const prevEl = document.getElementById('replyBarPreview');
        if (bar && toEl && prevEl) {
            toEl.textContent = `الرد على: ${senderName}`;
            prevEl.textContent = messageText;
            bar.style.display = 'flex';
        }
        const input = document.getElementById('messageInput');
        if (input) {
            input.focus();
        }
    }

    function cancelChatReply() {
        currentChatReply = null;
        const bar = document.getElementById('replyPreviewBar');
        if (bar) bar.style.display = 'none';
    }

    function scrollToMessage(msgId) {
        if (!msgId) return;
        const bubble = document.querySelector(`.message-bubble[data-msg-id="${msgId}"]`);
        if (bubble) {
            bubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
            bubble.style.transition = 'box-shadow 0.3s ease, transform 0.3s ease';
            bubble.style.transform = 'scale(1.04)';
            bubble.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.6)';
            setTimeout(() => {
                bubble.style.transform = '';
                bubble.style.boxShadow = '';
            }, 1200);
        }
    }

    function renderChatMessages(messages, silent = false, isOlderLoad = false, previousScrollHeight = 0, previousScrollTop = 0) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        if (silent && window.isAnyChatAudioPlaying && window.isAnyChatAudioPlaying()) {
            return;
        }
        if (!messages || messages.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--gray-400); padding:20px;">لا توجد رسائل بعد. ابدأ المحادثة!</p>';
            return;
        }
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
        let html = '';
        for (const msg of messages) {
            const isSent = msg.sender_id == studentId;
            let _dStr = msg.created_at; if (_dStr && !_dStr.endsWith('Z') && !_dStr.includes('+')) { _dStr += 'Z'; } const date = new Date(_dStr);
            const otherName = currentChatTeacher ? currentChatTeacher.name : 'الأستاذ';
            const senderDisplayName = isSent ? 'أنت' : otherName;
            const isAudioMsg = msg.message_type === 'audio' || msg.file_type === 'audio' || !!msg.audio_url;
            const cleanTextForJs = isAudioMsg ? '🎤 رسالة صوتية' : escapeHtml(msg.message).replace(/'/g, "\\'").replace(/"/g, '&quot;');

            let reactionsHtml = '';
            if (msg.reactions && msg.reactions.length > 0) {
                reactionsHtml = '<div class="message-reactions">';
                for (const r of msg.reactions) {
                    reactionsHtml += `<span class="reaction-pill ${r.user_reacted ? 'active' : ''}" onclick="event.stopPropagation(); reactToMessage(${msg.id}, '${r.emoji}')">${r.emoji} <span style="font-size:0.7rem; margin-right:2px;">${r.count}</span></span>`;
                }
                reactionsHtml += '</div>';
            }

            let replyQuoteHtml = '';
            if (msg.reply_to_text) {
                replyQuoteHtml = `
                    <div class="replied-quote-bubble" onclick="scrollToMessage(${msg.reply_to_id})">
                        <div class="replied-quote-author"><i class="fas fa-reply"></i> ${escapeHtml(msg.reply_to_sender || 'رسالة سابقة')}</div>
                        <div class="replied-quote-snippet">${escapeHtml(msg.reply_to_text)}</div>
                    </div>`;
            }

            const bodyContentHtml = isAudioMsg
                ? (typeof window.renderVoiceMessageHtml === 'function'
                    ? window.renderVoiceMessageHtml(msg, isSent, { canDelete: isSent, deleteJs: `deleteMessage(${msg.id})` })
                    : `<audio controls src="${msg.audio_url || msg.file_url}"></audio>`)
                : autoLinkUrls(msg.message, { isSelf: isSent, linkColor: isSent ? '#93c5fd' : '#2563eb' });

            html += `
                <div class="message-bubble ${isSent ? 'sent' : 'received'} ${isAudioMsg ? 'has-audio-player' : ''}" data-msg-id="${msg.id}">
                    <div class="message-content" style="${isAudioMsg ? 'min-width: 260px; max-width: 95%; padding: 6px 8px;' : ''}">
                        ${replyQuoteHtml}
                        <div class="message-text-body">${bodyContentHtml}</div>
                        ${reactionsHtml}
                        <div class="message-time" style="display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-top:4px;">
<div class="message-actions-bar">
    ${isSent ? `<button class="message-action-btn" type="button" onclick="event.stopPropagation(); deleteMessage(${msg.id})" title="حذف"><i class="fas fa-trash"></i></button>` : ''}
    <button class="message-action-btn" type="button" onclick="event.stopPropagation(); openEmojiPicker(${msg.id}, this.closest('.message-bubble'))" title="تفاعل"><i class="far fa-smile"></i></button>
    <button class="message-action-btn" type="button" onclick="event.stopPropagation(); startReplyToMessage(${msg.id}, '${escapeHtml(senderDisplayName).replace(/'/g, "\\'")}', '${cleanTextForJs}')" title="رد"><i class="fas fa-reply"></i></button>
</div>
                            <span>${date.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}</span>
${isSent ? `<span class="msg-status ${msg.is_read ? 'read' : ''}" title="${msg.is_read ? 'قُرئت' : 'أُرسلت'}">${msg.is_read ? '<i class="fas fa-check-double"></i>' : '<i class="fas fa-check"></i>'}</span>` : ''}
                        </div>
                    </div>
                </div>`;
        }
        
        let topBannerHtml = '';
        if (directChatHasMore && messages && messages.length >= 20) {
            topBannerHtml = `
                <div style="text-align: center; margin-bottom: 12px;">
                    <button type="button" onclick="loadConversationMessages(activeDirectChatOtherId, activeDirectChatOtherType, false, true)" style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 20px; padding: 6px 16px; font-size: 0.78rem; font-weight: 700; color: #475569; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <i class="fas fa-arrow-up" style="color: var(--primary, #3b82f6);"></i> تحميل 20 رسالة أقدم
                    </button>
                </div>
            `;
        }
        
        container.innerHTML = topBannerHtml + html;
        
        if (typeof setupLongPressReactions === 'function') {
            setupLongPressReactions(container);
        }
        
        if (isOlderLoad) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - previousScrollHeight + previousScrollTop;
        } else if (!silent && (isAtBottom || messages.length <= 20)) {
            setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
        }
    }

    function setupLongPressReactions(container) {
        let pressTimer = null;
        const bubbles = container.querySelectorAll('.message-bubble');
        bubbles.forEach(bubble => {
            const msgId = bubble.getAttribute('data-msg-id');
            if (!msgId) return;

            const startPress = () => {
                pressTimer = setTimeout(() => {
                    openEmojiPicker(parseInt(msgId, 10), bubble);
                }, 380);
            };

            const cancelPress = () => {
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
            };

            bubble.addEventListener('touchstart', startPress, { passive: true });
            bubble.addEventListener('touchend', cancelPress);
            bubble.addEventListener('touchmove', cancelPress);
        });
    }

    async function reactToMessage(msgId, emoji) {
        closeEmojiPickers();
        try {
            const res = await fetchWithAuth('/api/messages/react', {
                method: 'POST',
                body: JSON.stringify({ message_id: msgId, emoji })
            });
            const data = await res.json();
            if (data.success && currentChatTeacher) {
                loadConversationMessages(currentChatTeacher.id, currentChatTeacher.type, true);
            }
        } catch(e) {
            console.error('Error reacting to message:', e);
        }
    }

    function openEmojiPicker(msgId, bubbleEl) {
        closeEmojiPickers();
        if (!bubbleEl) return;

        const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
        const popover = document.createElement('div');
        popover.className = 'emoji-picker-popover';

        emojis.forEach(e => {
            const btn = document.createElement('button');
            btn.className = 'emoji-picker-btn';
            btn.type = 'button';
            btn.textContent = e;
            btn.onclick = (event) => {
                event.stopPropagation();
                reactToMessage(msgId, e);
            };
            popover.appendChild(btn);
        });

        bubbleEl.appendChild(popover);

        setTimeout(() => {
            document.addEventListener('click', closeEmojiPickers, { once: true });
        }, 50);
    }

    function closeEmojiPickers() {
        document.querySelectorAll('.emoji-picker-popover').forEach(el => el.remove());
    }

    async function deleteMessage(msgId) {
        if (!confirm('هل أنت متأكد من حذف هذه الرسالة؟')) return;
        try {
            const res = await fetchWithAuth('/api/messages/delete', {
                method: 'POST',
                body: JSON.stringify({ message_id: msgId })
            });
            const data = await res.json();
            if (data.success || (data.message && data.message.includes('مسبقاً'))) {
                if (currentChatTeacher) {
                    loadConversationMessages(currentChatTeacher.id, currentChatTeacher.type || 'teacher', true);
                }
            } else {
                if (!data.error || (!data.error.includes('مسبقاً') && !data.error.includes('انتظار'))) {
                    showToast(data.error || 'حدث خطأ', 'error');
                }
            }
        } catch(e) {
            console.error('Error deleting message:', e);
        }
    }

    async function sendMessageToTeacher() {
        const message = document.getElementById('messageInput').value.trim();
        if (!message) { showToast('الرجاء كتابة رسالة', 'warning'); return; }
        if (!currentChatTeacher) { showToast('الرجاء اختيار مستلم الرسالة', 'warning'); return; }
        const receiverType = currentChatTeacher.type || 'teacher';
        
        const payload = { 
            sender_id: studentId, 
            sender_type: 'student', 
            receiver_id: currentChatTeacher.id, 
            receiver_type: receiverType, 
            message: message 
        };

        if (currentChatReply) {
            payload.reply_to_id = currentChatReply.id;
            payload.reply_to_text = currentChatReply.text;
            payload.reply_to_sender = currentChatReply.name;
        }

        directChatSending = true;
        setTimeout(function () { directChatSending = false; }, 6000);
        try {
            const res = await fetchWithAuth('/api/messages/send', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                chatTypingStop();
                document.getElementById('messageInput').value = '';
                const sentReply = currentChatReply;
                cancelChatReply();
                appendOptimisticMessage(message, sentReply);
                // لا إعادة تحميل ولا مؤشر تحميل: نترك الاستطلاع الصامت يتكفل بالتزامن
                setTimeout(function () {
                    if (typeof loadConversations === 'function') loadConversations(true);
                }, 800);
            } else { 
                showToast(data.error || 'حدث خطأ', 'error'); 
            }
        } catch(e) { 
            if (e.message !== 'انتهت صلاحية الجلسة') showToast('حدث خطأ في الإرسال', 'error'); 
        }
    }

    async function loadConversations(silent = false) {
        window.loadConversations = loadConversations;
        const container = document.getElementById('conversationsList');
        if (!silent && container) {
            container.innerHTML = '<div class="loading" style="text-align:center; padding:20px; color:var(--gray-400);"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
        }
        try {
            const res = await fetchWithAuth(`/api/messages/conversations/${studentId}/student`);
            const conversations = await res.json();
            currentConversations = conversations;
            renderConversations(conversations);
            checkUnreadMessagesCount();
        } catch(e) { 
            if (e.message !== 'انتهت صلاحية الجلسة' && !silent) { 
                console.log(e); 
                if (container) container.innerHTML = '<p style="text-align:center; padding:20px; color:var(--danger);">حدث خطأ</p>'; 
            } 
        }
    }

    function renderConversations(conversations) {
        const container = document.getElementById('conversationsList');
        if (!conversations || conversations.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:25px; color:var(--gray-400);">لا توجد محادثات بعد</p>';
            return;
        }
        let html = '<div class="messages-list">';
        for (const conv of conversations) {
            let _dStrL = conv.last_message_date; if (_dStrL && !_dStrL.endsWith('Z') && !_dStrL.includes('+')) { _dStrL += 'Z'; } const date = new Date(_dStrL);
            const isUnread = conv.unread_count > 0;
            const oType = conv.other_type || 'teacher';
            const typeLabel = oType === 'student' ? 'طالب' : 'أستاذ';
            const iconClass = oType === 'student' ? 'fa-user-graduate' : 'fa-chalkboard-teacher';
            const profileFn = oType === 'student' ? `showStudentProfile(${conv.other_id})` : `showTeacherProfile(${conv.other_id})`;
            const imgSrc = conv.other_image || '/images/default-avatar.svg';

            html += `<div class="conversation-item ${isUnread ? 'conversation-unread' : ''}" onclick="openConversation(${conv.other_id}, '${escapeHtml(conv.other_name)}', '${escapeHtml(imgSrc)}', '${oType}')" style="display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid var(--gray-100); cursor: pointer;">
                <img src="${escapeHtml(imgSrc)}" data-original-url="${escapeHtml(imgSrc)}" style="width: 46px; height: 46px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary); flex-shrink: 0; cursor: pointer;" referrerpolicy="no-referrer" onerror="handleImageFallback(this)" onclick="event.stopPropagation(); ${profileFn}" title="عرض الملف الشخصي">
                <div style="flex: 1; min-width: 0;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="conversation-name" style="font-weight:700; color:var(--gray-800); cursor:pointer; display:flex; align-items:center; gap:8px;" onclick="event.stopPropagation(); ${profileFn}">
                            ${escapeHtml(conv.other_name)}
                            ${isUnread ? `<span style="background: #ef4444; color: white; border-radius: 10px; padding: 2px 6px; font-size: 0.65rem; font-weight: 800;">${conv.unread_count > 99 ? '+99' : conv.unread_count}</span>` : ''}
                        </div>
                        <span style="font-size:0.75rem; color:var(--primary); font-weight:600;"><i class="fas ${iconClass}"></i> ${typeLabel}</span>
                    </div>
                    <div class="conversation-last" style="font-size:0.85rem; color:var(--gray-600); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">${escapeHtml(conv.last_message)}</div>
                    <div style="font-size: 0.65rem; color: var(--gray-400); margin-top: 4px;">${date.toLocaleString('ar')}</div>
                </div>
            </div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    }

    async function openConversation(otherId, otherName, otherImage, otherType = 'teacher') {
        startChatWithUser(otherId, otherName, otherImage, otherType);
    }

    function backToConversations() {
        chatTypingWatch(null, null);
        stopDirectChatPolling();
        directChatLastTopId = 0;
        currentChatTeacher = null;
        document.getElementById('chatView').style.display = 'none';
        document.getElementById('conversationsList').style.display = 'block';
        var _msgAd = document.getElementById('studentMessagesAdSlot');
        if (_msgAd) _msgAd.style.display = 'block';
        loadConversations();
    }

    // ================================================================
    // ✅ DEPOSIT
    // ================================================================

    // ================================================================
    // ✅ DEPOSIT (Gold Card & BaridiMob / CCP)
    // ================================================================

    let currentDepositMethod = 'gold_card';
    let selectedDepositReceiptFile = null;

    function showDepositModal() {
        if (checkGuestAction()) return;
        document.getElementById('modalOverlay').style.display = 'block';
        document.getElementById('depositModal').style.display = 'block';
        document.getElementById('depositAmount').value = '';
        const manualAmt = document.getElementById('manualDepositAmount');
        if (manualAmt) manualAmt.value = '';
        const manualNotes = document.getElementById('manualDepositNotes');
        if (manualNotes) manualNotes.value = '';
        removeDepositReceipt();
        selectDepositMethod('gold_card');
        loadCcpInfoForUser();
        updateStudentDepositFee();
    }

    function selectDepositMethod(method) {
        currentDepositMethod = method;
        const goldBtn = document.getElementById('methodGoldCard');
        const baridiBtn = document.getElementById('methodBaridiMob');
        const goldSec = document.getElementById('goldCardSection');
        const baridiSec = document.getElementById('baridiMobSection');

        if (method === 'gold_card') {
            if (goldBtn) {
                goldBtn.style.border = '2px solid #2563eb';
                goldBtn.style.background = '#eff6ff';
            }
            if (baridiBtn) {
                baridiBtn.style.border = '2px solid #e2e8f0';
                baridiBtn.style.background = '#f8fafc';
            }
            if (goldSec) goldSec.style.display = 'block';
            if (baridiSec) baridiSec.style.display = 'none';
        } else {
            if (goldBtn) {
                goldBtn.style.border = '2px solid #e2e8f0';
                goldBtn.style.background = '#f8fafc';
            }
            if (baridiBtn) {
                baridiBtn.style.border = '2px solid #16a34a';
                baridiBtn.style.background = '#f0fdf4';
            }
            if (goldSec) goldSec.style.display = 'none';
            if (baridiSec) baridiSec.style.display = 'block';
            setTimeout(setupReceiptDropzone, 50);
        }
    }

    async function loadCcpInfoForUser() {
        try {
            const res = await fetch('/api/wallet/ccp-info');
            const data = await res.json();
            if (data.success && data.settings) {
                const s = data.settings;
                if (document.getElementById('baridimobAccountDisplay')) {
                    document.getElementById('baridimobAccountDisplay').innerText = s.baridimob_account || (s.ccp_account_number ? s.ccp_account_number + (s.ccp_key || '') : '004253980505');
                }
                if (document.getElementById('ccpAccountDisplay')) {
                    document.getElementById('ccpAccountDisplay').innerText = s.ccp_account_number || '0042539805';
                }
                if (document.getElementById('ccpKeyDisplay')) {
                    document.getElementById('ccpKeyDisplay').innerText = s.ccp_key || '05';
                }
                if (document.getElementById('ccpRipDisplay')) {
                    document.getElementById('ccpRipDisplay').innerText = s.ccp_rip || '00799999004253980505';
                }
                if (document.getElementById('ccpHolderDisplay')) {
                    document.getElementById('ccpHolderDisplay').innerText = s.ccp_account_holder || 'منصة ZoomDz التعليمية';
                }
            }
        } catch (e) {
            console.warn('⚠️ تعذر جلب معلومات CCP:', e.message);
        }
    }

    function triggerReceiptUpload(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const fileInput = document.getElementById('receiptFileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    function previewDepositReceipt(input) {
        const file = (input && input.files && input.files[0]) ? input.files[0] : null;
        if (!file) return;

        // التحقق من حجم الملف (أقصى حد 25MB)
        if (file.size > 25 * 1024 * 1024) {
            showToast('حجم الملف كبير جداً (الحد الأقصى 25 ميغابايت)', 'error');
            removeDepositReceipt();
            return;
        }

        selectedDepositReceiptFile = file;

        const previewImg = document.getElementById('receiptPreviewImg');
        const previewBox = document.getElementById('receiptPreviewBox');
        const placeholder = document.getElementById('receiptUploadPlaceholder');
        const fileName = document.getElementById('receiptFileName');
        const fileSize = document.getElementById('receiptFileSize');

        if (fileName) fileName.innerText = file.name;
        if (fileSize) {
            const mb = file.size / (1024 * 1024);
            fileSize.innerText = mb >= 1 ? mb.toFixed(2) + ' MB' : Math.round(file.size / 1024) + ' KB';
        }

        if (file.type && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                if (previewImg) {
                    previewImg.src = e.target.result;
                    previewImg.style.display = 'block';
                }
                if (placeholder) placeholder.style.display = 'none';
                if (previewBox) previewBox.style.display = 'flex';
            };
            reader.onerror = function() {
                showToast('تعذر قراءة صورة الوصل', 'error');
            };
            reader.readAsDataURL(file);
        } else {
            if (previewImg) {
                previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2316a34a" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
                previewImg.style.display = 'block';
            }
            if (placeholder) placeholder.style.display = 'none';
            if (previewBox) previewBox.style.display = 'flex';
        }
    }

    function removeDepositReceipt(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        selectedDepositReceiptFile = null;
        const fileInput = document.getElementById('receiptFileInput');
        if (fileInput) fileInput.value = '';
        const previewImg = document.getElementById('receiptPreviewImg');
        const previewBox = document.getElementById('receiptPreviewBox');
        const placeholder = document.getElementById('receiptUploadPlaceholder');

        if (previewImg) previewImg.src = '';
        if (previewBox) previewBox.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
    }

    function setupReceiptDropzone() {
        const dropzone = document.getElementById('receiptDropzone');
        if (!dropzone || dropzone._dragDropInitialized) return;
        dropzone._dragDropInitialized = true;

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.style.borderColor = '#10b981';
                dropzone.style.backgroundColor = '#ecfdf5';
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.style.borderColor = '#94a3b8';
                dropzone.style.backgroundColor = '#f8fafc';
            }, false);
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                const fileInput = document.getElementById('receiptFileInput');
                if (fileInput) {
                    fileInput.files = files;
                    previewDepositReceipt(fileInput);
                }
            }
        }, false);
    }

    function copyTextValue(text, btnElement) {
        if (!text) return;
        navigator.clipboard.writeText(text.trim()).then(() => {
            if (btnElement) {
                const originalHtml = btnElement.innerHTML;
                btnElement.innerHTML = '<i class="fas fa-check"></i> تم النسخ!';
                btnElement.style.background = '#10b981';
                setTimeout(() => {
                    btnElement.innerHTML = originalHtml;
                    btnElement.style.background = '';
                }, 2000);
            }
            showToast('✅ تم نسخ الرقم إلى الحافظة بنجاح', 'success');
        }).catch(() => {
            showToast('رقم الحساب: ' + text, 'info');
        });
    }

    async function submitManualDeposit(e) {
        if (e) e.preventDefault();
        if (checkGuestAction()) return;

        const amountInput = document.getElementById('manualDepositAmount');
        const amount = parseFloat(amountInput ? amountInput.value : 0);
        const notes = document.getElementById('manualDepositNotes')?.value || '';

        const sMan = await getRevSettings();
        const minDepositMan = getDepositMinFrom(sMan);
        if (!amount || isNaN(amount) || amount < minDepositMan) {
            showToast('يرجى كتابة مبلغ صحيح لا يقل عن ' + minDepositMan + ' دج', 'warning');
            return;
        }

        if (!selectedDepositReceiptFile) {
            showToast('يرجى إرفاق صورة واضحة لوصل الدفع أو لقطة شاشة التحويل', 'error');
            return;
        }

        const btn = document.getElementById('submitManualDepositBtn');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري رفع الوصل وإرسال الطلب...';
        }

        try {
            const formData = new FormData();
            formData.append('amount', amount);
            formData.append('notes', notes);
            formData.append('receipt', selectedDepositReceiptFile);

            const token = localStorage.getItem('token');
            const res = await fetch('/api/wallet/manual-deposit', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await res.json();
            if (data.success) {
                showToast(data.message || 'تم إرسال طلب الشحن بنجاح!', 'success');
                closeDepositModal();
                if (typeof loadStudentBalance === 'function') loadStudentBalance();
                if (typeof loadTransactions === 'function') loadTransactions();
            } else {
                showToast(data.error || 'فشل في إرسال طلب الشحن', 'error');
            }
        } catch (err) {
            console.error('Manual deposit error:', err);
            showToast('حدث خطأ أثناء إرسال طلب الشحن. يرجى المحاولة لاحقاً.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }

    // ✅ جلب إعدادات رسوم المنصة (مخزن مؤقت) — لعرض الرسوم والحدود الدقيقة كما يحددها المدير
    let __revSettingsCache = null;
    async function getRevSettings() {
        if (__revSettingsCache) return __revSettingsCache;
        try {
            const res = await fetch('/api/settings/revenue_settings');
            const data = await res.json();
            if (data && typeof data === 'object') __revSettingsCache = data;
        } catch (e) { /* استخدام القيم الافتراضية */ }
        return __revSettingsCache || {};
    }

    function getDepositMinFrom(s) { const v = parseFloat(s && s.min_deposit_amount); return (!isNaN(v) && v >= 0) ? v : 100; }

    async function updateStudentDepositFee() {
        const val = parseFloat(document.getElementById('depositAmount').value) || 0;
        const s = await getRevSettings();
        const minDeposit = getDepositMinFrom(s);
        const hintEl = document.getElementById('depositMinHint');
        if (hintEl) hintEl.innerText = 'الحد الأدنى للشحن: ' + minDeposit + ' دج';
        const pctRaw = parseFloat(s.deposit_fee_percentage);
        const feePct = isNaN(pctRaw) ? 1 : pctRaw;
        const fixedRaw = parseFloat(s.deposit_fee_fixed);
        const feeFixed = isNaN(fixedRaw) ? 0 : fixedRaw;
        const box = document.getElementById('studentDepositFeeBox');
        if (!box) return;
        if (val >= minDeposit) {
            const fee = Math.round(val * feePct / 100) + feeFixed;
            const total = val + fee;
            document.getElementById('studentDepositNetDisplay').innerText = val.toLocaleString() + ' دج';
            document.getElementById('studentDepositFeeDisplay').innerText = fee.toLocaleString() + ' دج';
            document.getElementById('studentDepositTotalDisplay').innerText = total.toLocaleString() + ' دج';
            box.style.display = 'block';
        } else {
            box.style.display = 'none';
        }
    }

    async function depositWallet() {
        const amount = document.getElementById('depositAmount').value;
        const s = await getRevSettings();
        const minDeposit = getDepositMinFrom(s);
        if (!amount || parseFloat(amount) < minDeposit) {
            showToast('الحد الأدنى لشحن الرصيد هو ' + minDeposit + ' دج', 'warning');
            return;
        }
        const btn = document.querySelector('#goldCardSection .save-btn') || document.querySelector('#depositModal .save-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحويل إلى بوابة الدفع...';
        }
        try {
            const res = await fetchWithAuth('/api/wallet/deposit', {
                method: 'POST',
                body: JSON.stringify({ student_id: studentId, amount: amount })
            });
            const data = await res.json();
            if (data.success && data.checkout_url) {
                window.location.href = data.checkout_url;
            } else {
                showToast(data.error || 'فشل الاتصال ببوابة الدفع', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-credit-card"></i> متابعة الدفع الآمن';
                }
            }
        } catch(e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ أثناء الانتقال لبوابة الدفع', 'error');
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-credit-card"></i> متابعة الدفع الآمن';
            }
        }
    }

    function closeDepositModal() {
        document.getElementById('modalOverlay').style.display = 'none';
        document.getElementById('depositModal').style.display = 'none';
    }

    function startCameraForInput() {
        //  فتح الكاميرا مباشرة لالتقاط صورة الملف الشخصي (جوال) أو اختيار ملف
        const input = document.getElementById('editProfileImage');
        if (input) { input.setAttribute('capture', 'environment'); input.click(); }
    }

    // ================================================================
    // ✅ EDIT PROFILE - مع تعديل المستوى وعدم رفع الصورة إجبارياً
    // ================================================================

    function showEditProfileModal() {
        if (checkGuestAction()) return;
        if (userData) {
            document.getElementById('editFullName').value = userData.full_name || '';
            document.getElementById('editPhone').value = userData.phone || '';
            document.getElementById('editEducationLevel').value = userData.education_level || '';
            
            const otherGroup = document.getElementById('editOtherLevelGroup');
            if (userData.education_level && (userData.education_level === 'other' || !levelMap[userData.education_level])) {
                document.getElementById('editEducationLevel').value = 'other';
                otherGroup.style.display = 'block';
                document.getElementById('editOtherLevelText').value = userData.education_level || '';
            } else {
                otherGroup.style.display = 'none';
            }
            
            // ✅ إعادة تعيين حقل رفع الصورة
            const profileImageInput = document.getElementById('editProfileImage');
            if (profileImageInput) {
                profileImageInput.value = '';
            }
        } else {
            console.error('userData is not defined!');
        }
        document.getElementById('modalOverlay').style.display = 'block';
        document.getElementById('editProfileModal').style.display = 'block';
    }

    document.addEventListener('DOMContentLoaded', function() {
        fetchNewsTicker();
        checkUnreadPostsCount();
        setInterval(checkUnreadPostsCount, 90000);
        updateGroupsUnreadBadge();
        setInterval(updateGroupsUnreadBadge, 45000);

        // ✅ عدم إظهار نافذة إكمال الملف الشخصي تلقائياً عند الدخول أو التحديث (بناءً على طلب المستخدم)
        setTimeout(function() {
            try {
                if (userData && !userData.is_guest && userData.id !== -1) {
                    var hasParam = new URLSearchParams(window.location.search).get('complete_profile') === 'true';
                    if (hasParam) {
                        showToast('👋 مرحباً بك في ZoomDz! يرجى إكمال رقم هاتفك ومستواك الدراسي للبدء', 'info');
                        if (typeof showEditProfileModal === 'function') {
                            showEditProfileModal();
                        }
                    }
                }
            } catch (e) {
                console.error('Error checking profile completion:', e);
            }
        }, 1000);

        const levelSelect = document.getElementById('editEducationLevel');
        if (levelSelect) {
            levelSelect.addEventListener('change', function() {
                const otherGroup = document.getElementById('editOtherLevelGroup');
                if (this.value === 'other') {
                    otherGroup.style.display = 'block';
                } else {
                    otherGroup.style.display = 'none';
                }
            });
        }

        const urlParams = new URLSearchParams(window.location.search);
        
        // Handle /group/:id URL path
        const pathParts = window.location.pathname.split('/');
        const groupIndex = pathParts.indexOf('group');
        if (groupIndex !== -1 && pathParts[groupIndex + 1]) {
            const groupId = pathParts[groupIndex + 1];
            
            // Wait for user data to load to determine if guest
            const checkAndJoin = setInterval(() => {
                if (typeof userData !== 'undefined') {
                    clearInterval(checkAndJoin);
                    
                    // Force switch to groups section
                    showSection('groups');
                    
                    if (!userData || userData.is_guest || userData.id === -1) {
                        // User is a guest, just enter the group chat (browsing)
                        enterStudentGroupChat(groupId, 'مجموعة', '');
                    } else {
                        // User is logged in, attempt to join normally
                        joinStudentToGroup(groupId, 'مجموعة');
                    }
                }
            }, 500);
        }

        const lessonId = urlParams.get('lesson_id');
        if (lessonId) {
            fetch(`/api/offers/${lessonId}/view`, { method: 'POST' }).catch(() => {});
            setTimeout(() => {
                if (typeof openLessonDetails === 'function') {
                    openLessonDetails(lessonId);
                } else if (typeof viewOfferDetails === 'function') {
                    viewOfferDetails(lessonId);
                }
            }, 1200);
        }

        const joinGroupId = urlParams.get('join_group') || urlParams.get('group');
        if (joinGroupId) {
            showSection('groups');
            const isGuestUser = !userData || userData.is_guest || userData.id === -1;
            if (isGuestUser) {
                setTimeout(() => {
                    enterStudentGroupChat(joinGroupId, '', '');
                }, 150);
            } else {
                const token = localStorage.getItem('token');
                fetch(`/api/groups/${joinGroupId}/join`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    }
                })
                .then(res => res.json())
                .then(data => {
                    if (data.error && !data.error.includes('بالفعل')) {
                        showToast(data.error, 'error');
                    } else if (data.message && data.message.includes('بنجاح')) {
                        showToast('🎉 تم الانضمام إلى المجموعة بنجاح!', 'success');
                    }
                    showSection('groups');
                    enterStudentGroupChat(joinGroupId, '', '');
                })
                .catch(err => {
                    showSection('groups');
                    enterStudentGroupChat(joinGroupId, '', '');
                });
            }
        }
    });

    async function fetchNewsTicker() {
        try {
            const res = await fetch('/api/settings/news_ticker?role=student');
            if (res.ok) {
                const rawData = await res.json();
                const data = rawData.students || rawData;
                const ticker = document.getElementById('mainNewsTicker');
                const dynamicItems = document.querySelectorAll('.dynamic-news-item');
                
                if (data.active && data.text && data.text.trim()) {
                    dynamicItems.forEach(el => el.style.display = 'inline-flex');
                    const dynamicTexts = document.querySelectorAll('.dynamic-news-text');
                    dynamicTexts.forEach(el => el.textContent = data.text);
                } else {
                    dynamicItems.forEach(el => el.style.display = 'none');
                }
                
                if (data.speed) {
                    const tickerContents = document.querySelectorAll('.ticker-content');
                    tickerContents.forEach(el => el.style.animationDuration = `${data.speed}s`);
                }
                
                if (ticker) ticker.style.display = 'block';
            }
        } catch (e) {
            console.error('Error fetching student news ticker:', e);
        }
    }

    async function updateProfile() {
        const phoneVal = document.getElementById('editPhone').value.trim();
        if (phoneVal) {
            var dzPhoneRegex = /^(?:\+213|00213|213|0)(?:[567]\d{8}|[234]\d{7,8})$/;
            var cleanedPhone = phoneVal.replace(/[\s\-\(\)\.]/g, '');
            if (!dzPhoneRegex.test(cleanedPhone)) {
                showToast('⚠️ يرجى إدخال رقم هاتف جزائري صحيح (مثال: 0550123456 أو 0660123456 أو 0770123456)', 'error');
                document.getElementById('editPhone').style.borderColor = '#dc2626';
                return;
            }
        }

        const formData = new FormData();
        formData.append('student_id', studentId);
        formData.append('full_name', document.getElementById('editFullName').value);
        formData.append('phone', phoneVal);
        
        let educationLevel = document.getElementById('editEducationLevel').value;
        if (educationLevel === 'other') {
            const otherText = document.getElementById('editOtherLevelText').value.trim();
            if (otherText) {
                educationLevel = otherText;
            }
        }
        formData.append('education_level', educationLevel);
        
        // ✅ فقط إذا اختار المستخدم صورة جديدة يتم إرسالها، وإلا يتم تجاهلها
        const imageFile = document.getElementById('editProfileImage').files[0];
        if (imageFile) {
            formData.append('profile_image', imageFile);
            console.log('📷 تم اختيار صورة جديدة سيتم رفعها');
        } else {
            console.log('📷 لم يتم اختيار صورة جديدة، سيتم الاحتفاظ بالصورة الحالية');
        }
        
        try {
            const res = await fetchWithAuth('/api/student/update-profile', { 
                method: 'POST', 
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                showToast('تم  حديث الملف الشخصي والمستوى الدراسي بنجاح', 'success');
                if (data.user) data.user.role = 'student';
                userData = data.user;
                localStorage.setItem('userData', JSON.stringify(data.user));
                updateUI();
                closeModal();
                loadOffers();
                loadTeachers();
            } else {
                showToast(data.error || 'حدث خ أ', 'error');
            }
        } catch(e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                // ✅ رسالة خطأ واضحة دون إعادة تحميل الصفحة
                const detailed = (e.message && e.message !== 'حدث خطأ') ? e.message : 'تعذر رفع الصورة أو تحديث الملف الشخصي';
                showToast('⚠️ ' + detailed + ' — تأكد من حجم الملف (أقل من 25MB) ومن اتصالك بالإنترنت ثم أعد المحاولة', 'error');
            }
        }
    }

    function closeModal() {
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.style.display = 'none';
        const editModal = document.getElementById('editProfileModal');
        if (editModal) editModal.style.display = 'none';
        const txModal = document.getElementById('transactionsModal');
        if (txModal) txModal.style.display = 'none';
        closeTransactionModal();
    }

    function closeAllModals() {
        const modals = ['modalOverlay', 'editProfileModal', 'teacherProfileModal', 'giftResultModal', 'purchaseModal', 'ratingModal', 'withdrawModal', 'transactionDetailsModal', 'depositModal', 'transactionsModal', 'viewStudentModal', 'viewTeacherModal', 'errorDebugModal'];
        modals.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    function showTransactionDetailsByMappedId(id) {
        if (window.studentTransactionsMap && window.studentTransactionsMap[id]) {
            showTransactionDetails(window.studentTransactionsMap[id]);
        } else {
            showToast('لم يتم العثور على تفاصيل المعاملة', 'error');
        }
    }

    function showTransactionDetails(txInput) {
        try {
            let tx;
            if (typeof txInput === 'string') {
                tx = JSON.parse(txInput);
            } else {
                tx = txInput;
            }
            
            // Set Amount
            const isDeposit = tx.type === 'deposit' || tx.type === 'credit' || tx.type === 'referral_gift' || tx.type === 'gift_reward' || tx.type === 'deposit_manual' || tx.type === 'manual_deposit';
            const sign = isDeposit ? '+' : '-';
            const amountEl = document.getElementById('txDetailsAmount');
            if (amountEl) {
                amountEl.textContent = `${sign} ${tx.amount} دج`;
                amountEl.style.color = tx.statusColor || '#0f172a';
            }
            
            // Set Status
            const statusEl = document.getElementById('txDetailsStatus');
            if (statusEl) {
                statusEl.textContent = tx.status || '';
                statusEl.style.backgroundColor = tx.statusBg || '#f1f5f9';
                statusEl.style.color = tx.statusColor || '#0f172a';
            }
            
            // Set IDs
            const txIdEl = document.getElementById('txDetailsId');
            if (txIdEl) txIdEl.textContent = tx.id;
            
            const sofizGroup = document.getElementById('txDetailsSofizGroup');
            if (sofizGroup) {
                if (tx.sofizId) {
                    const sofizIdEl = document.getElementById('txDetailsSofizId');
                    if (sofizIdEl) sofizIdEl.textContent = tx.sofizId;
                    sofizGroup.style.display = 'flex';
                } else {
                    sofizGroup.style.display = 'none';
                }
            }
            
            // Set Date & Desc
            const dateEl = document.getElementById('txDetailsDate');
            if (dateEl) dateEl.textContent = tx.date;
            const descEl = document.getElementById('txDetailsDesc');
            if (descEl) descEl.textContent = tx.desc || 'لا يوجد وصف';
            
            // Show Modal
            const overlay = document.getElementById('modalOverlay');
            if (overlay) overlay.style.display = 'block';
            const modal = document.getElementById('transactionDetailsModal');
            if (modal) {
                modal.style.display = 'block';
                modal.style.opacity = '0';
                modal.style.transform = 'translate(-50%, -45%)';
                setTimeout(() => {
                    modal.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                    modal.style.opacity = '1';
                    modal.style.transform = 'translate(-50%, -50%)';
                }, 10);
            }
            
        } catch(e) {
            console.error('Error showing transaction details:', e);
            showToast('حدث خطأ في عرض التفاصيل', 'error');
        }
    }

    function closeTransactionModal() {
        const modal = document.getElementById('transactionDetailsModal');
        if (modal) modal.style.display = 'none';
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    function closeTeacherModal() {
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.style.display = 'none';
        const teacherModal = document.getElementById('teacherProfileModal');
        if (teacherModal) teacherModal.style.display = 'none';
    }

    // ================================================================
    // ✅ LOGOUT
    // ================================================================

    function logout() {
        window._isLoggingOut = true;
        try { localStorage.removeItem('token'); } catch (e) {}
        try { localStorage.removeItem('userData'); } catch (e) {}
        try { sessionStorage.clear(); } catch (e) {}
        try {
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e) {}
        try { if (typeof showToast === 'function') showToast('يتم تسجيل الخروج الآن', 'info'); } catch (e) {}
        setTimeout(() => { window.location.href = '/'; }, 400);
        // لو فشل الانتقال فلا يبقى الزر معطلاً للأبد
        setTimeout(() => { window._isLoggingOut = false; }, 2500);
    }

    function exitGuestAndNavigate(targetUrl) {
        localStorage.removeItem('token');
        localStorage.removeItem('userData');
        window.location.href = targetUrl || '/?register=true';
    }
    window.exitGuestAndNavigate = exitGuestAndNavigate;

    // ================================================================
    // ✅ UTILITY
    // ================================================================

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatFileSize(bytes) {
        if (!bytes || isNaN(bytes) || bytes <= 0) return 'PDF';
        const num = parseInt(bytes, 10);
        if (num < 1024) return num + ' B';
        if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
        return (num / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function renderPdfAttachmentHtml(fileUrl, fileName, fileSize, isSelf = false) {
        if (!fileUrl) return '';
        const safeUrl = escapeHtml(fileUrl);
        const safeName = escapeHtml(fileName || 'مرفق');
        const sizeStr = fileSize ? formatFileSize(fileSize) : '';

        // التحقق مما إذا كان المرفق صورة لعرضها بشكل مرئي وفوري بجودة عالية
        // روابط الوسيط (/api/proxy-image?url=...) تحمل الرابط الأصلي مرمزاً داخل
        // معلّم url — نفكّ الترميز ونفحص الامتداد على الرابط الأصلي، وإلا
        // عُرضت كل صورة رسالة كملف مستند (ويظهر فقط /api/proxy-image)
        const effectiveUrl = (fileUrl.indexOf('proxy-image?url=') !== -1)
            ? (function () { try { return decodeURIComponent(fileUrl.split('url=')[1] || ''); } catch (e) { return fileUrl; } })()
            : fileUrl;
        const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|avif)(\?.*)?$/i.test(effectiveUrl) ||
                        /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|avif)$/i.test(effectiveUrl) ||
                        /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|avif)$/i.test(fileName || '') ||
                        fileUrl.startsWith('data:image/');

        if (isImage) {
            return `
                <div class="chat-image-attachment-container" style="margin-top: 6px; margin-bottom: 4px; border-radius: 12px; overflow: hidden; border: 1px solid ${isSelf ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)'}; background: ${isSelf ? 'rgba(0,0,0,0.08)' : '#f8fafc'}; box-shadow: 0 2px 8px rgba(0,0,0,0.06); max-width: 100%; cursor: pointer;" onclick="event.stopPropagation(); if (window.openPlatformImageLightbox) { window.openPlatformImageLightbox('${safeUrl}', '${safeName}'); } else { window.open('${safeUrl}', '_blank'); }">
                    <div style="position: relative; overflow: hidden; border-radius: 11px; max-height: 280px; min-height: 100px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.03);">
                        <img src="${safeUrl}" alt="${safeName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; max-height: 280px; object-fit: contain; display: block; border-radius: 11px; transition: transform 0.2s ease;" onmouseenter="this.style.transform='scale(1.02)'" onmouseleave="this.style.transform='scale(1)'" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\'padding:15px; text-align:center; color:#ef4444; font-size:0.8rem;\'><i class=\'fas fa-image\'></i> تعذر تحميل الصورة</div>';" />
                        <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(15,23,42,0.75); backdrop-filter: blur(4px); color: #ffffff; padding: 3px 8px; border-radius: 20px; font-size: 0.68rem; font-weight: 600; display: flex; align-items: center; gap: 4px; pointer-events: none; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
                            <i class="fas fa-search-plus"></i> انقر للتكبير
                        </div>
                    </div>
                    ${fileName ? `<div style="padding: 5px 8px; font-size: 0.72rem; color: ${isSelf ? 'rgba(255,255,255,0.85)' : '#64748b'}; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><i class="fas fa-image" style="margin-left:4px;"></i>${safeName} ${sizeStr ? `(${sizeStr})` : ''}</div>` : ''}
                </div>`;
        }

        const bgStyle = isSelf ? 'background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);' : 'background: #f8fafc; border: 1px solid #e2e8f0;';
        const textColor = isSelf ? '#ffffff' : '#0f172a';
        const subColor = isSelf ? 'rgba(255,255,255,0.85)' : '#64748b';
        const btnBg = isSelf ? 'background: rgba(255,255,255,0.25); color: #ffffff; border: 1px solid rgba(255,255,255,0.4);' : 'background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;';
        return `
            <div class="chat-pdf-attachment-box" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; ${bgStyle} border-radius: 12px; margin-top: 6px; margin-bottom: 2px; cursor: pointer; transition: transform 0.15s ease;" onclick="window.open('${safeUrl}', '_blank')" onmouseenter="this.style.transform='translateY(-1px)'" onmouseleave="this.style.transform='translateY(0)'">
                <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background: ${isSelf ? 'rgba(255,255,255,0.2)' : '#fee2e2'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-file-pdf" style="color: ${isSelf ? '#ffffff' : '#dc2626'}; font-size: 1.25rem;"></i>
                    </div>
                    <div style="min-width: 0; flex: 1; text-align: right;">
                        <div style="font-weight: 700; font-size: 0.85rem; color: ${textColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeName}">
                            ${safeName}
                        </div>
                        <div style="font-size: 0.72rem; color: ${subColor};">
                            ${sizeStr} • انقر لفتح أو تحميل الملف
                        </div>
                    </div>
                </div>
                <div style="padding: 5px 10px; border-radius: 8px; ${btnBg} font-size: 0.75rem; font-weight: 700; display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                    <i class="fas fa-download"></i> فتح
                </div>
            </div>
        `;
    }

    function autoLinkUrls(text, options = {}) {
        if (!text) return '';
        const isSelf = options.isSelf || false;
        const defaultColor = isSelf ? '#93c5fd' : 'var(--primary, #2563eb)';
        const linkColor = options.linkColor || defaultColor;
        const extraClass = options.className || '';

        const escaped = String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

        const urlPattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|org|net|edu|gov|io|dz|me|app|site|online|info|store|dev|co|ai|tv|cc|ly|gl|be|tech|club|live|top|pro|xyz|space|academy|agency|digital)(?:\/[^\s<]*)?)/gi;

        let result = escaped.replace(urlPattern, (matched) => {
            let cleanUrl = matched;
            let trailing = '';

            while (/[.,;:!?)\]\u061B\u061F]$/.test(cleanUrl)) {
                trailing = cleanUrl.slice(-1) + trailing;
                cleanUrl = cleanUrl.slice(0, -1);
            }

            if (!cleanUrl) return matched;

            let href = cleanUrl;
            if (!/^https?:\/\//i.test(href) && !/^ftp:\/\//i.test(href)) {
                href = 'https://' + href;
            }

            return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="${extraClass}" style="color: ${linkColor}; font-weight: 700; text-decoration: underline; word-break: break-all;" onclick="event.stopPropagation();"><i class="fas fa-external-link-alt" style="font-size:0.7em; margin-left:3px;"></i>${cleanUrl}</a>${trailing}`;
        });

        if (options.enableHashtags) {
            result = result.replace(/(#[\w\u0600-\u06FF_]+)/g, '<span class="post-hashtag" style="color: #0284c7; background: #e0f2fe; border: 1px solid #bae6fd; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; margin: 2px 2px; display: inline-block;">$1</span>');
        }

        return result;
    }

    function parseContentWithLinks(text) {
        if (!text) return '';
        return autoLinkUrls(text, { enableHashtags: true });
    }

    function renderPostAttachments(imageUrlString) {
        if (!imageUrlString) return '';
        let files = [];
        if (Array.isArray(imageUrlString)) {
            files = imageUrlString;
        } else {
            try {
                files = JSON.parse(imageUrlString);
            } catch (e) {
                if (typeof imageUrlString === 'string' && imageUrlString.trim() !== '') {
                    files = [imageUrlString];
                } else {
                    return '';
                }
            }
        }
        if (!Array.isArray(files) || files.length === 0) return '';

        const images = [];
        const docs = [];
        files.forEach(fileUrl => {
            if (!fileUrl) return;
            // روابط الوسيط (/api/proxy-image?url=...) تحمل الرابط الأصلي مرمزاً —
            // نفكّ الترميز قبل فحص الامتداد حتى لا تُعرض الصورة كملف مستند
            const sourceUrl = fileUrl.indexOf('proxy-image?url=') !== -1
                ? decodeURIComponent(fileUrl.split('url=')[1] || '')
                : fileUrl;
            const cleanUrl = sourceUrl.split('?')[0].toLowerCase();
            const isImage = cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.gif') || cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.svg');
            if (isImage) images.push(fileUrl);
            else docs.push(fileUrl);
        });

        let html = '';

        // 1. Render Images Grid (Facebook Style)
        if (images.length > 0) {
            const count = images.length;
            let gridStyles = '';
            
            if (count === 1) {
                gridStyles = 'display: block;';
            } else if (count === 2) {
                gridStyles = 'display: grid; grid-template-columns: 1fr 1fr; gap: 4px;';
            } else if (count === 3) {
                gridStyles = 'display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 200px 200px; gap: 4px;';
            } else if (count === 4) {
                gridStyles = 'display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 200px 200px; gap: 4px;';
            } else {
                gridStyles = 'display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: 250px 150px; gap: 4px;';
            }

            html += `<div class="post-media-grid" style="${gridStyles} border-radius: 12px; overflow: hidden; margin-bottom: 14px; border: 1px solid #f1f5f9; background: #000;">`;
            
            images.forEach((imgUrl, idx) => {
                if (idx >= 5) return; 

                let imgStyles = 'width: 100%; height: 100%; object-fit: cover; cursor: pointer; transition: filter 0.2s;';
                let containerStyles = 'position: relative; overflow: hidden; height: 100%;';
                
                if (count === 1) {
                    imgStyles = 'width: 100%; max-height: 500px; object-fit: contain; background: #1a1a1a; cursor: pointer; display: block;';
                } else if (count === 3) {
                    if (idx === 0) containerStyles += ' grid-row: span 2;';
                } else if (count === 5 || count > 5) {
                    if (idx < 2) containerStyles += ' grid-column: span 3;';
                    else containerStyles += ' grid-column: span 2;';
                }

                // Prepare images array for lightbox
                // We use single quotes for the attribute to avoid conflict with JSON double quotes
                const imagesJson = JSON.stringify(images).replace(/'/g, "&apos;");

                html += `
                    <div style="${containerStyles}" onclick='openLightbox(${imagesJson}, ${idx})'>
                        <img src="${escapeHtml(imgUrl)}" style="${imgStyles}" referrerpolicy="no-referrer" onmouseover="this.style.filter='brightness(0.9)'" onmouseout="this.style.filter='brightness(1)'">
                        ${idx === 4 && count > 5 ? `<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 700; pointer-events: none; backdrop-filter: blur(2px);">+${count - 5}</div>` : ''}
                    </div>`;
            });
            html += `</div>`;
        }

        // 2. Render Documents
        if (docs.length > 0) {
            html += '<div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px;">';
            docs.forEach((fileUrl, index) => {
                const fileName = fileUrl.split('/').pop().split('?')[0] || `ملف_${index + 1}`;
                let decodedName = fileName;
                try { decodedName = decodeURIComponent(fileName); } catch (e) {}
                let icon = 'fa-file-alt';
                let color = '#3b82f6';
                let bg = '#eff6ff';

                if (decodedName.toLowerCase().endsWith('.pdf')) {
                    icon = 'fa-file-pdf'; color = '#ef4444'; bg = '#fef2f2';
                } else if (decodedName.toLowerCase().endsWith('.doc') || decodedName.toLowerCase().endsWith('.docx')) {
                    icon = 'fa-file-word'; color = '#2563eb'; bg = '#eff6ff';
                } else if (decodedName.toLowerCase().endsWith('.xls') || decodedName.toLowerCase().endsWith('.xlsx')) {
                    icon = 'fa-file-excel'; color = '#16a34a'; bg = '#f0fdf4';
                }

                html += `
                    <a href="${escapeHtml(fileUrl)}" target="_blank" download class="file-download-btn" style="display: flex; align-items: center; justify-content: space-between; background: ${bg}; border: 1px solid ${color}33; padding: 10px 16px; border-radius: 12px; text-decoration: none; color: #1e293b; transition: all 0.2s ease;">
                        <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
                            <div style="background: white; color: ${color}; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i class="fas ${icon}"></i>
                            </div>
                            <div style="display: flex; flex-direction: column; overflow: hidden;">
                                <span style="font-weight: 700; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${escapeHtml(decodedName)}</span>
                            </div>
                        </div>
                        <i class="fas fa-download" style="color: ${color}; opacity: 0.7;"></i>
                    </a>`;
            });
            html += '</div>';
        }

        return html;
    }

    // ================================================================
    // ✅ CLOSE DROPDOWNS ON CLICK OUTSIDE
    // ================================================================

    document.addEventListener('click', function(e) {
        const notifBtn = document.getElementById('notifBtn');
        const notifDropdown = document.getElementById('notifDropdown');
        const profileBtn = document.getElementById('profileBtn');
        const profileDropdown = document.getElementById('profileDropdown');

        if (notifBtn && notifDropdown && !notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
            notifDropdown.classList.remove('open');
        }
        if (profileBtn && profileDropdown && !profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
            profileDropdown.classList.remove('open');
        }
    });

    // ================================================================
    // ✅ INIT
    // ================================================================

    let autoRefreshInterval = null;
    let fastNotifInterval = null;

    // ✅ التحديثات الدورية:30 ثانية بدل4/5 (تقليل كبير لطلبات قاعدة
    //    البيانات)، وتتوقف مؤقتاً إذا كان تبويب المتصفح مخفياً
    function startAutoRefresh() {
        if (userData && (userData.is_guest || userData.id === -1)) return;
        checkUnreadMessagesCount();
        loadNotifications();

        if (fastNotifInterval) clearInterval(fastNotifInterval);
        fastNotifInterval = setInterval(async () => {
            if (!studentId || document.hidden) return;
            try {
                await loadNotifications();
            } catch(e) {}
        }, 60000);

        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(async () => {
            if (!studentId || document.hidden) return;
            try {
                await loadWallet();
                await checkUnreadMessagesCount();
                if (currentSection === 'offers') {
                    await loadOffers(true);
                } else if (currentSection === 'bookings') {
                    await loadMyBookings(true);
                } else if (currentSection === 'transactions') {
                    await loadWallet();
                } else if (currentSection === 'referral') {
                    if (typeof loadReferralData === 'function') await loadReferralData();
                } else if (currentSection === 'messages') {
                    if (currentChatTeacher) {
                        await loadConversationMessages(currentChatTeacher.id, currentChatTeacher.type || 'teacher', true);
                    } else {
                        await loadConversations(true);
                    }
                }
                // Background update of bookings to detect when teacher starts or pauses stream
                if (currentSection !== 'bookings') {
                    await loadMyBookings(true);
                }
            } catch (e) {
                // silent background polling
            }
        }, 30000);
    }

    // ✅ عند العودة إلى التبويب: تحديث فوري واحد بدل انتظار الدورة القادمة
    document.addEventListener('visibilitychange', async function() {
        if (document.visibilityState !== 'visible' || !studentId) return;
        try {
            await loadNotifications();
            await loadWallet();
            await checkUnreadMessagesCount();
        } catch (e) {}
    });

    // ============================================================
    // PRELOADER CONTROLLER
    // ============================================================
    let preloaderStartTime = Date.now();

    function updatePreloaderProgress(percent, statusText) {
        const fill = document.getElementById('preloaderProgressFill');
        const status = document.getElementById('preloaderStatusText');
        if (fill) fill.style.width = percent + '%';
        if (status && statusText) status.textContent = statusText;
    }

    async function hidePreloader(instant = false) {
        updatePreloaderProgress(100, 'تم التحميل بنجاح!');
        const elapsedTime = Date.now() - preloaderStartTime;
        const remainingTime = instant ? 0 : Math.max(0, 800 - elapsedTime);
        setTimeout(() => {
            const loader = document.getElementById('platformPreloader');
            if (loader) {
                loader.classList.add('fade-out');
                setTimeout(() => {
                    loader.style.display = 'none';
                }, 300);
            }
        }, remainingTime);
    }

    // Safety fallback so preloader never hangs indefinitely
    setTimeout(() => {
        const loader = document.getElementById('platformPreloader');
        if (loader && loader.style.display !== 'none') {
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.style.display = 'none';
            }, 300);
        }
    }, 1500);

    updatePreloaderProgress(30, 'جاري جلب معلومات الطالب...');
    loadUserData().then(() => {
        updatePreloaderProgress(80, 'جاري إعداد الأقسام والدروس...');
        const urlParams = new URLSearchParams(window.location.search);
        const sharedPost = urlParams.get('post');
        const sharedOffer = urlParams.get('offer');
        const sharedCourse = urlParams.get('course');
        const sharedGroup = urlParams.get('join_group') || urlParams.get('group');
        const sharedExercise = urlParams.get('exercise');
            const sharedPackage = urlParams.get('package') || urlParams.get('view_package');
        const hasShared = sharedPost || sharedOffer || sharedCourse || sharedGroup || sharedExercise || sharedPackage;

        const requestedSection = urlParams.get('section');
        if (sharedGroup) {
            showSection('groups');
            enterStudentGroupChat(sharedGroup, '', '');
            hidePreloader(true);
        } else if (sharedExercise) {
            showSection('exercises');
            hidePreloader(true);
                } else if (sharedPackage) {
            showSection('packages');
            if (typeof loadStudentPackages === 'function') {
                loadStudentPackages().then(() => {
                    if (typeof openPackageDetailsModal === 'function') {
                        openPackageDetailsModal(sharedPackage);
                    }
                });
            } else {
                if (typeof openPackageDetailsModal === 'function') openPackageDetailsModal(sharedPackage);
            }
            hidePreloader(true);
        } else if (sharedPost) {
            showSection('posts');
            hidePreloader(true);
        } else if (sharedOffer) {
            showSection('offers');
            hidePreloader(true);
        } else if (sharedCourse) {
            showSection('courses');
            hidePreloader(true);
        } else if (requestedSection) {
            showSection(requestedSection);
            hidePreloader();
        } else {
            showSection('exercises');
            hidePreloader();
        }
        startAutoRefresh();
    }).catch(() => {
        hidePreloader(true);
    });

    async function manualRefresh() {
        const icon = document.getElementById('refreshIcon');
        if (icon) {
            icon.classList.add('fa-spin');
        }
        
        try {
            if (currentSection === 'offers') await loadOffers();
            else if (currentSection === 'posts') await loadStudentPosts();
            else if (currentSection === 'bookings') await loadMyBookings();
            else if (currentSection === 'teachers') await loadTeachers();
            else if (currentSection === 'courses') await loadStudentCourses();
            else if (currentSection === 'transactions') await loadWallet();
            else if (currentSection === 'referral') await loadReferralData();
            
            await loadWallet();
            await loadNotifications();
            
            showToast('تم تحديث البيانات بنجاح', 'success');
        } catch (e) {
            console.error(e);
            showToast('حدث خطأ أثناء التحديث', 'error');
        } finally {
            if (icon) {
                setTimeout(() => icon.classList.remove('fa-spin'), 500);
            }
        }
    }

    // ================================================================
    // POSTS LOGIC FOR STUDENTS (منشورات الأساتذة)
    // ================================================================
    let studentPostsFilter = 'all'; // 'all' or 'saved'
    let studentPostsOffset = 0;
    let studentPostsLimit = 10;
    let studentPostsHasMore = true;
    let studentPostsLoading = false;
    let studentPostsObserver = null;

    function setStudentPostsFilter(filter) {
        if (studentPostsFilter === filter) return;
        studentPostsFilter = filter;

        const allBtn = document.getElementById('student-post-filter-all');
        const savedBtn = document.getElementById('student-post-filter-saved');

        if (allBtn && savedBtn) {
            if (filter === 'all') {
                allBtn.style.background = 'white';
                allBtn.style.color = 'var(--primary)';
                allBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
                savedBtn.style.background = 'transparent';
                savedBtn.style.color = '#64748b';
                savedBtn.style.boxShadow = 'none';
            } else {
                savedBtn.style.background = 'white';
                savedBtn.style.color = 'var(--primary)';
                savedBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
                allBtn.style.background = 'transparent';
                allBtn.style.color = '#64748b';
                allBtn.style.boxShadow = 'none';
            }
        }

        loadStudentPosts(true);
    }
    window.setStudentPostsFilter = setStudentPostsFilter;

    async function updateStudentSavedCountBadge() {
        const badge = document.getElementById('studentSavedPostsBadge');
        if (!badge) return;
        try {
            const res = await fetchWithAuth('/api/post?saved_only=true&limit=100');
            if (res.ok) {
                const data = await res.json();
                const count = Array.isArray(data) ? data.length : (data.posts || []).length;
                badge.textContent = count;
            }
        } catch (e) {}
    }
    window.updateStudentSavedCountBadge = updateStudentSavedCountBadge;

    async function loadStudentPosts(reset = true) {
        const feed = document.getElementById('studentPostsFeedContainer');
        if (!feed) return;

        if (reset) {
            studentPostsOffset = 0;
            studentPostsHasMore = true;
            studentPostsLoading = false;
            feed.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #6b7280;">
                    <i class="fas fa-spinner fa-spin fa-2x"></i>
                    <p style="margin-top: 10px;">جاري تحميل المنشورات...</p>
                </div>`;
        }

        if (studentPostsLoading || (!reset && !studentPostsHasMore)) return;
        studentPostsLoading = true;

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const sharedPost = urlParams.get('post');
            let postEndpoint = `/api/post?limit=${studentPostsLimit}&offset=${studentPostsOffset}`;
            if (studentPostsFilter === 'saved') {
                postEndpoint += '&saved_only=true';
            }
            if (sharedPost && reset) {
                postEndpoint += `&include_post_id=${encodeURIComponent(sharedPost)}`;
            }

            let data;
            try {
                const res = await fetchWithAuth(postEndpoint);
                data = await res.json();
            } catch (authErr) {
                console.warn('fetchWithAuth failed, fallback to fetchPublicData:', authErr);
                data = await fetchPublicData(postEndpoint);
            }
            const posts = Array.isArray(data) ? data : (data.posts || data.data || []);
            
            updateStudentSavedCountBadge();

            if (reset && posts.length === 0) {
                if (studentPostsFilter === 'saved') {
                    feed.innerHTML = `
                        <div style="text-align: center; padding: 50px 20px; background: white; border-radius: 16px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 4px 18px rgba(0,0,0,0.03);">
                            <i class="fas fa-bookmark" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 12px;"></i>
                            <h4 style="font-weight: 800; color: #475569; margin-bottom: 6px;">لا توجد منشورات محفوظة</h4>
                            <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 16px;">يمكنك  فظ أي منشور للرجوع إليه لاحقاً بالنقر على زر حفظ 🔖 أسفل أي منشور.</p>
                            <button onclick="setStudentPostsFilter('all')" style="background: var(--primary); color: white; border: none; padding: 8px 22px; border-radius: 20px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                                <i class="fas fa-stream"></i> استعراض جميع المنشورات
                            </button>
                        </div>`;
                } else {
                    feed.innerHTML = `
                        <div style="text-align: center; padding: 50px 20px; background: white; border-radius: 16px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 4px 18px rgba(0,0,0,0.03);">
                            <i class="fas fa-newspaper" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 12px;"></i>
                            <h4 style="font-weight: 800; color: #475569; margin-bottom: 6px;">لا توجد منشورات حتى الآن</h4>
                            <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 16px;">سيظهر هنا كل منشور جديد يشاركه الأساتذة معنا!</p>
                            <button onclick="loadStudentPosts(true)" style="background: var(--primary); color: white; border: none; padding: 8px 22px; border-radius: 20px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                                <i class="fas fa-sync-alt"></i> تحديث المنشورات
                            </button>
                        </div>`;
                }
                studentPostsLoading = false;
                return;
            }

            const cardsHtml = posts.map(post => {
                try {
                    fetchWithAuth(`/api/post/${post.id}/view`, { method: 'POST' }).catch(() => {});
                    return renderPostCardHtml(post);
                } catch (renderErr) {
                    console.error('Error rendering post card:', renderErr, post);
                    return '';
                }
            }).join('');

            // ✅ إعلان مدمج بين المنشورات (مطابق للمستوى + مرة واحدة كل 24 ساعة)
            let finalCardsHtml = cardsHtml;
            try {
                if (window.ZoomDzAds && posts.length >= 3) {
                    const ad = await window.ZoomDzAds.match('between_posts');
                    if (ad) finalCardsHtml += window.ZoomDzAds.cardHtml(ad);
                }
            } catch (adErr) {}

            const oldSentinel = document.getElementById('studentPostsSentinel');
            if (oldSentinel) oldSentinel.remove();

            if (reset) {
                feed.innerHTML = finalCardsHtml;
            } else {
                feed.insertAdjacentHTML('beforeend', finalCardsHtml);
            }

            studentPostsOffset += posts.length;
            if (posts.length < studentPostsLimit || (data && data.has_more === false)) {
                studentPostsHasMore = false;
                const endCardHtml = `
                    <div style="text-align: center; padding: 25px 20px; background: white; border-radius: 16px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 4px 18px rgba(0,0,0,0.03); margin-top: 15px; margin-bottom: 25px;">
                        <i class="fas fa-check-circle" style="font-size: 2rem; color: var(--primary); margin-bottom: 8px;"></i>
                        <h4 style="font-weight: 800; color: #374151; margin-bottom: 4px; font-size: 0.95rem;">${studentPostsFilter === 'saved' ? 'وصلت إلى نهاية منشوراتك المحفوظة' : 'شاهدت جميع المنشورات'}</h4>
                        <button onclick="loadStudentPosts(true)" style="background: #f1f5f9; color: var(--primary); border: 1px solid #cbd5e1; padding: 8px 20px; border-radius: 20px; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; margin-top: 10px;">
                            <i class="fas fa-sync-alt"></i> تحديث من البداية
                        </button>
                    </div>`;
                feed.insertAdjacentHTML('beforeend', endCardHtml);
            } else {
                const sentinelHtml = `
                    <div id="studentPostsSentinel" style="text-align: center; padding: 20px; color: #64748b; font-weight: 700;">
                        <i class="fas fa-spinner fa-spin"></i> جاري تحميل المزيد من المنشورات...
                    </div>`;
                feed.insertAdjacentHTML('beforeend', sentinelHtml);

                if (window.IntersectionObserver) {
                    if (studentPostsObserver) studentPostsObserver.disconnect();
                    studentPostsObserver = new IntersectionObserver((entries) => {
                        if (entries[0].isIntersecting && studentPostsHasMore && !studentPostsLoading) {
                            loadStudentPosts(false);
                        }
                    }, { threshold: 0.1 });
                    const newSentinel = document.getElementById('studentPostsSentinel');
                    if (newSentinel) studentPostsObserver.observe(newSentinel);
                }
            }

            if (sharedPost && reset) {
                setTimeout(() => {
                    const el = document.getElementById(`post-card-${sharedPost}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.style.border = '3px solid var(--primary)';
                        el.style.boxShadow = '0 0 25px rgba(30, 64, 175, 0.5)';
                        showToast('📍 تم الانتقال للمنشور المطلوب بنجاح', 'info');
                    }
                }, 200);
            }
        } catch (e) {
            console.error('Error loading student posts:', e);
            if (reset) {
                feed.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: #ef4444; background: white; border-radius: 16px;">
                        <i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom: 8px;"></i>
                        <p>حدث خطأ أثناء تحميل المنشورات</p>
                        <button onclick="loadStudentPosts(true)" style="margin-top: 10px; background: #fee2e2; color: #991b1b; border: none; padding: 6px 16px; border-radius: 12px; font-weight: 700; cursor: pointer;">إعادة المحاولة</button>
                    </div>`;
            }
        } finally {
            studentPostsLoading = false;
        }
    }

let studentPostFilesArray = [];

    async function handleStudentPostFilesSelect(e) {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const compressedFiles = await Promise.all(files.map(f => compressImageFile(f)));
        studentPostFilesArray = [...studentPostFilesArray, ...compressedFiles].slice(0, 10);
        renderStudentPostFilesPreview();
    }

    async function copyGroupLink() {
        if (!activeStudentGroupId) {
            showToast('⚠️ لم يتم تحديد مجموعة حالياً', 'error');
            return;
        }
        const link = `${window.location.origin}/group/${activeStudentGroupId}`;
        try {
            await navigator.clipboard.writeText(link);
            showToast('✅ تم نسخ رابط المجموعة بنجاح', 'success');
        } catch (err) {
            showToast('❌ تعذر نسخ الرابط', 'error');
        }
    }

    function removeStudentPostFile(index) {
        studentPostFilesArray.splice(index, 1);
        renderStudentPostFilesPreview();
    }

    function renderStudentPostFilesPreview() {
        const container = document.getElementById('studentPostPreviewContainer');
        if (!container) return;

        if (studentPostFilesArray.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = studentPostFilesArray.map((file, idx) => {
            const isImg = file.type.startsWith('image/');
            const objectUrl = isImg ? URL.createObjectURL(file) : '';
            return `
                <div style="position: relative; width: 100%; height: 90px; border-radius: 12px; overflow: hidden; border: 1.5px solid #cbd5e1; background: #f8fafc; display: flex; align-items: center; justify-content: center;">
                    ${isImg ? `<img src="${objectUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : `<i class="fas fa-file-alt" style="font-size: 1.8rem; color: #2563eb;"></i>`}
                    <button type="button" onclick="removeStudentPostFile(${idx})" style="position: absolute; top: 4px; right: 4px; background: rgba(239,68,68,0.9); color: white; border: none; width: 22px; height: 22px; border-radius: 50%; font-size: 0.7rem; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">&times;</button>
                </div>
            `;
        }).join('');
    }

    function showStudentAddPostModal() {
        const modal = document.getElementById('studentAddPostModal');
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.style.display = 'block';
        if (modal) modal.style.display = 'block';

        if (userData) {
            const avatarEl = document.getElementById('createPostStudentAvatar');
            const nameEl = document.getElementById('createPostStudentName');
            const stName = userData.full_name || userData.name || userData.username || 'طالب المنصة';
            const stImg = userData.profile_url || userData.profile_image || userData.avatar || '/images/default-avatar.svg';
            if (avatarEl) avatarEl.src = stImg;
            if (nameEl) nameEl.textContent = stName;
        }

        setTimeout(() => {
            const input = document.getElementById('studentPostContentInput');
            if (input) input.focus();
        }, 150);
    }
    window.showStudentAddPostModal = showStudentAddPostModal;

    function hideStudentAddPostModal() {
        const modal = document.getElementById('studentAddPostModal');
        const overlay = document.getElementById('modalOverlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }
    window.hideStudentAddPostModal = hideStudentAddPostModal;

    async function submitStudentNewPost() {
        const contentInput = document.getElementById('studentPostContentInput');
        const linkInput = document.getElementById('studentPostLinkInput');
        const hashtagsInput = document.getElementById('studentPostHashtagsInput');
        const btn = document.getElementById('submitStudentPostBtn');

        let content = (contentInput?.value || '').trim();
        const link_url = (linkInput?.value || '').trim();
        const rawHashtags = (hashtagsInput?.value || '').trim();

        if (!content && studentPostFilesArray.length === 0 && !link_url) {
            showToast('⚠️ يرجى كتابة محتوى المنشور أو إرفاق رابط/صورة أولاً', 'warning');
            return;
        }

        if (rawHashtags) {
            const formattedHashtags = rawHashtags.split(/\s+/)
                .filter(tag => tag)
                .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
                .join(', ');
            if (formattedHashtags && !content.includes(formattedHashtags)) {
                content = content ? `${content}\n\n${formattedHashtags}` : formattedHashtags;
            }
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري النشر...';
        }

        try {
            const formData = new FormData();
            formData.append('content', content);
            if (link_url) {
                formData.append('link_url', link_url);
            }

            if (studentPostFilesArray.length > 0) {
                studentPostFilesArray.forEach(file => {
                    formData.append('files', file);
                });
            }

            const res = await fetchWithAuth('/api/posts/create', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.success) {
                showToast('🎉 تم نشر منشورك بنجاح!', 'success');
                if (contentInput) contentInput.value = '';
                if (linkInput) linkInput.value = '';
                if (hashtagsInput) hashtagsInput.value = '';
                studentPostFilesArray = [];
                renderStudentPostFilesPreview();
                hideStudentAddPostModal();
                if (typeof loadStudentPosts === 'function') loadStudentPosts(true);
            } else {
                showToast(data.error || '❌ فشل نشر المنشور', 'error');
            }
        } catch(err) {
            showToast('❌ حدث خطأ أثناء نشر المنشور', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>نشر المنشور</span>';
            }
        }
    }

    async function deleteStudentPost(postId) {
        if (!confirm('هل أنت متأكد من رغبتك في حذف هذا المنشور نهائياً؟')) return;
        try {
            const res = await fetchWithAuth(`/api/posts/${postId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                showToast('🗑️ تم حذف المنشور بنجاح', 'success');
                const card = document.getElementById(`post-card-${postId}`);
                if (card) card.remove();
                if (typeof loadStudentPosts === 'function') loadStudentPosts(true);
            } else {
                showToast(data.error || 'فشل حذف المنشور', 'error');
            }
        } catch(err) {
            showToast('حدث خطأ أثناء حذف المنشور', 'error');
        }
    }

    function formatEduLevel(level) {
        if (!level) return '';
        if (level === 'middle_all') return 'جميع مستويات المتوسط';
        if (level === 'primary_all') return 'جميع مستويات الابتدائي';
        if (level === 'secondary_all') return 'جميع مستويات الثانوي';
        if (level === 'university_all') return 'التعليم الجامعي';
        if (level === 'middle_1') return 'السنة الأولى متوسط';
        if (level === 'middle_2') return 'السنة الثانية متوسط';
        if (level === 'middle_3') return 'السنة الثالثة متوسط';
        if (level === 'middle_4') return 'السنة الرابعة متوسط';
        if (level === 'secondary_1') return 'السنة الأولى ثانوي';
        if (level === 'secondary_2') return 'السنة الثانية ثانوي';
        if (level === 'secondary_3') return 'السنة الثالثة ثانوي';
        return level;
    }

    function renderPostCardHtml(post) {
        const postDate = post.created_at ? new Date(post.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '';
        const isStudentPost = !!post.is_student_post || post.author_type === 'student' || !!post.student_id;
        const myStudentId = userData ? (userData.id || userData.userId) : null;
        
        const isMyPost = myStudentId && (
            (post.student_id && String(post.student_id) === String(myStudentId)) ||
            (post.user_id && String(post.user_id) === String(myStudentId)) ||
            (post.teacher_id && String(post.teacher_id) === String(myStudentId)) ||
            (isStudentPost && (!post.teacher_name || post.teacher_name === 'طالب المنصة' || post.teacher_name === 'مستخدم'))
        );

        let displayName = post.teacher_name;
        let displaySpec = post.teacher_specialization;
        let displayImg = post.teacher_profile_image;

        if (isMyPost && userData) {
            displayName = userData.full_name || userData.name || userData.username || displayName;
            displaySpec = userData.grade || formatEduLevel(userData.education_level) || displaySpec;
            displayImg = userData.profile_url || userData.profile_image || userData.avatar || displayImg;
        }

        if (isStudentPost) {
            if (!displayName || displayName === 'طالب المنصة' || displayName === 'مستخدم') {
                if (userData) displayName = userData.full_name || userData.name || 'طالب المنصة';
            }
            if (!displaySpec || displaySpec === 'طالب المنصة' || displaySpec === 'طالب' || displaySpec === 'middle_all') {
                if (userData) displaySpec = userData.grade || formatEduLevel(userData.education_level) || 'جميع مستويات المتوسط';
            }
            if (!displayImg || displayImg === 'null' || displayImg === 'undefined' || displayImg === '/images/default-avatar.svg') {
                if (userData && (userData.profile_url || userData.profile_image)) {
                    displayImg = userData.profile_url || userData.profile_image;
                }
            }
        }

        const authorImg = (displayImg && displayImg !== 'null' && displayImg !== 'undefined') ? displayImg : '/images/default-avatar.svg';
        const isFollowing = post.is_following || false;

        const profileClick = isStudentPost
            ? `showStudentProfile(${post.student_id || post.user_id || post.teacher_id || myStudentId})`
            : `showTeacherProfile(${post.teacher_id})`;

        const authorBadge = isStudentPost
            ? `<span style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; font-size: 0.68rem; padding: 2px 8px; border-radius: 8px; font-weight: 800;"><i class="fas fa-user-graduate"></i> طالب</span>`
            : (post.is_certified ? `<i class="fas fa-certificate" style="font-size: 0.75rem; color: var(--primary);"></i>` : '');

        let linkHtml = '';
        if (post.link_url) {
            let href = post.link_url.startsWith('http') ? post.link_url : 'https://' + post.link_url;
            linkHtml = `
                <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; gap: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; text-decoration: none; font-weight: 600; font-size: 0.88rem; word-break: break-all; transition: background 0.2s;">
                    <i class="fas fa-external-link-alt" style="color: #16a34a;"></i>
                    <span>${escapeHtml(post.link_url)}</span>
                </a>`;
        }

        let actionBtnsHtml = '';
        if (isMyPost) {
            actionBtnsHtml = `
                <button onclick="event.stopPropagation(); deleteStudentPost(${post.id})" style="background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; padding: 6px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;" title="حذف المنشور">
                    <i class="fas fa-trash-alt"></i> <span>حذف المنشور</span>
                </button>
            `;
        } else if (!isStudentPost && post.teacher_id) {
            actionBtnsHtml = `
                <button class="follow-btn-${post.teacher_id}" onclick="event.stopPropagation(); toggleFollowTeacher(${post.teacher_id})" style="${isFollowing ? 'background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;' : 'background: var(--primary); color: white; border: none;'} padding: 6px 16px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.3s ease; box-shadow: ${isFollowing ? 'none' : '0 4px 12px rgba(15, 92, 191, 0.2)'};">
                    <i class="fas ${isFollowing ? 'fa-check-circle' : 'fa-user-plus'}"></i>
                    <span>${isFollowing ? 'تتابعه' : 'متابعة'}</span>
                </button>
                <button onclick="event.stopPropagation(); openReportModal('post', ${post.id}, '${escapeHtml(displayName || 'منشور')}')" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; padding: 6px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;" title="إبلاغ عن المنشور">
                    <i class="fas fa-flag"></i>
                </button>
            `;
        } else {
            actionBtnsHtml = `
                <button onclick="event.stopPropagation(); openReportModal('post', ${post.id}, '${escapeHtml(displayName || 'منشور')}')" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; padding: 6px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;" title="إبلاغ عن المنشور">
                    <i class="fas fa-flag"></i>
                </button>
            `;
        }

        return `
            <div class="post-card" id="post-card-${post.id}" style="background: white; border-radius: 20px; padding: 24px; margin-bottom: 24px; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.05); border: 1px solid #cbd5e1; border-top: 3px solid #1e3a8a; transition: transform 0.2s ease;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;">
                    <div style="display: flex; align-items: center; gap: 14px; cursor: pointer;" onclick="${profileClick}" title="عرض الملف الشخصي">
                        <div style="position: relative;">
                            <img src="${escapeHtml(authorImg)}" alt="avatar" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2px solid white; box-shadow: 0 0 0 2px #cbd5e1;" referrerpolicy="no-referrer" onerror="this.src='/images/default-avatar.svg'">
                            <div style="position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; background: #22c55e; border: 2px solid white; border-radius: 50%;"></div>
                        </div>
                        <div>
                            <div style="font-weight: 800; font-size: 1.05rem; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                                <span>${escapeHtml(displayName)}</span>
                                ${authorBadge}
                            </div>
                            <div style="font-size: 0.8rem; color: #334155; font-weight: 700;">${escapeHtml(displaySpec)} • <span style="color: #64748b; font-weight: 500;">${postDate}</span></div>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${actionBtnsHtml}
                    </div>
                </div>

                <div style="font-size: 1.12rem; line-height: 1.7; color: #0f172a; white-space: pre-wrap; word-break: break-word; margin-bottom: 18px; font-weight: 500; letter-spacing: -0.01em;">
                    ${parseContentWithLinks(post.content)}
                </div>

                ${renderPostAttachments(post.image_url)}

                <div style="margin-top: 10px;">${linkHtml}</div>

                <div style="display: flex; align-items: center; gap: 12px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                    <button id="like-btn-${post.id}" onclick="toggleLikePost(${post.id})" style="background: ${post.user_liked ? '#fff1f2' : '#f8fafc'}; border: 1px solid ${post.user_liked ? '#fecdd3' : '#cbd5e1'}; color: ${post.user_liked ? '#e11d48' : '#334155'}; font-size: 0.88rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 8px 18px; border-radius: 12px; transition: all 0.2s ease;">
                        <i class="${post.user_liked ? 'fas' : 'far'} fa-heart" style="${post.user_liked ? 'transform: scale(1.1);' : ''}"></i>
                        <span id="like-count-${post.id}">${post.likes_count || 0}</span>
                        <span style="font-size: 0.8rem; font-weight: 600;">إعجاب</span>
                    </button>

                    <button onclick="toggleCommentsDrawer(${post.id})" style="background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 0.88rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 8px 18px; border-radius: 12px; transition: all 0.2s ease;">
                        <i class="far fa-comment" style="color: #1e3a8a;"></i>
                        <span id="comment-count-${post.id}">${post.comments_count || 0}</span>
                        <span style="font-size: 0.8rem; font-weight: 600;">تعليق</span>
                    </button>

                    <button onclick="sharePost(${post.id})" style="background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 0.88rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 8px 18px; border-radius: 12px; transition: all 0.2s ease;">
                        <i class="far fa-share-square" style="color: #1e3a8a;"></i>
                        <span style="font-size: 0.8rem; font-weight: 600;">مشاركة</span>
                    </button>

                    <button id="save-btn-${post.id}" onclick="toggleSavePost(${post.id})" style="background: ${post.is_saved ? '#fef3c7' : '#f8fafc'}; border: 1px solid ${post.is_saved ? '#fde68a' : '#cbd5e1'}; color: ${post.is_saved ? '#d97706' : '#334155'}; font-size: 0.88rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 8px 18px; border-radius: 12px; transition: all 0.2s ease;" title="${post.is_saved ? 'إزالة من المحفوظات' : 'حفظ المنشور'}">
                        <i class="${post.is_saved ? 'fas' : 'far'} fa-bookmark" style="${post.is_saved ? 'color: #d97706;' : ''}"></i>
                        <span style="font-size: 0.8rem; font-weight: 600;">${post.is_saved ? 'محفوظ' : 'حفظ'}</span>
                    </button>

                    <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; font-size: 0.88rem; font-weight: 800; display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 12px; margin-right: auto;" title="عدد المشاهدات الفريدة لكل IP فريد كل 24 ساعة">
                        <i class="far fa-eye" style="color: #1d4ed8;"></i>
                        <span id="post-views-${post.id}">${post.views_count || post.views || 0}</span>
                    </div>
                </div>

                <!-- Collapsible Comments Drawer -->
                <div id="comments-drawer-${post.id}" style="display: none; margin-top: 14px; padding-top: 16px; border-top: 1px dashed #cbd5e1; background: #f8fafc; padding: 18px; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(15,23,42,0.03);">
                    <div id="comments-list-${post.id}" style="margin-bottom: 14px;"></div>
                    <div style="display: flex; gap: 10px; align-items: center; background: white; padding: 6px 8px 6px 8px; border-radius: 30px; border: 1.5px solid #cbd5e1; box-shadow: 0 1px 4px rgba(0,0,0,0.03);">
                        <input type="text" id="comment-input-${post.id}" placeholder="اكتب تعليقاً مميزاً على المنشور..." onkeypress="if(event.key==='Enter') submitPostComment(${post.id})" style="flex: 1; padding: 8px 14px; border: none; background: transparent; font-size: 0.9rem; outline: none; font-family: 'Cairo', sans-serif; font-weight: 600;">
                        <button onclick="submitPostComment(${post.id})" style="background: #1e3a8a; color: white; border: none; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.15s ease;" title="نشر التعليق" onmouseover="this.style.transform='scale(1.06)'" onmouseout="this.style.transform='scale(1)'">
                            <i class="fas fa-paper-plane" style="font-size: 0.9rem;"></i>
                        </button>
                    </div>
                </div>
            </div>`;
    }

    function sharePost(postId) {
        const shareUrl = `${window.location.origin}/post/${postId}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('📋 تم نسخ رابط المنشور بنجاح! يمكنك الآن مشاركته.', 'success');
        }).catch(err => {
            console.error('Failed to copy', err);
            showToast('⚠️ فشل نسخ الرابط تلقائياً، الرابط: ' + shareUrl, 'warning');
        });
    }
    window.sharePost = sharePost;

    async function toggleFollowTeacher(tId) {
        if (checkGuestAction()) return;
        try {
            const res = await fetchWithAuth('/api/post/toggle-follow', {
                method: 'POST',
                body: JSON.stringify({ teacher_id: tId })
            });
            const data = await res.json();
            if (data.success) {
                const isFlw = data.is_following;
                showToast(isFlw ? '✅ تمت متابعة الأستاذ بنجاح' : 'ℹ️ تم إلغاء المتابعة', 'success');
                
                // تحديث كافة أزرار المتابعة لهذا الأستاذ في الصفحة
                const btns = document.querySelectorAll(`.follow-btn-${tId}`);
                btns.forEach(btn => {
                    if (isFlw) {
                        btn.style.background = '#f0fdf4';
                        btn.style.color = '#166534';
                        btn.style.border = '1px solid #bbf7d0';
                        btn.innerHTML = `<i class="fas fa-check-circle"></i> <span>تتابعه</span>`;
                    } else {
                        btn.style.background = 'var(--primary)';
                        btn.style.color = 'white';
                        btn.style.border = 'none';
                        btn.innerHTML = `<i class="fas fa-user-plus"></i> <span>متابعة</span>`;
                    }
                });

                // ✅ تحديث عدد المتابعين في الواجهة تلقائياً
                const countEls = document.querySelectorAll(`.follower-count-${tId}`);
                countEls.forEach(el => {
                    let currentCount = parseInt(el.textContent.replace(/[^\d]/g, '')) || 0;
                    if (isFlw) currentCount++;
                    else currentCount = Math.max(0, currentCount - 1);
                    
                    // إذا كان العنصر يحتوي على أي ونة (مثل الذي في بطاقة الأستاذ)، نحافظ عليها
                    if (el.querySelector('i')) {
                        el.innerHTML = `<i class="fas fa-users" style="font-size: 1rem; opacity: 0.8; margin-left: 4px;"></i>${currentCount}`;
                    } else {
                        el.textContent = currentCount;
                    }
                });
            } else {
                showToast('❌ ' + (data.error || 'فشل تغيير حالة المتابعة'), 'error');
            }
        } catch (e) {
            console.error('Error toggling follow:', e);
            showToast('❌ حدث خطأ أثناء المتابعة', 'error');
        }
    }
    window.toggleFollowTeacher = toggleFollowTeacher;

    async function checkUnreadPostsCount() {
        try {
            if (!authToken || (userData && (userData.is_guest || userData.id === -1))) return;
            const lastViewed = localStorage.getItem('last_posts_view_time') || '';
            const res = await fetchWithAuth(`/api/post/unread-count?last_viewed=${encodeURIComponent(lastViewed)}`);
            const data = await res.json();
            if (data.success && data.unread_count > 0) {
                const b1 = document.getElementById('postsBadge');
                const b2 = document.getElementById('mobilePostsBadge');
                const b3 = document.getElementById('postsBadgeSidebar');
                if (b1) { b1.textContent = data.unread_count; b1.style.display = 'inline-block'; }
                if (b2) { b2.textContent = data.unread_count; b2.style.display = 'flex'; }
                if (b3) { b3.textContent = data.unread_count; b3.style.display = 'inline-block'; }
            }
        } catch (e) {
            console.error('Error checking unread posts count:', e);
        }
    }

    async function checkUnreadMessagesCount() {
        try {
            if (!authToken || !studentId || studentId === -1 || (userData && userData.is_guest)) return;
            const res = await fetchWithAuth(`/api/messages/unread-count/${studentId}/student`);
            if (res.ok) {
                const data = await res.json();
                const count = data.unread_count || 0;
                const b1 = document.getElementById('messagesBadge');
                const b2 = document.getElementById('mobileMessagesBadge');
                const b3 = document.getElementById('messagesBadgeSidebar');
                if (count > 0) {
                    const displayVal = count > 99 ? '99+' : count;
                    if (b1) { b1.textContent = displayVal; b1.style.display = 'inline-block'; }
                    if (b2) { b2.textContent = displayVal; b2.style.display = 'inline-flex'; }
                    if (b3) { b3.textContent = displayVal; b3.style.display = 'inline-block'; }
                } else {
                    if (b1) b1.style.display = 'none';
                    if (b2) b2.style.display = 'none';
                    if (b3) b3.style.display = 'none';
                }
            }
        } catch (e) {
            console.error('Error checking unread messages count:', e);
        }
    }

    async function toggleLikePost(postId) {
        if (checkGuestAction()) return;
        try {
            const res = await fetchWithAuth('/api/post/toggle-like', {
                method: 'POST',
                body: JSON.stringify({ post_id: postId })
            });
            const data = await res.json();
            if (data.success) {
                const likeBtns = document.querySelectorAll(`[id="like-btn-${postId}"]`);
                const likeCounts = document.querySelectorAll(`[id="like-count-${postId}"]`);
                likeCounts.forEach(el => el.textContent = data.likes_count);
                likeBtns.forEach(likeBtn => {
                    if (data.liked) {
                        likeBtn.style.color = '#e11d48';
                        likeBtn.style.background = '#fff1f2';
                        likeBtn.style.borderColor = '#fecdd3';
                        const icon = likeBtn.querySelector('i');
                        if (icon) {
                            icon.className = 'fas fa-heart';
                            icon.style.transform = 'scale(1.1)';
                        }
                    } else {
                        likeBtn.style.color = '#64748b';
                        likeBtn.style.background = '#f8fafc';
                        likeBtn.style.borderColor = '#e2e8f0';
                        const icon = likeBtn.querySelector('i');
                        if (icon) {
                            icon.className = 'far fa-heart';
                            icon.style.transform = 'none';
                        }
                    }
                });
            }
        } catch (e) {
            console.error('Error toggling like:', e);
        }
    }

    async function toggleSavePost(postId) {
        if (checkGuestAction()) return;
        try {
            const res = await fetchWithAuth(`/api/post/${postId}/bookmark`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                const isSaved = data.is_saved;
                showToast(data.message || (isSaved ? '🔖 تم حفظ المنشور' : 'تم إزالة المنشور من المحفوظات'), 'success');
                
                const saveBtns = document.querySelectorAll(`[id="save-btn-${postId}"], .save-btn-${postId}`);
                saveBtns.forEach(btn => {
                    const icon = btn.querySelector('i');
                    const textSpan = btn.querySelector('span:last-child');
                    if (isSaved) {
                        btn.style.background = '#fef3c7';
                        btn.style.borderColor = '#fde68a';
                        btn.style.color = '#d97706';
                        btn.title = 'إزالة من المحفوظات';
                        if (icon) {
                            icon.className = 'fas fa-bookmark';
                            icon.style.color = '#d97706';
                        }
                        if (textSpan) textSpan.innerText = 'محفوظ';
                    } else {
                        btn.style.background = '#f8fafc';
                        btn.style.borderColor = '#e2e8f0';
                        btn.style.color = '#64748b';
                        btn.title = 'حفظ المنشور';
                        if (icon) {
                            icon.className = 'far fa-bookmark';
                            icon.style.color = '';
                        }
                        if (textSpan) textSpan.innerText = 'حفظ';
                    }
                });
                
                // Refresh saved count badge
                updateStudentSavedCountBadge();

                // If currently viewing saved filter and item was removed, smoothly remove card
                if (studentPostsFilter === 'saved' && !isSaved) {
                    const card = document.getElementById(`post-card-${postId}`);
                    if (card) {
                        card.style.transition = 'all 0.3s ease';
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.95)';
                        setTimeout(() => {
                            card.remove();
                            const feed = document.getElementById('studentPostsFeedContainer');
                            if (feed && !feed.querySelector('.post-card')) {
                                loadStudentPosts(true);
                            }
                        }, 300);
                    }
                }
            } else {
                showToast(data.error || 'فشل حفظ المنشور', 'error');
            }
        } catch (e) {
            console.error('Error toggling post save:', e);
            showToast('حدث خطأ أثناء حفظ المنشور', 'error');
        }
    }
    window.toggleSavePost = toggleSavePost;

    async function loadSavedPostsSidebar() {
        const container = document.getElementById('savedPostsSidebarContainer');
        const countBadge = document.getElementById('savedPostsCount');
        if (!container) return;

        try {
            const res = await fetchWithAuth('/api/post?saved_only=true');
            if (!res.ok) throw new Error('فشل جلب المحفوظات');
            const data = await res.json();
            const posts = Array.isArray(data) ? data : (data.posts || data.data || []);

            if (countBadge) countBadge.textContent = posts.length;

            if (posts.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; color: #94a3b8; padding: 15px; font-size: 0.85rem;">
                        <i class="fas fa-bookmark" style="margin-bottom: 6px; display: block; font-size: 1.2rem; color: #cbd5e1;"></i>
                        <span>لا توجد منشورات محفوظة</span>
                    </div>`;
                return;
            }

            container.innerHTML = posts.map(post => {
                const authorName = post.teachers?.full_name || post.teacher_name || 'أستاذ المنصة';
                const authorImg = post.teacher_profile_image || (post.teachers && post.teachers.profile_image) || '/images/default-avatar.svg';
                const plainTextContent = post.content ? post.content.replace(/<[^>]*>/g, '').trim() : '';
                const displayExcerpt = plainTextContent.length > 45 ? plainTextContent.substring(0, 45) + '...' : plainTextContent || 'منشور وسائط';
                
                return `
                    <div onclick="scrollToSavedPost(${post.id})" style="display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#cbd5e1';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#e2e8f0';">
                        <img src="${authorImg}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid #e2e8f0; flex-shrink: 0;" onerror="this.src='/images/default-avatar.svg'">
                        <div style="flex: 1; min-width: 0; text-align: right;">
                            <div style="font-weight: 800; font-size: 0.8rem; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 2px;">
                                ${escapeHtml(authorName)}
                            </div>
                            <div style="font-size: 0.72rem; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ${escapeHtml(displayExcerpt)}
                            </div>
                        </div>
                        <i class="fas fa-chevron-left" style="font-size: 0.7rem; color: #94a3b8; margin-right: 4px;"></i>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error('Error loading saved posts sidebar:', e);
            container.innerHTML = `
                <div style="text-align: center; color: #ef4444; padding: 10px; font-size: 0.82rem;">
                    <span>فشل تحميل المحفوظات</span>
                </div>`;
        }
    }
    window.loadSavedPostsSidebar = loadSavedPostsSidebar;

    async function scrollToSavedPost(postId) {
        let el = document.getElementById(`post-card-${postId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.border = '2px solid #f59e0b';
            el.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.3)';
            setTimeout(() => {
                el.style.transition = 'all 1s ease';
                el.style.border = '1px solid #e2e8f0';
                el.style.boxShadow = '';
            }, 3000);
        } else {
            // If not currently in DOM (due to pagination), fetch and prepend it to the feed!
            try {
                const res = await fetchWithAuth(`/api/post?post_id=${postId}`);
                if (!res.ok) return;
                const data = await res.json();
                const posts = Array.isArray(data) ? data : (data.posts || data.data || []);
                if (posts.length > 0) {
                    const post = posts[0];
                    const feed = document.getElementById('studentPostsFeedContainer') || document.getElementById('postsFeedContainer');
                    if (feed) {
                        // remove placeholder/empty-state if present
                        if (feed.innerHTML.includes('لا توجد منشورات') || feed.innerHTML.includes('جاري تحميل منشورات')) {
                            feed.innerHTML = '';
                        }
                        const cardHtml = renderPostCardHtml(post);
                        feed.insertAdjacentHTML('afterbegin', cardHtml);
                        
                        setTimeout(() => {
                            const newEl = document.getElementById(`post-card-${postId}`);
                            if (newEl) {
                                newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                newEl.style.border = '2px solid #f59e0b';
                                newEl.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.3)';
                                setTimeout(() => {
                                    newEl.style.transition = 'all 1s ease';
                                    newEl.style.border = '1px solid #e2e8f0';
                                    newEl.style.boxShadow = '';
                                }, 3000);
                            }
                        }, 100);
                    }
                }
            } catch (err) {
                console.error('Error fetching specific post to scroll:', err);
            }
        }
    }
    window.scrollToSavedPost = scrollToSavedPost;

    async function toggleCommentsDrawer(postId) {
        const drawers = document.querySelectorAll(`[id="comments-drawer-${postId}"]`);
        if (drawers.length === 0) return;

        let willOpen = false;
        drawers.forEach(drawer => {
            if (drawer.style.display === 'none' || !drawer.style.display) {
                drawer.style.display = 'block';
                willOpen = true;
            } else {
                drawer.style.display = 'none';
            }
        });

        if (willOpen) {
            await fetchComments(postId);
        }
    }

    async function fetchComments(postId) {
        if (!postId) return;
        const commentsLists = document.querySelectorAll(`[id="comments-list-${postId}"]`);
        if (commentsLists.length === 0) return;
        commentsLists.forEach(cl => {
            cl.innerHTML = `<div style="text-align: center; color: #9ca3af; font-size: 0.85rem;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل التعليقات...</div>`;
        });

        try {
            const res = await fetchWithAuth(`/api/post/comments/${postId}`);
            const data = await res.json();
            const allComments = data.comments || [];

            if (allComments.length === 0) {
                commentsLists.forEach(cl => {
                    cl.innerHTML = `<div style="text-align: center; color: #9ca3af; font-size: 0.85rem; padding: 6px;">لا توجد تعليقات بعد. كن أول من يعلق!</div>`;
                });
                return;
            }

            // تنظيم التعليقات: الأساسية والردود
            const mainComments = allComments.filter(c => !c.parent_id);
            const replies = allComments.filter(c => c.parent_id);

            const html = mainComments.map(c => {
                const commentReplies = replies.filter(r => r.parent_id === c.id);
                return renderSingleComment(c, postId, commentReplies);
            }).join('');

            // ✅ إعلان مدمج داخل قسم التعليقات (مطابق للمستوى)
            let finalHtml = html;
            try {
                if (window.ZoomDzAds) {
                    const ad = await window.ZoomDzAds.match('comments');
                    if (ad) finalHtml += window.ZoomDzAds.cardHtml(ad);
                }
            } catch (adErr) {}

            commentsLists.forEach(cl => {
                cl.innerHTML = finalHtml;
            });
        } catch (e) {
            console.error('Error fetching comments:', e);
            commentsLists.forEach(cl => {
                cl.innerHTML = `<div style="text-align: center; color: #ef4444; font-size: 0.85rem;">فشل جلب التعليقات</div>`;
            });
        }
    }

    function renderSingleComment(c, postId, commentReplies = [], isReply = false) {
        const cDate = c.created_at ? new Date(c.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '';
        const roleBadge = c.author_role === 'teacher' 
            ? '<span style="background: #dbeafe; color: #1e40af; font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; font-weight: 800; margin-right: 6px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid #bfdbfe;"><i class="fas fa-chalkboard-teacher"></i> أستاذ</span>' 
            : '<span style="background: #f1f5f9; color: #475569; font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; font-weight: 700; margin-right: 6px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid #e2e8f0;"><i class="fas fa-user-graduate"></i> طالب</span>';
        const currentUserId = userData?.id || (typeof studentId !== 'undefined' ? studentId : null);
        // زر الحذف يظهر لصاحب التعليق فقط
        const canDelete = String(c.user_id) === String(currentUserId) && c.author_role === 'student';
        const profileClick = c.author_role === 'teacher' ? `showTeacherProfile(${c.user_id})` : `showStudentProfile(${c.user_id})`;
        
        let repliesHtml = '';
        if (commentReplies.length > 0) {
            repliesHtml = `
                <div style="margin-right: 22px; border-right: 2.5px solid #3b82f6; padding-right: 14px; margin-top: 10px; border-radius: 0 0 0 8px;">
                    ${commentReplies.map(r => renderSingleComment(r, postId, [], true)).join('')}
                </div>
            `;
        }

        return `
            <div style="margin-bottom: 14px;">
                <div style="display: flex; gap: 12px; align-items: flex-start;">
                    <img src="${escapeHtml(c.author_image || '/images/default-avatar.svg')}" alt="avatar" style="width: ${isReply ? '32px' : '38px'}; height: ${isReply ? '32px' : '38px'}; border-radius: 50%; object-fit: cover; cursor: pointer; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.08); flex-shrink: 0;" onclick="${profileClick}" title="عرض الملف الشخصي" referrerpolicy="no-referrer" onerror="this.src='/images/default-avatar.svg'">
                    <div style="background: ${isReply ? '#ffffff' : '#f8fafc'}; padding: 12px 16px; border-radius: 16px; flex: 1; border: 1px solid #e2e8f0; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                            <div style="font-weight: 800; font-size: 0.88rem; color: #0f172a; cursor: pointer; display: flex; align-items: center; gap: 4px;" onclick="${profileClick}">
                                ${escapeHtml(c.author_name || 'مستخدم')} ${roleBadge}
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 0.72rem; color: #64748b; font-weight: 600;"><i class="far fa-clock" style="font-size: 0.68rem; margin-left: 2px;"></i>${cDate}</span>
                                ${canDelete ? `<button onclick="deleteComment(${c.id}, ${postId})" style="background: #fef2f2; border: 1px solid #fecaca; color: #ef4444; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.7rem; cursor: pointer; transition: all 0.2s;" title="حذف التعليق" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'"><i class="fas fa-trash-alt"></i></button>` : ''}
                            </div>
                        </div>
                        <div style="font-size: 0.9rem; color: #1e293b; margin-top: 6px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; font-weight: 500;">${autoLinkUrls(c.comment)}</div>
                        
                        ${!isReply ? `
                            <div style="margin-top: 8px; border-top: 1px dashed #e2e8f0; padding-top: 6px; display: flex; align-items: center; justify-content: flex-end;">
                                <button onclick="toggleReplyForm(${c.id}, ${postId})" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-size: 0.78rem; font-weight: 700; cursor: pointer; padding: 4px 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                                    <i class="fas fa-reply fa-flip-horizontal"></i> رد على التعليق
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Reply Form (Hidden) -->
                <div id="reply-form-${c.id}" style="display: none; margin-right: 50px; margin-top: 10px; background: #ffffff; padding: 10px 14px; border-radius: 14px; border: 1.5px solid #cbd5e1; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="text" id="reply-input-${c.id}" placeholder="اكتب ردك هنا..." onkeypress="if(event.key==='Enter') submitPostComment(${postId}, ${c.id})" style="flex: 1; border: 1px solid #e2e8f0; border-radius: 20px; padding: 8px 14px; font-size: 0.85rem; outline: none; font-family: 'Cairo', sans-serif;">
                        <button onclick="submitPostComment(${postId}, ${c.id})" style="background: #1e3a8a; color: white; border: none; padding: 8px 16px; border-radius: 20px; font-size: 0.82rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-paper-plane" style="font-size: 0.8rem;"></i> إرسال
                        </button>
                    </div>
                </div>

                ${repliesHtml}
            </div>`;
    }

    function toggleReplyForm(commentId, postId) {
        const forms = document.querySelectorAll(`[id="reply-form-${commentId}"]`);
        if (forms.length === 0) return;
        
        forms.forEach(form => {
            const willOpen = form.style.display === 'none' || !form.style.display;
            form.style.display = willOpen ? 'block' : 'none';
            if (willOpen) {
                const inp = form.querySelector(`[id="reply-input-${commentId}"]`);
                if (inp) inp.focus();
            }
        });
    }

    async function submitPostComment(postId, parentId = null) {
        if (checkGuestAction()) return;
        const inputId = parentId ? `reply-input-${parentId}` : `comment-input-${postId}`;
        const inputs = document.querySelectorAll(`[id="${inputId}"]`);
        let comment = '';
        inputs.forEach(inp => {
            if (inp.value.trim()) comment = inp.value.trim();
        });
        if (!comment) return;

        try {
            const payload = { post_id: parseInt(postId), comment: comment };
            if (parentId) {
                payload.parent_id = parseInt(parentId);
            }
            const res = await fetchWithAuth('/api/post/comment', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                inputs.forEach(inp => inp.value = '');
                if (parentId) {
                    document.querySelectorAll(`[id="reply-form-${parentId}"]`).forEach(rf => rf.style.display = 'none');
                }
                document.querySelectorAll(`[id="comment-count-${postId}"]`).forEach(el => {
                    if (data.comments_count !== undefined) {
                        el.textContent = data.comments_count;
                    }
                });
                await fetchComments(postId);
            } else {
                const errMsg = data.error || (data.errors && data.errors[0]?.msg) || 'فشل إضافة التعليق';
                showToast('❌ ' + errMsg, 'error');
            }
        } catch (e) {
            console.error('Error submitting comment:', e);
            showToast('❌ حدث خطأ أثناء إضافة التعليق', 'error');
        }
    }

    async function deleteComment(commentId, postId) {
        if (checkGuestAction()) return;
        if (!confirm('هل أنت متأكد من حذف هذا التعليق؟')) return;
        try {
            const res = await fetchWithAuth(`/api/post/comment/${commentId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('✅ تم حذف التعليق', 'success');
                document.querySelectorAll(`[id="comment-count-${postId}"]`).forEach(el => {
                    if (data.comments_count !== undefined) {
                        el.textContent = data.comments_count;
                    }
                });
                await fetchComments(postId);
            } else {
                showToast('❌ ' + (data.error || 'فشل حذف التعليق'), 'error');
            }
        } catch (e) {
            console.error('Error deleting comment:', e);
        }
    }

    // ================================================================
    // ✅ وظائف نظام تقييم الأساتذة
    // ================================================================

    window.toggleRatingForm = function() {
        const container = document.getElementById('ratingFormContainer');
        if (container) {
            if (container.style.display === 'none') {
                container.style.display = 'block';
                // تفعيل النجوم السابقة إن وجدت
                const currentVal = parseInt(document.getElementById('selectedRatingValue').value) || 0;
                setRatingStars(currentVal);
            } else {
                container.style.display = 'none';
            }
        }
    };

    window.highlightRatingStars = function(val) {
        const stars = document.querySelectorAll('.rating-star');
        stars.forEach(star => {
            const starVal = parseInt(star.getAttribute('data-value'));
            if (starVal <= val) {
                star.className = 'fas fa-star rating-star';
                star.style.color = '#eab308';
            } else {
                star.className = 'far fa-star rating-star';
                star.style.color = '#cbd5e1';
            }
        });
    };

    window.resetRatingStars = function() {
        const currentVal = parseInt(document.getElementById('selectedRatingValue').value) || 0;
        const stars = document.querySelectorAll('.rating-star');
        stars.forEach(star => {
            const starVal = parseInt(star.getAttribute('data-value'));
            if (starVal <= currentVal) {
                star.className = 'fas fa-star rating-star';
                star.style.color = '#eab308';
            } else {
                star.className = 'far fa-star rating-star';
                star.style.color = '#cbd5e1';
            }
        });
    };

    window.setRatingStars = function(val) {
        document.getElementById('selectedRatingValue').value = val;
        const stars = document.querySelectorAll('.rating-star');
        stars.forEach(star => {
            const starVal = parseInt(star.getAttribute('data-value'));
            if (starVal <= val) {
                star.className = 'fas fa-star rating-star';
                star.style.color = '#eab308';
            } else {
                star.className = 'far fa-star rating-star';
                star.style.color = '#cbd5e1';
            }
        });
    };

    window.generateStarsHtml = function(rating) {
        let stars = '';
        const rounded = Math.round(rating * 2) / 2; // round to nearest 0.5
        for (let i = 1; i <= 5; i++) {
            if (i <= rounded) {
                stars += '<i class="fas fa-star"></i>';
            } else if (i - 0.5 === rounded) {
                stars += '<i class="fas fa-star-half-alt"></i>';
            } else {
                stars += '<i class="far fa-star"></i>';
            }
        }
        return stars;
    };

    // ================================================================
    // 🚩 نظام تقديم الإبلاغات (Report Modal Functions)
    // ================================================================
    function openReportModal(targetType, targetId, targetTitle = '') {
        if (checkGuestAction()) return;
        const typeInput = document.getElementById('reportTargetType');
        const idInput = document.getElementById('reportTargetId');
        const reasonInput = document.getElementById('reportReasonInput');
        if (typeInput) typeInput.value = targetType;
        if (idInput) idInput.value = targetId;
        if (reasonInput) reasonInput.value = '';

        const titleEl = document.getElementById('reportModalTitle');
        const subTitleEl = document.getElementById('reportModalSubtitle');

        if (targetType === 'post') {
            if (titleEl) titleEl.textContent = 'إبلاغ عن منشور';
            if (subTitleEl) subTitleEl.textContent = targetTitle ? `إبلاغ عن منشور: ${targetTitle}` : 'الرجاء توضيح سبب الإبلاغ عن هذا المنشور.';
        } else if (targetType === 'teacher') {
            if (titleEl) titleEl.textContent = 'إبلاغ عن أستاذ';
            if (subTitleEl) subTitleEl.textContent = targetTitle ? `إبلاغ عن الاستاذ: ${targetTitle}` : 'الرجاء توضيح سبب الإبلاغ عن هذا الأستاذ.';
        }

        const modal = document.getElementById('reportModal');
        if (modal) modal.style.display = 'flex';
    }

    function closeReportModal() {
        const modal = document.getElementById('reportModal');
        if (modal) modal.style.display = 'none';
    }

    async function submitReportAction() {
        const targetType = document.getElementById('reportTargetType')?.value;
        const targetId = document.getElementById('reportTargetId')?.value;
        const reasonInput = document.getElementById('reportReasonInput');
        const reason = reasonInput ? reasonInput.value.trim() : '';
        const btn = document.getElementById('submitReportBtn');

        if (!reason) {
            showToast('الرجاء أدخل سبب الإبلاغ', 'error');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
        }

        try {
            const res = await fetchWithAuth('/api/reports', {
                method: 'POST',
                body: JSON.stringify({
                    target_type: targetType,
                    target_id: targetId,
                    reason: reason
                })
            });

            const data = await res.json();
            if (data.success) {
                showToast('✅ ' + (data.message || 'تم تقديم البلاغ بنجاح'), 'success');
                closeReportModal();
            } else {
                showToast('❌ ' + (data.error || 'فشل تقديم البلاغ'), 'error');
            }
        } catch (e) {
            console.error('Error submitting report:', e);
            showToast('❌ حدث خطأ أثناء تقديم البلاغ', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال البلاغ';
            }
        }
    }

    // ================================================================
    // 📚 قسم التمارين والحلول النموذجية للطلاب
    // ================================================================
    let allStudentExercises = [];
    let isExerciseOnlySavedFilter = false;
    let exerciseLightboxImages = [];
    let exerciseLightboxIndex = 0;

    // ============================================================
    // 🎬 إضافة فيديو يوتيوب للطلاب (يُحفظ ضمن الدروس والتمارين)
    //    يقبل كود الـ iframe الكامل أو الرابط أو عدة أسطر (قائمة تشغيل)
    // ============================================================
    function extractYouTubeVideoIds(text) {
        if (!text) return [];
        const re = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
        const ids = [];
        let m;
        while ((m = re.exec(text)) !== null) {
            if (ids.indexOf(m[1]) === -1) ids.push(m[1]);
        }
        return ids;
    }

    // 🎬 بدء التشغيل: يحلّ المشغّل الحقيقي مكان الصورة المصغّرة.
    //    نصيحتان من تشخيص خطأ يوتيوب 153 (خطأ في إعدادات المشغل):
    //    1) يوتيوب يرفض التشغيل بلا «Referer» صالح — نثبت
    //       referrerpolicy على الـ iframe ونرسل origin صراحةً
    //    2) نطاق youtube.com/embed المعتمد عالمياً (وليست nocookie
    //       المحجوبة من بعض مانعات الإعلانات)
    function ytEmbedSrc(videoId) {
        return 'https://www.youtube.com/embed/' + videoId
            + '?autoplay=1&rel=0&origin=' + encodeURIComponent(window.location.origin);
    }

    function playExerciseVideo(exId, videoId) {
        const box = document.getElementById('yt-player-' + exId);
        if (!box) return;
        const ids = String(box.dataset.videoIds || '').split(',').filter(Boolean);
        box.dataset.currentVideo = videoId;
        box.innerHTML = '<iframe width="100%" height="100%" src="' + ytEmbedSrc(videoId) + '" title="فيديو تعليمي" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style="display:block; border:0;"></iframe>'
            + ytNavOverlayHtml(exId, videoId, ids);
        recordExerciseView(exId);
    }

    // 🎬 تبديل الفيديو النشط في قائمة التشغيل — يعمل أثناء التشغيل أو قبله
    function swapExerciseVideo(exId, videoId, el) {
        const box = document.getElementById('yt-player-' + exId);
        if (box) {
            box.dataset.currentVideo = videoId;
            const iframe = box.querySelector('iframe');
            if (iframe) {
                iframe.src = ytEmbedSrc(videoId);
            } else {
                const img = box.querySelector('img');
                if (img) img.src = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
                const btn = box.querySelector('.ex-video-playbtn');
                if (btn) btn.setAttribute('onclick', 'playExerciseVideo(' + exId + ", '" + videoId + "')");
            }
            updateYtPosChip(exId);
        }
        const container = el && el.parentElement;
        if (container) {
            Array.from(container.children).forEach(function (c) { c.style.borderColor = '#e2e8f0'; });
        }
        if (el) el.style.borderColor = '#dc2626';
        recordExerciseView(exId);
    }

    // 🔽 أزرار التبديل بين فيديوهات قائمة التشغيل الواحدة (فوق المشغّل)
    //    اليمين = السابق › واليسار = التالي ‹ حسب اتجاه القراءة RTL
    function ytNavOverlayHtml(exId, currentId, ids) {
        if (!ids || ids.length < 2) return '';
        let idx = ids.indexOf(currentId);
        if (idx < 0) idx = 0;
        const navBtnStyle = 'position:absolute; top:50%; transform:translateY(-50%); z-index:6; width:40px; height:40px; border-radius:50%; border:none; background:rgba(15,23,42,0.72); color:#fff; font-size:1.35rem; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px10px rgba(0,0,0,0.45); transition:background 0.2s;';
        return `
            <button type="button" onclick="stepExerciseVideo(${exId}, -1)" title="الفيديو السابق من القائمة" aria-label="الفيديو السابق" style="${navBtnStyle} right:10px;" onmouseover="this.style.background='rgba(220,38,38,0.85)'" onmouseout="this.style.background='rgba(15,23,42,0.72)'">&#8250;</button>
            <button type="button" onclick="stepExerciseVideo(${exId}, 1)" title="الفيديو التالي من القائمة" aria-label="الفيديو التالي" style="${navBtnStyle} left:10px;" onmouseover="this.style.background='rgba(220,38,38,0.85)'" onmouseout="this.style.background='rgba(15,23,42,0.72)'">&#8249;</button>
            <span id="yt-pos-${exId}" style="position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:6; background:rgba(15,23,42,0.75); color:#fff; font-size:0.72rem; font-weight:800; padding:3px 12px; border-radius:999px; pointer-events:none; box-shadow:0 2px8px rgba(0,0,0,0.35);">${idx + 1} / ${ids.length}</span>`;
    }

    // 🔽 تنقّل +/- بين فيديوهات القائمة (يشتغل من الأزرار)
    function stepExerciseVideo(exId, delta) {
        const box = document.getElementById('yt-player-' + exId);
        if (!box) return;
        const ids = String(box.dataset.videoIds || '').split(',').filter(Boolean);
        if (ids.length < 2) return;
        let idx = ids.indexOf(box.dataset.currentVideo || ids[0]);
        if (idx < 0) idx = 0;
        const nextId = ids[(idx + delta + ids.length) % ids.length];
        const list = document.getElementById('yt-playlist-' + exId);
        const nextPos = ids.indexOf(nextId);
        const thumb = list && nextPos >= 0 ? list.children[nextPos] : null;
        swapExerciseVideo(exId, nextId, thumb || null);
    }

    // 🔽 تحديث عدّاد الموضع (مثلاً «2 / 4») أعلى المشغّل
    function updateYtPosChip(exId) {
        const chip = document.getElementById('yt-pos-' + exId);
        const box = document.getElementById('yt-player-' + exId);
        if (!chip || !box) return;
        const ids = String(box.dataset.videoIds || '').split(',').filter(Boolean);
        const idx = ids.indexOf(box.dataset.currentVideo || '');
        if (ids.length < 2 || idx < 0) { chip.style.display = 'none'; return; }
        chip.style.display = '';
        chip.textContent = (idx + 1) + ' / ' + ids.length;
    }

    // ============================================================
    // 📺 قائمة التشغيل: خانات إضافية تظهر عند تفعيل الخيار
    // ============================================================
    function togglePlaylistFields(mode) {
        const isTeacher = mode === 'teacher';
        const checkbox = document.getElementById(isTeacher ? 'exercisePlaylistToggle' : 'studentVideoPlaylistToggle');
        const container = document.getElementById(isTeacher ? 'teacherPlaylistExtra' : 'studentPlaylistExtra');
        const addBtn = document.getElementById(isTeacher ? 'teacherPlaylistAddBtn' : 'studentPlaylistExtraAddBtn');
        if (!checkbox || !container) return;
        container.style.display = checkbox.checked ? 'block' : 'none';
        if (addBtn) addBtn.style.display = checkbox.checked ? 'inline-flex' : 'none';
        if (checkbox.checked && container.children.length === 0) {
            addPlaylistRow(mode);
        } else if (!checkbox.checked) {
            container.innerHTML = '';
        }
    }

    function addPlaylistRow(mode) {
        const isTeacher = mode === 'teacher';
        const container = document.getElementById(isTeacher ? 'teacherPlaylistExtra' : 'studentPlaylistExtra');
        if (!container) return;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:8px; margin-bottom:8px; align-items:center;';
        row.innerHTML = `
            <input type="text" class="${isTeacher ? 'teacher' : 'student'}PlaylistExtraInput" placeholder="كود iframe لفيديو إضافي (من «مشاركة ← تضمين»)" style="flex:1; padding:9px 12px; border:1px solid #cbd5e1; border-radius:10px; font-family:'Cairo'; font-size:0.85rem; direction:ltr; text-align:right;">
            <button type="button" onclick="this.parentElement.remove()" title="حذف هذا الفيديو من القائمة" style="background:#fee2e2; color:#ef4444; border:none; width:34px; height:34px; border-radius:10px; cursor:pointer; flex-shrink:0;"><i class="fas fa-times"></i></button>`;
        container.appendChild(row);
    }

    // جمع الفيديو الأساسي + خانات القائمة إلى معرفات موحّدة بدون تكرار
    function collectYouTubeIds(mode) {
        const isTeacher = mode === 'teacher';
        const mainVal = document.getElementById(isTeacher ? 'exerciseModalExternalLink' : 'studentVideoUrl')?.value || '';
        const extras = Array.from(document.querySelectorAll('.' + (isTeacher ? 'teacher' : 'student') + 'PlaylistExtraInput'))
            .map(inp => inp.value).join('\n');
        return extractYouTubeVideoIds(mainVal + '\n' + extras);
    }

    function openStudentVideoModal() {
        if (checkGuestAction && checkGuestAction()) return;
        const sel = document.getElementById('studentVideoLevel');
        if (sel) sel.value = (userData && userData.education_level) ? userData.education_level : 'all';
        const modal = document.getElementById('addStudentVideoModal');
        if (modal) modal.style.display = 'flex';
    }

    function closeStudentVideoModal() {
        const modal = document.getElementById('addStudentVideoModal');
        if (modal) modal.style.display = 'none';
    }

    async function submitStudentVideo() {
        const title = document.getElementById('studentVideoTitle')?.value.trim();
        const subject = document.getElementById('studentVideoSubject')?.value.trim();
        const level = document.getElementById('studentVideoLevel')?.value || 'all';
        const desc = document.getElementById('studentVideoDesc')?.value.trim();
        const ytIds = collectYouTubeIds('student');

        if (!title) {
            showToast('⚠️ يرجى إدخال عنوان الفيديو', 'warning');
            return;
        }
        if (ytIds.length === 0) {
            showToast('⚠️ يرجى لصق كود الـ iframe للفيديو (من: مشاركة ← تضمين)', 'warning');
            return;
        }

        const btn = document.getElementById('btnSubmitStudentVideo');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري النشر...';
        }

        try {
            const res = await fetchWithAuth('/api/exercise', {
                method: 'POST',
                body: JSON.stringify({
                    title: title,
                    subject_name: subject || 'عام',
                    education_level: level,
                    description: desc,
                    images: [],
                    external_link: ytIds.map(id => 'https://www.youtube.com/watch?v=' + id).join('\n'),
                    classification: 'فيديو'
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast('🎬 تم نشر الفيديو التعليمي بنجاح!', 'success');
                closeStudentVideoModal();
                if (document.getElementById('studentVideoTitle')) document.getElementById('studentVideoTitle').value = '';
                if (document.getElementById('studentVideoUrl')) document.getElementById('studentVideoUrl').value = '';
                if (document.getElementById('studentVideoDesc')) document.getElementById('studentVideoDesc').value = '';
                // إعادة ضبط خيارات قائمة التشغيل
                const chk = document.getElementById('studentVideoPlaylistToggle');
                if (chk) chk.checked = false;
                const extra = document.getElementById('studentPlaylistExtra');
                if (extra) { extra.style.display = 'none'; extra.innerHTML = ''; }
                const addBtn = document.getElementById('studentPlaylistExtraAddBtn');
                if (addBtn) addBtn.style.display = 'none';
                loadExercises(true);
            } else {
                showToast('❌ ' + (data.error || 'فشل نشر الفيديو'), 'error');
            }
        } catch (e) {
            showToast('❌ خطأ: ' + (e.message || 'تعذر الاتصال بالخادم'), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> نشر الفيديو';
            }
        }
    }

    async function loadExercises(forceReload = false) {
        const grid = document.getElementById('exercisesGrid');
        if (!grid) return;

        if (allStudentExercises.length === 0 || forceReload) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b;">
                    <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary);"></i>
                    <p style="margin-top: 10px; font-weight: 700;">جاري تحميل التمارين والحلول النموذجية...</p>
                </div>
            `;

            try {
                const res = await fetchWithAuth('/api/exercise', { cache: 'no-store' });
                const data = await res.json();

                if (!res.ok || (data && data.success === false)) {
                    throw new Error(data.error || data.details || `خطأ HTTP رقم ${res.status}`);
                }

                if (Array.isArray(data)) {
                    allStudentExercises = data;
                } else if (data.success && Array.isArray(data.exercises)) {
                    allStudentExercises = data.exercises;
                } else {
                    allStudentExercises = [];
                }
            } catch (err) {
                console.error('Error fetching exercises:', err);
                grid.innerHTML = `
                    <div style="grid-column: 1 / -1; padding: 24px; color: #1e293b; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center; direction: rtl;">
                        <i class="fas fa-exclamation-circle" style="color: #64748b; font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                        <p style="margin: 0 0 14px 0; font-size: 0.95rem; font-weight: 700; color: #334155;">تعذر تحميل التمارين والحلول حالياً، يرجى إعادة المحاولة.</p>
                        <button onclick="loadExercises(true)" style="background: var(--primary, #0284c7); color: white; border: none; padding: 10px 22px; border-radius: 12px; cursor: pointer; font-family: inherit; font-weight: 800; font-size: 0.88rem; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);">
                            <i class="fas fa-sync-alt" style="margin-left: 6px;"></i> إعادة المحاولة
                        </button>
                    </div>`;
                return;
            }
        }

        filterExercises();

        // Check if url has ?exercise=ID
        const urlParams = new URLSearchParams(window.location.search);
        const targetExerciseId = urlParams.get('exercise');
        if (targetExerciseId) {
            setTimeout(() => {
                const el = document.getElementById(`exercise-card-${targetExerciseId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.style.boxShadow = '0 0 0 3px var(--primary), 0 10px 25px rgba(0,0,0,0.15)';
                    setTimeout(() => { el.style.boxShadow = ''; }, 3500);
                }
            }, 500);
        }
    }

    function toggleExerciseSavedFilter() {
        isExerciseOnlySavedFilter = !isExerciseOnlySavedFilter;
        const btn = document.getElementById('exerciseSavedFilterBtn');
        if (btn) {
            if (isExerciseOnlySavedFilter) {
                btn.style.background = '#fef3c7';
                btn.style.borderColor = '#f59e0b';
                btn.style.color = '#b45309';
            } else {
                btn.style.background = '#f8fafc';
                btn.style.borderColor = '#cbd5e1';
                btn.style.color = '#475569';
            }
        }
        filterExercises();
    }

    function filterExercises() {
        const grid = document.getElementById('exercisesGrid');
        if (!grid) return;

        const searchText = (document.getElementById('exerciseSearchInput')?.value || '').toLowerCase().trim();
        const levelFilter = document.getElementById('exerciseLevelFilter')?.value || 'all';
        const subjectFilter = (document.getElementById('exerciseSubjectFilter')?.value || '').trim();
        const classFilter = document.getElementById('exerciseClassFilter')?.value || 'all';

        let filtered = allStudentExercises.filter(ex => {
            // Search text
            if (searchText) {
                const matchTitle = (ex.title || '').toLowerCase().includes(searchText);
                const matchSubject = (ex.subject_name || ex.subject || '').toLowerCase().includes(searchText);
                const matchDesc = (ex.description || '').toLowerCase().includes(searchText);
                const matchTeacher = (ex.teacher_name || '').toLowerCase().includes(searchText);
                if (!matchTitle && !matchSubject && !matchDesc && !matchTeacher) return false;
            }

            // Saved filter
            if (isExerciseOnlySavedFilter && !ex.is_saved) {
                return false;
            }

            // فلترة حسب المادة الدراسية (كتابة جزئية مسموحة)
            if (subjectFilter) {
                const exSubject = (ex.subject_name || ex.subject || 'عام');
                if (exSubject.indexOf(subjectFilter) === -1) return false;
            }

            // 🏷️ فلترة حسب نوع المحتوى: تمرين / درس / ملخص / فيديو
            if (classFilter !== 'all' && (ex.classification || 'تمرين') !== classFilter) {
                return false;
            }

            // Level filter
            if (levelFilter === 'all') return true;
            if (levelFilter === 'my_level') {
                if (!userData || !userData.education_level) return true;
                const studentLvl = userData.education_level;
                if (ex.education_level === 'all') return true;
                if (ex.education_level === studentLvl) return true;
                if ((studentLvl.startsWith('primary_') || studentLvl === '5eme_pri') && ex.education_level === 'primary_all') return true;
                if ((studentLvl.startsWith('middle_') || studentLvl.includes('_am') || studentLvl === 'bem') && ex.education_level === 'middle_all') return true;
                if ((studentLvl.startsWith('secondary_') || studentLvl.includes('_as') || studentLvl === 'bac') && ex.education_level === 'secondary_all') return true;
                if ((studentLvl.includes('_uni') || ['master', 'doctorat'].includes(studentLvl)) && ex.education_level === 'university') return true;
                if (['cap', 'cmp', 'bt', 'bts', 'insfp', 'insta_uni'].includes(studentLvl) && ex.education_level === 'vocational_all') return true;
                return false;
            }

            if (ex.education_level === 'all') return true;
            if (levelFilter === 'middle_all' && (ex.education_level.includes('_am') || ex.education_level === '4eme_am' || ex.education_level === 'bem' || ex.education_level === 'middle_all')) return true;
            if (levelFilter === 'secondary_all' && (ex.education_level.includes('_as') || ex.education_level === 'bac' || ex.education_level === 'secondary_all')) return true;
            if (levelFilter === 'university' && (ex.education_level.includes('_uni') || ex.education_level === 'master' || ex.education_level === 'doctorat' || ex.education_level === 'university')) return true;
            if (levelFilter === 'vocational_all' && (['cap', 'cmp', 'bt', 'bts', 'insfp', 'insta_uni', 'vocational_all'].includes(ex.education_level))) return true;

            return false;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: white; border-radius: 16px; border: 1px solid #e2e8f0;">
                    <i class="fas fa-folder-open fa-3x" style="color: #cbd5e1; margin-bottom: 12px;"></i>
                    <h3 style="margin: 0 0 6px 0; color: #334155; font-size: 1.1rem; font-weight: 800;">لا توجد تمارين تطابق خيارات البحث</h3>
                    <p style="margin: 0; color: #64748b; font-size: 0.88rem;">جرب تغيير كلمة البحث أو تصفية المستويات لعرض المزيد من التمارينات والحلول.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map(ex => renderStudentExerciseCard(ex)).join('');
    }

    function renderStudentExerciseCard(ex) {
        const createdDate = new Date(ex.created_at);
        const dateStr = createdDate.toLocaleDateString('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric' });
        const levelLabel = levelMap[ex.education_level] || ex.education_level || 'جميع المستويات';
        const images = Array.isArray(ex.images) ? ex.images : [];
        const isSaved = ex.is_saved;

        const currentUserId = userData ? userData.id : null;
        const currentUserRole = userData ? userData.role : null;
        const isOwner = currentUserId && (currentUserRole === 'admin' || (currentUserRole === 'teacher' && parseInt(ex.teacher_id) === parseInt(currentUserId)) || (currentUserRole === 'student' && ex.student_id != null && parseInt(ex.student_id) === parseInt(currentUserId)));

        const classification = ex.classification || 'تمرين';
        let classificationBadgeHtml = '';
        if (classification === 'تمرين') {
            classificationBadgeHtml = `
                <span style="background: #eff6ff; color: #2563eb; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; border: 1px solid #bfdbfe; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fas fa-file-pen"></i> تمرين
                </span>
            `;
        } else if (classification === 'درس') {
            classificationBadgeHtml = `
                <span style="background: #ecfdf5; color: #059669; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; border: 1px solid #a7f3d0; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fas fa-book-open"></i> درس
                </span>
            `;
        } else if (classification === 'ملخص') {
            classificationBadgeHtml = `
                <span style="background: #fffbeb; color: #d97706; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; border: 1px solid #fde68a; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fas fa-file-invoice"></i> ملخص
                </span>
            `;
        } else if (classification === 'فيديو') {
            classificationBadgeHtml = `
                <span style="background: #fef2f2; color: #dc2626; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; border: 1px solid #fecaca; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fab fa-youtube"></i> فيديو
                </span>
            `;
        } else {
            classificationBadgeHtml = `
                <span style="background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; border: 1px solid #cbd5e1; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fas fa-file"></i> ${escapeHtml(classification)}
                </span>
            `;
        }

        let imagesGridHtml = '';
        if (images.length > 0) {
            const count = images.length;
            if (count === 1) {
                imagesGridHtml = `
                    <div style="border-radius: 12px; overflow: hidden; margin-top: 12px; border: 1px solid #e2e8f0; background: #0f172a;">
                        <div onclick="openExerciseLightbox(${ex.id}, 0)" style="position: relative; height: 240px; cursor: pointer; overflow: hidden;">
                            <img src="${escapeHtml(images[0])}" style="width: 100%; height: 100%; object-fit: contain; background: #020617; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'" alt="صورة التمرين">
                        </div>
                    </div>
                `;
            } else if (count === 2) {
                imagesGridHtml = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 12px; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
                        <div onclick="openExerciseLightbox(${ex.id}, 0)" style="position: relative; height: 130px; cursor: pointer; overflow: hidden; background: #0f172a;">
                            <img src="${escapeHtml(images[0])}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" alt="صورة التمرين">
                        </div>
                        <div onclick="openExerciseLightbox(${ex.id}, 1)" style="position: relative; height: 130px; cursor: pointer; overflow: hidden; background: #0f172a;">
                            <img src="${escapeHtml(images[1])}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" alt="صورة التمرين">
                        </div>
                    </div>
                `;
            } else {
                const remainingCount = count - 3;
                imagesGridHtml = `
                    <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; grid-template-rows: 110px 110px; gap: 6px; margin-top: 12px; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
                        <div onclick="openExerciseLightbox(${ex.id}, 0)" style="grid-row: span 2; position: relative; height: 226px; cursor: pointer; overflow: hidden; background: #0f172a;">
                            <img src="${escapeHtml(images[0])}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" alt="صورة التمرين">
                        </div>
                        <div onclick="openExerciseLightbox(${ex.id}, 1)" style="position: relative; height: 110px; cursor: pointer; overflow: hidden; background: #0f172a;">
                            <img src="${escapeHtml(images[1])}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" alt="صورة التمرين">
                        </div>
                        <div onclick="openExerciseLightbox(${ex.id}, 2)" style="position: relative; height: 110px; cursor: pointer; overflow: hidden; background: #0f172a;">
                            <img src="${escapeHtml(images[2])}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" alt="صورة التمرين">
                            ${remainingCount > 0 ? `
                                <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.65); color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 800; pointer-events: none; backdrop-filter: blur(1.5px);">
                                    <span style="font-size: 1.3rem;">+${remainingCount}</span>
                                    <span style="font-size: 0.75rem;">صور إضافية</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }
        }

        // 🎬 فيديو يوتيوب (أو قائمة تشغيل): صورة مصغّرة + تشغيل عند النقر
        const ytIds = (classification === 'فيديو') ? extractYouTubeVideoIds(ex.external_link) : [];
        const ytMainId = ytIds.length > 0 ? ytIds[0] : null;
        const videoEmbedHtml = ytMainId ? `
            <div class="ex-video-wrap">
                <div class="ex-video-main" id="yt-player-${ex.id}" data-video-ids="${ytIds.join(',')}" data-current-video="${ytMainId}">
                    <img src="https://i.ytimg.com/vi/${ytMainId}/hqdefault.jpg" alt="${escapeHtml(ex.title || 'فيديو تعليمي')}" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;" loading="lazy" referrerpolicy="no-referrer">
                    <button type="button" class="ex-video-playbtn" onclick="playExerciseVideo(${ex.id}, '${ytMainId}')" aria-label="تشغيل الفيديو" style="position: absolute; inset: 0; margin: auto; width: 70px; height: 50px; border: none; border-radius: 12px; background: rgba(15, 23, 42, 0.75); color: #fff; font-size: 1.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.4);"><i class="fas fa-play"></i></button>
                    ${ytNavOverlayHtml(ex.id, ytMainId, ytIds)}
                </div>
                ${ytIds.length > 1 ? `
                <div class="ex-video-playlist" id="yt-playlist-${ex.id}">
                    ${ytIds.map((vid, i) => `
                        <div class="ex-video-thumb" onclick="swapExerciseVideo(${ex.id}, '${vid}', this)" title="تشغيل الفيديو ${i + 1}" style="${i === 0 ? 'border-color:#dc2626;' : ''}">
                            <img src="https://i.ytimg.com/vi/${vid}/mqdefault.jpg" alt="فيديو ${i + 1}" loading="lazy" referrerpolicy="no-referrer">
                            <span class="ex-thumb-play"><i class="fas fa-play-circle"></i></span>
                        </div>`).join('')}
                </div>` : ''}
            </div>` : '';
        const playlistBadgeHtml = ytIds.length > 1 ? `
            <span style="background: #f5f3ff; color: #7c3aed; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; border: 1px solid #ddd6fe; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fas fa-list-ol"></i> قائمة تشغيل (${ytIds.length} فيديوهات)
            </span>` : '';
        const hasTeacher = ex.teacher_id != null && parseInt(ex.teacher_id) > 0;

        return `
            <div id="exercise-card-${ex.id}" style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 12px rgba(0,0,0,0.03); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
                <div>
                    <!-- Teacher Info & Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px;${hasTeacher ? ' cursor: pointer;' : ''}" ${hasTeacher ? `onclick="showTeacherProfile(${ex.teacher_id})"` : ''}>
                            <img src="${escapeHtml(ex.teacher_profile_image || '/images/default-avatar.svg')}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;" referrerpolicy="no-referrer" onerror="handleImageFallback(this)">
                            <div>
                                <div style="font-weight: 800; font-size: 0.95rem; color: #1e293b; transition: color 0.2s;" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='#1e293b'">${escapeHtml(hasTeacher ? (ex.teacher_name || 'أستاذ') : (ex.teacher_name || 'طالب في المنصة'))}</div>
                                <div style="font-size: 0.78rem; color: #64748b;">${dateStr}</div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; border: 1px solid #bae6fd;">
                                ${escapeHtml(ex.subject_name || ex.subject || 'تمارين')}
                            </span>
                            ${isOwner ? `
                                <button onclick="deleteExercise(${ex.id})" title="حذف المنشور" style="background: #fee2e2; color: #ef4444; border: none; width: 34px; height: 34px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Level & Classification Badges -->
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; align-items: center;">
                        <span style="background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 700;">
                            <i class="fas fa-graduation-cap" style="color: var(--primary);"></i> ${escapeHtml(levelLabel)}
                        </span>
                        ${classificationBadgeHtml}
                        ${playlistBadgeHtml}
                    </div>

                    <!-- Title & Description -->
                    <h3 style="margin: 8px 0 6px 0; font-size: 1.05rem; font-weight: 800; color: #0f172a; line-height: 1.4;">${escapeHtml(ex.title)}</h3>
                    ${ex.description ? `<p style="margin: 0 0 10px 0; font-size: 0.88rem; color: #334155; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(ex.description)}</p>` : ''}

                    ${videoEmbedHtml}

                    ${(!videoEmbedHtml && ex.external_link) ? `
                        <div class="exercise-card-link-box" style="margin: 12px 0; background: #f0fdf4; border: 1px dashed #4ade80; border-radius: 12px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; direction: rtl;">
                            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                                <i class="fas fa-link" style="color: #16a34a; font-size: 1rem; flex-shrink: 0;"></i>
                                <span style="font-size: 0.82rem; color: #166534; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">رابط خارجي إضافي للتمارين / الحلول</span>
                            </div>
                            <a href="${escapeHtml(ex.external_link)}" target="_blank" rel="noopener noreferrer" onclick="recordExerciseView(${ex.id})" style="background: #16a34a; color: white; border: none; padding: 6px 12px; border-radius: 8px; font-weight: 700; font-size: 0.78rem; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; transition: background 0.2s; white-space: nowrap;" onmouseover="this.style.background='#15803d'" onmouseout="this.style.background='#16a34a'">
                                <i class="fas fa-external-link-alt"></i> فتح الرابط
                            </a>
                        </div>
                    ` : ''}

                    <!-- Images Grid -->
                    ${imagesGridHtml}
                </div>

                <!-- Footer Actions -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid #f1f5f9;">
                    <div style="display: flex; gap: 8px;">
                        <button onclick="toggleSaveExercise(${ex.id})" style="background: ${isSaved ? '#fef3c7' : '#f8fafc'}; color: ${isSaved ? '#d97706' : '#64748b'}; border: 1px solid ${isSaved ? '#f59e0b' : '#cbd5e1'}; padding: 6px 14px; border-radius: 10px; font-weight: 700; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                            <i class="${isSaved ? 'fas' : 'far'} fa-bookmark"></i>
                            <span>${isSaved ? 'محفوظ 🔖' : 'حفظ المنشور'}</span>
                        </button>

                        <button onclick="shareExercise(${ex.id}, '${escapeHtml(ex.title).replace(/'/g, "\\'")}')" style="background: #eff6ff; color: var(--primary); border: 1px solid #bfdbfe; padding: 6px 14px; border-radius: 10px; font-weight: 700; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-share-nodes"></i>
                            <span>مشاركة التمارين</span>
                        </button>
                    </div>

                </div>
            </div>
        `;
    }

    const viewedExercises = new Set();

    async function recordExerciseView(exerciseId) {
        if (!exerciseId || viewedExercises.has(exerciseId)) return;
        viewedExercises.add(exerciseId);

        try {
            fetch(`/api/exercise/${exerciseId}/view`, { method: 'POST' }).catch(() => {});
            const ex = allStudentExercises.find(e => e.id === exerciseId);
            if (ex) {
                ex.views_count = (ex.views_count || 0) + 1;
                const viewEl = document.getElementById(`exercise-views-${exerciseId}`);
                if (viewEl) {
                    viewEl.innerHTML = `<i class="fas fa-eye"></i> ${ex.views_count}`;
                }
            }
        } catch (e) {
            console.error('Error recording view:', e);
        }
    }

    async function toggleSaveExercise(exerciseId) {
        if (checkGuestAction()) return;

        try {
            const res = await fetchWithAuth(`/api/exercise/${exerciseId}/bookmark`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast(data.is_saved ? '🔖 تم حفظ التمارين المحفوظات' : 'تم إزالة التمارين من المحفوظات', 'success');
                const ex = allStudentExercises.find(e => e.id === exerciseId);
                if (ex) ex.is_saved = data.is_saved;
                filterExercises();
            } else {
                showToast('❌ ' + (data.error || 'فشل عملية الحفظ'), 'error');
            }
        } catch (err) {
            console.error('Error toggling save exercise:', err);
            showToast('❌ حدث خطأ أثناء الاتصال', 'error');
        }
    }

    async function deleteExercise(exerciseId) {
        if (!confirm('هل أنت متأكد من رغبتك في حذف هذا المنشور نهائياً؟')) return;

        try {
            const res = await fetchWithAuth(`/api/exercise/${exerciseId}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok || data.success) {
                showToast('🗑️ تم حذف التمارين بنجاح', 'success');
                allStudentExercises = allStudentExercises.filter(e => e.id !== exerciseId);
                filterExercises();
            } else {
                showToast('❌ ' + (data.error || 'فشل حذف التمارين'), 'error');
            }
        } catch (err) {
            console.error('Error deleting exercise:', err);
            showToast('❌ حدث خطأ أثناء الحذف', 'error');
        }
    }

    function shareExercise(exerciseId, title) {
        const shareUrl = `${window.location.origin}/student-dashboard.html?exercise=${exerciseId}`;
        if (navigator.share) {
            navigator.share({
                title: title || 'تمارين وحلول منصة زوم ديزاد',
                text: `تفضل بزيارة هذا التمارين والحلول النموذجية على منصة زوم ديزاد التعليمية: ${title}`,
                url: shareUrl
            }).catch(() => {});
        } else {
            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast('📋 تم نسخ رابط التمارين بنجاح!', 'success');
            }).catch(() => {
                prompt('انسخ رابط التمارين التالي للمشاركة:', shareUrl);
            });
        }
    }

    let exerciseLightboxZoom = 1;

    function zoomExerciseImg(amount) {
        exerciseLightboxZoom = Math.max(0.5, Math.min(4, exerciseLightboxZoom + amount));
        const img = document.getElementById('exerciseLightboxImg');
        if (img) {
            img.style.transform = `scale(${exerciseLightboxZoom})`;
        }
    }

    function resetExerciseImgZoom() {
        exerciseLightboxZoom = 1;
        const img = document.getElementById('exerciseLightboxImg');
        if (img) {
            img.style.transform = 'scale(1)';
        }
    }

    function openExerciseLightbox(exerciseId, imageIndex) {
        const ex = allStudentExercises.find(e => e.id === exerciseId);
        if (!ex || !Array.isArray(ex.images) || ex.images.length === 0) return;

        // Record a view when opening the exercise image lightbox
        recordExerciseView(exerciseId);

        exerciseLightboxImages = ex.images;
        exerciseLightboxIndex = imageIndex;
        resetExerciseImgZoom();

        const modal = document.getElementById('exerciseLightboxModal');
        const img = document.getElementById('exerciseLightboxImg');
        const titleEl = document.getElementById('exerciseLightboxTitle');
        const counter = document.getElementById('exerciseLightboxCounter');

        if (titleEl) titleEl.textContent = ex.title || 'عرض صورة التمرين';
        if (img) img.src = exerciseLightboxImages[exerciseLightboxIndex];
        if (counter) counter.textContent = `صورة ${exerciseLightboxIndex + 1} من ${exerciseLightboxImages.length}`;

        if (modal) modal.style.display = 'block';
    }

    function navigateLightbox(dir) {
        if (exerciseLightboxImages.length <= 1) return;
        exerciseLightboxIndex += dir;
        if (exerciseLightboxIndex < 0) exerciseLightboxIndex = exerciseLightboxImages.length - 1;
        if (exerciseLightboxIndex >= exerciseLightboxImages.length) exerciseLightboxIndex = 0;
        resetExerciseImgZoom();

        const img = document.getElementById('exerciseLightboxImg');
        const counter = document.getElementById('exerciseLightboxCounter');

        if (img) img.src = exerciseLightboxImages[exerciseLightboxIndex];
        if (counter) counter.textContent = `صورة ${exerciseLightboxIndex + 1} من ${exerciseLightboxImages.length}`;
    }

    function closeExerciseLightbox() {
        const modal = document.getElementById('exerciseLightboxModal');
        if (modal) modal.style.display = 'none';
        resetExerciseImgZoom();
    }

    window.loadExercises = loadExercises;
    window.toggleExerciseSavedFilter = toggleExerciseSavedFilter;
    window.filterExercises = filterExercises;
    window.toggleSaveExercise = toggleSaveExercise;
    window.shareExercise = shareExercise;
    window.openExerciseLightbox = openExerciseLightbox;
    window.navigateLightbox = navigateLightbox;
    window.closeExerciseLightbox = closeExerciseLightbox;
    window.zoomExerciseImg = zoomExerciseImg;
    window.resetExerciseImgZoom = resetExerciseImgZoom;
    window.recordExerciseView = recordExerciseView;

    window.openReportModal = openReportModal;
    window.closeReportModal = closeReportModal;
    window.submitReportAction = submitReportAction;
    window.reportPost = function(postId) { openReportModal('post', postId); };
