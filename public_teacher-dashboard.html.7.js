
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
    // ================================================================
    // ✅ نظام البث المباشر مع عداد الوقت والرصيد المعلق
    // ================================================================

    let userData = null;
    let teacherId = null;
    let currentConversations = [];
    let currentChatTeacher = null;

    // Expose local variables to window object so external scripts like chat-audio.js can access them
    Object.defineProperty(window, 'teacherId', {
        get() { return teacherId; },
        set(val) { teacherId = val; },
        configurable: true
    });
    Object.defineProperty(window, 'userData', {
        get() { return userData; },
        set(val) { userData = val; },
        configurable: true
    });
    Object.defineProperty(window, 'currentChatTeacher', {
        get() { return currentChatTeacher; },
        set(val) { currentChatTeacher = val; },
        configurable: true
    });
    let referralData = null;
    let notifications = [];
    let unreadCount = 0;
    let authToken = null;
    let csrfToken = null;

    // Global Error Logger & Self-Healing Auto-Repair Engine
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
        attemptAutoRepair(errorMsg, source);
    }
    window.logAppError = logAppError;

    window.addEventListener('error', function(e) {
        logAppError('Global Window Error', e.error || e.message);
    });

    window.addEventListener('unhandledrejection', function(e) {
        logAppError('Unhandled Promise Rejection', e.reason ? (e.reason.message || e.reason) : 'Promise rejected');
    });


    const API_BASE_URL = window.location.origin;

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
        if (document.getElementById('lightboxOverlay').style.display === 'flex') {
            if (e.key === 'ArrowRight') changeLightboxImage(1);
            if (e.key === 'ArrowLeft') changeLightboxImage(-1);
        }
    });

    console.log('🌐 API Base URL:', API_BASE_URL);

    // ================================================================
    // دوال المصادقة والأمان
    // ================================================================

    const errorList = [];
    function showErrorDiagnostics(msg, detail) {
        const ts = new Date().toLocaleTimeString('ar');
        errorList.push(`[${ts}] ${msg}${detail ? ' — ' + detail : ''}`);
        const panel = document.getElementById('errorDiagnostics');
        if (panel) {
            panel.style.display = 'none'; // Keep error diagnostics panel hidden
        }
        console.error('[DIAG]', msg, detail || '');
    }

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

    // Helper to parse content and detect links & hashtags
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
                if (idx >= 5) return; // Only show up to 5 in grid

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

                // Prepare images array for lightbox as a JSON string to pass into onclick
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
    window.renderPostAttachments = renderPostAttachments;

    function showAddPostModal() {
        if (!checkTeacherProfileComplete()) return;
        if (checkGuestAction()) return;
        if (userData && userData.status !== 'approved') {
            if (userData.requires_profile_completion || !userData.profile_completion) {
                showToast('⚠️ قم برفع الوثائق (صورة الشهادة/الدبلوم وإثبات الهوية) لتحقق من حسابك والوصول الى هذا القسم', 'warning');
            } else if (userData.status === 'rejected') {
                showToast('❌ تم رفض طلبك. يرجى إعادة رفع الوثائق والصور لإضافة منشورات.', 'warning');
            } else {
                showToast('⏳ زر إضافة المنشورات معلق لحين قبول حسابك من قبل الإدارة', 'warning');
            }
            return;
        }
        document.getElementById('addPostModal').style.display = 'block';
    }
    function hideAddPostModal() {
        document.getElementById('addPostModal').style.display = 'none';
    }
    window.showAddPostModal = showAddPostModal;
    window.hideAddPostModal = hideAddPostModal;

    function showImageSize(input) {
        window.capturedProfileImage = null;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
            if (file.size > 50 * 1024 * 1024) {
                showToast(`⚠️ حجم الصورة (${sizeInMb} MB) يتجاوز الحد الأقصى المسموح به للصورة الواحدة وهو 50 ميجابايت`, 'error');
                input.value = '';
                return false;
            }
            showToast(`حجم الصورة: ${sizeInMb} ميجابايت (ضمن الحد المسموح 50MB)`, 'info');
            return true;
        }
    }
    window.showImageSize = showImageSize;

    async function validateImageSize(input, nextElementId) {
        if (input.files && input.files[0]) {
            let file = input.files[0];
            const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
            if (file.size > 50 * 1024 * 1024) {
                showToast(`⚠️ حجم الصورة (${sizeInMb} MB) يتجاوز الحد الأقصى المسموح به للصورة الواحدة وهو 50 ميجابايت`, 'error');
                input.value = '';
                return false;
            }
            if (file.type.startsWith('image/')) {
                showToast(`جاري ضغط وتحسين الصورة لتسريع الرفع وضمان الاستقرار...`, 'info');
                file = await compressImageFile(file, 1200, 1200, 0.8);
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                input.files = dataTransfer.files;
                const newSizeInMb = (file.size / (1024 * 1024)).toFixed(2);
                showToast(`✅ تم ضغط الصورة بنجاح (الحجم الجديد: ${newSizeInMb}MB)`, 'success');
            }
        }
        if (typeof autoScrollToNext === 'function' && nextElementId) {
            autoScrollToNext(input, nextElementId);
        }
        return true;
    }
    window.validateImageSize = validateImageSize;

    let stream;
    window.startCamera = function() {
        const container = document.getElementById('cameraContainer');
        const video = document.getElementById('cameraStream');
        if (!container || !video) return;
        container.style.display = 'block';
        setTimeout(() => {
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(s => {
                stream = s;
                video.srcObject = s;
            })
            .catch(err => {
                console.error("Error accessing camera: ", err);
                showToast('تعذر الوصول إلى الكاميرا', 'error');
            });
    }

    window.capturePhoto = function() {
        const video = document.getElementById('cameraStream');
        const canvas = document.getElementById('cameraCanvas');
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(blob => {
            const file = new File([blob], "profile.jpg", { type: "image/jpeg" });
            const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
            if (file.size > 50 * 1024 * 1024) {
                showToast(`⚠️ الصورة الملتقطة أكبر من 50 ميجابايت`, 'error');
                return;
            }
            window.capturedProfileImage = file;
            showToast(`تم التقاط الصورة بنجاح (الحجم: ${sizeMb} MB - ضمن الحد المسموح 50MB)`, 'success');
            
            stream.getTracks().forEach(track => track.stop());
            document.getElementById('cameraContainer').style.display = 'none';
        }, 'image/jpeg', 0.85);
    }

    let modalCameraStream = null;
    let activeCameraInputId = null;

    window.startCameraForInput = function(inputId) {
        activeCameraInputId = inputId;
        const container = document.getElementById('modalCameraContainer');
        const video = document.getElementById('modalCameraStream');
        if (!container || !video) return;

        container.style.display = 'block';
        setTimeout(() => {
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);

        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(s => {
                modalCameraStream = s;
                video.srcObject = s;
            })
            .catch(err => {
                navigator.mediaDevices.getUserMedia({ video: true })
                    .then(s => {
                        modalCameraStream = s;
                        video.srcObject = s;
                    })
                    .catch(e => {
                        showToast('تعذر الوصول إلى الكاميرا. يرجى السماح باستخدام الكاميرا في المتصفح.', 'error');
                    });
            });
    };

    window.stopModalCamera = function() {
        if (modalCameraStream) {
            modalCameraStream.getTracks().forEach(track => track.stop());
            modalCameraStream = null;
        }
        const container = document.getElementById('modalCameraContainer');
        if (container) container.style.display = 'none';
        activeCameraInputId = null;
    };

    window.capturePhotoForInput = function() {
        const video = document.getElementById('modalCameraStream');
        const canvas = document.getElementById('modalCameraCanvas');
        if (!video || !canvas || !activeCameraInputId) return;

        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(blob => {
            if (!blob) return;
            const file = new File([blob], `${activeCameraInputId}_captured.jpg`, { type: "image/jpeg" });
            const sizeMb = (file.size / (1024 * 1024)).toFixed(2);

            try {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                const targetInput = document.getElementById(activeCameraInputId);
                if (targetInput) {
                    targetInput.files = dataTransfer.files;
                    targetInput.dispatchEvent(new Event('change'));
                }
            } catch (e) {
                console.log("DataTransfer error", e);
            }

            showToast(`✅ تم التقاط الصورة بنجاح (${sizeMb} MB) - ضمن الحد المسموح 50MB`, 'success');
            stopModalCamera();
        }, 'image/jpeg', 0.85);
    };

    window.updateCapturedDocStatus = function(inputId, statusId) {
        const input = document.getElementById(inputId);
        const statusEl = document.getElementById(statusId);
        if (input && statusEl) {
            if (input.files && input.files.length > 0) {
                statusEl.style.display = 'block';
            } else {
                statusEl.style.display = 'none';
            }
        }
    };

    // إدارة الملفات المختارة للمنشور الجديد
    let postFilesArray = [];

    function previewFiles(input) {
        const previewContainer = document.getElementById('postPreviewContainer');
        const uploadArea = document.getElementById('uploadArea');
        
        const newFiles = Array.from(input.files);
        
        // التحقق من العدد الإجمالي
        if (postFilesArray.length + newFiles.length > 10) {
            showToast('⚠️ لا يمكن اختيار أكثر من 10 ملفات للمنشور الواحد', 'error');
            input.value = '';
            return;
        }

        // التحقق من الحجم الإجمالي (50 ميجابايت)
        const currentSize = postFilesArray.reduce((acc, file) => acc + file.size, 0);
        const newSize = newFiles.reduce((acc, file) => acc + file.size, 0);
        if (currentSize + newSize > 50 * 1024 * 1024) {
            showToast('⚠️ إجمالي حجم الملفات يتجاوز 50 ميجابايت', 'error');
            input.value = '';
            return;
        }

        // إضافة الملفات الجديدة للمصفوفة
        postFilesArray = [...postFilesArray, ...newFiles];
        input.value = ''; // تفريغ المدخل للسماح باختيار نفس الملف مرة أخرى إذا حذف

        renderFilesPreview();
        
        if (postFilesArray.length > 0) {
            uploadArea.style.borderColor = 'var(--primary)';
            uploadArea.style.background = '#f0f9ff';
        }
    }

    function renderFilesPreview() {
        const previewContainer = document.getElementById('postPreviewContainer');
        const uploadArea = document.getElementById('uploadArea');
        previewContainer.innerHTML = '';

        postFilesArray.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const div = document.createElement('div');
                div.className = 'preview-item';
                div.style.cssText = `
                    position: relative;
                    width: 100%;
                    height: 100px;
                    border-radius: 12px;
                    overflow: hidden;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    background: #fff;
                `;
                
                let content = '';
                if (file.type.startsWith('image/')) {
                    content = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover;">`;
                } else {
                    const fileName = file.name.length > 12 ? file.name.substring(0, 10) + '...' : file.name;
                    content = `<div style="width: 100%; height: 100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#f8fafc; font-size: 0.7rem; color:#475569; padding:8px; text-align:center;">
                        <i class="fas fa-file-alt" style="font-size: 1.8rem; color: var(--primary); margin-bottom: 8px;"></i>
                        <span style="font-weight: 600; line-height: 1.2;">${escapeHtml(fileName)}</span>
                    </div>`;
                }
                
                div.innerHTML = `${content}
                    <button type="button" onclick="removePostFile(${index})" style="position: absolute; top: 6px; right: 6px; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 12px; display:flex; align-items:center; justify-content:center; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                        <i class="fas fa-times"></i>
                    </button>`;
                previewContainer.appendChild(div);
            };
            reader.readAsDataURL(file);
        });

        if (postFilesArray.length === 0) {
            uploadArea.style.borderColor = 'var(--gray-300)';
            uploadArea.style.background = '#f8fafc';
        }
    }

    window.removePostFile = (index) => {
        postFilesArray.splice(index, 1);
        renderFilesPreview();
    };
    
    window.previewFiles = previewFiles;

    function checkGuestAction() {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData.is_guest || userData.id === -1) {
            showToast('⚠️ أنت تتصفح كزائر. يرجى تسجيل الدخول أو إنشاء حساب للقيام بهذا الإجراء.', 'error');
            if (confirm('أنت تتصفح كزائر حالياً.\nللقيام بالمتابعة، النشر، إنشاء العروض/الدورات أو تعديل الملف الشخصي، يرجى تسجيل الخول أو إنشاء حاب.\n\nهل ترغب في الانتقال لصفحة إنشاء حساب؟')) {
                exitGuestAndNavigate('/?register=true');
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
        const storedData = localStorage.getItem('userData') || localStorage.getItem('zoomdz_user') || localStorage.getItem('user');
        const token = localStorage.getItem('token') || localStorage.getItem('zoomdz_token');

        if (!storedData || !token) {
            if (window._isLoggingOut) return true;
            window._isLoggingOut = true;
            console.warn('🔒 التوكن أو بيانات المستخدم مفقودة! يتم تسجيل الخروج الآن...');
            localStorage.clear();
            if (typeof showToast === 'function') {
                showToast('يتم تسجيل الخروج الآن', 'info');
            }
            setTimeout(() => {
                window.location.href = '/index.html?login=1';
            }, 800);
            return true;
        }

        let uData = {};
        try {
            uData = JSON.parse(storedData);
        } catch(e) {
            localStorage.clear();
            window.location.href = '/index.html?login=1';
            return true;
        }

        if (uData.is_guest || uData.id === -1) {
            return false;
        }

        if (isTokenExpired(token)) {
            if (window._isLoggingOut) return true;
            window._isLoggingOut = true;
            console.warn('🔒 التوكن منتهي الصلاحية! يتم تسجيل الخروج الآن...');
            localStorage.clear();
            if (typeof showToast === 'function') {
                showToast('يتم تسجيل الخروج الآن', 'info');
            }
            setTimeout(() => {
                window.location.href = '/index.html?login=1';
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
        checkGuestAction();
    }

    async function fetchWithAuth(url, options = {}) {
        const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
        
        const isGuestUser = userData && (userData.is_guest || userData.id === -1);
        if (!isGuestUser && checkAndHandleAutoLogout()) {
            throw new Error('انتهت صلاحية التوكن');
        }

        const isFormData = options.body instanceof FormData;
        const currentToken = localStorage.getItem('token') || localStorage.getItem('zoomdz_token') || '';
        const headers = {
            'Authorization': `Bearer ${currentToken}`,
            'X-CSRF-Token': csrfToken || '',
            ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
            ...options.headers
        };
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // زيادة المهلة إلى 120 ثانية لرفع الملفات الكبيره
        
        // GET قراءة خلفية: فشله لا يستحق إزعاجاً. أما POST/PUT/DELETE
        // فإجراء طلبه المستخدم فيستحق رسالة.
        const method = String((options && options.method) || 'GET').toUpperCase();
        const isBackgroundRead = method === 'GET';
        try {
            const response = await fetch(fullUrl, {
                ...options,
                headers: headers,
                credentials: 'include',
                signal: controller.signal
            })
.then(function (res) {
    if (window.ZoomyNet && window.ZoomyNet.markSuccess) window.ZoomyNet.markSuccess();
    return res;
}, function (err) {
    if (window.ZoomyNet && window.ZoomyNet.markFailure) window.ZoomyNet.markFailure();
    throw err;
});;;
            clearTimeout(timeoutId);

            if (response.status === 401) {
                if (userData && (userData.is_guest || userData.id === -1)) {
                    throw new Error('غير مصرح للزائر');
                }
                if (window._isLoggingOut) throw new Error('انتهت صلاحية الجلسة');
                window._isLoggingOut = true;
                showToast('يتم تسجيل الخروج الآن', 'info');
                localStorage.clear();
                setTimeout(() => { window.location.href = '/'; }, 1000);
                throw new Error('انتهت صلاحية الجلسة');
            }

            if (response.status >= 500) {
                // كان يعيد تحميل الصفحة تلقائياً هنا، فتفقد المستخدم
                // ما كتبته. الآن: صمت تماماً أثناء التحميل الخلفي،
                // ورسالة واحدة هادئة عند إجراء صريح فقط.
                // ⚠️ errMsg كان غير معرَّف — كل خطأ 5xx كان يُرمي
                // ReferenceError ويخفي السبب الحقيقي عن المستخدم والسجل.
                let errMsg = 'Server Error';
                try {
                    const errBody = await response.clone().json();
                    if (errBody && (errBody.error || errBody.message)) errMsg = errBody.error || errBody.message;
                } catch (parseErr) { /* استجابة غير JSON */ }
                logAppError('Server Error', errMsg, response.status, url);
                if (!isBackgroundRead && !(window.ZoomyNet && window.ZoomyNet.isOnline() === false)) {
                }
            }

            if (response.status === 413) {
                showToast('❌ الملف كبير جداً، يرجى اختيار ملف أصغر (أقل من 1 جيجابايت)', 'error');
                throw new Error('الملف كبير جداً');
            }

            if (response.status === 403) {
                let errorMsg = 'غير مصرح به';
                try {
                    const data = await response.json();
                    if (data.banned) {
                        showToast('⚠️ تم حظر حسابك من المنصة', 'error');
                        localStorage.clear();
                        setTimeout(() => { window.location.href = '/'; }, 2000);
                        throw new Error('حساب محظور');
                    }
                    if (data.error && data.error.includes('CSRF')) {
                        await getCsrfToken();
                        const retryResponse = await fetch(fullUrl, {
                            ...options,
                            headers: {
                                ...headers,
                                'X-CSRF-Token': csrfToken
                            }
                        });
                        if (retryResponse.ok) return retryResponse;
                    }
                    if (data.error) errorMsg = data.error;
                } catch (e) {
                    if (e.message === 'حساب محظور' || e.message === 'انتهت صلاحية الجلسة') throw e;
                    if (e.message) errorMsg = e.message;
                }
                throw new Error(errorMsg);
            }

            return response;
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                if (!isBackgroundRead) { /* لا رسالة خطأ على الشاشة */ }
                throw new Error('انتهت مهلة الاتصال');
            }
            if (!err.message.includes('انتهت صلاحية الجلسة') && !err.message.includes('حساب محظور') && !isBackgroundRead) {
                // لا إعادة تحميل للصفحة أبداً: يفقد المستخدم ما كتبه.
                logAppError('Fetch Error', err.message, null, url);
                if (!(window.ZoomyNet && window.ZoomyNet.isOnline() === false)) {
                }
            }
            throw err;
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
            return null;
        }
    }

    // ================================================================
    // NOTIFICATIONS
    // ================================================================

    async function loadNotifications() {
        try {
            const res = await fetchWithAuth(`/api/notifications/${teacherId}/teacher`);
            const data = await res.json();
            notifications = data || [];
    if (typeof window.zoomySoundWatchNotifications === 'function') window.zoomySoundWatchNotifications(notifications, teacherId);
            unreadCount = notifications.filter(n => !n.is_read).length;
            updateNotifBadge();
            renderNotifications();
        } catch (e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                console.error('خطأ في جلب الإشعارات:', e);
            }
        }
    }

    function updateNotifBadge() {
        const badge = document.getElementById('notifBadge');
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    function renderNotifications() {
        const list = document.getElementById('notifList');
        const countLabel = document.getElementById('notifCountLabel');
        const button = document.getElementById('notifBtn');
        const totalCount = notifications ? notifications.length : 0;
        const unreadCount = notifications ? notifications.filter(n => !n.is_read).length : 0;

        if (countLabel) {
            countLabel.textContent = totalCount;
        }

        if (!notifications || notifications.length === 0) {
            list.innerHTML = `<div class="notif-empty"><i class="fas fa-bell-slash"></i>لا توجد إشعارات</div>`;
            if (button) button.classList.toggle('active', false);
            return;
        }

        let html = '';
        for (const notif of notifications) {
            const isUnread = !notif.is_read;
            const time = new Date(notif.created_at);
            const timeStr = time.toLocaleString('ar', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
            let iconClass = 'info', icon = 'fa-bell';
            const title = notif.title || '';
            if (title.includes('منشور') || title.includes('درس')) { iconClass = 'info'; icon = 'fa-bullhorn'; }
            else if (title.includes('متابع')) { iconClass = 'info'; icon = 'fa-user-plus'; }
            else if (title.includes('سحب') || title.includes('صرف')) { iconClass = 'warning'; icon = 'fa-hand-holding-usd'; }
            else if (title.includes('دفع') || title.includes('إضافة') || title.includes('شحن')) { iconClass = 'success'; icon = 'fa-check-circle'; }
            else if (title.includes('درس') || title.includes('بث') || title.includes('حصة')) { iconClass = 'info'; icon = 'fa-calendar-alt'; }
            else if (title.includes('حظر') || title.includes('إلغاء') || title.includes('رفض')) { iconClass = 'danger'; icon = 'fa-exclamation-circle'; }

            const cleanMessage = (notif.message || '').replace(/\[(POST|STUDENT|TEACHER):\d+\]/g, '').trim();

            html += `<div class="notif-item ${isUnread ? 'unread' : ''}" onclick='markNotificationRead("${notif.id}", ${notif.offer_id || 'null'}, ${JSON.stringify(notif.message || '')}, ${JSON.stringify(notif.title || '')})'>
                <div class="notif-icon ${iconClass}"><i class="fas ${icon}"></i></div>
                <div class="notif-content">
                    <div class="notif-title">${escapeHtml(notif.title)}</div>
                    <div class="notif-message">${escapeHtml(cleanMessage)}</div>
                    <div class="notif-time">${timeStr}</div>
                </div>
            </div>`;
        }
        list.innerHTML = html;

        if (button) {
            button.classList.toggle('active', unreadCount > 0);
        }
    }

    function toggleNotifications() {
        const dropdown = document.getElementById('notifDropdown');
        const button = document.getElementById('notifBtn');
        const isOpen = dropdown.classList.contains('open');

        dropdown.classList.toggle('open');
        document.getElementById('profileDropdown').classList.remove('open');

        if (button) {
            button.classList.toggle('active', !isOpen);
        }
        if (!isOpen) loadNotifications();
    }

    async function markNotificationRead(notifId, offerId, rawMessage = '', rawTitle = '') {
        const dropdown = document.getElementById('notifDropdown');
        if (dropdown) dropdown.classList.remove('open');

        try {
            const res = await fetchWithAuth(`/api/notifications/read/${notifId}`, { method: 'POST' });
            if (res.ok) {
                const notif = notifications.find(n => n.id == notifId);
                if (notif) notif.is_read = true;
                unreadCount = notifications.filter(n => !n.is_read).length;
                updateNotifBadge();
                renderNotifications();
            }
        } catch (e) {
            if (e.message !== 'انتهت صلاحية الجلسة') console.error(e);
        }

        // 1. Post / Like / Comment / Mention routing
        const postMatch = rawMessage.match(/\[POST:(\d+)\]/);
        if (postMatch || rawTitle.includes('منشور') || rawTitle.includes('إعجاب') || rawTitle.includes('تعليق')) {
            showSection('posts');
            const postId = postMatch ? postMatch[1] : null;
            loadTeacherPosts().then(() => {
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

        // 2. Lessons / Offers / Bookings / Streams routing
        if (offerId || rawTitle.includes('درس') || rawTitle.includes('حصة') || rawTitle.includes('عرض') || rawTitle.includes('حجز') || rawTitle.includes('بث')) {
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

        // 3. Wallet / Earnings / Withdrawals / Transactions routing
        if (rawTitle.includes('رصيد') || rawTitle.includes('أرباح') || rawTitle.includes('سحب') || rawTitle.includes('شحن') || rawTitle.includes('دفع') || rawTitle.includes('معاملة')) {
            showSection('earnings');
            return;
        }

        // 4. Referral / Rewards routing
        if (rawTitle.includes('إحالة') || rawTitle.includes('مكافأة') || rawTitle.includes('صندوق') || rawTitle.includes('هدايا')) {
            showSection('referral');
            return;
        }

        // 5. Messages / Chat routing
        if (rawTitle.includes('رسالة') || rawTitle.includes('محادثة') || rawTitle.includes('دردشة')) {
            showSection('messages');
            return;
        }

        // 6. Profiles routing
        const studentMatch = rawMessage.match(/\[STUDENT:(\d+)\]/);
        if (studentMatch) {
            showStudentProfile(studentMatch[1]);
            return;
        }

        const teacherMatch = rawMessage.match(/\[TEACHER:(\d+)\]/);
        if (teacherMatch) {
            showTeacherProfileFromPost(teacherMatch[1]);
            return;
        }

        showSection('posts');
    }

    async function markAllNotifications() {
        for (const notif of notifications.filter(n => !n.is_read)) {
            try {
                await fetchWithAuth(`/api/notifications/read/${notif.id}`, { method: 'POST' });
                notif.is_read = true;
            } catch(e) { 
            if (e.message !== 'انتهت صلاحية الجلسة') {
                console.error(e);
                const el = document.getElementById('earningsInfo');
                if (el) el.innerHTML = '<p style="text-align:center; padding:25px; color:var(--danger);">حدث خطأ في تحميل بيانات الأرباح</p>';
            }
        }
        }
        unreadCount = 0;
        updateNotifBadge();
        renderNotifications();
        showToast('تم تحديد جميع الإشعارات كمقروءة', 'success');
    }

    async function clearAllNotifications() {
        if (!notifications || notifications.length === 0) {
            showToast('لا توجد إشعارات لمسحها', 'info');
            return;
        }
        if (!confirm('هل أنت متأكد من مسح جميع الإشعارات؟')) return;

        try {
            const res = await fetchWithAuth('/api/notifications/delete-all', { method: 'DELETE' });
            const data = await res.json();
            if (data && data.success) {
                notifications = [];
                unreadCount = 0;
                updateNotifBadge();
                renderNotifications();
                showToast('تم مسح جميع الإشعارات بنجاح', 'success');
            } else {
                showToast('فشل مسح الإشعارات', 'error');
            }
        } catch(e) {
            console.error('Clear notifications error:', e);
            showToast('حدث خطأ أثناء مسح الإشعارات', 'error');
        }
    }

    // ================================================================
    // PROFILE DROPDOWN
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
    // TOAST
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
            'is not a function'];
        for (var i = 0; i < marks.length; i++) { if (t.indexOf(marks[i]) !== -1) return true; }
        //  أكواد الأخطاء التقنية (429/500/502/503) تُبتلع ما لم يكن النص
        //  رسالة مبلغ مالي ("500 دج") — وإلا كان "الحد الأدنى 500 دج"
        //  وأرصدة مثل 1500 دج تُطبع في صمت ولا يراها أحد.
        if (t.indexOf('دج') === -1) {
            var codes = ['429', '500', '502', '503'];
            for (var j = 0; j < codes.length; j++) { if (t.indexOf(codes[j]) !== -1) return true; }
        }
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
    // NAVIGATION
    // ================================================================

    async function showSection(section) {
        if ((section === 'earnings' || section === 'transactions' || section === 'referral' || section === 'messages') && (userData && (userData.is_guest || userData.id === -1))) {
            checkGuestAction();
            return;
        }

        if (section === 'profile' && !userData) {
            await loadUserData();
        }

        // ✅ التحقق من حالة الحساب قبل السماح بالوصول لأقسام الدروس والدورات والمنشورات والتمارين وقسم الأساتذة
        if ((section === 'offers' || section === 'courses' || section === 'packages' || section === 'posts' || section === 'teachers' || section === 'all-lessons' || section === 'exercises') && userData && userData.status !== 'approved' && !(userData.is_guest || userData.id === -1)) {
            if (userData.requires_profile_completion || !userData.profile_completion) {
                showToast('⚠️ قم برفع الوثائق (صورة الشهادة/الدبلوم وإثبات الهوية) للتحقق من حسابك والوصول إلى هذا القسم', 'warning');
            } else if (userData.status === 'rejected') {
                showToast('❌ تم رفض طلبك. يرجى إعادة رفع الوثائق والصور للوصول إلى هذا القسم.', 'warning');
            } else {
                showToast('⏳ حسابك قيد التحقق ومراجعة الإدارة. سيتم إعلامك عند اعتماد حسابك.', 'warning');
            }
            if (section !== 'profile') {
                return showSection('profile');
            }
            return;
        }

        const allSections = ['profileSection', 'offersSection', 'postsSection', 'exercisesSection', 'coursesSection', 'packagesSection', 'earningsSection', 'transactionsSection', 'referralSection', 'teachersSection', 'messagesSection', 'groupsSection', 'allLessonsSection', 'communityChannelsSection', 'aiAssistantSection', 'adsSection'];
        allSections.forEach(sId => {
            const el = document.getElementById(sId);
            if (el) el.style.display = 'none';
        });

        const sectionMap = { 
            'profile': 'profileSection', 
            'offers': 'offersSection', 
            'posts': 'postsSection', 
            'exercises': 'exercisesSection',
            'all-lessons': 'allLessonsSection',
            'courses': 'coursesSection',
            'packages': 'packagesSection', 
            'earnings': 'earningsSection', 
            'transactions': 'transactionsSection', 
            'referral': 'referralSection', 
            'teachers': 'teachersSection', 
            'messages': 'messagesSection',
            'groups': 'groupsSection',
            'community-channels': 'communityChannelsSection',
            'ai-assistant': 'aiAssistantSection',
            'ads': 'adsSection'
        };
        const target = document.getElementById(sectionMap[section]);
        if (target) target.style.display = 'block';

        if (section === 'community-channels') {
            loadCommunityChannels();
        }

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

        if (section === 'offers') loadOffers();
        if (section === 'posts') {
            localStorage.setItem('last_teacher_posts_view_time', new Date().toISOString());
            const b1 = document.getElementById('postsBadge');
            const b2 = document.getElementById('mobilePostsBadge');
            if (b1) b1.style.display = 'none';
            if (b2) b2.style.display = 'none';
            loadTeacherPosts();
            loadSavedPostsSidebar();
        }
        if (section === 'courses') loadCourses();
        if (section === 'packages') { if (typeof loadTeacherPackages === 'function') loadTeacherPackages(); }
        if (section === 'exercises') loadExercises();
        if (section === 'all-lessons') loadColleagueLessons();
        if (section === 'earnings') loadBalance();
        if (section === 'transactions') loadTransactions();
        if (section === 'referral') loadReferralData();
        if (section === 'teachers') loadTeachers();
        if (section === 'messages') loadConversations();
        if (section === 'groups') loadTeacherGroups();
        if (section === 'profile') { updateUI(); checkProfileCompletion(); }
    }

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
                const avatarEl = document.getElementById('drawerAvatar');
                if (nameEl) nameEl.textContent = userData.full_name || 'أستاذ';
                if (emailEl) emailEl.textContent = userData.email || '';
                if (avatarEl) avatarEl.src = getValidImageUrl(userData.profile_image, userData.full_name || 'أستاذ', 120);
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
    // USER DATA
    // ================================================================

        async function checkActiveStream() {
        try {
            if (!streamOfferId) return;
            const res = await fetchWithAuth(`/api/stream/status/${streamOfferId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.active) {
                    activeStream = data;
                }
            }
        } catch (e) {}
    }

    async function loadUserData() {
        // ✅ منع تحديث البيانات أو إعادة قراءتها إذا كان مودال الملف الشخصي أو تعديل الملف مفتوحاً لمنع التشويش وفقدان التركيز أثناء الكتابة
        const completeModal = document.getElementById('completeProfileModal');
        const editModal = document.getElementById('editProfileModal');
        if ((completeModal && completeModal.style.display === 'block') || (editModal && editModal.style.display === 'block')) {
            console.log('Skipping loadUserData because a profile modal is open');
            return;
        }

        try {
            const storedData = localStorage.getItem('userData') || localStorage.getItem('zoomdz_user') || localStorage.getItem('user');
            const token = localStorage.getItem('token') || localStorage.getItem('zoomdz_token');

            if (!storedData || !token) {
                localStorage.clear();
                window.location.href = '/index.html?login=1';
                return;
            }

            try {
                userData = JSON.parse(storedData);
            } catch (parseError) {
                localStorage.clear();
                window.location.href = '/index.html?login=1';
                return;
            }

            const isGuest = userData && (userData.is_guest || userData.id === -1);

            if (!isGuest && (checkAndHandleAutoLogout() || !token)) {
                return;
            }

            authToken = token;
            teacherId = userData.id;

            if (isGuest) {
                updateUI();
                try {
                    await loadTeacherPosts();
                } catch(e) {}
                return;
            }

            if (!teacherId || !authToken) {
                localStorage.clear();
                window.location.href = '/index.html?login=1';
                return;
            }

            try {
                await getCsrfToken();
            } catch (err) {}

            try {
                const res = await fetchWithAuth('/api/teacher/me');
                if (res && res.ok) {
                    const data = await res.json();
                    const teacherData = data.teacher || data;
                    if (!data.error && teacherData.id) {
                        teacherData.role = 'teacher';
                        
                        const oldStatus = userData ? userData.status : null;

                        userData = teacherData;
                        
                        teacherId = teacherData.id;
                        localStorage.setItem('userData', JSON.stringify(userData));
                        updateUI();

                        // ✅ التحقق من تغير حالة الحساب (قبول / رفض) وتحديث الصفحة تلقائياً
                        if (oldStatus && teacherData.status && oldStatus !== teacherData.status) {
                            if (teacherData.status === 'approved') {
                                showToast('🎉 تهانينا! تم قبول حسابك كأستاذ معتمد. جاري تحديث الصفحة...', 'success');
                            } else if (teacherData.status === 'rejected') {
                                showToast('⚠️ تم تحديث حالة حسابك من الإدارة. جاري تحديث الصفحة...', 'warning');
                            } else {
                                showToast('🔄 تم تحديث حالة حسابك. جاري تحديث الصفحة...', 'info');
                            }
                            setTimeout(() => {
                                window.location.reload();
                            }, 2000);
                            return;
                        }
                    }
                } else if (res && (res.status === 401 || res.status === 403)) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('userData');
                    window.location.href = '/';
                    return;
                }
            } catch (e) {
                if (e.message === 'انتهت صلاحية الجلسة') {
                    window.location.href = '/';
                    return;
                }
                showErrorDiagnostics('فشل تحميل بيانات الأستاذ من الخادم', `GET /api/teacher/me → ${e.message}`);
                const infoEl = document.getElementById('profileInfo');
                if (infoEl) {
                    infoEl.innerHTML = `<div style="text-align:center; padding:30px;"><i class="fas fa-exclamation-triangle" style="font-size:2rem; color:var(--danger); margin-bottom:12px;"></i><p style="color:var(--danger); font-weight:700; margin-bottom:8px;">تعذّر تحميل بياناتك من الخادم</p><p style="color:var(--gray-500); font-size:0.85rem;">السبب: ${escapeHtml(e.message)}</p><p style="color:var(--gray-400); font-size:0.8rem; margin-top:8px;">يتم درس بياناتك المحفوظة محلياً. تحقّق من اتصال الخادم بقاعدة البيانات.</p></div>`;
                }
            }

            try {
                await checkProfileCompletion();
            } catch (e) {
                showErrorDiagnostics('فشل التحقق من حالة إكمال الملف الشخصي', e.message);
            }

            Promise.all([
                loadBalance().catch(() => {}),
                loadReferralData().catch(() => {}),
                loadNotifications().catch(() => {}),
                checkActiveStream().catch(() => {})
            ]);

            try {
                checkTeachingLevel();
            } catch (e) {}

        } catch(e) {
            if (e.message === 'انتهت صلاحية الجلسة') { window.location.href = '/'; return; }
            showErrorDiagnostics('خطأ عام في تهيئة الصحة', e.message);
        }
    }

    function setupGuestUI() {
        const isGuest = userData && (userData.is_guest || userData.id === -1);
        if (isGuest) {
            // Hide navbar elements
            const profileBtn = document.getElementById('profileBtn');
            if (profileBtn) profileBtn.style.display = 'none';
            const notifBtn = document.getElementById('notifBtn');
            if (notifBtn) notifBtn.style.display = 'none';
            const navBalance = document.querySelector('.nav-balance');
            if (navBalance) navBalance.style.display = 'none';
            const navDepositBtn = document.querySelector('.nav-deposit-btn');
            if (navDepositBtn) navDepositBtn.style.display = 'none';
            const navWithdrawBtn = document.querySelector('.nav-withdraw-btn');
            if (navWithdrawBtn) navWithdrawBtn.style.display = 'none';
            
            // Show guestNavButtons
            const guestNavButtons = document.getElementById('guestNavButtons');
            if (guestNavButtons) {
                guestNavButtons.style.display = 'flex';
            }

            // Hide private nav tabs
            const privateSections = ['earnings', 'transactions', 'referral', 'messages'];
            document.querySelectorAll('.nav-tab').forEach(tab => {
                const section = tab.getAttribute('data-section');
                if (privateSections.includes(section)) {
                    tab.style.display = 'none';
                }
            });

            // Hide mobile drawer balance
            const drawerUser = document.querySelector('.mobile-drawer-user');
            if (drawerUser) {
                const drawerName = document.getElementById('drawerName');
                if (drawerName) drawerName.textContent = 'أستاذ زائر';
                const drawerEmail = document.getElementById('drawerEmail');
                if (drawerEmail) drawerEmail.textContent = 'تصفح بدون حساب';
                const drawerBalance = document.getElementById('drawerBalance');
                if (drawerBalance) drawerBalance.style.display = 'none';
                const balanceItems = drawerUser.querySelectorAll('.balance-item, .earnings-stat');
                balanceItems.forEach(item => item.style.display = 'none');
            }

            // Hide private menu items in mobile drawer
            document.querySelectorAll('.mobile-drawer-menu-item').forEach(item => {
                const onclickText = item.getAttribute('onclick') || '';
                if (onclickText.includes('earnings') || onclickText.includes('transactions') || onclickText.includes('referral') || onclickText.includes('messages') || onclickText.includes('toggleNotifications') || onclickText.includes('showEditProfileModal') || onclickText.includes('profile')) {
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

    function checkTeacherProfileComplete() {
        if (checkGuestAction && checkGuestAction()) return false;
        const hasRequiredFields = Boolean(userData && userData.phone && userData.specialization && userData.bio && userData.experience && userData.teaching_level);
        const isProfileComplete = Boolean(userData && (userData.profile_completion === true || hasRequiredFields) && !userData.requires_profile_completion);
        if (!isProfileComplete) {
            showToast('⚠️ يرجى إكمال معلومات ملفك الشخصي أولاً لتتمكن من إضافة الدورات والدروس والبث المباشر والمنشورات والمجموعات', 'warning');
            if (typeof openCompleteProfileModal === 'function') {
                openCompleteProfileModal();
            }
            return false;
        }
        return true;
    }
    window.checkTeacherProfileComplete = checkTeacherProfileComplete;

    // ✅ التحقق من حالة إكمال الملف الشخصي وإظهار الشريط المناسب
    async function checkProfileCompletion() {
        // ✅ إذا كان أستاذ زائر، إخفاء جميع الأشرطة فوراً
        const isGuest = userData && (userData.is_guest || userData.id === -1);
        if (isGuest) {
            hideAllBanners();
            return;
        }

        // ✅ تجنب الفحص أثناء تعبئة النماذج لتفادي مسح المدخلات أو إخفاء المودال
        const completeModal = document.getElementById('completeProfileModal');
        const editModal = document.getElementById('editProfileModal');
        if ((completeModal && completeModal.style.display === 'block') || (editModal && editModal.style.display === 'block')) {
            console.log('Skipping checkProfileCompletion because a profile modal is open');
            return;
        }

        try {
            const res = await fetchWithAuth('/api/teacher/profile-completion-status');
            if (!res.ok) return;
            const data = await res.json();

            if (data.success) {
                // ✅ تحديث userData مع حالة إكمال الملف الشخصي
                userData.requires_profile_completion = data.requires_profile_completion;
                userData.profile_completion = data.profile_completion;

                if (data.requires_profile_completion) {
                    // ✅ إظهار شريط إكمال الملف الشخصي
                    showProfileCompletionBanner();
                } else if (userData.status === 'rejected') {
                    // ✅ إظهار شريط الرفض مع زر إعادة التقديم
                    showRejectedBanner(userData.rejection_reason);
                } else if (userData.status !== 'approved') {
                    // ✅ إظهار شريط انتظار الموافقة
                    showPendingApprovalBanner();
                } else {
                    // ✅ إخفاء كل الأشرطة - الحساب معتمد ومكتمل
                    hideAllBanners();
                }
            }
        } catch (e) {
            showErrorDiagnostics('فشل جلب حالة إكمال الملف الشخصي', `GET /api/teacher/profile-completion-status → ${e.message}`);
        }
    }

    function showProfileCompletionBanner() {
        hideAllBanners();
        const banner = document.getElementById('profileCompletionBanner');
        if (banner) {
            banner.style.display = 'none';
            banner.innerHTML = '';
        }
        // ✅ تحديث واجهة الملف الشخصي
        updateProfileForPending();
    }

let completeProfileCameraStream = null;
    let completeProfileFacingMode = 'user'; // Front camera by default for selfie/profile photo
    window.completeCapturedProfileImage = null;

    window.startCompleteProfileCamera = async function() {
        const liveBox = document.getElementById('completeProfileCameraLiveBox');
        const initialBox = document.getElementById('completeProfileCameraInitialBox');
        const previewBox = document.getElementById('completeProfilePreviewBox');
        const video = document.getElementById('completeProfileCameraVideo');
        if (!liveBox || !video) return;

        // Stop any previous stream
        if (completeProfileCameraStream) {
            completeProfileCameraStream.getTracks().forEach(t => { try { t.stop(); } catch(e) {} });
            completeProfileCameraStream = null;
        }

        try {
            const constraints = {
                video: {
                    facingMode: completeProfileFacingMode,
                    width: { ideal: 640 },
                    height: { ideal: 640 }
                },
                audio: false
            };
            completeProfileCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = completeProfileCameraStream;
            await video.play();

            if (initialBox) initialBox.style.display = 'none';
            if (previewBox) previewBox.style.display = 'none';
            liveBox.style.display = 'block';
            setTimeout(() => {
                liveBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        } catch (err) {
            console.warn('Direct camera constraints failed, attempting generic video:', err);
            try {
                completeProfileCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                video.srcObject = completeProfileCameraStream;
                await video.play();
                if (initialBox) initialBox.style.display = 'none';
                if (previewBox) previewBox.style.display = 'none';
                liveBox.style.display = 'block';
            } catch (fallbackErr) {
                console.error('Camera access denied or unavailable:', fallbackErr);
                showToast('تعذر فتح الكاميرا، يرجى السماح للمتصفح بالوصول إلى الكاميرا', 'error');
            }
        }
    };

    window.toggleCompleteProfileCameraDirection = function() {
        completeProfileFacingMode = (completeProfileFacingMode === 'user') ? 'environment' : 'user';
        startCompleteProfileCamera();
    };

    window.stopCompleteProfileCamera = function(showInitial = true) {
        if (completeProfileCameraStream) {
            completeProfileCameraStream.getTracks().forEach(t => { try { t.stop(); } catch(e) {} });
            completeProfileCameraStream = null;
        }
        const video = document.getElementById('completeProfileCameraVideo');
        if (video) video.srcObject = null;

        const liveBox = document.getElementById('completeProfileCameraLiveBox');
        if (liveBox) liveBox.style.display = 'none';

        if (showInitial && !window.completeCapturedProfileImage) {
            const initialBox = document.getElementById('completeProfileCameraInitialBox');
            if (initialBox) initialBox.style.display = 'block';
        }
    };

    window.captureCompleteProfilePhoto = function() {
        const video = document.getElementById('completeProfileCameraVideo');
        const canvas = document.getElementById('completeProfileCanvas');
        if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
            showToast('⚠️ الكاميرا قيد التهيئة، يرجى الانتظار ثانية والمحاولة مرة أخرى', 'warning');
            return;
        }

        const vWidth = video.videoWidth;
        const vHeight = video.videoHeight;

        // Crop square from center for avatar
        const minDim = Math.min(vWidth, vHeight);
        const startX = (vWidth - minDim) / 2;
        const startY = (vHeight - minDim) / 2;

        // Compress dimensions: 360x360 pixels is optimal for avatars in modern web apps and retina displays
        const targetDim = Math.min(minDim, 360);

        canvas.width = targetDim;
        canvas.height = targetDim;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw cropped and scaled image onto canvas
        ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, targetDim, targetDim);

        // High compression to JPEG with quality 0.60 (reduces file size down to ~20KB - 35KB, saving without any size errors)
        canvas.toBlob((blob) => {
            if (!blob) {
                showToast('❌ تعذر معالجة الصورة، يرجى المحاولة ثانية', 'error');
                return;
            }

            const sizeKb = (blob.size / 1024).toFixed(1);
            const compressedFile = new File([blob], 'profile_camera.jpg', { type: 'image/jpeg' });
            window.completeCapturedProfileImage = compressedFile;

            // Stop camera stream immediately
            stopCompleteProfileCamera(false);

            // Update Preview UI
            const previewBox = document.getElementById('completeProfilePreviewBox');
            const previewImg = document.getElementById('completeProfilePreviewImg');
            const sizeInfo = document.getElementById('completeProfileSizeInfo');
            const initialBox = document.getElementById('completeProfileCameraInitialBox');

            if (previewImg) {
                previewImg.src = URL.createObjectURL(blob);
            }
            if (sizeInfo) {
                sizeInfo.innerHTML = `حجم الصورة: <strong>${sizeKb} KB</strong> (تم الضغط بنجاح لحجم فائق الخفة)`;
            }
            if (initialBox) initialBox.style.display = 'none';
            if (previewBox) previewBox.style.display = 'block';

            showToast(`✅ تم التقاط الصورة وضغطها بنجاح (${sizeKb} KB)`, 'success');
        }, 'image/jpeg', 0.60);
    };

    window.clearCompleteProfileCapturedPhoto = function() {
        window.completeCapturedProfileImage = null;
        const previewBox = document.getElementById('completeProfilePreviewBox');
        const previewImg = document.getElementById('completeProfilePreviewImg');
        const initialBox = document.getElementById('completeProfileCameraInitialBox');

        if (previewImg) previewImg.src = '';
        if (previewBox) previewBox.style.display = 'none';
        if (initialBox) initialBox.style.display = 'block';
    };

    function openCompleteProfileModal() {
        if (checkGuestAction()) return;
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.style.display = 'block';
        const modal = document.getElementById('completeProfileModal');
        if (modal) {
            modal.style.display = 'block';
            const modalContent = modal.querySelector('.modal-content') || modal;
            if (modalContent) modalContent.scrollTop = 0;
        }
        
        // إعادة تعيين حالة الكاميرا والصورة
        stopCompleteProfileCamera(false);
        window.completeCapturedProfileImage = null;
        
        const previewBox = document.getElementById('completeProfilePreviewBox');
        const previewImg = document.getElementById('completeProfilePreviewImg');
        const sizeInfo = document.getElementById('completeProfileSizeInfo');
        const initialBox = document.getElementById('completeProfileCameraInitialBox');
        const liveBox = document.getElementById('completeProfileCameraLiveBox');

        if (liveBox) liveBox.style.display = 'none';

        if (userData && userData.profile_image) {
            if (previewBox && previewImg && sizeInfo && initialBox) {
                previewImg.src = userData.profile_image;
                sizeInfo.innerHTML = 'صورة ملفك الشخصي الحالية (يمكنك إعادة التقاط صورة جديدة بالكاميرا)';
                previewBox.style.display = 'block';
                initialBox.style.display = 'none';
            }
        } else {
            if (previewBox) previewBox.style.display = 'none';
            if (initialBox) initialBox.style.display = 'block';
        }

        // تعبئة البيانات الموجودة بالفعل إن وجدت
        if (userData) {
            const phoneEl = document.getElementById('completePhone') || document.getElementById('profilePhone');
            if (phoneEl) phoneEl.value = userData.phone || '';
            
            const specEl = document.getElementById('completeSpecialization') || document.getElementById('profileSpecialization');
            if (specEl) specEl.value = userData.specialization || '';
            
            const bioEl = document.getElementById('completeBio') || document.getElementById('profileBio');
            if (bioEl) bioEl.value = userData.bio || '';
            
            const expEl = document.getElementById('completeExperience') || document.getElementById('profileExperience');
            if (expEl) expEl.value = userData.experience || '';
            
            const levelEl = document.getElementById('completeTeachingLevel') || document.getElementById('profileTeachingLevel');
            if (levelEl) levelEl.value = userData.teaching_level || '';
        }
    }
    window.openCompleteProfileModal = openCompleteProfileModal;
    window.showProfileCompletionModal = openCompleteProfileModal;

    let upgradeStream = null;
    let capturedIdImageBase64 = null;
    let capturedDiplomaImageBase64 = null;

    async function startCameraForUpgrade(type) {
        const video = document.getElementById('upgradeCameraVideo');
        if (!video) return;
        try {
            if (upgradeStream) {
                upgradeStream.getTracks().forEach(t => t.stop());
            }
            upgradeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = upgradeStream;
            video.style.display = 'block';
            showNotification(`📷 تم تشغيل الكاميرا. وجه الكاميرا نحو ${type === 'id' ? 'بطاقة الهوية الوطنية' : 'الشهادة أو الدبلوم'} ثم اضغط زر التقاط وضغط الصورة.`, 'info');
        } catch (err) {
            console.error('Camera error:', err);
            showNotification('❌ تعذر تشغيل الكاميرا. يرجى السماح بالوصول للكاميرا من المتصفح.', 'error');
        }
    }
    window.startCameraForUpgrade = startCameraForUpgrade;

    function captureUpgradeImage(type) {
        const video = document.getElementById('upgradeCameraVideo');
        const canvas = document.getElementById('upgradeCanvas');
        if (!video || !canvas || video.style.display === 'none') {
            showNotification('⚠️ يرجى تشغيل الكاميرا أولاً قبل الالتقاط', 'warning');
            return;
        }
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;
        canvas.width = Math.min(width, 1000);
        canvas.height = Math.round((canvas.width * height) / width);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);

        if (type === 'id') {
            capturedIdImageBase64 = compressedDataUrl;
            const preview = document.getElementById('idPreviewImg');
            if (preview) {
                preview.src = compressedDataUrl;
                preview.style.display = 'block';
            }
            showNotification('✅ تم التقاط وضغط صورة بطاقة الهوية بنجاح', 'success');
        } else if (type === 'diploma') {
            capturedDiplomaImageBase64 = compressedDataUrl;
            const preview = document.getElementById('diplomaPreviewImg');
            if (preview) {
                preview.src = compressedDataUrl;
                preview.style.display = 'block';
            }
            showNotification('✅ تم التقاط وضغط صورة الشهادة بنجاح', 'success');
        }

        stopUpgradeCamera();
    }
    window.captureUpgradeImage = captureUpgradeImage;

    function stopUpgradeCamera() {
        if (upgradeStream) {
            upgradeStream.getTracks().forEach(t => t.stop());
            upgradeStream = null;
        }
        const video = document.getElementById('upgradeCameraVideo');
        if (video) video.style.display = 'none';
    }
    window.stopUpgradeCamera = stopUpgradeCamera;

    async function openUpgradeModal() {
        if (checkGuestAction()) return;
        const modal = document.getElementById('upgradeModal');
        
        // Fetch latest profile to check VIP status
        try {
            const res = await fetchWithAuth('/api/teacher/me');
            const data = await res.json();
            if (data.success && data.teacher) {
                const teacher = data.teacher;
                const paymentSection = document.getElementById('upgradePaymentSection');
                const vipSection = document.getElementById('vipSubscriptionSection');
                
                let isVipActive = teacher.is_vip === true;
                if (isVipActive && teacher.vip_expires_at) {
                    const expiry = new Date(teacher.vip_expires_at);
                    if (expiry <= new Date()) {
                        isVipActive = false;
                    }
                }
                
                if (window.userData) {
                    window.userData.is_vip = isVipActive;
                    window.userData.is_certified = isVipActive;
                    if (teacher.vip_expires_at) window.userData.vip_expires_at = teacher.vip_expires_at;
                    if (typeof teacher.balance !== 'undefined') window.userData.balance = teacher.balance;
                    localStorage.setItem('userData', JSON.stringify(window.userData));
                    if (typeof updateUI === 'function') updateUI();
                }

                if (!isVipActive) {
                    if (paymentSection) paymentSection.style.display = 'block';
                    if (vipSection) vipSection.style.display = 'none';
                } else {
                    if (paymentSection) paymentSection.style.display = 'none';
                    if (vipSection) vipSection.style.display = 'block';
                    
                    // Calculate remaining days/time
                    const remainingDisplay = document.getElementById('vipRemainingTimeDisplay');
                    if (remainingDisplay) {
                        if (teacher.vip_expires_at) {
                            const expiry = new Date(teacher.vip_expires_at);
                            const now = new Date();
                            const diffMs = expiry - now;
                            
                            if (diffMs > 0) {
                                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                                
                                let remainingText = '';
                                if (diffDays > 0) {
                                    remainingText += `${diffDays} يوم `;
                                }
                                if (diffHrs > 0 || diffDays > 0) {
                                    remainingText += `و ${diffHrs} ساعة `;
                                }
                                remainingText += `و ${diffMins} دقيقة`;
                                remainingDisplay.textContent = remainingText;
                                remainingDisplay.style.color = '#047857';
                            } else {
                                remainingDisplay.textContent = 'منتهي الصلاحية';
                                remainingDisplay.style.color = '#ef4444';
                            }
                        } else {
                            remainingDisplay.textContent = 'نشط (صلاحية غير محددة)';
                            remainingDisplay.style.color = '#10b981';
                        }
                    }
                }
            }
        } catch(e) {
            console.error('Failed to fetch profile', e);
        }

        if (modal) modal.style.display = 'block';
    }
    window.openUpgradeModal = openUpgradeModal;

    async function payUpgradeFee() {
        if (checkGuestAction()) return;
        const btn = document.getElementById('payUpgradeBtn');
        const insufficientSection = document.getElementById('insufficientBalanceSection');
        const insufficientText = document.getElementById('insufficientBalanceText');
        
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الترقية...';
        }
        
        if (insufficientSection) insufficientSection.style.display = 'none';

        try {
            const res = await fetchWithAuth('/api/teacher/upgrade-vip', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                // Refresh local data and modal
                if (window.userData) {
                    window.userData.is_vip = true;
                    window.userData.is_certified = true;
                    window.userData.vip_expires_at = data.vip_expires_at;
                    if (data.new_balance !== undefined) {
                        window.userData.balance = data.new_balance;
                        if (typeof loadBalance === 'function') loadBalance();
                    }
                    localStorage.setItem('userData', JSON.stringify(window.userData));
                }

                if (typeof updateUI === 'function') updateUI();
                if (typeof loadProfileInfo === 'function') loadProfileInfo();
                if (typeof updateUpgradeButtonsVisibility === 'function') updateUpgradeButtonsVisibility();

                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'تهانينا! تم ترقية حسابك بنجاح 👑',
                        text: data.message || 'تم تفعيل الشارة الذهبية وكافة ميزات الأستاذ المعتمد لحسابك فوراً لمدة 30 يوماً.',
                        confirmButtonText: 'تحديث الصفحة وتطبيق الشارة',
                        confirmButtonColor: '#10b981'
                    }).then(() => {
                        window.location.reload();
                    });
                } else {
                    showToast(data.message || '🎉 تم تفعيل الشارة الذهبية بنجاح!', 'success');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1200);
                }
            } else {
                showToast(data.error || 'فشلت عملية الترقية', 'error');
                
                if (res.status === 400 && data.needed) {
                    if (insufficientSection && insufficientText) {
                        insufficientText.textContent = data.error;
                        insufficientSection.style.display = 'block';
                    }
                }
                
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-crown"></i> ترقية وتفعيل الشارة الذهبية الآن (700 دج)';
                }
            }
        } catch (e) {
            showToast('حدث خطأ أثناء الاتصال بالخادم', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-crown"></i> ترقية وتفعيل الشارة الذهبية الآن (700 دج)';
            }
        }
    }
    window.payUpgradeFee = payUpgradeFee;

    function closeUpgradeModal() {
        stopUpgradeCamera();
        const modal = document.getElementById('upgradeModal');
        if (modal) modal.style.display = 'none';
    }
    window.closeUpgradeModal = closeUpgradeModal;

    async function submitUpgradeRequest(event) {
        if (event) event.preventDefault();
        if (checkGuestAction()) return;

        if (!capturedIdImageBase64 && !capturedDiplomaImageBase64) {
            showNotification('⚠️ يرجى التقاط صورة بطاقة الهوية الوطنية وصورة الشهادة أو الدبلوم عبر الكاميرا قبل الإرسال', 'error');
            return;
        }

        stopUpgradeCamera();
        const submitBtn = document.getElementById('submitUpgradeBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري معالجة وإرسال الوثائق...';
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/teacher/request-upgrade', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    id_image_base64: capturedIdImageBase64,
                    diploma_image_base64: capturedDiplomaImageBase64
                })
            });

            const data = await res.json();
            if (data.success) {
                if (data.user) {
                    userData = data.user;
                    localStorage.setItem('userData', JSON.stringify(userData));
                }
                closeUpgradeModal();
                updateProfileForPending();
                updateUI();

                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'تم إرسال طلب الترقية بنجاح! 🚀',
                        text: data.message || 'سيتم مراجعة وثائقك من قِبل إدارة المنصة لمنحك الشارة الذهبية (أستاذ معتمد).',
                        confirmButtonText: 'ممتاز',
                        confirmButtonColor: '#f59e0b'
                    });
                } else {
                    showNotification(data.message || '✅ تم إرسال طلب الترقية بنجاح', 'success');
                }
            } else {
                showNotification(data.error || '❌ حدث خطأ', 'error');
            }
        } catch (err) {
            console.error('Error submitting upgrade request:', err);
            showNotification('❌ حدث خطأ في الاتصال بالخادم', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال طلب الترقية للاعتماد 🚀';
            }
        }
    }
    window.submitUpgradeRequest = submitUpgradeRequest;

    function updateUpgradeButtonsVisibility() {
        // Hide nav-upgrade-btn and nav-tab-upgrade on mobile/tablet viewport sizes first (before checking userData)
        if (window.innerWidth < 992) {
            document.querySelectorAll('.nav-upgrade-btn').forEach(el => {
                if (el) el.style.setProperty('display', 'none', 'important');
            });
            document.querySelectorAll('.nav-tab-upgrade').forEach(el => {
                if (el) el.style.setProperty('display', 'none', 'important');
            });
        }

        if (!userData) return;
        const isCertified = Boolean(userData.is_certified === true || userData.status === 'certified');
        const isVerified = Boolean(userData.email_verified || userData.status === 'approved');
        const shouldShow = isVerified && !isCertified;
        
        document.querySelectorAll('.nav-upgrade-btn, .sidebar-upgrade-btn, .mobile-drawer-upgrade-item, .dropdown-upgrade-item, #teacherUpgradeBanner').forEach(el => {
            if (!el) return;
            // Always hide nav-upgrade-btn on mobile/tablet screens to prevent overlapping
            if (el.classList.contains('nav-upgrade-btn') && window.innerWidth < 992) {
                el.style.setProperty('display', 'none', 'important');
                return;
            }
            if (!shouldShow) {
                el.style.display = 'none';
            } else {
                if (el.id === 'teacherUpgradeBanner' || el.classList.contains('dropdown-item') || el.classList.contains('mobile-drawer-upgrade-item')) {
                    el.style.display = 'flex';
                } else {
                    el.style.display = 'inline-flex';
                }
            }
        });
    }
    window.updateUpgradeButtonsVisibility = updateUpgradeButtonsVisibility;

    async function submitTeacherProfile() {
        if (checkGuestAction()) return;
        if (!teacherId && userData && userData.id) {
            teacherId = userData.id;
        }
        if (!teacherId) {
            try {
                const stored = JSON.parse(localStorage.getItem('userData'));
                if (stored && stored.id) teacherId = stored.id;
            } catch(e) {}
        }

        const phoneEl = document.getElementById('completePhone') || document.getElementById('profilePhone');
        const specEl = document.getElementById('completeSpecialization') || document.getElementById('profileSpecialization');
        const bioEl = document.getElementById('completeBio') || document.getElementById('profileBio');
        const expEl = document.getElementById('completeExperience') || document.getElementById('profileExperience');
        const levelEl = document.getElementById('completeTeachingLevel') || document.getElementById('profileTeachingLevel');

        const phone = (phoneEl ? phoneEl.value.trim() : '') || (userData ? userData.phone || '' : '');
        const specialization = (specEl ? specEl.value.trim() : '') || (userData ? userData.specialization || '' : '');
        const bio = (bioEl ? bioEl.value.trim() : '') || (userData ? userData.bio || '' : '');
        const experience = (expEl ? expEl.value.trim() : '') || (userData ? userData.experience || '' : '');
        const teachingLevel = (levelEl ? levelEl.value : '') || (userData ? userData.teaching_level || '' : '');

        if (!phone) { showToast('⚠️ يرجى إدخال رقم الهاتف', 'error'); return; }
        
        var dzPhoneRegex = /^(?:\+213|00213|213|0)(?:[567]\d{8}|[234]\d{7,8})$/;
        var cleanedPhone = phone.replace(/[\s\-\(\)\.]/g, '');
        if (!dzPhoneRegex.test(cleanedPhone)) {
            showToast('⚠️ يرجى إدخال رقم هاتف جزائري صحيح (مثال: 0550123456 أو 0660123456 أو 0770123456)', 'error');
            if (phoneEl) phoneEl.style.borderColor = '#dc2626';
            return;
        }
        if (!specialization) { showToast('⚠️ يرجى إدخال التخصص', 'error'); return; }
        if (!bio) { showToast('⚠️ يرجى كتابة نبذة تعريفية', 'error'); return; }
        if (!experience) { showToast('⚠️ يرجى إدخال سنوات الخبرة', 'error'); return; }
        if (!teachingLevel) { showToast('⚠️ يرجى اختيار المستوى الدراسي', 'error'); return; }

        let profileImageToSend = null;
        if (window.completeCapturedProfileImage) {
            profileImageToSend = window.completeCapturedProfileImage;
        } else {
            const profileInput = document.getElementById('completeProfileImage') || document.getElementById('profileImage');
            if (profileInput && profileInput.files && profileInput.files[0]) {
                profileImageToSend = profileInput.files[0];
            }
        }

        const formData = new FormData();
        if (teacherId) formData.append('teacher_id', teacherId);
        formData.append('phone', phone);
        formData.append('specialization', specialization);
        formData.append('bio', bio);
        formData.append('experience', experience);
        formData.append('teaching_level', teachingLevel);
        if (profileImageToSend) formData.append('profile_image', profileImageToSend, 'profile_camera.jpg');

        const submitBtn = document.getElementById('btnSubmitTeacherProfile');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري حفظ الملف الشخصي...';
        }

        try {
            showToast('جاري حفظ معلومات الملف الشخصي...', 'info');
            const res = await fetchWithAuth('/api/teacher/complete-profile', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ تم إكمال وحفظ ملفك الشخصي بنجاح! يمكنك الآن استخدام كافة ميزات المنصة.', 'success');
                
                // 1. إغلاق النافذة المنبثقة
                closeModal();

                // 2. تحديث بيانات المستخدم المباشرة
                if (!userData) userData = {};
                userData.phone = phone;
                userData.specialization = specialization;
                userData.bio = bio;
                userData.experience = experience;
                userData.teaching_level = teachingLevel;
                userData.profile_completion = true;
                userData.requires_profile_completion = false;
                userData.status = 'approved';

                if (data.user) {
                    if (data.user.status) userData.status = data.user.status;
                    if (data.user.profile_image) userData.profile_image = data.user.profile_image;
                }

                localStorage.setItem('userData', JSON.stringify(userData));

                // 3. إخفاء بانرات عدم اكتمال الملف
                hideAllBanners();

                // 4. تحديث عرض الملف الشخصي فوراً
                updateUI();
                if (typeof updateTeacherProfileUI === 'function') {
                    updateTeacherProfileUI();
                }

                // 5. مزامنة البيانات من الخادم
                try {
                    await loadUserData();
                } catch(e) {}
            } else {
                showToast(data.error || 'حدث خطأ أثناء الحفظ', 'error');
                showErrorDiagnostics('خطأ في إكمال الملف الشخصي', data.error || 'استجابة غير متوقعة من الخادم');
            }
        } catch (e) {
            console.error('Submit Profile Error:', e);
            const detail = e.name === 'AbortError' ? 'انتهت مهلة الاتصال (Timeout) - تحقق من جودة الإنترنت' : e.message;
            showToast('❌ خطأ في الاتصال بالخادم', 'error');
            showErrorDiagnostics('فشل الاتصال بالخادم عند إكمال الملف', detail);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> حفظ وإكمال الملف الشخصي';
            }
        }
    }

    function showPendingApprovalBanner() {
        hideAllBanners();
        const isGuest = userData && (userData.is_guest || userData.id === -1);
        if (isGuest) return;

        const banner = document.getElementById('pendingApprovalBanner');
        if (banner) {
            banner.style.display = 'flex';
            banner.innerHTML = `
                <div class="approval-banner">
                    <i class="fas fa-clock" aria-hidden="true"></i>
                    <span>⏳ حسابك قيد المراجعة من قبل الإدارة. سيتم إرسال بريد إلكتروني إليك خلال 24 ساعة عند قبول حسابك من قبل منصة ZoomDz.</span>
                </div>
            `;
        }
        updateProfileForPending();
    }

    function showRejectedBanner(reason) {
        hideAllBanners();
        const banner = document.getElementById('pendingApprovalBanner');
        if (banner) {
            banner.style.display = 'flex';
            banner.innerHTML = `
                <div class="approval-banner" style="background: #fef2f2; border-bottom: 1px solid #fee2e2; color: #b91c1c;">
                    <i class="fas fa-times-circle" aria-hidden="true" style="color: #ef4444;"></i>
                    <span style="font-weight: 800;">❌ تم رفض طلبك. السبب: ${reason || 'لم يتم تحديد سبب'}.</span>
                    <button class="btn-primary" onclick="openCompleteProfileModal()" style="padding: 6px 16px; font-size: 0.8rem; background-color: #ef4444; border-color: #ef4444; color: white; cursor: pointer; margin-right: 10px;">إعادة إدخال المعلومات والوثائق</button>
                </div>
            `;
        }
        updateProfileForPending();
    }

    function hideAllBanners() {
        const profileBanner = document.getElementById('profileCompletionBanner');
        const pendingBanner = document.getElementById('pendingApprovalBanner');
        if (profileBanner) profileBanner.style.display = 'none';
        if (pendingBanner) pendingBanner.style.display = 'none';
    }

    function updateProfileForPending() {
        if (!userData || !userData.id) return;
        const userName = userData.full_name || 'أستاذ';
        const userImage = getValidImageUrl(userData.profile_image, userName, 120);
        const navName = document.getElementById('navProfileName');
        if (navName) navName.textContent = userName.split(' ')[0];
        const navImg = document.getElementById('navProfileImg');
        if (navImg) navImg.src = userImage;

        const profileInfo = document.getElementById('profileInfo');
        if (!profileInfo) return;

        const isApproved = userData.status === 'approved';
        const isRejected = userData.status === 'rejected';
        const isCertified = Boolean(userData.is_certified === true || userData.status === 'certified');
        const hasUpgradeDocs = Boolean((userData.id_image || userData.diploma_image) && !isCertified);

        let statusText = '';
        let statusColor = '';
        if (isCertified) {
            statusText = '👑 أستاذ معتمد (شارة ذهبية)';
            statusColor = '#d97706';
        } else if (hasUpgradeDocs) {
            statusText = '🔵 أستاذ موثق - طلب الترقية قيد المراجعة ⏳';
            statusColor = '#2563eb';
        } else {
            statusText = '🔵 أستاذ موثق (شارة زرقاء)';
            statusColor = '#2563eb';
        }

        let warningBoxHtml = '';
        if (isRejected) {
            warningBoxHtml = `
                <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 12px; padding: 18px; margin: 0 auto 20px auto; max-width: 600px; color: #b91c1c; font-weight: 800; text-align: center; font-size: 0.95rem; line-height: 1.6; box-shadow: var(--shadow);">
                    ❌ تم رفض طلبك من قبل الإدارة. ${userData.rejection_reason ? 'السبب: ' + userData.rejection_reason : ''} يلزم رفع الدبلوم وبطاقة الهوية مجدداً لإعادة إرسال الطلب.
                    <div style="margin-top: 12px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button onclick="openCompleteProfileModal()" style="background: #ef4444; color: white; border: none; padding: 10px 24px; border-radius: 20px; font-size: 0.85rem; font-weight: 700; cursor: pointer;">
                            <i class="fas fa-redo"></i> تحديث الوثائق وإعادة إرسال الطلب
                        </button>
                    </div>
                </div>`;
        } else if (isCertified) {
            warningBoxHtml = `
                <div style="background: linear-gradient(135deg, #fffbe3, #fef3c7); border: 1.5px solid #fde68a; border-radius: 14px; padding: 18px; margin: 0 auto 20px auto; max-width: 600px; color: #92400e; font-weight: 800; text-align: center; font-size: 0.92rem; line-height: 1.6; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.12);">
                    🎉 تهانينا! حسابك مرقى ومزود بالشارة الذهبية (👑 VIP) وتتمتع بكافة امتيازات وأولوية الظهور في نتائج البحث.
                </div>`;
        } else {
            warningBoxHtml = `
                <div style="background: linear-gradient(135deg, #fffbe3, #fef3c7); border: 1.5px solid #fde68a; border-radius: 14px; padding: 18px; margin: 0 auto 20px auto; max-width: 600px; color: #92400e; font-weight: 800; text-align: center; font-size: 0.92rem; line-height: 1.6; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.12);">
                    <div style="font-size: 1.05rem; margin-bottom: 6px;">👑 ترقية الحساب إلى أستاذ معتمد (الشارة الذهبية)</div>
                    <div style="font-size: 0.84rem; color: #78350f; font-weight: 600; margin-bottom: 12px;">
                        حسابك حالياً <strong>أستاذ موثق 🔵</strong>. قم بترقية حسابك وتفعيل الشارة الذهبية والصدارة في نتائج البحث مباشرة بدفع الرسوم (700 دج) دون الحاجة لرفع أي وثائق.
                    </div>
                    <button onclick="openUpgradeModal()" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; padding: 10px 24px; border-radius: 25px; font-weight: 800; font-size: 0.88rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                        <i class="fas fa-crown"></i> ترقية وتفعيل الشارة الذهبية (700 دج) 👑
                    </button>
                </div>`;
        }

        const avatarBadgeHtml = isCertified
            ? '<span title="أستاذ معتمد - شارة ذهبية 👑" style="position: absolute; bottom: 4px; right: 4px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; border: 3px solid white; box-shadow: 0 2px 6px rgba(217, 119, 6, 0.5); z-index: 2;"><i class="fas fa-crown"></i></span>'
            : '<span title="أستاذ موثق - شارة زرقاء 🔵" style="position: absolute; bottom: 4px; right: 4px; background: #2563eb; color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; border: 3px solid white; box-shadow: 0 2px 5px rgba(37, 99, 235, 0.4); z-index: 2;"><i class="fas fa-check"></i></span>';

        profileInfo.innerHTML = `
            <div class="profile-display">
                ${warningBoxHtml}
                <div style="position: relative; display: inline-block; margin-bottom: 10px;">
                    <img src="${userImage}" data-original-url="${userImage}" alt="صورة الملف الشخصي" class="profile-avatar" referrerpolicy="no-referrer" onerror="handleImageFallback(this)" style="border: ${isCertified ? '3px solid #f59e0b' : '3px solid #2563eb'};">
                    ${avatarBadgeHtml}
                </div>
                <div class="profile-name">${escapeHtml(userData.full_name || '')}</div>
                <div class="profile-specialty"><i class="fas fa-book" style="color:var(--primary);"></i> ${escapeHtml(userData.specialization || 'تخصص غير محدد')}</div>
                <div class="profile-bio">${escapeHtml(userData.bio || 'لا توجد نبذة تعريفية')}</div>
                <div class="profile-info-grid">
                    <div class="profile-info-item"><div class="label">📧 البريد الإلكتروني</div><div class="value">${escapeHtml(userData.email || 'غير محدد')}</div></div>
                    <div class="profile-info-item"><div class="label">📞 الهاتف</div><div class="value">${escapeHtml(userData.phone || 'غير محدد')}</div></div>
                    <div class="profile-info-item"><div class="label">💼 الخبرة</div><div class="value">${escapeHtml(userData.experience || '0')} سنة</div></div>
                    <div class="profile-info-item"><div class="label">📊 الحالة</div><div class="value" style="color: ${statusColor}; font-weight: 800;">${statusText}</div></div>
                    <div class="profile-info-item" style="border-color: var(--gold);"><div class="label">🎓 المستوى الدراسي</div><div class="value" style="color: var(--gold-dark); font-weight: 800;">${userData.teaching_level ? escapeHtml(userData.teaching_level) : '<span style="font-size: 0.7rem; color: var(--danger); display: block;">⚠️ غير محدد</span>'}</div></div>
                </div>
                <div class="social-links-section"><div class="social-title"><i class="fas fa-share-alt"></i>روابط التواصل الاجتماعي</div>${renderSocialLinks(userData)}</div>
                <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 12px;">
                    <button onclick="showEditProfileModal()" style="background: var(--gradient-main); color: white; border: none; padding: 10px 30px; border-radius: 30px; cursor: pointer; font-weight: 700; font-size: 0.9rem; transition: all 0.3s ease; box-shadow: 0 4px 16px rgba(15,92,191,0.25); display: inline-flex; align-items: center; gap: 10px;">
                        <i class="fas fa-edit"></i> تعديل الملف الشخصي وإضافة الروابط
                    </button>
                </div>
                <p style="color: var(--gray-400); margin-top: 16px; font-size: 0.7rem;"><i class="fas fa-lock"></i> لا يمكن تعديل المعلومات الشخصية (الاسم، التخصص، الخبرة، المستوى الدراسي) إلا عبر الإدارة</p>
            </div>
        `;
    }

    function checkTeachingLevel() {
        const banner = document.getElementById('teachingLevelBanner');
        const createOfferBtn = document.querySelector('.btn-primary');
        // ✅ إذا كان الحساب غير معتمد، إظهار البانر وتعطيل الأزرار
        if (userData && userData.status !== 'approved') {
            if (banner) banner.style.display = 'flex';
            if (createOfferBtn) createOfferBtn.disabled = true;
            return;
        }
        if (userData && userData.teaching_level) {
            banner.style.display = 'none';
            if (createOfferBtn) createOfferBtn.disabled = false;
        } else {
            banner.style.display = 'flex';
            if (createOfferBtn) createOfferBtn.disabled = true;
        }
    }

    function renderSocialLinks(userData) {
        const socialLinks = [
            { url: userData.facebook_url, icon: 'fab fa-facebook-f', label: 'فيسبوك', cls: 'facebook' },
            { url: userData.instagram_url, icon: 'fab fa-instagram', label: 'انستغرام', cls: 'instagram' },
            { url: userData.linkedin_url, icon: 'fab fa-linkedin-in', label: 'لينكدإن', cls: 'linkedin' },
            { url: userData.youtube_url, icon: 'fab fa-youtube', label: 'يوتيوب', cls: 'youtube' },
            { url: userData.twitter_url, icon: 'fab fa-x-twitter', label: 'تويتر', cls: 'twitter' },
            { url: userData.website_url, icon: 'fas fa-globe', label: 'الموقع', cls: 'website' },
            { url: userData.whatsapp_number ? `https://wa.me/${userData.whatsapp_number.replace(/\\D/g, '')}` : '', icon: 'fab fa-whatsapp', label: 'واتساب', cls: 'whatsapp' }
        ];
        let html = '', hasLinks = false;
        for (const link of socialLinks) {
            if (link.url && link.url.trim() !== '') {
                html += `<a href="${link.url}" target="_blank" class="social-link-item ${link.cls}" title="${link.label}"><i class="${link.icon}"></i><span>${link.label}</span></a>`;
                hasLinks = true;
            }
        }
        if (!hasLinks) return '<div class="no-social-links"><i class="fas fa-link" style="margin-left:6px;"></i>لا توجد روابط تواصل اجتماعي مضاف</div>';
        return `<div class="social-links-grid">${html}</div>`;
    }

function updateUI() {
        // ✅ تجنب تحديث واجهة المستخدم بالكامل إذا كانت مودالات التعديل أو إكمال الملف مفتوحة لمنع إعادتها للحالة الأولى أثناء كتابة المستخدم وفقدان التركيز
        const completeModal = document.getElementById('completeProfileModal');
        const editModal = document.getElementById('editProfileModal');
        if ((completeModal && completeModal.style.display === 'block') || (editModal && editModal.style.display === 'block')) {
            console.log('Skipping updateUI because a profile modal is open');
            return;
        }

        if (!userData) return;
        updateUpgradeButtonsVisibility();
        const userName = userData.full_name || 'أستاذ';
        const userImage = getValidImageUrl(userData.profile_image, userName, 120);
        document.getElementById('navProfileName').textContent = userName.split(' ')[0];
        document.getElementById('navProfileImg').src = userImage;

        const isCert = Boolean(userData.is_certified === true || userData.status === 'certified');
        const navBadge = document.getElementById('navProfileBadge');
        if (navBadge) {
            if (isCert) {
                navBadge.style.cssText = 'position: absolute; bottom: -2px; right: -2px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 15px; height: 15px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.45rem; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(217, 119, 6, 0.4); z-index: 2;';
                navBadge.innerHTML = '<i class="fas fa-crown"></i>';
                navBadge.title = 'أستاذ معتمد (شارة ذهبية) 👑';
            } else {
                navBadge.style.cssText = 'position: absolute; bottom: -2px; right: -2px; background: #2563eb; color: white; width: 14px; height: 14px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.4rem; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(37, 99, 235, 0.4); z-index: 2;';
                navBadge.innerHTML = '<i class="fas fa-check"></i>';
                navBadge.title = 'أستاذ موثق (شارة زرقاء) 🔵';
            }
        }

        const drawerBadge = document.getElementById('drawerAvatarBadge');
        if (drawerBadge) {
            if (isCert) {
                drawerBadge.style.cssText = 'position: absolute; bottom: 0; right: 0; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.55rem; border: 2px solid white; box-shadow: 0 2px 4px rgba(217, 119, 6, 0.4); z-index: 2;';
                drawerBadge.innerHTML = '<i class="fas fa-crown"></i>';
                drawerBadge.title = 'أستاذ معتمد (شارة ذهبية) 👑';
            } else {
                drawerBadge.style.cssText = 'position: absolute; bottom: 0; right: 0; background: #2563eb; color: white; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.5rem; border: 2px solid white; box-shadow: 0 2px 3px rgba(37, 99, 235, 0.4); z-index: 2;';
                drawerBadge.innerHTML = '<i class="fas fa-check"></i>';
                drawerBadge.title = 'أستاذ موثق (شارة زرقاء) 🔵';
            }
        }

        const drawerName = document.getElementById('drawerName');
        if (drawerName) drawerName.textContent = userName;
        const drawerEmail = document.getElementById('drawerEmail');
        if (drawerEmail) drawerEmail.textContent = userData.email || '';
        const drawerAvatar = document.getElementById('drawerAvatar');
        if (drawerAvatar) drawerAvatar.src = userImage;

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
            'secondary_all': 'جميع مستويات الثانو',
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
            'other': 'مستوى آخر / عام'
        };
        const teachingLevelDisplay = userData.teaching_level ? levelMap[userData.teaching_level] || userData.teaching_level : 'لم يحدد بعد';

        const isApproved = userData.status === 'approved';
        const isRejected = userData.status === 'rejected';
        const needsCompletion = userData.requires_profile_completion === true || !userData.profile_completion;

        let statusText = '';
        let statusColor = '';

        if (isApproved) {
            statusText = '✅ معتمد';
            statusColor = 'var(--secondary)';
        } else if (!needsCompletion && !isRejected) {
            statusText = '⏳ قيد التحقق';
            statusColor = 'var(--gold)';
        } else {
            statusText = '⚠️ يلزم رفع الدبلوم وبطاقة الهوية';
            statusColor = 'var(--danger)';
        }

        const addPostBtn = document.getElementById('addPostBtn');
        if (addPostBtn) {
            if (userData.status !== 'approved') {
                const isIncomplete = userData.requires_profile_completion || !userData.profile_completion;
                addPostBtn.style.background = '#94a3b8';
                addPostBtn.style.cursor = 'not-allowed';
                addPostBtn.title = isIncomplete ? 'يجب إكمال ملفك الشخصي أولاً' : 'زر إضافة منشور معلق حتى يتم قبولك من الإدارة';
                addPostBtn.innerHTML = isIncomplete ? '<i class="fas fa-lock"></i> إضافة منشور (غير مكتمل)' : '<i class="fas fa-lock"></i> إضافة منشور (معلق)';
                const box = document.getElementById('addPostBox');
                if (box) box.style.display = 'none';
            } else {
                addPostBtn.style.background = 'var(--primary)';
                addPostBtn.style.cursor = 'pointer';
                addPostBtn.title = '';
                addPostBtn.innerHTML = '<i class="fas fa-plus"></i> إضافة منشور';
            }
        }

        document.getElementById('profileInfo').innerHTML = `
            <div class="profile-card-premium" style="background: white; border-radius: var(--radius-lg); box-shadow: 0 10px 30px rgba(0,0,0,0.05); overflow: hidden; max-width: 800px; margin: 0 auto; border: 1px solid var(--gray-200); text-align: right;">
                <!-- Decorative Top Cover Banner -->
                <div class="profile-cover-banner" style="background: var(--gradient-main); height: 160px; position: relative; width: 100%;">
                    <div style="position: absolute; bottom: -50px; right: 40px;">
                        <img src="${userImage}" data-original-url="${userImage}" alt="صورة الملف الشخصي" style="width: 110px; height: 110px; border-radius: 50%; object-fit: cover; border: 4px solid white; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" referrerpolicy="no-referrer" onerror="handleImageFallback(this)">
                    </div>
                    <div style="position: absolute; bottom: 15px; left: 20px; background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); color: white; padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 700;">
                        ${statusText}
                    </div>
                </div>

                <div class="profile-main-body" style="padding: 70px 40px 30px 40px;">
                    <!-- Teacher Name & Specialty -->
                    <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
                        <div>
                            <h2 style="font-size: 1.8rem; font-weight: 850; color: var(--gray-900); margin-bottom: 6px;">${escapeHtml(userData.full_name)}</h2>
                            <div style="display: flex; gap: 8px; align-items: center; color: var(--primary); font-weight: 700; font-size: 1rem;">
                                <i class="fas fa-book-open"></i>
                                <span>${escapeHtml(userData.specialization || 'تخصص غير محدد')}</span>
                            </div>
                        </div>
                        <div style="background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); border: 1px solid #c7d2fe; border-radius: var(--radius-md); padding: 12px 24px; text-align: center; box-shadow: 0 4px 12px rgba(79,70,229,0.08);">
                            <div style="font-size: 0.8rem; color: #4338ca; font-weight: 800; margin-bottom: 2px;"><i class="fas fa-users" style="margin-left: 6px;"></i>عدد المتابعين</div>
                            <div style="font-size: 1.7rem; font-weight: 900; color: var(--primary);">${userData.followers_count || 0}</div>
                        </div>
                    </div>

                    <!-- Bio Section -->
                    <div style="background: var(--gray-50); padding: 18px; border-radius: var(--radius-md); border-right: 4px solid var(--primary); margin-bottom: 30px;">
                        <div style="font-weight: 800; color: var(--gray-800); font-size: 0.95rem; margin-bottom: 6px;"><i class="fas fa-quote-right" style="color: var(--primary); margin-left: 6px;"></i>النبذة التعريفية</div>
                        <p style="color: var(--gray-600); font-size: 0.9rem; line-height: 1.6; margin: 0;">${escapeHtml(userData.bio || 'لا توجد نبذة تعريفية مضافة حالياً.')}</p>
                    </div>

                    <!-- Information Sections Grid -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-bottom: 30px;">
                        <!-- Academic & Professional Info Card -->
                        <div style="border: 1px solid var(--gray-200); padding: 20px; border-radius: var(--radius-md); background: white;">
                            <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--gray-800); margin-bottom: 16px; border-bottom: 2px solid var(--gray-100); padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-graduation-cap" style="color: var(--primary);"></i> البيانات التعليمية والمهنية
                            </h3>
                            <div style="display: flex; flex-direction: column; gap: 14px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                                    <span style="color: var(--gray-500);"><i class="fas fa-user-graduate" style="width: 20px; color: var(--primary);"></i> المستوى التعليمي المدرس:</span>
                                    <span style="font-weight: 700; color: var(--gray-800);">${teachingLevelDisplay}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                                    <span style="color: var(--gray-500);"><i class="fas fa-briefcase" style="width: 20px; color: var(--primary);"></i> سنوات الخبرة:</span>
                                    <span style="font-weight: 700; color: var(--gray-800);">${userData.experience || '0'} سنوات</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                                    <span style="color: var(--gray-500);"><i class="fas fa-info-circle" style="width: 20px; color: var(--primary);"></i> حالة الحساب:</span>
                                    <span style="font-weight: 700; color: ${statusColor};">${statusText}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Contact Details Card -->
                        <div style="border: 1px solid var(--gray-200); padding: 20px; border-radius: var(--radius-md); background: white;">
                            <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--gray-800); margin-bottom: 16px; border-bottom: 2px solid var(--gray-100); padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-address-book" style="color: var(--primary);"></i> معلومات الاتصال والمراسلة
                            </h3>
                            <div style="display: flex; flex-direction: column; gap: 14px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                                    <span style="color: var(--gray-500);"><i class="fas fa-envelope" style="width: 20px; color: var(--primary);"></i> البريد الإلكتروني:</span>
                                    <span style="font-weight: 700; color: var(--gray-800); text-align: left; direction: ltr;">${userData.email || 'غير محدد'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                                    <span style="color: var(--gray-500);"><i class="fas fa-phone-alt" style="width: 20px; color: var(--primary);"></i> رقم الهاتف:</span>
                                    <span style="font-weight: 700; color: var(--gray-800); text-align: left; direction: ltr;">${userData.phone || 'غير محدد'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Payment Details & Withdrawal Cover -->
                    <div style="border: 1px solid var(--gray-200); padding: 24px; border-radius: var(--radius-md); background: var(--gray-50); margin-bottom: 30px;">
                        <h3 style="font-size: 1.1rem; font-weight: 850; color: var(--gray-800); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-wallet" style="color: var(--primary);"></i> تفاصيل سحب المستحقات والأربح
                        </h3>
                        
                        <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 0.82rem; color: #b45309; font-weight: 700; line-height: 1.6;">
                            <i class="fas fa-info-circle" style="color: var(--gold); margin-left: 4px;"></i> يجب أن يكون رقم الحساب الجاري (CCP) مكوناً من 20 رقماً ويبدأ بالتنسيق: <span style="font-family: monospace; font-weight: 800; color: #1e3a8a; direction: ltr; display: inline-block;">00799999</span>
                        </div>

                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 20px;">
                            <!-- CCP Status Display -->
                            <div style="background: white; border: 1px solid var(--gray-200); padding: 16px; border-radius: var(--radius-sm); border-right: 4px solid #ea580c;">
                                <div style="font-size: 0.75rem; color: var(--gray-400); font-weight: 700; margin-bottom: 4px;"><i class="fas fa-university"></i> رقم حساب الـ CCP الجاري</div>
                                <div style="font-size: 1.05rem; font-weight: 800; color: var(--gray-800); font-family: monospace; direction: ltr; text-align: right;">${userData.ccp_account ? escapeHtml(userData.ccp_account) : '<span style="color: var(--gray-400); font-weight: 500; font-size: 0.85rem; font-family: Cairo;">⚠️ لم يحدد بعد</span>'}</div>
                                <div style="font-size: 0.7rem; color: #ea580c; font-weight: 600; margin-top: 6px;"><i class="fas fa-history"></i> مدة المعالجة والتحويل: خلال 3 إلى 7 أيام عمل</div>
                            </div>
                            
                            <!-- Method Information Display -->
                            <div style="background: white; border: 1px solid var(--gray-200); padding: 16px; border-radius: var(--radius-sm); border-right: 4px solid #16a34a;">
                                <div style="font-size: 0.75rem; color: var(--gray-400); font-weight: 700; margin-bottom: 4px;"><i class="fas fa-money-check-alt"></i> وسيلة دفع مستحقاتك المعتمدة</div>
                                <div style="font-size: 1.05rem; font-weight: 800; color: #166534;"><i class="fas fa-check-circle"></i> بريد الجزائر CCP / BaridiMob</div>
                                <div style="font-size: 0.7rem; color: #16a34a; font-weight: 600; margin-top: 6px;"><i class="fas fa-shield-alt"></i> تحويل رسمي آمن ومباشر لحسابك البريدي</div>
                            </div>
                        </div>

                        <div style="background: var(--primary-light); padding: 12px 16px; border-radius: var(--radius-sm); font-size: 0.8rem; line-height: 1.5; color: var(--gray-700); display: flex; align-items: flex-start; gap: 8px;">
                            <i class="fas fa-info-circle" style="color: var(--primary); margin-top: 3px; font-size: 0.95rem;"></i>
                            <div>
                                يمكنك تعديل بيانات الدفع أعلاه وتغييرها في أي وقت من خلال الضغط على زر <strong>"تعديل الملف الشخصي"</strong> في الأسفل وتعبئة حقول الحسابات.
                            </div>
                        </div>
                    </div>

                    <!-- Social Links Section -->
                    <div style="margin-bottom: 30px;">
                        <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--gray-800); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-share-alt" style="color: var(--primary);"></i> حسابات ومواقع التواصل الاجتماعي
                        </h3>
                        <div style="background: var(--gray-50); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--gray-200);">
                            ${renderSocialLinks(userData)}
                        </div>
                    </div>

                    <!-- Action Buttons and Warnings -->
                    <div style="text-align: center; border-top: 1px solid var(--gray-200); padding-top: 24px;">
                        <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
                            <button onclick="showEditProfileModal()" style="background: var(--gradient-main); color: white; border: none; padding: 12px 30px; border-radius: 30px; cursor: pointer; font-weight: 800; font-size: 0.95rem; transition: all 0.3s ease; box-shadow: 0 4px 16px rgba(15,92,191,0.25); display: inline-flex; align-items: center; gap: 10px;">
                                <i class="fas fa-edit"></i> تعديل ملف التعريف وإعدادات الدفع
                            </button>
                            <button onclick="showTeacherProfileFromPost(userData.id, true)" style="background: white; color: var(--primary); border: 2px solid var(--primary); padding: 10px 30px; border-radius: 30px; cursor: pointer; font-weight: 800; font-size: 0.95rem; transition: all 0.3s ease; display: inline-flex; align-items: center; gap: 10px;">
                                <i class="fas fa-eye"></i> معاينة الملف العام
                            </button>
                        </div>
                        
                        <p style="color: var(--gray-400); margin-top: 16px; font-size: 0.75rem;"><i class="fas fa-lock" style="margin-left: 4px;"></i> لا يمكن تعديل معلوماتك الشخصية الأساسية (الاسم، التخصص، سنوات الخبرة، المستوى المدرس) إلا من خلال مراجعة الإدارة.</p>
                    </div>
                </div>
            </div>
        `;

        // ✅ إظهار/إخفاء أشرطة الحالة حسب حالة الحساب (فقط للأستاذ المسجل)
        const isGuestTeacher = userData && (userData.is_guest || userData.id === -1);
        if (userData.status !== 'approved' && !isGuestTeacher) {
            if (userData.requires_profile_completion === true) {
                showProfileCompletionBanner();
            } else if (userData.status === 'rejected') {
                showRejectedBanner(userData.rejection_reason);
            } else {
                showPendingApprovalBanner();
            }
        } else {
            hideAllBanners();
        }

        setupGuestUI();
    }

    // ================================================================
    // BALANCE & EARNINGS
    // ================================================================

    window.teacherAllEarnings = [];
    window.currentEarningsFilter = 'all';

    // ================================================================
    // 💰 المدفوعات المستحقة والأرباح - 20 صفاً ثم تحميل المزيد بالتمرير
    // ================================================================
    window.teacherEarningsShown = 20;
    const TEACHER_EARNINGS_PAGE = 20;

    function teacherEarningsStatusCell(row) {
        const status = row.payment_status || row.status || '';
        if (status === 'paid' || status === 'completed' || status === 'completed_stream')
            return '<span style="background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;"><i class="fas fa-check-circle"></i> مدفوعة</span>';
        if (status === 'partial')
            return '<span style="background: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;"><i class="fas fa-circle-half-stroke"></i> جزئية</span>';
        if (status === 'pending_stream' || status === 'pending' || status === 'active')
            return '<span style="background: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;"><i class="fas fa-clock"></i> معلّقة</span>';
        if (status === 'cancelled' || status === 'refunded')
            return '<span style="background: #fee2e2; color: #b91c1c; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;"><i class="fas fa-ban"></i> ملغاة</span>';
        return '<span style="background: #e2e8f0; color: #475569; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">' + escapeHtml(status || 'غير محددة') + '</span>';
    }

    // الطالب والأستاذ معاً في نفس العمود، مع شارة تميّز النوع
    function teacherEarningsPayerCell(row) {
        const name = row.payer_name || row.student_name || 'مستخدم منصة ZoomDz';
        const isTeacher = row.payer_type === 'teacher';
        const badge = isTeacher
            ? '<span style="background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe; padding: 1px 7px; border-radius: 8px; font-size: 0.68rem; font-weight: 800; margin-right: 5px;"><i class="fas fa-chalkboard-user"></i> أستاذ</span>'
            : '<span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 1px 7px; border-radius: 8px; font-size: 0.68rem; font-weight: 800; margin-right: 5px;"><i class="fas fa-user-graduate"></i> طالب</span>';
        return '<span style="display:inline-flex; align-items:center; flex-wrap:wrap; gap:4px;">' + badge + escapeHtml(name) + '</span>';
    }

    function teacherEarningsRowHtml(s) {
        const itemType = s.type || 'lesson';
        let typeBadge = '';
        if (itemType === 'package') {
            typeBadge = '<span style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 4px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; display: inline-block;"><i class="fas fa-cubes"></i> باقة</span>';
        } else if (itemType === 'course') {
            typeBadge = '<span style="background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe; padding: 4px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; display: inline-block;"><i class="fas fa-graduation-cap"></i> دورة</span>';
        } else {
            typeBadge = '<span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 4px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; display: inline-block;"><i class="fas fa-video"></i> درس</span>';
        }

        const teacherEarned = (s.teacher_earned !== undefined && s.teacher_earned !== null) ? s.teacher_earned : (s.payment_amount - (s.platform_fee || 0));
        const titleText = s.title || (s.offers && s.offers.subject_name) || s.subject_name || 'عنصر غير محدد';
        const dateFormatted = s.created_at
            ? new Date(s.created_at).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'غير محددة';

        return '<tr>' +
            '<td>' + typeBadge + '</td>' +
            '<td><strong style="color: #1e293b;">' + escapeHtml(titleText) + '</strong></td>' +
            '<td>' + teacherEarningsPayerCell(s) + '</td>' +
            '<td><span style="color: #059669; font-weight: 800; font-size: 1rem;">+' + Number(teacherEarned).toLocaleString() + ' دج</span>' +
                (s.platform_fee ? '<br><small style="font-size:0.7rem; color: #64748b;">(رسوم المنصة: ' + Number(s.platform_fee).toLocaleString() + ' دج)</small>' : '') +
            '</td>' +
            '<td style="font-size: 0.8rem; color: var(--gray-600);">' + dateFormatted + '</td>' +
            '<td>' + teacherEarningsStatusCell(s) + '</td>' +
        '</tr>';
    }

    function renderTeacherEarningsRows(filter = 'all') {
        const items = window.teacherAllEarnings || [];
        const filtered = filter === 'all' ? items : items.filter(it => it.type === filter);
        const tbody = document.getElementById('teacherEarningsTableBody');
        const countSpan = document.getElementById('teacherEarningsFilterCount');
        if (!tbody) return;

        const limit = Math.min(window.teacherEarningsShown || TEACHER_EARNINGS_PAGE, filtered.length);
        if (countSpan) {
            countSpan.textContent = limit < filtered.length
                ? 'عرض ' + limit + ' من ' + filtered.length + ' عملية'
                : filtered.length + ' عملية';
        }

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px; color:var(--gray-400);"><i class="fas fa-receipt" style="font-size: 2rem; margin-bottom: 8px; opacity: 0.4;"></i><br>لا توجد عمليات بعد</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.slice(0, limit).map(teacherEarningsRowHtml).join('');

        // سطر-indicator يقود إلى تحميل المزيد
        const sentinel = document.createElement('tr');
        sentinel.id = 'teacherEarningsMoreRow';
        sentinel.innerHTML = '<td colspan="6" style="text-align:center; padding: 14px; color: var(--gray-500); font-size: 0.8rem; font-weight: 700;">' +
            (limit < filtered.length
                ? '<i class="fas fa-arrow-down"></i> ' + (filtered.length - limit) + ' عملية أخرى - انزل للمزيد'
                : '<i class="fas fa-check-double"></i> تم عرض كل العمليات') +
            '</td>';
        tbody.appendChild(sentinel);
        armTeacherEarningsSentinel(filtered, limit);
    }

    // تمرير لا نهائي: يظهر المزيد عند الاقتراب من أسفل الجدول
    function armTeacherEarningsSentinel(filtered, shown) {
        const row = document.getElementById('teacherEarningsMoreRow');
        if (!row) return;
        if (window.teacherEarningsObserver) {
            window.teacherEarningsObserver.disconnect();
            window.teacherEarningsObserver = null;
        }
        if (shown >= filtered.length) return;

        if (typeof IntersectionObserver === 'undefined') {
            // احتياطي: زر يدوي
            row.innerHTML = '<td colspan="6" style="text-align:center; padding: 12px;"><button type="button" onclick="showMoreTeacherEarnings()" style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:7px 18px;font-weight:800;cursor:pointer;"><i class="fas fa-arrow-down"></i> عرض المزيد</button></td>';
            return;
        }

        window.teacherEarningsObserver = new IntersectionObserver(function (entries) {
            if (!entries[0].isIntersecting) return;
            showMoreTeacherEarnings();
        }, { rootMargin: '160px' });
        window.teacherEarningsObserver.observe(row);
    }

    function showMoreTeacherEarnings() {
        const items = window.teacherAllEarnings || [];
        const filter = window.currentEarningsFilter || 'all';
        const filtered = filter === 'all' ? items : items.filter(it => it.type === filter);
        const next = (window.teacherEarningsShown || TEACHER_EARNINGS_PAGE) + TEACHER_EARNINGS_PAGE;
        if (next >= filtered.length + TEACHER_EARNINGS_PAGE) {
            window.teacherEarningsShown = filtered.length;
        } else {
            window.teacherEarningsShown = next;
        }
        renderTeacherEarningsRows(filter);
    }
    window.showMoreTeacherEarnings = showMoreTeacherEarnings;

    // شبكة أمان: إن لم يعمل المراقب نُحمّل عند nearingأسفل الصفحة
    window.addEventListener('scroll', function () {
        const items = window.teacherAllEarnings || [];
        const filter = window.currentEarningsFilter || 'all';
        const filtered = filter === 'all' ? items : items.filter(it => it.type === filter);
        if ((window.teacherEarningsShown || 0) >= filtered.length) return;
        if ((window.innerHeight + window.scrollY) < (document.body.scrollHeight - 320)) return;
        showMoreTeacherEarnings();
    }, { passive: true });

    window.filterTeacherEarningsTab = function(type, btn) {
        window.currentEarningsFilter = type;
        window.teacherEarningsShown = 20;
        const allBtns = document.querySelectorAll('.earnings-filter-btn');
        allBtns.forEach(b => {
            b.style.backgroundColor = '#f1f5f9';
            b.style.color = '#475569';
            b.style.borderColor = '#cbd5e1';
        });
        if (btn) {
            btn.style.backgroundColor = '#2563eb';
            btn.style.color = '#ffffff';
            btn.style.borderColor = '#2563eb';
        }
        renderTeacherEarningsRows(type);
    };

    async function loadBalance() {
        try {
            const res = await fetchWithAuth(`/api/teacher/balance/${teacherId}`);
            const data = await res.json();
            const balance = data.balance || 0;
            const pending = data.pending_withdraw || 0;
            const lessonsEarned = data.lessons_earned || 0;
            const packagesEarned = data.packages_earned || 0;
            const coursesEarned = data.courses_earned || 0;
            const totalEarned = data.total_earned || (lessonsEarned + packagesEarned + coursesEarned);
            
            // تحديث الرصيد في شريط التنقل
            document.getElementById('navBalanceAmount').textContent = balance;
            document.getElementById('navPendingAmount').textContent = pending;
            document.getElementById('withdrawBalance').textContent = balance;

            window.teacherAllEarnings = data.sessions || data.earnings || [];
            window.teacherEarningsShown = 20;

            let earningsHtml = `
                <div style="background: var(--gray-50); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px; border: 1px solid var(--gray-200);">
                    <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <h3 style="font-size: 1.15rem; color: var(--gray-800); font-weight: 800; margin-bottom: 4px;">💰 إجمالي الأرباح الكلية: ${totalEarned.toLocaleString()} دج</h3>
                            <p style="font-size: 0.92rem; color: #047857; font-weight: 700; margin: 2px 0;"><i class="fas fa-wallet"></i> الرصيد المتاح للسحب: ${balance.toLocaleString()} دج</p>
                            <p style="font-size: 0.85rem; color: var(--gold-dark); font-weight: 600; margin: 2px 0;">⏳ الرصيد المعلق: ${pending.toLocaleString()} دج (في انتظار اكتمال البث المباشر)</p>
                        </div>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                            <button class="btn-primary" onclick="showWithdrawModal()" style="font-size:0.85rem; padding:8px 18px; font-weight: 700;"><i class="fas fa-hand-holding-usd"></i> طلب سحب CCP</button>
                            <button class="btn-primary" onclick="showDepositModal()" style="font-size:0.85rem; padding:8px 18px; background-color: var(--secondary); font-weight: 700;"><i class="fas fa-plus-circle"></i> شحن الرصيد</button>
                        </div>
                    </div>
                    <p style="font-size: 0.72rem; color: var(--gray-500); margin-top: 6px; margin-bottom: 0;">* الحد الأدنى لطلب السحب: <span id="minWithdrawHint">500</span> دج | يتم تحويل المستحقات مباشرة إلى حسابك الجاري CCP أو بريدي موب</p>
                </div>

                <!-- 🌟 بطاقات تفصيل مصادر الأرباح الثلاثة (الدروس، الباقات، الدورات) -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 18px;">
                    <!-- كرت أرباح الدروس -->
                    <div style="background: #ffffff; border: 1.5px solid #bfdbfe; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(37,99,235,0.06); display: flex; align-items: center; gap: 12px;">
                        <div style="width: 44px; height: 44px; border-radius: 10px; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
                            <i class="fas fa-video"></i>
                        </div>
                        <div>
                            <span style="font-size: 0.75rem; color: #64748b; font-weight: 700; display: block;">أرباح الدروس والحصص</span>
                            <strong style="font-size: 1.15rem; color: #1e40af; font-weight: 900; display: block;">${lessonsEarned.toLocaleString()} دج</strong>
                            <small style="font-size: 0.7rem; color: #3b82f6;">${data.earnings_count?.lessons || 0} حصة/جلسة</small>
                        </div>
                    </div>

                    <!-- كرت أرباح الباقات التعليمية -->
                    <div style="background: #ffffff; border: 1.5px solid #a7f3d0; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(5,150,105,0.06); display: flex; align-items: center; gap: 12px;">
                        <div style="width: 44px; height: 44px; border-radius: 10px; background: #ecfdf5; color: #059669; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
                            <i class="fas fa-cubes"></i>
                        </div>
                        <div>
                            <span style="font-size: 0.75rem; color: #64748b; font-weight: 700; display: block;">أرباح الباقات التعليمية</span>
                            <strong style="font-size: 1.15rem; color: #065f46; font-weight: 900; display: block;">${packagesEarned.toLocaleString()} دج</strong>
                            <small style="font-size: 0.7rem; color: #10b981;">${data.earnings_count?.packages || 0} اشتراك باقة</small>
                        </div>
                    </div>

                    <!-- كرت أرباح الدورات المسجلة -->
                    <div style="background: #ffffff; border: 1.5px solid #ddd6fe; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(124,58,237,0.06); display: flex; align-items: center; gap: 12px;">
                        <div style="width: 44px; height: 44px; border-radius: 10px; background: #f5f3ff; color: #7c3aed; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
                            <i class="fas fa-graduation-cap"></i>
                        </div>
                        <div>
                            <span style="font-size: 0.75rem; color: #64748b; font-weight: 700; display: block;">أرباح الدورات التدريبية</span>
                            <strong style="font-size: 1.15rem; color: #5b21b6; font-weight: 900; display: block;">${coursesEarned.toLocaleString()} دج</strong>
                            <small style="font-size: 0.7rem; color: #8b5cf6;">${data.earnings_count?.courses || 0} مبيعة دورة</small>
                        </div>
                    </div>
                </div>

                <!-- عنوان وقائمة التصفية للعمليات -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <h4 style="font-size: 1rem; color: var(--gray-800); margin: 0; font-weight: 800;">
                            <i class="fas fa-file-invoice-dollar" style="color: var(--primary); margin-left: 4px;"></i> المدفوعات المستحقة والأرباح:
                        </h4>
                        <span id="teacherEarningsFilterCount" style="font-size: 0.8rem; color: var(--gray-500); background: #e2e8f0; padding: 2px 8px; border-radius: 10px; font-weight: 700;">
                            ${window.teacherAllEarnings.length} عملية
                        </span>
                    </div>

                    <!-- أزرار التصفية السريعة -->
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <button type="button" class="earnings-filter-btn" onclick="filterTeacherEarningsTab('all', this)" style="padding: 5px 12px; font-size: 0.78rem; font-weight: 700; border-radius: 8px; border: 1px solid #2563eb; background: #2563eb; color: #fff; cursor: pointer; font-family: 'Cairo';">
                            الكل (${window.teacherAllEarnings.length})
                        </button>
                        <button type="button" class="earnings-filter-btn" onclick="filterTeacherEarningsTab('lesson', this)" style="padding: 5px 12px; font-size: 0.78rem; font-weight: 700; border-radius: 8px; border: 1px solid #cbd5e1; background: #f1f5f9; color: #475569; cursor: pointer; font-family: 'Cairo';">
                            📺 الدروس (${data.earnings_count?.lessons || 0})
                        </button>
                        <button type="button" class="earnings-filter-btn" onclick="filterTeacherEarningsTab('package', this)" style="padding: 5px 12px; font-size: 0.78rem; font-weight: 700; border-radius: 8px; border: 1px solid #cbd5e1; background: #f1f5f9; color: #475569; cursor: pointer; font-family: 'Cairo';">
                            📦 الباقات (${data.earnings_count?.packages || 0})
                        </button>
                        <button type="button" class="earnings-filter-btn" onclick="filterTeacherEarningsTab('course', this)" style="padding: 5px 12px; font-size: 0.78rem; font-weight: 700; border-radius: 8px; border: 1px solid #cbd5e1; background: #f1f5f9; color: #475569; cursor: pointer; font-family: 'Cairo';">
                            🎓 الدورات (${data.earnings_count?.courses || 0})
                        </button>
                    </div>
                </div>

                <div style="overflow-x: auto;">
                    <table class="earnings-table">
                        <thead>
                            <tr>
                                <th>نوع العملية</th>
                                <th>الخدمة / المحتوى</th>
                                <th>الطالب</th>
                                <th>المبلغ المضاف</th>
                                <th>تاريخ المعاملة</th>
                                <th>الحالة</th>
                            </tr>
                        </thead>
                        <tbody id="teacherEarningsTableBody"></tbody>
                    </table>
                </div>
            `;

            document.getElementById('earningsInfo').innerHTML = earningsHtml;
            renderTeacherEarningsRows('all');
            loadWithdrawRequests();
        } catch(e) { if (e && e.message && !e.message.includes('انتهت صلاحية الجلسة') && !e.message.includes('Failed to fetch')) console.error(e); }
    }

    async function loadWithdrawRequests() {
        try {
            const res = await fetchWithAuth(`/api/teacher/withdraw-requests/${teacherId}`);
            const requests = await res.json();
            if (!requests || requests.length === 0) {
                document.getElementById('withdrawRequestsList').innerHTML = '<p style="text-align:center; padding:15px; color:var(--gray-400);">لا توجد طلبات سحب سابقة</p>';
                return;
            }
            let html = '<div class="requests-list">';
            for (const req of requests) {
                let statusClass = '', statusText = '';
                if (req.status === 'pending') { statusClass = 'status-pending'; statusText = '⏳ قيد المراجعة للتحويل'; }
                else if (req.status === 'completed') { statusClass = 'status-completed'; statusText = '✅ تم التحويل لحساب CCP'; }
                else { statusClass = 'status-rejected'; statusText = '❌ مرفوض'; }
                const ccpNumber = req.ccp_account || userData?.ccp_account || 'حساب CCP المسجل';
                html += `<div class="request-item">
                    <div>
                        <strong style="color:var(--gray-800); font-size: 1.05rem;">${req.amount} دج</strong>
                        ${req.description ? `<br><small style="font-size:0.75rem; color:#0f766e; font-weight:600;">${escapeHtml(req.description)}</small>` : ''}
                        <div style="font-size:0.75rem; color:#1e40af; font-weight:700; margin-top:3px; display:flex; align-items:center; gap:5px;">
                            <i class="fas fa-university" style="color:#2563eb;"></i> 
                            <span>حساب CCP:</span>
                            <span style="font-family:monospace; direction:ltr; display:inline-block; color:#0f172a;">${escapeHtml(ccpNumber)}</span>
                        </div>
                    </div>
                    <span class="request-status ${statusClass}">${statusText}</span>
                </div>`;
            }
            html += '</div>';
            document.getElementById('withdrawRequestsList').innerHTML = html;
        } catch(e) { if (e.message !== 'انتهت صلاحية الجلسة') console.error(e); }
    }

    // ================================================================
    // ✅ DEPOSIT & TRANSACTIONS (Gold Card & BaridiMob / CCP)
    // ================================================================

    let currentDepositMethod = 'gold_card';
    let selectedDepositReceiptFile = null;

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
    function getWithdrawMinFrom(s) { const v = parseFloat(s && s.min_withdrawal_amount); return (!isNaN(v) && v >= 0) ? v : 500; }

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
        updateTeacherDepositFee();
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
                if (typeof loadTeacherBalance === 'function') loadTeacherBalance();
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

    async function updateTeacherDepositFee() {
        const val = parseFloat(document.getElementById('depositAmount').value) || 0;
        const s = await getRevSettings();
        const minDeposit = getDepositMinFrom(s);
        const pctRaw = parseFloat(s.deposit_fee_percentage);
        const feePct = isNaN(pctRaw) ? 1 : pctRaw;
        const fixedRaw = parseFloat(s.deposit_fee_fixed);
        const feeFixed = isNaN(fixedRaw) ? 0 : fixedRaw;
        const minHint = document.getElementById('depositMinHint');
        if (minHint) minHint.innerText = 'الحد الأدنى للشحن: ' + minDeposit + ' دج';
        const box = document.getElementById('teacherDepositFeeBox');
        if (!box) return;
        if (val >= minDeposit) {
            const fee = Math.round(val * feePct / 100) + feeFixed;
            const total = val + fee;
            document.getElementById('teacherDepositNetDisplay').innerText = val.toLocaleString() + ' دج';
            document.getElementById('teacherDepositFeeDisplay').innerText = fee.toLocaleString() + ' دج';
            document.getElementById('teacherDepositTotalDisplay').innerText = total.toLocaleString() + ' دج';
            box.style.display = 'block';
        } else {
            box.style.display = 'none';
        }
    }

    function closeDepositModal() {
        document.getElementById('modalOverlay').style.display = 'none';
        document.getElementById('depositModal').style.display = 'none';
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
            const res = await fetchWithAuth('/api/wallet/deposit-teacher', {
                method: 'POST',
                body: JSON.stringify({ teacher_id: teacherId, amount: parseInt(amount) })
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
        let healed = false;
        try {
            for (const row of pendingRows) {
                try {
                    const res = await fetchWithAuth('/api/wallet/deposit/status/' + encodeURIComponent(row.id));
                    const data = await res.json();
                    if (data && data.success && data.status === 'success') healed = true;
                } catch (e) { /* خطأ مؤقت — نعيد المحاولة عند الفتح القادم */ }
            }
        } finally {
            pendingDepositVerifyInFlight = false;
        }
        if (healed) {
            if (typeof loadBalance === 'function') loadBalance();
            showToast('✅ تم تأكيد الدفع بنجاح — أُضيف المبلغ إلى رصيدك', 'success');
            loadTransactions();
        }
    }

    async function loadTransactions() {
        const container = document.getElementById('transactionsList');
        if (!container) return;
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
        try {
            const res = await fetchWithAuth(`/api/wallet/transactions-teacher/${teacherId}`);
            const data = await res.json();
            const transactions = data.transactions || [];
            if (transactions.length === 0) {
                container.innerHTML = '<p style="text-align:center; padding:30px; color:var(--gray-400);">لا توجد معاملات سابقة</p>';
                return;
            }
            window.teacherTransactionsMap = {};
            let html = '';
            for (const t of transactions) {
                const date = new Date(t.created_at);
                const formattedDate = date.toLocaleString('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const isDeposit = t.type === 'deposit' || t.type === 'credit' || t.type === 'deposit_manual' || t.type === 'manual_deposit' || t.type === 'ad_refund';
                const isWithdraw = t.type === 'withdraw';
                const isFees = t.type === 'fees';
                const isAdBooking = t.type === 'ad_booking';
                
                let icon = isDeposit ? (t.type === 'deposit_manual' || t.type === 'manual_deposit' ? 'fa-money-bill-transfer' : (t.type === 'ad_refund' ? 'fa-rotate-left' : 'fa-arrow-up')) : (isWithdraw ? 'fa-hand-holding-usd' : (isAdBooking ? 'fa-bullhorn' : 'fa-arrow-down'));
                let color = isDeposit ? 'var(--secondary)' : (isWithdraw ? '#2563eb' : (isAdBooking ? '#d97706' : 'var(--danger)'));
                let bg = isDeposit ? 'var(--secondary-soft)' : (isWithdraw ? '#dbeafe' : (isAdBooking ? '#fffbeb' : 'var(--danger-soft)'));
                let label = isDeposit ? (t.type === 'ad_refund' ? '💰 استرداد إعلان (مرفوض/محذوف)' : (t.type === 'deposit_manual' || t.type === 'manual_deposit' ? 'شحن رصيد (بريدي موب / CCP)' : 'شحن رصيد')) : (isWithdraw ? 'سحب رصيد' : (isFees ? 'رسوم إنشاء حصة مجانية' : (isAdBooking ? '📢 حجز إعلان' : 'خصم رصيد')));
                
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
                    type: t.type,
                    amount: t.amount,
                    status: statusLabel,
                    statusColor: statusColor,
                    statusBg: statusBg,
                    date: formattedDate,
                    desc: t.description || '',
                    sofizId: t.sofizpay_transaction_id || ''
                };
                
                window.teacherTransactionsMap[t.id] = txObj;
                const txJson = JSON.stringify(txObj).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

                html += `
                    <div class="transaction-item" onclick="showTransactionDetailsByMappedId('${t.id}')" style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid var(--gray-100); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='transparent'">
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
                                ${isDeposit ? '+' : '-'} ${t.amount || 0} دج
                            </div>
                        </div>
                    </div>
                `;
            }
            container.innerHTML = html;
            verifyPendingDeposits(transactions);
        } catch(e) { 
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ أثناء تحميل المعاملات', 'error');
            }
        }
    }

    function startChatWithStudent(otherId, otherName, otherImage) {
        startChatWithUser(otherId, otherName, otherImage, 'student');
    }

    function startChatWithTeacher(otherId, otherName, otherImage) {
        startChatWithUser(otherId, otherName, otherImage, 'teacher');
    }

        
    // The nav search renders an "instant message" button that calls this.
    function openDirectChat(userId, name, avatar, userType) {
        startChatWithUser(userId, name, avatar, userType || 'student');
    }
    window.openDirectChat = openDirectChat;

window.startChatWithStudent = startChatWithStudent;
    window.startChatWithTeacher = startChatWithTeacher;

    function startChatWithUser(otherId, otherName, otherImage, otherType = 'teacher') {
        if (checkGuestAction && checkGuestAction()) return;
        currentChatTeacher = { id: otherId, name: otherName, image: otherImage || '/images/default-avatar.svg', type: otherType };
        chatTypingWatch(otherId, otherType, otherName);
        startDirectChatPolling();
        document.getElementById('conversationsList').style.display = 'none';
        document.getElementById('chatView').style.display = 'block';

        const isStudent = otherType === 'student';
        const typeLabel = isStudent ? 'طالب' : 'أستاذ';
        const profileOnClick = isStudent ? `showStudentProfile(${otherId})` : `viewTeacherProfile(${otherId})`;
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
        if (inputEl) inputEl.placeholder = `تواصل مع ${typeLabel}... اكتب رسالتك هنا`;

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
            const res = await fetchWithAuth(`/api/messages/${teacherId}/teacher/${otherId}/${typeParam}?limit=${directChatLimit}`);
            const messages = await res.json();
            
            if (!Array.isArray(messages) || messages.length < directChatLimit) {
                directChatHasMore = false;
            }
            
            renderChatMessages(messages, silent, isOlderLoad, previousScrollHeight, previousScrollTop);
            checkUnreadMessagesCount();
        } catch(e) { 
            if (e.message !== 'انتهت صلاحية الجلسة') { console.log(e); container.innerHTML = '<p style="text-align:center; padding:20px; color:var(--danger);">حدث خطأ في تحميل الرسائل</p>'; } 
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
            const isSent = msg.sender_id == teacherId;
            let _dStr = msg.created_at; if (_dStr && !_dStr.endsWith('Z') && !_dStr.includes('+')) { _dStr += 'Z'; } const date = new Date(_dStr);
            const otherName = currentChatTeacher ? currentChatTeacher.name : 'المستلم';
            const senderDisplayName = isSent ? 'أنت' : otherName;
            const isAudioMsg = msg.message_type === 'audio' || msg.file_type === 'audio' || !!msg.audio_url;
            const cleanTextForJs = isAudioMsg ? '🎤 رسالة صوتية' : escapeHtml(msg.message).replace(/'/g, "\\'").replace(/"/g, '&quot;');

            let reactionsHtml = '';
            if (msg.reactions && msg.reactions.length > 0) {
                reactionsHtml += '<div class="message-reactions">';
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
            sender_id: teacherId, 
            sender_type: 'teacher', 
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
            } else { showToast(data.error || 'حدث خطأ', 'error'); }
        } catch(e) { if (e.message !== 'انتهت صلاحية الجلسة') showToast('حدث خطأ في الإرسال', 'error'); }
        finally { directChatSending = false; }
    }

    async function loadConversations(silent = false) {
        window.loadConversations = loadConversations;
        const container = document.getElementById('conversationsList');
        if (!silent && container) {
            container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
        }
        try {
            const res = await fetchWithAuth(`/api/messages/conversations/${teacherId}/teacher`);
            const conversations = await res.json();
            currentConversations = conversations;
            renderConversations(conversations);
            checkUnreadMessagesCount();
        } catch(e) { if (e.message !== 'انتهت صلاحية الجلسة' && !silent) { console.log(e); if (container) container.innerHTML = '<p style="text-align:center; padding:20px; color:var(--danger);">حدث خطأ</p>'; } }
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
            const profileFn = oType === 'student' ? `showStudentProfile(${conv.other_id})` : `viewTeacherProfile(${conv.other_id})`;
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
        loadConversations();
    }

    function viewTeacherProfile(tId) {
        showTeacherProfileFromPost(tId, true);
    }
    window.viewTeacherProfile = viewTeacherProfile;

    // ================================================================
    // TEACHERS
    // ================================================================

    async function loadTeachers() {
        const isGuest = userData && (userData.is_guest || userData.id === -1);
        const container = document.getElementById('teachersList');

        // ✅ إذا كان أستاذ زائر: إخباره بإنشاء حساب ورفع الوثائق للوصول إلى هذا القسم
        if (isGuest) {
            if (container) {
                container.innerHTML = `
                    <div style="text-align:center; padding:45px 25px; background:white; border-radius:18px; border:1px solid var(--gray-200); margin:20px auto; max-width:620px; box-shadow:0 4px 20px rgba(0,0,0,0.04);">
                        <div style="width:72px; height:72px; background:var(--primary-light); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 18px; color:var(--primary); font-size:1.8rem;">
                            <i class="fas fa-id-card"></i>
                        </div>
                        <h3 style="font-weight:850; font-size:1.25rem; color:var(--gray-900); margin-bottom:12px;">قسم الأساتذة</h3>
                        <p style="color:var(--gray-600); font-size:0.95rem; line-height:1.7; margin-bottom:24px; max-width:480px; margin-left:auto; margin-right:auto;">
                            للوصول إلى قسم الأساتذة والتواصل معهم، يرجى <strong>إنشاء حساب أستاذ ورفع الوثائق المطلوبة</strong> (صورة الشهادة/الدبلوم وإثبات الهوية) ليتم تفعيل حسبك من قبل الإدارة.
                        </p>
                        <button onclick="exitGuestAndNavigate('/?login=true&role=teacher')" class="btn-primary" style="padding:12px 32px; border-radius:30px; font-weight:800; font-size:0.95rem; display:inline-flex; align-items:center; gap:10px; box-shadow:0 4px 15px rgba(15,92,191,0.25); cursor:pointer;">
                            <i class="fas fa-user-plus"></i> إنشاء حساب أستاذ ورفع الوثائق
                        </button>
                    </div>
                `;
            }
            return;
        }

        // ✅ السماح لجميع الأساتذة بدخول قسم الأساتذة (ما عدا المرفوضين)
        if (userData && userData.status === 'rejected') {
            if (container) {
                container.innerHTML = '<p style="text-align:center; padding:25px; color:var(--danger);"><i class="fas fa-times-circle"></i> ❌ تم رفض طلبك. يرجى التواصل مع الإدارة للوصول إلى هذا القسم.</p>';
            }
            return;
        }
        if (!container) return;
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
        try {
            const res = await fetchWithAuth('/api/public/teachers');
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const teachers = await res.json();
            if (!teachers || teachers.length === 0) {
                container.innerHTML = '<p style="text-align:center; padding:25px; color:var(--gray-400);">لا يوجد أساتذة معتمدون حالياً</p>';
                return;
            }
            teachers.sort((a, b) => {
                const aCert = (a.is_certified === true || a.status === 'certified') ? 1 : 0;
                const bCert = (b.is_certified === true || b.status === 'certified') ? 1 : 0;
                return bCert - aCert;
            });

            let html = '';
            for (const teacher of teachers) {
                if (teacher.id == teacherId) continue;
                const teacherImage = getValidImageUrl(teacher.profile_image, teacher.full_name, 60);
                const isCert = Boolean(teacher.is_certified === true || teacher.status === 'certified');
                const certBadgeHtml = isCert
                    ? '<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:2px 8px; border-radius:12px; font-size:0.68rem; font-weight:800; display:inline-flex; align-items:center; gap:3px; margin:4px 0;"><i class="fas fa-crown" style="color:#f59e0b;"></i> أستاذ معتمد</span>'
                    : '<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:12px; font-size:0.68rem; font-weight:700; display:inline-flex; align-items:center; gap:3px; margin:4px 0;"><i class="fas fa-check-circle" style="color:#2563eb;"></i> أستاذ موثق</span>';

                html += `<div class="teacher-card" onclick="viewTeacherProfile(${teacher.id})">
                    <div style="position: relative; display: inline-block; margin-bottom: 6px;">
                        <img src="${teacherImage}" data-original-url="${teacherImage}" class="teacher-avatar" referrerpolicy="no-referrer" onerror="handleImageFallback(this)" style="border: ${isCert ? '3px solid #f59e0b' : '2px solid #2563eb'}; box-shadow: ${isCert ? '0 0 10px rgba(245, 158, 11, 0.4)' : '0 2px 8px rgba(37,99,235,0.2)'};">
                        ${isCert 
                            ? '<span title="أستاذ معتمد - شارة ذهبية 👑" style="position: absolute; bottom: 0; right: 0; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; border: 2px solid white; box-shadow: 0 2px 4px rgba(217, 119, 6, 0.4); z-index:2;"><i class="fas fa-crown"></i></span>'
                            : '<span title="أستاذ موثق - شارة زرقاء 🔵" style="position: absolute; bottom: 0; right: 0; background: #2563eb; color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.55rem; border: 2px solid white; box-shadow: 0 2px 4px rgba(37,99,235,0.4); z-index:2;"><i class="fas fa-check"></i></span>'
                        }
                    </div>
                    <div class="teacher-name" style="display:flex; align-items:center; justify-content:center; gap:6px;">
                        <span>${escapeHtml(teacher.full_name)}</span>
                        ${isCert ? '<i class="fas fa-crown" style="font-size: 0.85rem; color: #f59e0b;" title="أستاذ معتمد 👑"></i>' : '<i class="fas fa-check-circle" style="font-size: 0.85rem; color: #2563eb;" title="أستاذ موثق 🔵"></i>'}
                    </div>
                    <div>${certBadgeHtml}</div>
                    <div class="teacher-specialty"><i class="fas fa-book"></i> ${escapeHtml(teacher.specialization || 'تخصص عام')}</div>
                    <div class="teacher-specialty"><i class="fas fa-briefcase"></i> ${teacher.experience || '0'} سنة خبرة</div>
                    ${teacher.bio ? `<div style="font-size:0.75rem; color:var(--gray-500); margin-top:6px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(teacher.bio)}</div>` : ''}
                    <button class="message-btn" onclick="event.stopPropagation(); startChatWithTeacher(${teacher.id}, '${escapeHtml(teacher.full_name)}', '${teacherImage}')"><i class="fas fa-envelope"></i> مراسلة</button>
                    <button class="follow-btn-${teacher.id}" onclick="event.stopPropagation(); toggleFollowTeacher(${teacher.id}, '${escapeHtml(teacher.full_name)}', '${teacherImage}')" style="${teacher.is_following ? 'background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;' : 'background: var(--primary); color: white; border: none;'} padding: 7px 14px; border-radius: 20px; font-weight: 700; font-size: 0.75rem; width: 100%; margin-top: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.3s ease;">
                        <i class="fas ${teacher.is_following ? 'fa-check-circle' : 'fa-user-plus'}"></i>
                        <span>${teacher.is_following ? 'تتابعه' : 'متابعة'}</span>
                    </button>
                </div>`;
            }
            container.innerHTML = html;
        } catch(e) { console.error('خطأ في تحميل الأساتذة:', e); showToast('حدث خطأ في تحميل الأساتذة', 'error'); container.innerHTML = '<p style="text-align:center; padding:25px; color:var(--gray-400);">حدث خطأ في تحميل الأساتذة</p>'; }
    }

    // ================================================================
    // ✅ OFFERS - مع دعم البث والعداد
    // ================================================================

    async function loadOffers(silent = false) {
        // ✅ التحقق من حالة الحساب
        if (userData && userData.status !== 'approved' && !(userData.is_guest || userData.id === -1)) {
            const container = document.getElementById('offersList');
            if (container) {
                if (userData.requires_profile_completion || !userData.profile_completion) {
                    container.innerHTML = '<p style="text-align:center; padding:25px; color:var(--danger);"><i class="fas fa-exclamation-triangle"></i> ⚠️ قم برفع الوثائق (صورة الشهادة/الدبلوم وإثبات الهوية) لتحقق من حسابك والوصول الى هذا القسم</p>';
                } else if (userData.status === 'rejected') {
                    container.innerHTML = '<p style="text-align:center; padding:25px; color:var(--danger);"><i class="fas fa-times-circle"></i> ❌ تم رفض طلبك. يرجى إعادة رفع الوثائق والصور للوصول إلى هذا القسم.</p>';
                } else {
                    container.innerHTML = '<p style="text-align:center; padding:25px; color:var(--gold-dark);"><i class="fas fa-clock"></i> حسابك قيد المراجعة. سيتم تفعيل قسم الدروس بعد قبول حسابك من قبل الإدارة.</p>';
                }
            }
            return;
        }
        const container = document.getElementById('offersList');
        if (!silent && container) {
            container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
        }
        try {
            const url = (userData && (userData.is_guest || userData.id === -1)) ? '/api/offers' : `/api/teacher/offers/${teacherId}`;
            const res = await fetchWithAuth(url, { cache: 'no-store' });
            const offers = await res.json();
            renderOffers(offers);
        } catch(e) { if (e.message !== 'انتهت صلاحية الجلسة') { if (!silent) showToast('حدث خطأ', 'error'); const c = document.getElementById('offersList'); if(c && !silent) c.innerHTML = '<p style="text-align:center; padding:25px; color:var(--danger);">حدث خطأ في الاتصال</p>'; } }
    }

    // ================================================================
    // ✅ روس الزملاء (الدروس العامة للماهدة والاطلاع فقط)
    // ================================================================
    let colleagueLessonsData = [];

    async function loadColleagueLessons(silent = false) {
        const grid = document.getElementById('colleagueLessonsGrid');
        if (!grid) return;
        if (!silent) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b;">
                    <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary);"></i>
                    <p style="margin-top: 10px; font-weight: 700;">جاري تحميل دروس الزملاء...</p>
                </div>`;
        }

        try {
            const res = await fetchWithAuth('/api/offers', { cache: 'no-store' });
            if (!res.ok) throw new Error('فشل جلب دروس الزملاء');
            const data = await res.json();
            colleagueLessonsData = Array.isArray(data) ? data : [];
            filterColleagueLessons();
        } catch (err) {
            console.error('Error loading colleague lessons:', err);
            if (grid) {
                grid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 30px; background: white; border-radius: 16px; border: 1px solid #fee2e2;">
                        <i class="fas fa-exclamation-triangle fa-2x" style="color: #ef4444; margin-bottom: 8px;"></i>
                        <p style="color: #991b1b; font-weight: 700;">حدث خطأ أثناء تحميل دروس الزملاء</p>
                        <button onclick="loadColleagueLessons(true)" style="margin-top: 10px; background: #fee2e2; color: #991b1b; border: none; padding: 8px 18px; border-radius: 12px; font-weight: 700; cursor: pointer;">
                            إعادة المحاولة
                        </button>
                    </div>`;
            }
        }
    }

    function filterColleagueLessons() {
        const grid = document.getElementById('colleagueLessonsGrid');
        if (!grid) return;

        const searchText = (document.getElementById('colleagueSearchInput')?.value || '').toLowerCase().trim();
        const levelFilter = document.getElementById('colleagueLevelFilter')?.value || 'all';

        const filtered = colleagueLessonsData.filter(offer => {
            const matchesSearch = !searchText || 
                (offer.subject_name || '').toLowerCase().includes(searchText) ||
                (offer.teacher_name || '').toLowerCase().includes(searchText) ||
                (offer.teacher_specialization || '').toLowerCase().includes(searchText);

            let matchesLevel = true;
            if (levelFilter !== 'all') {
                matchesLevel = offer.education_level === levelFilter || 
                    (levelFilter === 'primary_all' && (offer.education_level || '').startsWith('primary')) ||
                    (levelFilter === 'middle_all' && ((offer.education_level || '').includes('am') || offer.education_level === 'bem' || offer.education_level === 'middle_all')) ||
                    (levelFilter === 'secondary_all' && ((offer.education_level || '').includes('as') || offer.education_level === 'bac' || offer.education_level === 'secondary_all')) ||
                    (levelFilter === 'university' && ((offer.education_level || '').includes('uni') || offer.education_level === 'university' || offer.education_level === 'master' || offer.education_level === 'doctorat'));
            }

            return matchesSearch && matchesLevel;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: white; border-radius: 16px; border: 1px dashed #cbd5e1;">
                    <i class="fas fa-graduation-cap" style="font-size: 3rem; color: #94a3b8; margin-bottom: 12px;"></i>
                    <h4 style="font-weight: 800; color: #334155; margin-bottom: 6px;">لا توجد دروس مطابقة للمعايير حالياً</h4>
                    <p style="color: #64748b; font-size: 0.9rem;">سيتم عرض الدروس والحصص المباشرة للزملاء فور نشرها على المنصة.</p>
                </div>`;
            return;
        }

        const levelMap = {
            'primary_all': 'جميع مستويات الابتدائي',
            'primary_1': 'السنة الأولى ابتدائي',
            'primary_2': 'السنة الثانية ابتدائي',
            'primary_3': 'السنة الثالثة ابتدائي',
            'primary_4': 'السنة الرابعة ابتدائي',
            'primary_5': 'السنة الخامسة اتدائي',
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
            '3eme_uni': 'ثالثة جامعي (L3)',
            'master': 'ماستر',
            'doctorat': 'دكتوراه',
            'other': 'عام'
        };

        grid.innerHTML = filtered.map(offer => {
            const isOwnOffer = userData && offer.teacher_id === userData.id;
            const levelLabel = levelMap[offer.education_level] || offer.education_level || 'عام';
            const priceText = (offer.is_free || parseFloat(offer.price || 0) === 0) ? 'مجاني' : `${offer.price} دج`;
            const formattedDate = offer.offer_date ? new Date(offer.offer_date).toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'تاريخ غير محدد';
            
            const isLive = offer.status === 'live' || offer.stream_active === true;

            return `
                <div style="background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.03); transition: transform 0.2s, box-shadow 0.2s; display: flex; flex-direction: column;">
                    <!-- Card Top Banner / Status -->
                    <div style="padding: 12px 16px; background: ${isLive ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)'}; color: white; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 800; font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
                            ${isLive ? '<i class="fas fa-broadcast-tower fa-spin"></i> مباشر الآن' : '<i class="fas fa-clock"></i> درس قادم'}
                        </span>
                        <span style="background: rgba(255,255,255,0.22); padding: 3px 10px; border-radius: 20px; font-weight: 800; font-size: 0.8rem;">
                            ${escapeHtml(priceText)}
                        </span>
                    </div>

                    <!-- Teacher Info Bar -->
                    <div style="padding: 14px 16px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 12px; cursor: pointer; background: #fafafa;" onclick="showTeacherProfileFromPost(${offer.teacher_id})">
                        <img src="${escapeHtml(offer.teacher_profile_image || '/images/default-avatar.svg')}" alt="صورة الأستاذ" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary);" onerror="this.src='/images/default-avatar.svg'">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 800; font-size: 0.95rem; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px;">
                                ${escapeHtml(offer.teacher_name || 'أستاذ')}
                                ${isOwnOffer ? '<span style="background: #dbeafe; color: #1e40af; font-size: 0.7rem; padding: 1px 6px; border-radius: 8px;">(أنت)</span>' : ''}
                            </div>
                            <div style="font-size: 0.8rem; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${escapeHtml(offer.teacher_specialization || 'أستاذ المحتوى')}
                            </div>
                        </div>
                        <i class="fas fa-chevron-left" style="color: #cbd5e1; font-size: 0.85rem;"></i>
                    </div>

                    <!-- Lesson Body -->
                    <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 12px;">
                        <div>
                            <h4 style="font-weight: 800; font-size: 1.05rem; color: #0f172a; margin-bottom: 8px; line-height: 1.4;">
                                ${escapeHtml(offer.subject_name || 'عنوان الدرس')}
                            </h4>
                            
                            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; color: #475569;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-layer-group" style="color: var(--primary); width: 16px;"></i>
                                    <span>المستوى: <strong>${escapeHtml(levelLabel)}</strong></span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-calendar-alt" style="color: var(--primary); width: 16px;"></i>
                                    <span>التاريخ: ${escapeHtml(formattedDate)}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-hourglass-half" style="color: var(--primary); width: 16px;"></i>
                                    <span>المدة: ${offer.duration || 60} دقيقة</span>
                                </div>
                            </div>
                        </div>

                        <!-- Read Only Action Notice (No Booking Allowed for Teachers) -->
                        <div style="margin-top: 10px; border-top: 1px dashed #e2e8f0; padding-top: 12px;">
                            <button style="width: 100%; background: #f8fafc; color: #64748b; border: 1px solid #cbd5e1; border-radius: 12px; padding: 10px; font-weight: 700; font-size: 0.82rem; cursor: not-allowed; display: flex; align-items: center; justify-content: center; gap: 8px;" disabled title="لا يمكن للأستاذ حجز درس أستاذ آخر">
                                <i class="fas fa-eye"></i> للمشاهدة والاطلاع فقط (لا يمكن الحجز)
                            </button>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }

    function renderOffers(offers) {
        const container = document.getElementById('offersList');
        if (!container) return;
        if (!Array.isArray(offers)) {
            container.innerHTML = `<p style="text-align:center; padding:25px; color:var(--danger);">${escapeHtml(offers && offers.error ? offers.error : 'حدث خطأ في تحميل الدروس')}</p>`;
            return;
        }
        
        const isGuestUser = userData && (userData.is_guest || userData.id === -1);
        if (offers.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; background: white; border-radius: 16px; border: 2px dashed #cbd5e1; margin: 10px 0;">
                    <i class="fas fa-chalkboard-teacher" style="font-size: 3.2rem; color: var(--primary); margin-bottom: 14px;"></i>
                    <h3 style="font-weight: 800; font-size: 1.15rem; color: #1e293b; margin-bottom: 8px;">ابدأ في إنشاء لغرف الخاصة بك وشاركها مع طلابك للانضمام</h3>
                    <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 18px;">لم تقم بإنشاء أي غرفة فيديو بعد. اضغط على الزر أدناه لإضافة أول غرفة لطلابك.</p>
                    <button class="btn-primary" onclick="showCreateOfferModal()" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 22px; border-radius: 25px; font-weight: 800; font-size: 0.95rem; margin: 0 auto;">
                        <i class="fas fa-video"></i> إنشاء لايف ZoomDz
                    </button>
                </div>`;
            return;
        }

        const now = new Date();
        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">';
        
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
            'other': 'مستوى آخر / عام'
        };

        function parseAlgeriaDate(dateStr) {
            if (!dateStr) return null;
            if (typeof dateStr === 'string') {
                const trimmed = dateStr.trim();
                if (trimmed.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(trimmed)) {
                    return new Date(trimmed);
                }
                const iso = trimmed.replace(' ', 'T');
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

        for (const offer of offers) {
            let schedule = [];
            if (Array.isArray(offer.sessions_schedule)) {
                schedule = offer.sessions_schedule;
            } else if (typeof offer.sessions_schedule === 'string') {
                try { schedule = JSON.parse(offer.sessions_schedule); } catch(e) { schedule = []; }
            }
            const scheduleLength = Array.isArray(schedule) ? schedule.length : 0;
            const totalSessions = Math.max(1, Number(offer.total_sessions) || 0, scheduleLength);
            const completedCount = Number(offer.completed_sessions ?? offer.completed_sessions_count ?? 0);

            let targetOfferDate = offer.offer_date;
            if (Array.isArray(schedule) && schedule.length > 0) {
                const nextS = schedule.find(s => s.status !== 'completed' && (s.session_date || s.date)) || schedule[0];
                if (nextS && (nextS.session_date || nextS.date)) {
                    targetOfferDate = nextS.session_date || nextS.date;
                }
            }
            const offerDate = parseAlgeriaDate(targetOfferDate) || new Date();
            const durationMs = (offer.duration_minutes || offer.session_duration || offer.duration || 60) * 60 * 1000;
            const isFinished = completedCount >= totalSessions;
            const isMultiSessionRemaining = totalSessions > 1 && completedCount < totalSessions;

            const isExpired = (offerDate.getTime() + durationMs) < now.getTime() && 
                              offer.status !== 'live' && 
                              offer.status !== 'teacher_ready' && 
                              offer.status !== 'paused' && 
                              !isMultiSessionRemaining;

            const isExplicitlyTerminated = ['completed', 'cancelled'].includes(offer.status) || (!!offer.completed_at && !isMultiSessionRemaining) || !!offer.force_ended_at || offer.terminated === true;
            const isTerminated = isExplicitlyTerminated || isExpired || isFinished;

            let statusText = '', statusClass = '';
            if (isFinished) { statusText = '✅ منتهية بالكامل'; statusClass = 'status-completed'; }
            else if (offer.status === 'upcoming' && !isExpired) { statusText = '⏳ قادم'; statusClass = 'status-upcoming'; }
            else if (offer.status === 'teacher_ready') { statusText = '🎥 جاهز للبث'; statusClass = 'status-teacher-ready'; }
            else if (offer.status === 'live') { statusText = '🔴 بث مباشر'; statusClass = 'status-live'; }
            else if (offer.status === 'paused') { statusText = '⏸ متوقف مؤقتاً'; statusClass = 'status-teacher-ready'; }
            else if (isTerminated) { statusText = '✅ منتهية'; statusClass = 'status-completed'; }
            else { statusText = '⏳ قادم'; statusClass = 'status-upcoming'; }

            const levelName = levelMap[offer.education_level] || offer.education_level || 'غير محدد';

            const planType = (offer.plan_type && offer.plan_type !== 'null' && offer.plan_type !== 'undefined')
                ? String(offer.plan_type)
                : (totalSessions > 1 ? '1_month' : '1_day');
            const completedSessions = completedCount;

            const planMap = {
                '1_day': 'حصة واحدة',
                '1_month': 'اشتراك شهري',
                '3_months': 'اشتراك 3 أشهر',
                '6_months': 'اشتراك 6 أشهر'
            };
            const planBadge = planType === '1_day' 
                ? '<span style="background:#eff6ff; color:#1d4ed8; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:700; border:1px solid #bfdbfe;"><i class="fas fa-sun"></i> حصة واحدة</span>'
                : `<span style="background:#fdf4ff; color:#9333ea; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:700; border:1px solid #f0abfc;"><i class="fas fa-layer-group"></i> ${planMap[planType] || planType} - ${totalSessions} حصص</span>`;

            const sessionNumberDisplay = (offer.session_number || offer.completed_sessions_count || 0) + 1;
            const completedDisplay = offer.completed_sessions ?? offer.completed_sessions_count ?? 0;
            const currentSessionNum = Math.min(completedCount + 1, totalSessions);
            const currentSessionBadge = totalSessions > 1 ? `الحصة ${currentSessionNum} من ${totalSessions}` : `الحصة ${currentSessionNum}`;

            html += `
                <div class="offer-card" id="offer-card-${offer.id}" style="background: white; border-radius: 12px; padding: 16px; box-shadow: var(--shadow); border: 1px solid var(--gray-200); display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 4px;">
                            <span style="font-weight: 800; font-size: 1.05rem; color: var(--gray-800);">${escapeHtml(offer.subject_name)}</span>
                            <div>${planBadge} <span class="${statusClass}" style="padding: 4px 8px; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">${statusText}</span></div>
                        </div>

                        <div class="offer-info" style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 5px;"><i class="fas fa-calendar-alt"></i> موعد الحصة: ${formatOfferDateTime(targetOfferDate)}</div>
                        <div class="offer-info" style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 5px;"><i class="fas fa-clock"></i> مدة الحصة: ${offer.duration_minutes || offer.session_duration || offer.duration || 60} دقيقة</div>
                        <div class="offer-info" style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 5px;"><i class="fas fa-layer-group"></i> الخطة: ${escapeHtml(planMap[planType] || planType)} | الإجمالي: ${totalSessions} حصص</div>
                        <div class="offer-info" style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 5px;"><i class="fas fa-list-ol"></i> رقم الحصة: ${sessionNumberDisplay} | المكتملة: ${completedDisplay}</div>
                        <div class="offer-info" style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 5px;"><i class="fas fa-stopwatch"></i> المدة الفعلية: ${offer.actual_duration || 0} ثانية</div>
                        <div class="offer-info" style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 5px;"><i class="fas fa-video"></i> حالة البث: ${offer.stream_active ? '<span style="color:green">نشط</span>' : '<span style="color:red">غير نشط</span>'}</div>
                        <div class="offer-info" style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 5px;"><i class="fas fa-circle-info"></i> الحالة: ${escapeHtml(offer.status || 'upcoming')}</div>
                        <div class="offer-info" style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 5px;"><i class="fas fa-graduation-cap"></i> المستوى: ${escapeHtml(levelName)}</div>
                        <div class="offer-info" style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 5px;"><i class="fas fa-money-bill-wave"></i> السعر: ${offer.is_free ? '<span style="color:#10b981; font-weight:800;"><i class="fas fa-gift"></i> مجاني (بث تفاعلي مؤتمت)</span>' : (offer.price_per_session || offer.price || 0) + ' دج'}</div>
                        ${offer.is_free ? (() => {
                            const roomLink = '/live-room.html?room=offer_' + offer.id + '&role=teacher';
                            return `
                            <div style="background:#eff6ff; border:1.5px solid #bfdbfe; border-radius:10px; padding:10px 12px; margin: 8px 0; font-size:0.82rem; color:#1e40af;">
                                <div style="font-weight:800; display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; flex-wrap:wrap; gap:4px;">
                                    <span><i class="fas fa-video" style="color:#2563eb;"></i> غرفة البث المدمجة (أنت المضيف):</span>
                                    <button onclick="navigator.clipboard.writeText('${roomLink}'); showToast('تم نسخ الرابط بنجاح!', 'success');" style="background:#2563eb; color:white; border:none; padding:3px 8px; border-radius:4px; font-size:0.72rem; font-weight:700; cursor:pointer;" title="نسخ رابط الغرفة">نسخ الرابط</button>
                                </div>
                                <div style="font-size:0.75rem; color:#2563eb; word-break:break-all; background:white; padding:5px 8px; border-radius:6px; border:1px solid #dbeafe;">
                                    <a href="${roomLink}" target="_blank" style="color:#2563eb; font-weight:700; text-decoration:none;"><i class="fas fa-link"></i> ${roomLink}</a>
                                </div>
                            </div>
                            `;
                        })() : ''}
                        
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; margin: 8px 0; font-size:0.8rem;">
                            <div style="font-weight:700; color:#334155; margin-bottom:4px;">
                                <span>حالة الحصص:</span>
                                <span style="color:#2563eb;">${completedCount} من ${totalSessions} حصص مكتملة</span>
                            </div>
                            <div style="font-size: 0.75rem; color: var(--gray-600); margin-top: 5px;">
                                <span>رقم الحصة التي انتهت: <strong>${completedCount}</strong></span> |
                                <span>رقم الحصة القادمة: <strong>${completedCount < totalSessions ? completedCount + 1 : 'لا يوجد'}</strong></span>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; border-top: 1px solid var(--gray-100); padding-top: 10px;">
                        ${totalSessions > 1 ? `
                            <button onclick="openOfferSessionsModal(${offer.id})" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:7px 12px; border-radius:8px; font-size:0.82rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                                <i class="fas fa-calendar-days" style="color:#2563eb;"></i> جدول الحصص والمستحقات المعلقة
                            </button>
                        ` : ''}

                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            <button onclick="shareOffer(${offer.id})" style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: bold; display: inline-flex; align-items: center; gap: 4px;" title="مشاركة الدرس"><i class="fas fa-share-alt"></i> مشاركة</button>
                            <button onclick="viewOfferStudents(${offer.id}, '${escapeHtml(offer.subject_name)}')" style="background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: bold; display: inline-flex; align-items: center; gap: 4px;" title="عرض الطلاب المسجلين"><i class="fas fa-users"></i> الطلاب (${offer.current_students || offer.booked_count || 0})</button>
                            ${isGuestUser ? `
                                <span style="flex: 1; text-align: center; font-size: 0.78rem; color: var(--gray-500); padding: 6px; background: var(--gray-50); border-radius: 6px;"><i class="fas fa-lock"></i> عرض فقط (حساب زائر)</span>
                            ` : `
                                ${!isTerminated && offer.status !== 'live' && offer.status !== 'teacher_ready' && offer.status !== 'paused' && offer.stream_active !== true ? `
                                    <button onclick="startStreamNow(${offer.id}, ${currentSessionNum})" style="flex: 1; min-width: 140px; background: var(--primary); color: white; border: none; padding: 7px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: bold; display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 5px rgba(37,99,235,0.25);" title="بدء بث ${currentSessionBadge}">
                                        <i class="fas fa-video"></i>
                                        <span>بدء البث</span>
                                        <span style="background: rgba(255, 255, 255, 0.22); padding: 1px 7px; border-radius: 10px; font-size: 0.73rem; font-weight: 800; border: 1px solid rgba(255,255,255,0.35); white-space: nowrap;">${currentSessionBadge}</span>
                                    </button>
                                ` : ''}
                                ${!isTerminated && (['live', 'teacher_ready', 'paused'].includes(offer.status) || offer.stream_active === true) ? `
                                    <button onclick="joinTeacherStream(${offer.id})" style="flex: 1; min-width: 140px; background: #10b981; color: white; border: none; padding: 7px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: bold; display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 5px rgba(16,185,129,0.25);" title="فتح بث ${currentSessionBadge}">
                                        <i class="fas fa-play"></i>
                                        <span>فتح البث</span>
                                        <span style="background: rgba(255, 255, 255, 0.22); padding: 1px 7px; border-radius: 10px; font-size: 0.73rem; font-weight: 800; border: 1px solid rgba(255,255,255,0.35); white-space: nowrap;">${currentSessionBadge}</span>
                                    </button>
                                    <button onclick="endStreamManual(${offer.id})" style="flex: 1; background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: bold;"><i class="fas fa-stop"></i> إنهاء البث المباشر</button>
                                ` : ''}
                                ${!isTerminated && offer.status !== 'completed' ? `
                                    <button onclick="openEditOfferDateModal(${offer.id}, 1, '${offer.offer_date || ''}')" style="background: #0d9488; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 0.8rem; cursor: pointer;" title="تعديل موعد البث"><i class="fas fa-calendar-days"></i> تعديل</button>
                                ` : ''}
                                <button onclick="deleteOffer(${offer.id})" style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 0.8rem; cursor: pointer;" title="حذف الدرس"><i class="fas fa-trash"></i></button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;
    }

    async function openOfferSessionsModal(offerId) {
        if (checkGuestAction()) return;
        const modal = document.getElementById('viewOfferSessionsModal');
        const headerEl = document.getElementById('sessionsModalHeaderInfo');
        const listEl = document.getElementById('sessionsModalList');
        if (!modal || !headerEl || !listEl) return;

        modal.style.display = 'block';
        document.getElementById('modalOverlay').style.display = 'block';
        headerEl.innerHTML = '<div style="text-align:center; color:#64748b;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل بيانات الحصص والمستحقات...</div>';
        listEl.innerHTML = '';

        try {
            const res = await fetchWithAuth(`/api/offer/${offerId}/sessions`);
            const data = await res.json();
            if (!data.success) {
                headerEl.innerHTML = `<div style="color:#ef4444;">❌ ${data.error || 'تعذر تحميل بيانات الحصص'}</div>`;
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

            const planType = (offer.plan_type && offer.plan_type !== 'null' && offer.plan_type !== 'undefined') ? offer.plan_type : (sessions.length > 1 ? '1_month' : '1_day');
            const pricePerSession = offer.price_per_session || offer.price || 0;
            const completedCount = Number(offer.completed_sessions_count ?? offer.completed_sessions ?? 0);
            const planMapModal = {
                '1_day': 'حصة واحدة',
                '1_month': 'اشتراك شهري',
                '3_months': 'اشتراك 3 أشهر',
                '6_months': 'اشتراك 6 أشهر'
            };

            headerEl.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <h4 style="margin:0 0 4px 0; font-size:1.05rem; color:#1e293b; font-weight:800;">${escapeHtml(offer.subject_name)}</h4>
                        <div style="font-size:0.8rem; color:#64748b;">نوع الخطة: <strong>${escapeHtml(planMapModal[planType] || planType)}</strong> (${sessions.length} حصص) | سعر الحصة: <strong>${pricePerSession} دج</strong></div>
                    </div>
                    <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:6px 12px; border-radius:8px; text-align:center;">
                        <div style="font-size:0.72rem; color:#065f46;">الحصص المكتملة:</div>
                        <div style="font-weight:800; color:#047857; font-size:1rem;">${completedCount} / ${sessions.length}</div>
                    </div>
                </div>
            `;

            if (sessions.length === 0) {
                listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">لا توجد حصص مبرمجة</div>';
                return;
            }

            let sHtml = '';
            sessions.forEach(s => {
                const formattedDate = formatOfferDateTime(s.session_date);
                const isCompleted = s.status === 'completed' || s.is_completed || s.session_number <= completedCount;
                const isLive = s.status === 'live';

                sHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:${isCompleted ? '#f0fdf4' : '#ffffff'}; border:1.5px solid ${isCompleted ? '#bbf7d0' : '#e2e8f0'}; border-radius:10px; flex-wrap:wrap; gap:8px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:32px; height:32px; border-radius:50%; background:${isCompleted ? '#15803d' : '#2563eb'}; color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem;">
                                ${isCompleted ? '<i class="fas fa-check"></i>' : s.session_number}
                            </div>
                            <div>
                                <div style="font-weight:800; color:#1e293b; font-size:0.9rem;">الحصة رقم ${s.session_number}</div>
                                <div style="font-size:0.78rem; color:#64748b;"><i class="fas fa-calendar-alt"></i> ${formattedDate} (${s.duration || 60} دقيقة)</div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${!isCompleted ? `
                                <button onclick="openEditOfferDateModal(${offer.id}, ${s.session_number}, '${s.session_date || ''}')" style="background:#0d9488; color:white; border:none; padding:5px 10px; border-radius:6px; font-size:0.75rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; margin-left: 8px;">
                                    <i class="fas fa-calendar-days"></i> تعديل الموعد
                                </button>
                            ` : ''}
                            ${isCompleted ? `
                                <span style="background:#dcfce7; color:#166534; font-weight:700; padding:4px 10px; border-radius:6px; font-size:0.75rem; border:1px solid #86efac;">
                                    <i class="fas fa-check-double"></i> مكتملة ومحررة
                                </span>
                            ` : `
                                <span style="background:#eff6ff; color:#1e40af; font-weight:700; padding:4px 10px; border-radius:6px; font-size:0.75rem; border:1px solid #bfdbfe;">
                                    <i class="fas fa-clock"></i> في الانتظار (معلقة)
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
    window.openOfferSessionsModal = openOfferSessionsModal;

    function closeOfferSessionsModal() {
        const modal = document.getElementById('viewOfferSessionsModal');
        if (modal) modal.style.display = 'none';
        document.getElementById('modalOverlay').style.display = 'none';
    }
    window.closeOfferSessionsModal = closeOfferSessionsModal;

    function openEditOfferDateModal(offerId, sessionNumber, currentDateStr) {
        if (checkGuestAction()) return;
        const modal = document.getElementById('editOfferDateModal');
        const offerIdInput = document.getElementById('editOfferId');
        const sessionNumberInput = document.getElementById('editSessionNumber');
        const dateInput = document.getElementById('editOfferDateInput');
        
        if (!modal || !offerIdInput || !sessionNumberInput || !dateInput) return;
        
        offerIdInput.value = offerId;
        sessionNumberInput.value = sessionNumber || 1;
        
        // تحضير قيمة التاريخ والوقت لـ datetime-local
        let dtVal = '';
        if (currentDateStr) {
            const d = new Date(currentDateStr);
            if (!isNaN(d.getTime())) {
                // ضبط التوقيت المحلي ليتطابق مع حقل الإدخال بدقة
                const tzOffset = d.getTimezoneOffset() * 60000; // بالفارق الميلي ثانية
                const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
                dtVal = localISOTime;
            }
        }
        dateInput.value = dtVal;
        
        modal.style.display = 'block';
        document.getElementById('modalOverlay').style.display = 'block';
    }
    window.openEditOfferDateModal = openEditOfferDateModal;

    function closeEditOfferDateModal() {
        const modal = document.getElementById('editOfferDateModal');
        if (modal) modal.style.display = 'none';
        
        // لا نريد إخفاء الـ overlay إذا كان مودال الحصص لا يزال مفتوحاً
        const sessionsModal = document.getElementById('viewOfferSessionsModal');
        if (!sessionsModal || sessionsModal.style.display !== 'block') {
            document.getElementById('modalOverlay').style.display = 'none';
        }
    }
    window.closeEditOfferDateModal = closeEditOfferDateModal;

    async function submitEditOfferDate(event) {
        event.preventDefault();
        const offerId = document.getElementById('editOfferId').value;
        const sessionNumber = document.getElementById('editSessionNumber').value || 1;
        const sessionDate = document.getElementById('editOfferDateInput').value;
        
        if (!offerId || !sessionDate) {
            showToast('الرجاء إدخال موعد صحيح', 'danger');
            return;
        }
        
        try {
            const btn = event.target.querySelector('button[type="submit"]');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
            btn.disabled = true;
            
            const res = await fetchWithAuth(`/api/offer/${offerId}/session/${sessionNumber}/date`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ session_date: sessionDate })
            });
            
            const data = await res.json();
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            
            if (data.success) {
                showToast(data.message || 'تم تحديث موعد الحصة بنجاح!', 'success');
                closeEditOfferDateModal();
                
                // إذا كان مودال الحصص مفتوحاً، نعيد تحميله لتحديث المواعيد بداخله
                const sessionsModal = document.getElementById('viewOfferSessionsModal');
                if (sessionsModal && sessionsModal.style.display === 'block') {
                    openOfferSessionsModal(offerId);
                }
                
                // إعادة تحميل الدروس على الصفحة الرئيسية
                if (typeof loadTeacherOffers === 'function') {
                    loadTeacherOffers();
                }
            } else {
                showToast(data.error || 'فشل تحديث موعد الحصة', 'danger');
            }
        } catch (err) {
            showToast('حدث خطأ في الاتصال بالخادم: ' + err.message, 'danger');
        }
    }
    window.submitEditOfferDate = submitEditOfferDate;

    async function viewOfferStudents(offerId, subjectName) {
        if (checkGuestAction()) return;
        const modal = document.getElementById('viewOfferStudentsModal');
        const headerEl = document.getElementById('offerStudentsModalHeader');
        const listEl = document.getElementById('offerStudentsModalList');
        if (!modal || !headerEl || !listEl) return;

        modal.style.display = 'block';
        document.getElementById('modalOverlay').style.display = 'block';
        headerEl.innerHTML = `<div style="text-align:center; color:#64748b;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل قائمة الطلاب المسجلين...</div>`;
        listEl.innerHTML = '';

        try {
            const res = await fetchWithAuth(`/api/offer/${offerId}/students`);
            const data = await res.json();
            if (!data.success) {
                headerEl.innerHTML = `<div style="color:#ef4444; font-weight:bold;">❌ ${data.error || 'تعذر جلب قائمة الطلاب'}</div>`;
                return;
            }

            const students = data.students || [];
            headerEl.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <h4 style="margin:0; font-size:1.05rem; color:#1e293b; font-weight:800;">📚 ${escapeHtml(data.offer.subject_name)}</h4>
                        <p style="margin:4px 0 0 0; font-size:0.85rem; color:#64748b;">إجمالي الحجوزات المؤكدة: <strong>${students.length} طالب</strong></p>
                    </div>
                </div>
            `;

            if (students.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align:center; padding:30px 10px; color:#64748b; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">
                        <i class="fas fa-user-slash" style="font-size:2rem; color:#94a3b8; margin-bottom:10px;"></i>
                        <p style="margin:0; font-size:0.9rem; font-weight:600;">لا يوجد أي طلاب قاموا بحجز هذا الدرس بعد.</p>
                    </div>
                `;
                return;
            }

            let html = '';
            students.forEach(s => {
                const bookedDate = s.booked_at ? new Date(s.booked_at).toLocaleString('ar-DZ', { dateStyle: 'medium',
                    timeStyle: 'short'
                }) : 'غير محدد';

                html += `
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <div style="width:42px; height:42px; border-radius:50%; background:#e0e7ff; color:#3730a3; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:1.1rem; overflow:hidden;">
                                    ${s.profile_image ? `<img src="${s.profile_image}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas fa-user-graduate"></i>`}
                                </div>
                                <div>
                                    <h5 style="margin:0; font-size:0.95rem; color:#0f172a; font-weight:800;">${escapeHtml(s.student_name)}</h5>
                                    <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">
                                        <span><i class="fas fa-graduation-cap"></i> ${escapeHtml(s.student_education_level)}</span>
                                        <span style="margin:0 6px;">•</span>
                                        <span><i class="fas fa-phone"></i> ${escapeHtml(s.student_phone)}</span>
                                    </div>
                                </div>
                            </div>
                            <div style="text-align:left; display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
                                <span style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:700;">
                                    <i class="fas fa-check-circle"></i> مبلغ الحجز الصافي: ${s.base_amount || s.payment_amount} دج
                                </span>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:8px 12px; border-radius:8px; font-size:0.8rem; color:#475569; flex-wrap:wrap; gap:8px;">
                            <span><i class="fas fa-clock"></i> تاريخ الحجز: ${bookedDate}</span>
                            ${s.refundable_amount > 0 ? `
                                <button onclick="cancelStudentBookingByTeacher(${s.session_id}, ${offerId}, '${escapeHtml(s.student_name)}', ${s.base_amount || s.payment_amount})" style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:5px 10px; border-radius:6px; font-size:0.78rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.2s;">
                                    <i class="fas fa-user-xmark"></i> إلغاء الحجز واسترداد (${s.base_amount || s.payment_amount} دج)
                                </button>
                            ` : `
                                <span style="background:#fee2e2; color:#991b1b; padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:700; border:1px solid #fca5a5; display:inline-flex; align-items:center; gap:4px;" title="لا يمكن إلغاء الحجز بعد بدء الحصص أو حضور الطالب لأي حصة">
                                    <i class="fas fa-ban"></i> لا يمكن الإلغاء (بدأت الحصص)
                                </span>
                            `}
                        </div>
                    </div>
                `;
            });

            listEl.innerHTML = html;
        } catch (err) {
            headerEl.innerHTML = `<div style="color:#ef4444; font-weight:bold;">❌ حدث خطأ في الاتصال بالسيرفر</div>`;
        }
    }
    window.viewOfferStudents = viewOfferStudents;

    function closeOfferStudentsModal() {
        const modal = document.getElementById('viewOfferStudentsModal');
        if (modal) modal.style.display = 'none';
        document.getElementById('modalOverlay').style.display = 'none';
    }
    window.closeOfferStudentsModal = closeOfferStudentsModal;

    async function cancelStudentBookingByTeacher(sessionId, offerId, studentName, refundableAmount) {
        if (checkGuestAction()) return;
        
        const confirmMsg = `هل أنت متأكد من إلغاء حجز الطالب "${studentName}"؟\n\nسيتم استرداد مبلغ الحجز بالكامل وهو ${refundableAmount} دج تلقائياً لحساب الطالب (بدون رسوم المنصة) وإلغاء تسجيله من هذا الدرس.\n\nهل تريد تأكيد الإلغاء؟`;
        if (!confirm(confirmMsg)) return;

        try {
            showToast('⏳ جاري إلغاء الحجز ومعالجة استرداد المبلغ...', 'info');
            const res = await fetchWithAuth('/api/booking/teacher-cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId })
            });

            const data = await res.json();
            if (data.success) {
                showToast('✅ ' + (data.message || 'تم إلغاء الحجز وإعادة المبلغ للطالب بنجاح'), 'success');
                viewOfferStudents(offerId, '');
                if (typeof loadTeacherOffers === 'function') loadTeacherOffers();
            } else {
                showToast('❌ ' + (data.error || 'تعذر إلغاء الحجز'), 'error');
            }
        } catch (err) {
            showToast('❌ حدث خطأ غير متوقع أثناء إلغاء الحجز', 'error');
        }
    }
    window.cancelStudentBookingByTeacher = cancelStudentBookingByTeacher;

    async function completeSessionEscrow(offerId, sessionNumber) {
        if (checkGuestAction()) return;
        if (!confirm(`هل أنت متأكد من تأكيد إتمام الحصة رقم (${sessionNumber}) وتحرير مستحقاتها المالية من الرصيد المعلق؟`)) return;

        try {
            showToast('⏳ جاري تحرير مستحقات الحصة...', 'info');
            const res = await fetchWithAuth('/api/teacher/complete-session-escrow', {
                method: 'POST',
                body: JSON.stringify({ offer_id: offerId, session_number: sessionNumber })
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message || '✅ تم تحرير مستحقات الحصة بنجاح', 'success');
                openOfferSessionsModal(offerId);
                loadWallet();
                loadOffers();
            } else {
                showToast(data.error || '❌ تعذر تحرير المستحقات', 'error');
            }
        } catch (err) {
            showToast('❌ حدث خطأ في الاتصال', 'error');
        }
    }
    window.completeSessionEscrow = completeSessionEscrow;

    // ============================================================
    // ✅ بدء البث المباشر (غرفة WebRTC مدمجة داخل المنصة — بدون Zoom أو Google Meet)
    // ============================================================
    async function startStreamNow(offerId, sessionNumber) {
        if (!checkTeacherProfileComplete()) return;
        if (checkGuestAction()) return;

        let confirmMsg = "⚠️ هل تريد بدء البث المباشر لهذه الغرفة الآن؟";
        if (sessionNumber) {
            confirmMsg = `⚠️ أنت على وشك بدء البث المباشر للحصة الحالية (رقم ${sessionNumber}).\nهل أنت متأكد من بدء البث المباشر لهذه الحصة الآن؟`;
        }
        
        const shouldStart = confirm(confirmMsg);
        if (!shouldStart) return;

        try {
            showToast('⏳ جاري تجهيز غرفة البث المباشر وإشعار الطلاب...', 'info');
            const res = await fetchWithAuth('/api/stream/start-zoom-stream', {
                method: 'POST',
                body: JSON.stringify({ offer_id: offerId })
            });
            const data = await res.json();
            if (data.success) {
                if (data.is_free || data.stream_platform === 'webrtc' || data.stream_platform === 'zoom' || data.stream_platform === 'google_meet' || data.meet_url || data.zoom_url) {
                    let roomUrl = data.zoom_url
                        || (data.meet_url && (data.meet_url.includes('live-room.html') || data.meet_url.includes('zoom.us') || data.meet_url.includes('zoom.com') || (data.meet_url.includes('meet.google.com') && !data.meet_url.includes('jit.si'))) ? data.meet_url : null)
                        || (data.stream_url && (data.stream_url.includes('live-room.html') || data.stream_url.includes('zoom.us') || data.stream_url.includes('zoom.com') || (data.stream_url.includes('meet.google.com') && !data.stream_url.includes('jit.si'))) ? data.stream_url : null)
                        || data.room_url
                        || ('/live-room.html?room=offer_' + offerId + '&role=teacher');
                    if (roomUrl && roomUrl.includes('live-room.html') && roomUrl.indexOf('role=') === -1) {
                        roomUrl += (roomUrl.includes('?') ? '&' : '?') + 'role=teacher';
                    }
                    showToast('🎉 تم إطلاق البث المباشر وإشعار جميع الطلاب بغرفة البث!', 'success');
                    try {
                        const newWindow = window.open(roomUrl, '_blank');
                        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                            window.location.href = roomUrl;
                        }
                    } catch(e) {
                        window.location.href = roomUrl;
                    }
                    setTimeout(() => loadOffers(), 1500);
                    return;
                }

                showToast(`✅ تم فتح شاشة البث (الحصة رقم ${sessionNumber || 1}) بنجاح! اضغط على "👈 انقر هنا لإدخال الطلاب وبدء البث" لإتاحة الحضور للطلاب.`, 'success');
                
                const token = localStorage.getItem('token');
                const teacherRoomUrl = `/api/teacher-zoom/${offerId}?token=${encodeURIComponent(token)}`;
                try {
                    const newWindow = window.open(teacherRoomUrl, '_blank');
                    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                        window.location.href = teacherRoomUrl;
                    }
                } catch(e) {
                    window.location.href = teacherRoomUrl;
                }
                setTimeout(() => loadOffers(), 1500);
            } else {
                showToast(data.error || '❌ حدث خطأ في بدء البث', 'error');
            }
        } catch (e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('❌ حدث خطأ في الاتصال', 'error');
            }
        }
    }

    async function joinTeacherStream(offerId) {
        if (checkGuestAction()) return;
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                showToast('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
                return;
            }
            try {
                const res = await fetchWithAuth(`/api/offer/${offerId}`);
                const offer = await res.json();
                if (offer && (offer.is_free || offer.stream_platform === 'webrtc' || offer.stream_platform === 'zoom' || offer.stream_platform === 'google_meet' || (offer.meet_url && (offer.meet_url.includes('meet.google.com') || offer.meet_url.includes('zoom.us') || offer.meet_url.includes('zoom.com') || offer.meet_url.includes('live-room.html'))))) {
                    let meetUrl = offer.meet_url || offer.stream_url || ('/live-room.html?room=offer_' + offerId + '&role=teacher');
                    if (meetUrl.includes('live-room.html') && meetUrl.indexOf('role=') === -1) {
                        meetUrl += (meetUrl.includes('?') ? '&' : '?') + 'role=teacher';
                    }
                    if (meetUrl) {
                        try {
                            const newWindow = window.open(meetUrl, '_blank');
                            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                                window.location.href = meetUrl;
                            }
                        } catch(e) {
                            window.location.href = meetUrl;
                        }
                        return;
                    } else {
                        //  لا يوجد رابط خارجي → غرفة WebRTC المحلية
                        const localRoomUrl = '/live-room.html?room=offer_' + offerId + '&role=teacher';
                        try {
                            const rw = window.open(localRoomUrl, '_blank');
                            if (!rw || rw.closed || typeof rw.closed === 'undefined') {
                                window.location.href = localRoomUrl;
                            }
                        } catch(e) {
                            window.location.href = localRoomUrl;
                        }
                        return;
                    }
                }
            } catch(oErr) {}

            const roomJoinUrl = `/api/teacher-zoom/${offerId}?token=${encodeURIComponent(token)}`;
            try {
                const newWindow = window.open(roomJoinUrl, '_blank');
                if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                    window.location.href = roomJoinUrl;
                }
            } catch(e) {
                window.location.href = roomJoinUrl;
            }
        } catch (e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ أثناء فتح البث', 'error');
            }
        }
    }

    async function endStreamManual(offerId) {
        if (checkGuestAction()) return;
        if (!confirm('⚠️ تأكد أنك أكملت 90% على الأقل من مدة الحصة المحددة لهذه الحصة لتتلقى العائد الخاص بك.\nإذا انتهت الحصة قبل إكمال 90% من وقتها وتم إنهاء البث فلن تتلقى أي عوائد وسيعاد مبلغ هذه الحصة كاملاً إلى الطالب.\n\nهل أنت متأكد من إنهاء البث؟')) return;
        // علبة تدور أثناء معالجة الإنهاء (التسوية تستغرق بضع ثوانٍ) حتى
        // لا يظن الأستاذ أن الموقع تعطّل، ولقفل النقرات المتكررة.
        const endBtn = document.querySelector('button[onclick^="endStreamManual(' + offerId + ')"]');
        const endBtnHtml = endBtn ? endBtn.innerHTML : '';
        if (endBtn) {
            endBtn.disabled = true;
            endBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإنهاء...';
        }
        try {
            const res = await fetchWithAuth(`/api/stream/end/${offerId}`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ تم إنهاء البث وتغيير حالته إلى منتهي بنجاح', 'success');
                await loadOffers();
            } else {
                showToast(data.error || '❌ فشل إنهاء البث', 'error');
            }
        } catch (e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('❌ خطأ في الاتصال بالخادم', 'error');
            }
        } finally {
            if (endBtn) {
                endBtn.disabled = false;
                endBtn.innerHTML = endBtnHtml;
            }
        }
    }

    async function deleteExpiredOffers() {
        if (checkGuestAction()) return;
        const res = await fetchWithAuth(`/api/teacher/offers/${teacherId}`);
        const offers = await res.json();
        // المتصفح يستخدم توقيت الجزائر تلقائياً
        const now = new Date();
        const expiredOffers = offers.filter(o => {
            const offerDate = parseAlgeriaDate(o.offer_date) || new Date(o.offer_date);
            const durationMs = (o.duration || 60) * 60 * 1000;
            return (offerDate.getTime() + durationMs) < now.getTime() && 
                   o.status !== 'live' && 
                   o.status !== 'teacher_ready' && 
                   o.status !== 'paused';
        });

        if (expiredOffers.length === 0) {
            showToast('لا توجد دروس منتهية للحذف', 'warning');
            return;
        }

        if (!confirm(`⚠️ هل نت متأكد من حذف ${expiredOffers.length} درس(دروس) منتهية؟`)) return;

        let deletedCount = 0;
        for (const offer of expiredOffers) {
            try {
                const deleteRes = await fetchWithAuth(`/api/offer/delete/${offer.id}`, {
                    method: 'DELETE',
                    body: JSON.stringify({ teacher_id: teacherId })
                });
                const data = await deleteRes.json();
                if (data.success) deletedCount++;
            } catch(e) { if (e.message !== 'انتهت صلاحية الجلسة') console.log(e); }
        }

        showToast(`✅ تم حذف ${deletedCount} درس منتهٍ`, 'success');
        loadOffers();
    }

    async function deleteOffer(offerId) {
        if (checkGuestAction()) return;
        if (confirm('⚠️ هل أنت متأكد من حذف هذا الدرس؟')) {
            // علبة تدور أثناء الحذف حتى لا يظن الأستاذ أن الموقع تعطّل
            const delBtn = document.querySelector('button[onclick^="deleteOffer(' + offerId + ')"]');
            const delBtnHtml = delBtn ? delBtn.innerHTML : '';
            if (delBtn) {
                delBtn.disabled = true;
                delBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }
            try {
                const res = await fetchWithAuth(`/api/offer/delete/${offerId}`, {
                    method: 'DELETE',
                    body: JSON.stringify({ teacher_id: teacherId })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('تم حذف الدرس', 'success');
                    loadOffers();
                } else {
                    showToast(data.error || 'حدث خطأ أثناء حذف الدرس', 'error');
                }
            } catch (e) {
                if (delBtn) {
                    delBtn.disabled = false;
                    delBtn.innerHTML = delBtnHtml;
                }
                if (e.message !== 'انتهت صلاحية الجلسة') {
                    showToast('تعذر الاتصال بالخادم', 'error');
                }
            }
        }
    }

    // ================================================================
    // CREATE OFFER
    // ================================================================

    window.goToCreateZoomLesson = function() {
        showSection('offers');
        setTimeout(() => {
            showCreateOfferModal();
        }, 150);
    };

    function showCreateOfferModal() {
        if (!checkTeacherProfileComplete()) return;
        if (checkGuestAction()) return;
        if (userData && userData.status !== 'approved') {
            if (userData.requires_profile_completion || !userData.profile_completion) {
                showToast('⚠️ قم برفع الوثائق (صورة الشهادة/الدبلوم وإثبات الهوية) لتحقق من حسابك والوصول الى هذا القسم', 'warning');
            } else if (userData.status === 'rejected') {
                showToast('❌ تم رفض طلبك. يرجى إعادة رفع الوثائق والصور لإضافة دروس.', 'warning');
            } else {
                showToast('⏳ حسابك قيد المراجعة. لا يمكنك إضافة دروس حتى يتم قبول حسابك من الإدارة.', 'warning');
            }
            return;
        }
        if (!userData || !userData.teaching_level) {
            showToast('⚠️ قم بإدخال المستوى الدرسي في ملفك الشخصي أولاً', 'warning');
            showEditProfileModal();
            return;
        }
        document.getElementById('subjectName').value = '';
        document.getElementById('duration').value = '60';
        if (document.getElementById('durationPreset')) document.getElementById('durationPreset').value = '60';
        document.getElementById('offerDate').value = '';
        document.getElementById('isFree').checked = false;
        document.getElementById('price').disabled = false;
        document.getElementById('price').value = '250';
        document.getElementById('educationLevel').value = '';
        document.getElementById('otherLevelText').value = '';
        document.getElementById('otherLevelGroup').style.display = 'none';
        if (document.getElementById('totalSessions')) document.getElementById('totalSessions').value = '1';
        selectOfferPlan('1_day');
        calculatePlanCosts();
        document.getElementById('modalOverlay').style.display = 'block';
        document.getElementById('createOfferModal').style.display = 'block';
    }

    function applyDurationPreset(val) {
        const durationInput = document.getElementById('duration');
        if (val !== 'custom' && durationInput) {
            durationInput.value = val;
            validateOfferLimits();
        }
    }

    function syncDurationPreset() {
        const durationInput = document.getElementById('duration');
        const durationPreset = document.getElementById('durationPreset');
        if (!durationInput || !durationPreset) return;
        const val = durationInput.value;
        const matchingOption = Array.from(durationPreset.options).find(opt => opt.value === val);
        if (matchingOption) {
            durationPreset.value = val;
        } else {
            durationPreset.value = 'custom';
        }
    }

    window.applyDurationPreset = applyDurationPreset;
    window.syncDurationPreset = syncDurationPreset;

    function selectOfferPlan(planType) {
        document.getElementById('selectedPlanType').value = planType;
        ['1_day', '1_month', '3_months', '6_months'].forEach(pt => {
            const btn = document.getElementById('planBtn_' + pt);
            if (btn) {
                if (pt === planType) {
                    btn.style.borderColor = '#2563eb';
                    btn.style.background = '#eff6ff';
                    btn.style.color = '#1e40af';
                    btn.style.borderWidth = '2px';
                } else {
                    btn.style.borderColor = '#cbd5e1';
                    btn.style.background = 'white';
                    btn.style.color = '#475569';
                    btn.style.borderWidth = '1px';
                }
            }
        });

        const totalBlock = document.getElementById('totalSessionsBlock');
        const schedContainer = document.getElementById('scheduleContainer');
        const totalInput = document.getElementById('totalSessions');
        const firstLabel = document.getElementById('firstSessionLabel');

        if (planType === '1_day') {
            if (totalBlock) totalBlock.style.display = 'none';
            if (schedContainer) schedContainer.style.display = 'none';
            if (totalInput) totalInput.value = 1;
            if (firstLabel) firstLabel.textContent = 'موعد الحصة';
        } else {
            if (totalBlock) totalBlock.style.display = 'block';
            if (schedContainer) schedContainer.style.display = 'block';
            if (firstLabel) firstLabel.textContent = 'موعد الحصة الأولى (البداية)';
            if (totalInput) {
                if (planType === '1_month' && (parseInt(totalInput.value) <= 1 || parseInt(totalInput.value) > 20)) totalInput.value = 4;
                if (planType === '3_months' && (parseInt(totalInput.value) <= 1 || parseInt(totalInput.value) > 40)) totalInput.value = 12;
                if (planType === '6_months' && (parseInt(totalInput.value) <= 1 || parseInt(totalInput.value) > 80)) totalInput.value = 24;
            }
        }

        calculatePlanCosts();
        syncScheduleInputs();
    }
    window.selectOfferPlan = selectOfferPlan;

    function calculatePlanCosts() {
        const planType = document.getElementById('selectedPlanType')?.value || '1_day';
        const isFree = document.getElementById('isFree')?.checked;
        const durationVal = parseInt(document.getElementById('duration')?.value) || 60;
        const pricePerSession = isFree ? 0 : (parseFloat(document.getElementById('price')?.value) || 0);
        let totalSessions = planType === '1_day' ? 1 : (parseInt(document.getElementById('totalSessions')?.value) || 1);
        if (totalSessions < 1) totalSessions = 1;

        const feePerSession = isFree ? 0 : Math.round((durationVal / 45) * 50);
        const totalPlatformFee = feePerSession * totalSessions;
        const totalTeacherEarnings = pricePerSession * totalSessions;
        const totalStudentCost = (pricePerSession + feePerSession) * totalSessions;

        const elPricePer = document.getElementById('summaryPricePerSession');
        const elFee = document.getElementById('summaryPlatformFee');
        const elTeacher = document.getElementById('summaryTeacherTotal');
        const elStudent = document.getElementById('summaryStudentTotal');

        if (elPricePer) elPricePer.textContent = isFree ? 'مجاني (0 دج)' : `${pricePerSession} دج`;
        if (elFee) elFee.textContent = isFree ? '0 دج (مجاني)' : `${feePerSession} دج / حصة (إجمالي: ${totalPlatformFee} دج)`;
        if (elTeacher) elTeacher.textContent = isFree ? '0 دج' : `${totalTeacherEarnings} دج`;
        if (elStudent) elStudent.textContent = isFree ? 'مجاني (0 دج)' : `${totalStudentCost} دج`;
    }
    window.calculatePlanCosts = calculatePlanCosts;

    function syncScheduleInputs() {
        const planType = document.getElementById('selectedPlanType')?.value || '1_day';
        const container = document.getElementById('sessionsScheduleList');
        if (!container) return;

        if (planType === '1_day') {
            container.innerHTML = '';
            return;
        }

        const totalSessions = parseInt(document.getElementById('totalSessions')?.value) || 4;
        const firstDateVal = document.getElementById('offerDate')?.value;
        let baseDate = firstDateVal ? new Date(firstDateVal) : new Date(Date.now() + 24 * 3600 * 1000);

        let html = '';
        for (let i = 1; i <= totalSessions; i++) {
            let sessionDateStr = '';
            if (i === 1 && firstDateVal) {
                sessionDateStr = firstDateVal;
            } else {
                const targetDate = new Date(baseDate.getTime() + (i - 1) * 7 * 24 * 3600 * 1000);
                const localIso = new Date(targetDate.getTime() - (targetDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                sessionDateStr = localIso;
            }

            html += `
                <div style="display:flex; align-items:center; gap:8px; background:#f8fafc; border:1px solid #e2e8f0; padding:6px 10px; border-radius:8px;">
                    <span style="font-weight:800; color:#1e40af; font-size:0.82rem; min-width:65px;">الحصة ${i}:</span>
                    <input type="datetime-local" class="session-schedule-input" data-session="${i}" value="${sessionDateStr}" required style="flex:1; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; background:white;">
                </div>
            `;
        }
        container.innerHTML = html;
    }
    window.syncScheduleInputs = syncScheduleInputs;

    function autoGenerateWeeklySchedule() {
        const firstDateVal = document.getElementById('offerDate')?.value;
        if (!firstDateVal) {
            showToast('⚠️ يرجى تحديد موعد الحصة الأولى أولاً', 'warning');
            document.getElementById('offerDate').focus();
            return;
        }
        syncScheduleInputs();
        showToast('✨ تم ضبط المواعيد أسبوعياً في نفس التوقيت بنجاح', 'info');
    }
    window.autoGenerateWeeklySchedule = autoGenerateWeeklySchedule;

    function onFirstDateChange() {
        const firstDateVal = document.getElementById('offerDate')?.value;
        const firstInput = document.querySelector('.session-schedule-input[data-session="1"]');
        if (firstInput && firstDateVal) {
            firstInput.value = firstDateVal;
        }
    }
    window.onFirstDateChange = onFirstDateChange;

    function togglePrice() {
        const isFree = document.getElementById('isFree').checked;
        const priceGroup = document.getElementById('priceGroup');
        const priceInput = document.getElementById('price');
        const freeNotice = document.getElementById('freeOfferNotice');
        const durationInput = document.getElementById('duration');
        const maxStudentsInput = document.getElementById('maxStudents');

        if (isFree) {
            if (priceInput) priceInput.value = 0;
            if (priceGroup) priceGroup.style.display = 'none';
            if (freeNotice) freeNotice.style.display = 'block';
            if (durationInput) {
                if (parseInt(durationInput.value) > 60 || !durationInput.value) {
                    durationInput.value = 60;
                    syncDurationPreset();
                }
                durationInput.max = 60;
            }
            if (maxStudentsInput) {
                if (parseInt(maxStudentsInput.value) > 20 || !maxStudentsInput.value) {
                    maxStudentsInput.value = 20;
                }
                maxStudentsInput.max = 20;
            }
            selectOfferPlan('1_day');
        } else {
            if (priceGroup) priceGroup.style.display = 'block';
            if (priceInput) {
                if (parseFloat(priceInput.value) <= 0 || !priceInput.value) {
                    priceInput.value = 250;
                }
            }
            if (freeNotice) freeNotice.style.display = 'none';
            if (durationInput) durationInput.max = 240;
            if (maxStudentsInput) maxStudentsInput.max = 500;
        }
        calculatePlanCosts();
    }

    function validateOfferLimits() {
        const isFree = document.getElementById('isFree').checked;
        const durationInput = document.getElementById('duration');
        const maxStudentsInput = document.getElementById('maxStudents');

        if (durationInput) {
            let val = parseInt(durationInput.value);
            if (val && val < 60) {
                showToast('⚠️ لا يمكن تقديم درس أقل من ساعة واحدة (60 دقيقة)', 'warning');
                durationInput.value = 60;
                syncDurationPreset();
            } else if (val && val > 240) {
                showToast('⚠️ الحد الأقصى لمدة الدرس هي 4 ساعات (240 دقيقة)', 'warning');
                durationInput.value = 240;
                syncDurationPreset();
            }
        }

        if (isFree) {
            if (durationInput && parseInt(durationInput.value) > 60) {
                showToast('⚠️ العرض المجاني متاح لمدة أقصاها ساعة واحدة (60 دقيقة)', 'warning');
                durationInput.value = 60;
                syncDurationPreset();
            }
            if (maxStudentsInput && parseInt(maxStudentsInput.value) > 20) {
                showToast('⚠️ العرض المجاني يتسع لـ 20 شخصاً كحد أقصى', 'warning');
                maxStudentsInput.value = 20;
            }
        }

        calculatePlanCosts();
    }

    function toggleOtherLevel() {
        const level = document.getElementById('educationLevel').value;
        const otherGroup = document.getElementById('otherLevelGroup');
        otherGroup.style.display = level === 'other' ? 'block' : 'none';
    }

    let isCreatingOffer = false;

    async function createOffer() {
        if (!checkTeacherProfileComplete()) return;
        if (checkGuestAction()) return;
        if (isCreatingOffer) {
            showToast('⏳ جاري إنشاء الدرس، الرجاء الانتظار...', 'info');
            return;
        }

        const subject_name = document.getElementById('subjectName').value ? document.getElementById('subjectName').value.trim() : '';
        const offer_date = document.getElementById('offerDate').value;
        const educationLevel = document.getElementById('educationLevel').value;
        const durationVal = parseInt(document.getElementById('duration').value) || 60;
        const maxStudentsVal = parseInt(document.getElementById('maxStudents')?.value) || 20;
        const isFree = document.getElementById('isFree').checked;
        const priceVal = parseFloat(document.getElementById('price').value) || 0;
        const plan_type = document.getElementById('selectedPlanType')?.value || '1_day';
        const total_sessions = plan_type === '1_day' ? 1 : (parseInt(document.getElementById('totalSessions')?.value) || 1);

        // ✅ رسائل توضيحية فورية عند نسيان أي خانة (نوع warning يظهر للضرورة — لا رسائل صامتة)
        const missingFields = [];
        if (!subject_name) missingFields.push('عنوان الدرس');
        if (!offer_date) missingFields.push('موعد الدرس');
        if (missingFields.length) {
            showToast('⚠️ الرجاء تحديد: ' + missingFields.join(' + '), 'warning');
            const firstMissingEl = document.getElementById(!subject_name ? 'subjectName' : 'offerDate');
            if (firstMissingEl) firstMissingEl.focus();
            return;
        }

        if (!isFree && priceVal < 250) {
            showToast('⚠️ سعر الدرس المدفوع يجب أن يكون 250 دج على الأقل للحصة الواحدة', 'warning');
            document.getElementById('price').focus();
            return;
        }

        if (durationVal < 60) {
            showToast('⚠️ لا يمكن تقديم درس أقل من ساعة واحدة (60 دقيقة)', 'warning');
            document.getElementById('duration').value = 60;
            syncDurationPreset();
            return;
        }

        if (durationVal > 240) {
            showToast('⚠️ الحد الأقصى لمدة الدرس هو 4 ساعات (240 دقيقة)', 'warning');
            document.getElementById('duration').value = 240;
            syncDurationPreset();
            return;
        }

        if (!educationLevel) {
            showToast('⚠️ الرجاء اختيار المستوى التعليمي', 'warning');
            document.getElementById('educationLevel').focus();
            return;
        }

        let finalLevel = educationLevel;
        if (educationLevel === 'other') {
            const otherText = document.getElementById('otherLevelText').value.trim();
            if (!otherText) {
                showToast('⚠️ الرجاء إدخال المستوى التعليمي المطلوب', 'warning');
                document.getElementById('otherLevelText').focus();
                return;
            }
            finalLevel = otherText;
        }

        // دالة لتنسيق التاريخ والوقت المدخل محلياً بدقة مع الحفاظ على موعد البث الفعلي بالجزائر دون إنقاص ساعة
        const formatLocalDateTime = (dateStr) => {
            if (!dateStr) return null;
            if (typeof dateStr === 'string') {
                const trimmed = dateStr.trim();
                if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
                    return trimmed.length === 16 ? `${trimmed}:00` : trimmed;
                }
            }
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };

        const offer_date_formatted = formatLocalDateTime(offer_date);

        // جمع جدول الحصص المحدد وتحويل التواريخ بدقة لمنع إزاحة التوقيت
        let sessionsSchedule = [];
        if (plan_type !== '1_day' && total_sessions > 1) {
            const schedInputs = document.querySelectorAll('.session-schedule-input');
            schedInputs.forEach((inp, idx) => {
                const sNum = parseInt(inp.getAttribute('data-session')) || (idx + 1);
                const sDate = inp.value || offer_date;
                sessionsSchedule.push({
                    session_number: sNum,
                    date: formatLocalDateTime(sDate),
                    duration: durationVal
                });
            });
        } else {
            sessionsSchedule.push({
                session_number: 1,
                date: offer_date_formatted,
                duration: durationVal
            });
        }

        //  العروض المجانية تستخدم غرفة المنصة المدمجة (WebRTC) — لا حاجة لأي رابط خارجي
        const reqBody = JSON.stringify({
            teacher_id: teacherId,
            subject_name: subject_name,
            duration: durationVal,
            max_students: isFree ? Math.min(20, maxStudentsVal) : maxStudentsVal,
            offer_date: offer_date_formatted,
            is_free: isFree,
            meet_url: null,
            stream_url: null,
            price: isFree ? 0 : priceVal,
            education_level: finalLevel,
            plan_type: plan_type,
            total_sessions: total_sessions,
            session_duration: durationVal,
            price_per_session: isFree ? 0 : priceVal,
            sessions_schedule: sessionsSchedule
        });

        isCreatingOffer = true;
        // ✅ عجلة تحميل فورية على الزر + تعطيله — الأستاذ يرى أن الإنشاء جارٍ ولا ينقر مكرراً
        const createOfferBtn = document.getElementById('createOfferBtn');
        if (createOfferBtn) {
            createOfferBtn.disabled = true;
            createOfferBtn.style.opacity = '0.75';
            createOfferBtn.style.cursor = 'wait';
            createOfferBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إنشاء الدرس... الرجاء الانتظار';
        }
        try {
            const res = await fetchWithAuth('/api/offer/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: reqBody
            });
            const result = await res.json();
            if (result.success) {
                showToast('✅ تم إنشاء البث والخطة بنجاح', 'success');
                closeModal();
                showSection('offers');
                if (typeof loadOffers === 'function') loadOffers();
                const newOfferId = (result.offer && result.offer.id) || result.id;
                if (newOfferId) {
                    setTimeout(() => {
                        if (confirm('✅ تم إنشاء البث بنجاح!\n\nهل ترغب في نسخ رابط مشاركة هذا الدرس لمشاركته مع الطلاب الآن؟')) {
                            shareOffer(newOfferId);
                        }
                    }, 400);
                }
            } else {
                const errMsg = result.error || (result.errors && result.errors[0] && result.errors[0].msg) || 'تعذر إنشاء الدرس، الرجاء مراجعة الحقول المدخلة';
                showToast(errMsg.indexOf('⚠️') === 0 ? errMsg : '⚠️ ' + errMsg, 'warning');
            }
        } catch(e) {
            console.warn('createOffer failed:', e);
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('⚠️ تعذر إتمام الإنشاء، تحقق من اتصالك وحاول مرة أخرى', 'warning');
            }
        } finally {
            isCreatingOffer = false;
            if (createOfferBtn) {
                createOfferBtn.disabled = false;
                createOfferBtn.style.opacity = '';
                createOfferBtn.style.cursor = '';
                createOfferBtn.innerHTML = '<i class="fas fa-check"></i> إنشاء البث / الخطة';
            }
        }
    }

    // ================================================================
    // WITHDRAW
    // ================================================================

    function toggleWithdrawMethodFields() {
        const noteEl = document.getElementById('withdrawTimingNote');
        if (!noteEl) return;
        
        noteEl.style.borderRightColor = '#ea580c';
        noteEl.style.backgroundColor = '#fff7ed';
        noteEl.innerHTML = `
            <div style="font-weight: 700; color: #ea580c; margin-bottom: 4px;"><i class="fas fa-university"></i> سحب وتحويل عبر حساب الـ CCP / بريدي موب:</div>
            <div style="font-size: 0.8rem; color: var(--gray-700); line-height: 1.4;">سيتم مراجعة وتحويل طلب السحب إلى حساب الـ CCP أو بريدي موب المسجل في إعدادات ملفك الشخصي خلال <strong>3 إلى 7 أيام عمل كأقصى حد</strong>.</div>
        `;
    }

    async function saveSofizPayKey() {
        const key = document.getElementById('sofizpayPublicKey').value.trim();
        if (!key || key.length < 30) {
            showToast('يرجى إدخال مفتاح SofizPay العام صحيح', 'error');
            return;
        }
        try {
            const res = await fetchWithAuth('/api/teacher/sofizpay-key', {
                method: 'POST',
                body: JSON.stringify({ teacher_id: teacherId, sofizpay_public_key: key })
            });
            const data = await res.json();
            if (data.success) {
                showToast('تم حفظ مفتاح SofizPay بنجاح', 'success');
            } else {
                showToast(data.error, 'error');
            }
        } catch(e) {
            if (e.message !== 'انتهت صلاحية الجلسة') showToast('حدث خطأ', 'error');
        }
    }

    function showWithdrawModal() {
        if (checkGuestAction()) return;
        document.getElementById('modalOverlay').style.display = 'block';
        document.getElementById('withdrawModal').style.display = 'block';
        document.getElementById('withdrawAmount').value = '';
        updateTeacherWithdrawFee();
        if (document.getElementById('withdrawOtpCode')) {
            document.getElementById('withdrawOtpCode').value = '';
        }
        if (document.getElementById('withdrawOtpContainer')) {
            document.getElementById('withdrawOtpContainer').style.display = 'none';
        }
        const btnSend = document.getElementById('btnSendWithdrawOtp');
        if (btnSend) {
            btnSend.disabled = false;
            btnSend.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال رمز التحقق إلى البريد الإلكتروني';
        }
        const btnSubmit = document.getElementById('btnSubmitWithdraw');
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.style.opacity = '0.5';
            btnSubmit.style.cursor = 'not-allowed';
        }
        if (document.getElementById('withdrawMethodSelect')) {
            document.getElementById('withdrawMethodSelect').value = 'ccp';
            toggleWithdrawMethodFields();
        }
        loadBalance();
    }

    async function updateTeacherWithdrawFee() {
        const val = parseFloat(document.getElementById('withdrawAmount').value) || 0;
        const s = await getRevSettings();
        const minWithdraw = getWithdrawMinFrom(s);
        const minHint = document.getElementById('minWithdrawHint');
        if (minHint) minHint.innerText = minWithdraw;
        const pctRaw = parseFloat(s.teacher_withdrawal_commission);
        const feePct = isNaN(pctRaw) ? 1 : pctRaw;
        const box = document.getElementById('teacherWithdrawFeeBox');
        if (!box) return;
        if (val >= minWithdraw) {
            const fee = Math.round(val * feePct / 100);
            const net = val - fee;
            document.getElementById('teacherWithdrawGrossDisplay').innerText = val.toLocaleString() + ' دج';
            document.getElementById('teacherWithdrawFeeDisplay').innerText = fee.toLocaleString() + ' دج';
            document.getElementById('teacherWithdrawNetDisplay').innerText = net.toLocaleString() + ' دج';
            box.style.display = 'block';
        } else {
            box.style.display = 'none';
        }
    }

    function onOtpCodeInput() {
        const otpVal = document.getElementById('withdrawOtpCode').value.trim();
        const btnSubmit = document.getElementById('btnSubmitWithdraw');
        if (btnSubmit) {
            if (otpVal.length === 6) {
                btnSubmit.disabled = false;
                btnSubmit.style.opacity = '1';
                btnSubmit.style.cursor = 'pointer';
            } else {
                btnSubmit.disabled = true;
                btnSubmit.style.opacity = '0.5';
                btnSubmit.style.cursor = 'not-allowed';
            }
        }
    }

    async function requestWithdrawOtp() {
        const amount = document.getElementById('withdrawAmount').value;
        const sMin = await getRevSettings();
        const minWithdraw = getWithdrawMinFrom(sMin);
        if (!amount || parseFloat(amount) < minWithdraw) {
            showToast('الحد الأدنى لمبلغ السحب هو ' + minWithdraw + ' دج', 'warning');
            return;
        }

        const btnSend = document.getElementById('btnSendWithdrawOtp');
        if (btnSend) {
            btnSend.disabled = true;
            btnSend.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إرسال الكود...';
        }

        try {
            const res = await fetchWithAuth('/api/teacher/request-withdraw-otp', {
                method: 'POST',
                body: JSON.stringify({ teacher_id: teacherId, amount: parseFloat(amount) })
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message || 'تم إرسال رمز التحقق إلى بريدك الإلكتروني بنجاح', 'success');
                const otpContainer = document.getElementById('withdrawOtpContainer');
                if (otpContainer) {
                    otpContainer.style.display = 'block';
                }
                const infoEl = document.getElementById('withdrawOtpInfo');
                if (infoEl && data.masked_email) {
                    infoEl.innerHTML = `<i class="fas fa-envelope-open-text"></i> تم إرسال كود مكون من 6 أرقام إلى بريدك (${data.masked_email}).`;
                }
                if (btnSend) {
                    btnSend.innerHTML = '<i class="fas fa-check"></i> تم إرسال الرمز بنجاح';
                }
            } else {
                showToast(data.error || 'فشل إرسال رمز التحقق', 'warning');
                if (btnSend) {
                    btnSend.disabled = false;
                    btnSend.innerHTML = '<i class="fas fa-paper-plane"></i> إعادة حال إرسال رمز التحقق';
                }
            }
        } catch (e) {
            if (btnSend) {
                btnSend.disabled = false;
                btnSend.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال رمز التحقق إلى البريد الإلكتروني';
            }
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ في إرسال رمز التحقق', 'warning');
            }
        }
    }

    async function submitWithdrawRequest() {
        const amount = document.getElementById('withdrawAmount').value;
        const sMin = await getRevSettings();
        const minWithdraw = getWithdrawMinFrom(sMin);
        if (!amount || parseFloat(amount) < minWithdraw) {
            showToast('الحد الأدنى لمبلغ السحب هو ' + minWithdraw + ' دج', 'warning');
            return;
        }

        const otpCode = document.getElementById('withdrawOtpCode') ? document.getElementById('withdrawOtpCode').value.trim() : '';
        if (!otpCode || otpCode.length !== 6) {
            showToast('يرجى إدخال كود التحقق المكون من 6 أرقام', 'warning');
            return;
        }

        const btnSubmit = document.getElementById('btnSubmitWithdraw');
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تأكيد السحب...';
        }

        try {
            const res = await fetchWithAuth('/api/teacher/withdraw-request', {
                method: 'POST',
                body: JSON.stringify({ 
                    teacher_id: teacherId, 
                    amount: parseFloat(amount), 
                    method: 'ccp',
                    otp_code: otpCode
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message || 'تم تقديم طلب السحب بنجاح عبر حساب CCP، جاري المراجعة والتحويل لحسابك الجاري', 'success');
                closeWithdrawModal();
                loadBalance();
            } else {
                showToast(data.error || 'حدث خطأ في تقديم طلب السحب', 'warning');
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = '<i class="fas fa-check-circle"></i> تأكيد عملية السحب';
                }
            }
        } catch(e) {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<i class="fas fa-check-circle"></i> تأكيد عملية السحب';
            }
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ أثناء معالجة طلب السحب', 'warning');
            }
        }
    }

    // ================================================================
    // PROFILE EDIT
    // ================================================================

    function showEditProfileModal() {
        if (checkGuestAction()) return;
        if (!userData) return;

        // تعبئة البيانات الأساسية والتعليمية
        if (document.getElementById('editFullName')) {
            document.getElementById('editFullName').value = userData.full_name || '';
        }
        if (document.getElementById('editPhone')) {
            document.getElementById('editPhone').value = userData.phone || '';
        }
        if (document.getElementById('editSpecialization')) {
            document.getElementById('editSpecialization').value = userData.specialization || userData.subject || '';
        }
        if (document.getElementById('editExperience')) {
            document.getElementById('editExperience').value = userData.experience || '';
        }
        if (document.getElementById('editTeachingLevel')) {
            document.getElementById('editTeachingLevel').value = userData.teaching_level || '';
        }
        if (document.getElementById('editBio')) {
            document.getElementById('editBio').value = userData.bio || '';
        }

        // تعبئة رواب التواصل الاجتماعي
        if (document.getElementById('facebookUrl')) document.getElementById('facebookUrl').value = userData.facebook_url || '';
        if (document.getElementById('instagramUrl')) document.getElementById('instagramUrl').value = userData.instagram_url || '';
        if (document.getElementById('linkedinUrl')) document.getElementById('linkedinUrl').value = userData.linkedin_url || '';
        if (document.getElementById('youtubeUrl')) document.getElementById('youtubeUrl').value = userData.youtube_url || '';
        if (document.getElementById('twitterUrl')) document.getElementById('twitterUrl').value = userData.twitter_url || '';
        if (document.getElementById('websiteUrl')) document.getElementById('websiteUrl').value = userData.website_url || '';
        if (document.getElementById('whatsappUrl')) document.getElementById('whatsappUrl').value = userData.whatsapp_number || '';
        
        // تعبئة بيانات الدفع والسحب
        if (document.getElementById('ccpAccount')) {
            document.getElementById('ccpAccount').value = userData.ccp_account || '';
        }
        if (document.getElementById('sofizpayPublicKey')) {
            document.getElementById('sofizpayPublicKey').value = userData.sofizpay_public_key || '';
        }

        document.getElementById('modalOverlay').style.display = 'block';
        document.getElementById('editProfileModal').style.display = 'block';
    }

    function showProfileCompletionModal() {
        openCompleteProfileModal();
    }

    async function completeProfile() {
        await submitTeacherProfile();
    }

    let isProfileUpdating = false;
    async function updateProfile() {
        if (checkGuestAction()) return;
        if (isProfileUpdating) return;

        const saveBtn = document.querySelector('#editProfileModal .save-btn');
        const originalBtnText = saveBtn ? saveBtn.innerHTML : '<i class="fas fa-save"></i> حفظ التغييرات';

        const fullNameInput = document.getElementById('editFullName');
        if (fullNameInput && !fullNameInput.value.trim()) {
            showToast('⚠️ يرجى إدخال الاسم الكامل', 'warning');
            fullNameInput.focus();
            return;
        }

        const formData = new FormData();
        formData.append('teacher_id', teacherId);

        if (fullNameInput) formData.append('full_name', fullNameInput.value.trim());
        const phoneInput = document.getElementById('editPhone');
        if (phoneInput) formData.append('phone', phoneInput.value.trim());
        const specInput = document.getElementById('editSpecialization');
        if (specInput) {
            formData.append('specialization', specInput.value.trim());
            formData.append('subject', specInput.value.trim());
        }
        const expInput = document.getElementById('editExperience');
        if (expInput) formData.append('experience', expInput.value.trim());
        const levelInput = document.getElementById('editTeachingLevel');
        if (levelInput) formData.append('teaching_level', levelInput.value);
        const bioInput = document.getElementById('editBio');
        if (bioInput) formData.append('bio', bioInput.value.trim());

        const imageFile = document.getElementById('editProfileImage')?.files[0] || window.capturedProfileImage;
        if (imageFile) {
            if (imageFile.size <= 50 * 1024 * 1024) {
                formData.append('profile_image', imageFile);
            } else {
                showToast(`الصورة كبيرة جداً (${(imageFile.size / (1024 * 1024)).toFixed(2)} MB)، الحد الأقصى المسموح به هو 50 ميجابايت`, 'error');
                return;
            }
        }

        const socialData = {
            facebook_url: document.getElementById('facebookUrl')?.value.trim() || null,
            instagram_url: document.getElementById('instagramUrl')?.value.trim() || null,
            linkedin_url: document.getElementById('linkedinUrl')?.value.trim() || null,
            youtube_url: document.getElementById('youtubeUrl')?.value.trim() || null,
            twitter_url: document.getElementById('twitterUrl')?.value.trim() || null,
            website_url: document.getElementById('websiteUrl')?.value.trim() || null,
            whatsapp_number: document.getElementById('whatsappUrl')?.value.trim() || null,
            ccp_account: document.getElementById('ccpAccount')?.value.trim() || null,
            sofizpay_public_key: document.getElementById('sofizpayPublicKey')?.value.trim() || null
        };

        for (const [key, value] of Object.entries(socialData)) {
            formData.append(key, value || '');
        }

        try {
            isProfileUpdating = true;
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
            }

            const res = await fetchWithAuth('/api/teacher/update-profile-with-social', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                window.capturedProfileImage = null;
                showToast('✅ تم حفظ وتحديث كافة معلومات الملف الشخصي بنجاح', 'success');
                closeModal();
                if (data.user) {
                    userData = Object.assign({}, userData, data.user);
                }
                loadUserData();
            } else {
                showToast(data.error || 'حدث خطأ أثناء حفظ التغييرات', 'error');
            }
        } catch(e) {
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ في الاتصال بالخادم', 'error');
            }
        } finally {
            isProfileUpdating = false;
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalBtnText;
            }
        }
    }

    // ================================================================
    // MODALS
    // ================================================================

    window.autoScrollToNext = function(currentInput, nextInputId) {
        if (!currentInput) return;
        
        let isFilled = false;
        if (currentInput.type === 'file') {
            isFilled = currentInput.files && currentInput.files.length > 0;
        } else {
            isFilled = currentInput.value && currentInput.value.trim().length > 0;
        }
        
        if (isFilled && nextInputId) {
            const nextEl = document.getElementById(nextInputId);
            if (nextEl) {
                const targetContainer = nextEl.closest('.form-group') || nextEl;
                if (targetContainer) {
                    targetContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => {
                        if (nextEl.tagName === 'INPUT' || nextEl.tagName === 'TEXTAREA' || nextEl.tagName === 'SELECT') {
                            nextEl.focus({ preventScroll: true });
                        }
                    }, 350);
                }
            }
        }
    };

    function closeModal() {
        if (typeof stopCompleteProfileCamera === 'function') {
            stopCompleteProfileCamera(false);
        }
        const modals = ['modalOverlay', 'editProfileModal', 'completeProfileModal', 'createOfferModal', 'createCourseModal', 'withdrawModal', 'depositModal', 'viewStudentModal', 'viewTeacherModal', 'addPostModal', 'supportModal', 'transactionDetailsModal'];
        modals.forEach(mId => {
            const el = document.getElementById(mId);
            if (el) el.style.display = 'none';
        });
    }

    function closeTransactionModal() {
        const modal = document.getElementById('transactionDetailsModal');
        if (modal) modal.style.display = 'none';
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    function showTransactionDetailsByMappedId(id) {
        if (window.teacherTransactionsMap && window.teacherTransactionsMap[id]) {
            showTransactionDetails(window.teacherTransactionsMap[id]);
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
            const isDeposit = tx.type === 'deposit' || tx.type === 'credit' || tx.type === 'deposit_manual' || tx.type === 'manual_deposit';
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

    function openSupportModal() {
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.style.display = 'block';
        const modal = document.getElementById('supportModal');
        if (modal) modal.style.display = 'block';
    }

    function closeSupportModal() {
        const modal = document.getElementById('supportModal');
        if (modal) modal.style.display = 'none';
        const completeModal = document.getElementById('completeProfileModal');
        const editModal = document.getElementById('editProfileModal');
        const isCompleteOpen = completeModal && completeModal.style.display === 'block';
        const isEditOpen = editModal && editModal.style.display === 'block';
        if (!isCompleteOpen && !isEditOpen) {
            const overlay = document.getElementById('modalOverlay');
            if (overlay) overlay.style.display = 'none';
        }
    }

    function closeWithdrawModal() {
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.style.display = 'none';
        const withdrawModal = document.getElementById('withdrawModal');
        if (withdrawModal) withdrawModal.style.display = 'none';
        const otpContainer = document.getElementById('withdrawOtpContainer');
        if (otpContainer) otpContainer.style.display = 'none';
        const otpCode = document.getElementById('withdrawOtpCode');
        if (otpCode) otpCode.value = '';
    }

    // ================================================================
    // LOGOUT
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
    // UTILITY
    // ================================================================

    function getValidImageUrl(url, name, size = 120) {
        if (!url || url === 'null' || url === 'undefined' || url.trim() === '') {
            return '/images/default-avatar.svg';
        }
        return encodeURI(url.trim());
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ================================================================
    // CLOSE DROPDOWNS ON CLICK OUTSIDE
    // ================================================================

    document.addEventListener('click', function(e) {
        const notifBtn = document.getElementById('notifBtn');
        const notifDropdown = document.getElementById('notifDropdown');
        const profileBtn = document.getElementById('profileBtn');
        const profileDropdown = document.getElementById('profileDropdown');

        if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
            notifDropdown.classList.remove('open');
        }
        if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
            profileDropdown.classList.remove('open');
        }
    });

    // ================================================================
    // ✅ COURSES - إدارة الدورات
    // ================================================================

    async function loadCourses() {
        if (courseViewMode === 'others') return loadOtherTeacherCourses();
        // ✅ التحقق من حالة الحساب
        if (userData && userData.status !== 'approved' && !(userData.is_guest || userData.id === -1)) {
            const c = document.getElementById('coursesList');
            if (c) {
                if (userData.requires_profile_completion || !userData.profile_completion) {
                    c.innerHTML = '<p style="text-align:center; padding:25px; color:var(--danger);"><i class="fas fa-exclamation-triangle"></i> ⚠️ قم برفع الوثائق (صورة الشهادة/الدبلوم وإثبات الهوية) لتحقق من حسابك والوصول الى هذا القسم</p>';
                } else if (userData.status === 'rejected') {
                    c.innerHTML = '<p style="text-align:center; padding:25px; color:var(--danger);"><i class="fas fa-times-circle"></i> ❌ تم رفض طلبك. يرجى إعادة رفع الوثائق والصور للوصول إلى هذا القسم.</p>';
                } else {
                    c.innerHTML = '<p style="text-align:center; padding:25px; color:var(--gold-dark);"><i class="fas fa-clock"></i> حساك قيد المراجعة. سيتم تفعيل قسم الدورات بعد قبول حسابك من قبل الإدارة.</p>';
                }
            }
            return;
        }
        const container = document.getElementById('coursesList');
        if (!container) return;
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
        try {
            const url = (userData && (userData.is_guest || userData.id === -1)) ? '/api/course/public' : `/api/course/teacher/${teacherId}`;
            const res = await fetchWithAuth(url);
            const data = await res.json();
            renderCourses(data.courses || data);
        } catch(e) { 
            if (e.message !== 'انتهت صلاحية الجلسة') {
                showToast('حدث خطأ', 'error'); 
                const c = document.getElementById('coursesList');
                if (c) c.innerHTML = '<p style="text-align:center; padding:25px; color:var(--danger);">حدث خطأ في الاتصال</p>';
            } 
        }
    }

    function renderCourses(courses) {
        const container = document.getElementById('coursesList');
        if (!container) return;
        if (!Array.isArray(courses)) {
            container.innerHTML = `<p style="text-align:center; padding:25px; color:var(--danger);">${escapeHtml(courses && courses.error ? courses.error : 'حدث خطأ في تحميل الدورات')}</p>`;
            return;
        }
        if (courses.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:25px; color:var(--gray-400);">لا توجد دورات حالياً</p>';
            return;
        }
        const courseLevelMap = {
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
            '3eme_uni': 'ثالثة جامعي (L3)',
            'master': 'ماستر',
            'doctorat': 'دكتوراه',
            'other': 'مستوى آخر / عام'
        };
        let html = '<div class="courses-grid">';
        for (const c of courses) {
            const levelLabel = courseLevelMap[c.education_level] || c.education_level || 'غير محدد';
            let statusBadge = '';
            if (c.status === 'pending') {
                statusBadge = '<span style="background: #fef3c7; color: #b45309; font-weight: 700; font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; display: inline-block; margin-bottom: 6px;"><i class="fas fa-clock"></i> قيد المراجعة ⏳</span>';
            } else if (c.status === 'published' || !c.status) {
                statusBadge = '<span style="background: #dcfce7; color: #15803d; font-weight: 700; font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; display: inline-block; margin-bottom: 6px;"><i class="fas fa-check-circle"></i> منشورة ✅</span>';
            } else if (c.status === 'rejected') {
                statusBadge = '<span style="background: #fee2e2; color: #b91c1c; font-weight: 700; font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; display: inline-block; margin-bottom: 6px;"><i class="fas fa-times-circle"></i> مرفوضة ❌</span>';
            }

            html += `
                <div class="course-card">

                    <div style="display:flex; justify-content:space-between; align-items:start; gap:10px;">
                        <div style="flex:1; min-width:0;">
                            ${statusBadge}
                            ${(c.status === 'rejected' && c.rejection_reason) ? `<div style="background:#fef2f2; border:1px solid #fecaca; border-right:4px solid #ef4444; padding:6px 10px; border-radius:8px; margin-bottom:6px; font-size:0.78rem; color:#991b1b; line-height:1.5; word-break:break-word;"><i class="fas fa-exclamation-circle"></i> <strong>سبب الرفض:</strong> ${escapeHtml(c.rejection_reason)}</div>` : ''}
                            <h3 style="font-size:1rem; margin-bottom:4px; color:var(--gray-900);">${escapeHtml(c.title)}</h3>
                            <p style="font-size:0.8rem; color:var(--gray-600); margin-bottom:6px;">${parseContentWithLinks(c.description || '')}</p>
                            <p style="font-size:0.8rem;"><strong>المستوى:</strong> ${escapeHtml(levelLabel)}</p>
                            <p style="font-size:0.8rem;"><strong>السعر:</strong> ${c.is_free ? 'مجاني' : c.price + ' دج'}</p>
                            <p style="font-size:0.8rem; color:var(--gray-600); margin-top:4px;"><i class="fas fa-eye" style="color:var(--primary);"></i> المشاهدات: <strong>${c.views_count || c.views || 0}</strong></p>
                            <div onclick="openCourseReviewsModal(${c.id}, '${escapeHtml(c.title).replace(/'/g, "\\'")}')" style="display:flex; align-items:center; gap:12px; font-size:0.78rem; margin-top:6px; background:#f8fafc; padding:6px 10px; border-radius:8px; cursor:pointer;" title="انقر لعرض جميع مراجعات وتقييمات الطلاب">
                                <span style="color:#d97706; font-weight:800;"><i class="fas fa-star" style="color:#f59e0b;"></i> ${Number(c.average_rating || 0).toFixed(1)} (${c.ratings_count || 0} تقييم) <i class="fas fa-chevron-left" style="font-size:0.6rem; opacity:0.7;"></i></span>
                                <span style="color:#2563eb; font-weight:800;"><i class="fas fa-shopping-cart"></i> ${Number(c.sales_count || 0)} مبيعات</span>
                            </div>
                            <p style="font-size:0.75rem; color:var(--gray-500); word-break: break-all;">
                                <a href="${escapeHtml(c.course_url)}" target="_blank" rel="noopener" style="color:var(--primary); text-decoration:none;">🔗 فتح رابط الدورة</a>
                            </p>
                        </div>
                        <div class="button-group" style="flex-direction:column; gap:6px;">
                            <button class="btn-share" onclick="shareCourse(${c.id})" style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; border-radius: 6px; padding: 4px 8px; font-size: 0.8rem; cursor: pointer; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" title="مشاركة الدورة">
                                <i class="fas fa-share-alt"></i> مشاركة
                            </button>
                            <button class="btn-edit" onclick="showEditCourseModal(${c.id}, '${escapeHtml(c.title)}', '${escapeHtml(c.description || '')}', ${c.price}, ${c.is_free}, '${escapeHtml(c.education_level)}', '${escapeHtml(c.course_url)}')">
                                <i class="fas fa-edit"></i> تعديل
                            </button>
                            <button class="btn-delete" onclick="deleteCourse(${c.id})">
                                <i class="fas fa-trash"></i> حذف
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;
    }

// ================================================================
// 📚 COURSES - عرض دورات الأساتذة الآخرين
// ================================================================

const COURSE_LEVEL_LABELS = {
    'primary_all': 'ابتدائي - جميع المستويات',
    'primary_1': 'السنة الأولى ابتدائي',
    'primary_2': 'السنة الثانية ابتدائي',
    'primary_3': 'السنة الثالثة ابتدائي',
    'primary_4': 'السنة الرابعة ابتدائي',
    'primary_5': 'السنة الخامسة ابتدائي',
    '5eme_pri': 'خامس ابتدائي',
    'middle_all': 'متوسط - جميع المستويات',
    '1ere_am': 'أولى متوسط',
    '2eme_am': 'ثانية متوسط',
    '3eme_am': 'ثالثة متوسط',
    '4eme_am': 'رابعة متوسط (BEM)',
    'bem': 'رابعة متوسط (BEM)',
    'secondary_all': 'ثانوي - جميع المستويات',
    '1ere_as': 'أولى ثانوي',
    '2eme_as': 'ثانية ثانوي',
    '3eme_as': 'ثالثة ثانوي (BAC)',
    'bac': 'ثالثة ثانوي (BAC)',
    'university': 'جامعة - جميع المستويات',
    '1ere_uni': 'جامعي سنة أولى (L1)',
    '2eme_uni': 'جامعي ثانية (L2)',
    '3eme_uni': 'جامعي ثالثة (L3)',
    'master': 'ماجستير',
    'doctorat': 'دكتوراه',
    'other': 'مستوى آخر'
};

let courseViewMode = 'mine';
let otherCoursesCache = [];
let otherCoursesTotal = 0;
let otherCoursesHasMore = false;
let otherCoursesPage = 1;

function switchCourseView(mode) {
    courseViewMode = (mode === 'others') ? 'others' : 'mine';
    const mine = document.getElementById('courseTabMine');
    const others = document.getElementById('courseTabOthers');
    const bar = document.getElementById('otherCoursesBar');
    const actions = document.getElementById('coursesSectionActions');
    if (mine) mine.classList.toggle('active', courseViewMode === 'mine');
    if (others) others.classList.toggle('active', courseViewMode === 'others');
    if (bar) bar.style.display = courseViewMode === 'others' ? 'flex' : 'none';
    if (actions) actions.style.display = courseViewMode === 'mine' ? '' : 'none';
    const filter = document.getElementById('otherCoursesTeacherFilter');
    if (filter && courseViewMode !== 'others') filter.innerHTML = '';
    loadCourses();
}

function otherCourseAvatar(c) {
    const img = c.teacher_profile_image;
    if (img) return img;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<rect width="100" height="100" fill="#e2e8f0"/>' +
        '<circle cx="50" cy="38" r="18" fill="#94a3b8"/>' +
        '<path d="M12 100c0-22 17-34 38-34s38 12 38 34z" fill="#94a3b8"/></svg>'
    );
}

function buildOtherTeacherFilter() {
    const sel = document.getElementById('otherCoursesTeacherFilter');
    if (!sel) return;
    const previous = sel.value;
    const seen = [];
    const map = {};
    otherCoursesCache.forEach(function (c) {
        const id = c.teacher_id;
        if (!id || map[id]) return;
        map[id] = true;
        seen.push({ id: id, name: c.teacher_name || 'أستاذ' });
    });
    seen.sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    let html = '<option value="">كل الأساتذة</option>';
    seen.forEach(function (t) {
        html += '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>';
    });
    sel.innerHTML = html;
    if (previous && map[previous]) sel.value = previous;
}

function renderOtherTeacherCourses() {
    const container = document.getElementById('coursesList');
    if (!container) return;
    const filterEl = document.getElementById('otherCoursesTeacherFilter');
    const searchEl = document.getElementById('otherCoursesSearch');
    const wantedTeacher = filterEl ? filterEl.value : '';
    const term = searchEl ? String(searchEl.value || '').trim().toLowerCase() : '';

    const list = otherCoursesCache.filter(function (c) {
        if (wantedTeacher && String(c.teacher_id) !== String(wantedTeacher)) return false;
        if (!term) return true;
        return String(c.title || '').toLowerCase().indexOf(term) !== -1;
    });

    const countEl = document.getElementById('otherCoursesCount');
    if (countEl) {
        countEl.textContent = list.length + ' من ' + otherCoursesTotal + ' دورة';
    }

    if (otherCoursesCache.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:25px; color:var(--gray-500);">لا توجد دورات منشورة بعد</p>';
        return;
    }
    if (list.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:25px; color:var(--gray-500);"><i class="fas fa-search"></i> لا توجد نتائج مطابقة</p>';
        return;
    }

    let html = '<div class="courses-grid">';
    list.forEach(function (c) {
        const levelLabel = COURSE_LEVEL_LABELS[c.education_level] || c.education_level || 'غير محدد';
        const priceText = c.is_free ? 'مجاناً' : (Number(c.price) || 0) + ' دج';
        let badges = '';
        if (c.teacher_is_vip) badges += '<span class="owner-mini vip">VIP</span>';
        else if (c.teacher_is_certified) badges += '<span class="owner-mini cert">موثّق</span>';
        const safeTitle = escapeHtml(c.title);
        const safeUrl = escapeHtml(c.course_url || '');

        html += '<div class="course-card">';
        html += '<div class="other-course-owner">';
        html += '<img src="' + otherCourseAvatar(c) + '" alt="" loading="lazy" onerror="this.src=\'data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23e2e8f0%22/%3E%3C/svg%3E\'" />';
        html += '<div style="min-width:0;">';
        html += '<div class="owner-name">' + escapeHtml(c.teacher_name || 'أستاذ') + badges + '</div>';
        html += '<div class="owner-spec">' + escapeHtml(c.teacher_specialization || 'تخصص غير محدد') + '</div>';
        html += '</div></div>';

        html += '<div style="display:flex; justify-content:space-between; align-items:start; gap:10px;">';
        html += '<div style="flex:1; min-width:0;">';
        html += '<h3 style="font-size:1rem; margin-bottom:4px; color:var(--gray-900);">' + safeTitle + '</h3>';
        html += '<p style="font-size:0.8rem; color:var(--gray-600); margin-bottom:6px;">' + parseContentWithLinks(c.description || '') + '</p>';
        html += '<p style="font-size:0.8rem;"><strong>المستوى:</strong> ' + escapeHtml(levelLabel) + '</p>';
        html += '<p style="font-size:0.8rem;"><strong>السعر:</strong> ' + priceText + '</p>';
        html += '<p style="font-size:0.8rem; color:var(--gray-600); margin-top:4px;"><i class="fas fa-eye" style="color:var(--primary);"></i> المشاهدات: <strong>' + (Number(c.views_count || c.views || 0)) + '</strong></p>';
        html += '<div onclick="openCourseReviewsModal(' + Number(c.id) + ', \'' + safeTitle.replace(/'/g, "\\'") + '\')" style="display:flex; align-items:center; gap:12px; font-size:0.78rem; margin-top:6px; cursor:pointer;">';
        html += '<span style="color:#d97706; font-weight:800;"><i class="fas fa-star" style="color:#f59e0b;"></i> ' + Number(c.average_rating || 0).toFixed(1) + ' (' + Number(c.ratings_count || 0) + ')</span>';
        html += '<span style="color:#2563eb; font-weight:800;"><i class="fas fa-shopping-cart"></i> ' + Number(c.sales_count || 0) + ' مبيعة</span>';
        html += '</div>';
        if (safeUrl && safeUrl !== '#' && safeUrl.indexOf('undefined') === -1) {
            html += '<p style="font-size:0.75rem; color:var(--gray-500); word-break:break-all;"><a href="' + safeUrl + '" target="_blank" rel="noopener" style="color:var(--primary); text-decoration:none;">↗ افتح الدورة</a></p>';
        }
        html += '</div>';
        html += '<div class="button-group" style="flex-direction:column; gap:6px;">';
        html += '<button class="btn-share" onclick="shareCourse(' + Number(c.id) + ')" style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; border-radius:6px; padding:4px 8px; cursor:pointer; font-weight:700;"><i class="fas fa-share-alt"></i> مشاركة</button>';
        html += '</div></div></div>';
    });
    html += '</div>';

    if (otherCoursesHasMore) {
        html += '<div style="text-align:center; margin-top:18px;"><button type="button" class="btn-primary" id="otherCoursesMoreBtn" onclick="loadOtherTeacherCourses(true)"><i class="fas fa-arrow-down"></i> تحميل المزيد</button></div>';
    } else if (otherCoursesCache.length > 0) {
        html += '<p style="text-align:center; margin-top:18px; font-size:0.8rem; color:var(--gray-500);">تم عرض كل الدورات</p>';
    }

    container.innerHTML = html;
}

async function loadOtherTeacherCourses(append) {
    const container = document.getElementById('coursesList');
    if (!container) return;
    if (append) {
        const btn = document.getElementById('otherCoursesMoreBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ التحميل...'; }
    } else {
        otherCoursesCache = [];
        otherCoursesPage = 1;
        otherCoursesTotal = 0;
        otherCoursesHasMore = false;
        const filter = document.getElementById('otherCoursesTeacherFilter');
        const search = document.getElementById('otherCoursesSearch');
        if (filter) filter.innerHTML = '<option value="">كل الأساتذة</option>';
        if (search) search.value = '';
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جارٍ تحميل دورات الأساتذة...</div>';
    }
    try {
        const url = '/api/course/public?page=' + otherCoursesPage + '&limit=50';
        const res = await fetchWithAuth(url);
        const data = await res.json();
        const incoming = (data && Array.isArray(data.courses)) ? data.courses : [];
        otherCoursesCache = append ? otherCoursesCache.concat(incoming) : incoming;
        otherCoursesTotal = (data && data.total) ? Number(data.total) : otherCoursesCache.length;
        otherCoursesHasMore = Boolean(data && data.has_more);
        if (otherCoursesHasMore) otherCoursesPage += 1;
        buildOtherTeacherFilter();
        renderOtherTeacherCourses();
    } catch (e) {
        if (!append) {
            const c = document.getElementById('coursesList');
            if (c) c.innerHTML = '<p style="text-align:center; padding:25px; color:var(--danger);">تعذّر تحميل دورات الأساتذة</p>';
        } else {
            const btn = document.getElementById('otherCoursesMoreBtn');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-arrow-down"></i> تحميل المزيد'; }
        }
    }
}
window.switchCourseView = switchCourseView;
window.renderOtherTeacherCourses = renderOtherTeacherCourses;
window.loadOtherTeacherCourses = loadOtherTeacherCourses;

    function showCreateCourseModal() {
        if (!checkTeacherProfileComplete()) return;
        if (checkGuestAction()) return;
        if (userData && userData.status !== 'approved') {
            if (userData.requires_profile_completion || !userData.profile_completion) {
                showToast('⚠️ قم برفع الوثائق (صورة الشهادة/الدبلوم وإثبات الهوية) لتحقق من حسابك والوصول الى هذا القسم', 'warning');
            } else if (userData.status === 'rejected') {
                showToast('❌ تم رفض طلبك. يرجى إعادة رفع الوثائق والصور لإضافة دورات.', 'warning');
            } else {
                showToast('⏳ حسابك قيد المراجعة. لا يمكنك إضافة دورات حتى يتم قبول حسابك من الإدارة.', 'warning');
            }
            return;
        }
        document.getElementById('createCourseModal').style.display = 'block';
        document.getElementById('courseTitle').value = '';
        document.getElementById('courseDescription').value = '';
        if (document.getElementById('courseHashtags')) document.getElementById('courseHashtags').value = '';
        document.getElementById('coursePrice').value = '0';
        document.getElementById('courseEducationLevel').value = '';
        document.getElementById('courseUrl').value = '';
        window.editingCourseId = null;
        updateCourseCommissionCalc();
    }

    function updateCourseCommissionCalc() {
        const val = parseFloat(document.getElementById('coursePrice')?.value) || 0;
        const infoEl = document.getElementById('courseCommissionInfo');
        const commText = document.getElementById('coursePlatformCommissionText');
        const netText = document.getElementById('courseTeacherNetText');
        if (!infoEl) return;
        if (val > 0) {
            const comm = Math.round(val * 0.20);
            const net = val - comm;
            if (commText) commText.textContent = comm + ' دج';
            if (netText) netText.textContent = net + ' دج';
            infoEl.style.display = 'block';
        } else {
            infoEl.style.display = 'none';
        }
    }
    window.updateCourseCommissionCalc = updateCourseCommissionCalc;

    function showEditCourseModal(id, title, description, price, isFree, educationLevel, courseUrl) {
        if (checkGuestAction()) return;
        document.getElementById('createCourseModal').style.display = 'block';
        document.getElementById('courseTitle').value = title;
        document.getElementById('courseDescription').value = description;
        if (document.getElementById('courseHashtags')) document.getElementById('courseHashtags').value = '';
        document.getElementById('coursePrice').value = price;
        document.getElementById('courseEducationLevel').value = educationLevel;
        document.getElementById('courseUrl').value = courseUrl;
        window.editingCourseId = id;
        updateCourseCommissionCalc();
    }

    let isSavingCourse = false;
    async function createCourse() {
        if (!checkTeacherProfileComplete()) return;
        if (checkGuestAction()) return;
        // ✅ منع النقر المكرر أثناء الإنشاء (الضغط على الصور واستقبالها يستغرق وقتاً)
        if (isSavingCourse) {
            showToast('⏳ جاري حفظ الدورة، الرجاء الانتظار...', 'info');
            return;
        }
        const title = document.getElementById('courseTitle').value.trim();
        let description = document.getElementById('courseDescription').value.trim();
        const rawHashtags = document.getElementById('courseHashtags')?.value.trim();
        const price = document.getElementById('coursePrice').value;
        const educationLevel = document.getElementById('courseEducationLevel').value;
        const courseUrl = document.getElementById('courseUrl').value.trim();
        const editingId = window.editingCourseId;

        if (!title) { showToast('يرجى إدخال اسم الدورة', 'error'); return; }
        if (!educationLevel) { showToast('يرجى اختيار المستوى التعليمي', 'error'); return; }
        if (!courseUrl) { showToast('يرجى إدخال رابط الدورة', 'error'); return; }

        if (rawHashtags) {
            const formattedHashtags = rawHashtags.split(/\s+/)
                .filter(tag => tag)
                .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
                .join(' ');
            if (formattedHashtags && !description.includes(formattedHashtags)) {
                description = description ? `${description}\n\n${formattedHashtags}` : formattedHashtags;
            }
        }

        let reqBody = JSON.stringify({
            title,
            description: description || null,
            price: parseFloat(price) || 0,
            is_free: (parseFloat(price) || 0) === 0,
            education_level: educationLevel,
            course_url: courseUrl
        });

        isSavingCourse = true;
        // ✅ عجلة تحميل فورية على الزر + تعطيله أثناء الحفظ
        const createCourseBtn = document.getElementById('createCourseBtn');
        if (createCourseBtn) {
            createCourseBtn.dataset.oldHtml = createCourseBtn.innerHTML;
            createCourseBtn.disabled = true;
            createCourseBtn.style.opacity = '0.75';
            createCourseBtn.style.cursor = 'wait';
            createCourseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ... الرجاء الانتظار';
        }

        try {
            const endpoint = editingId ? `/api/course/update/${editingId}` : '/api/course/create';
            const method = editingId ? 'PUT' : 'POST';
            const res = await fetchWithAuth(endpoint, {
                method,
                body: reqBody
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message || (editingId ? '✅ تم تحديث الدورة' : '✅ تم إنشاء الدورة بنجاح'), 'success');
                closeModal();
                window.editingCourseId = null;
                loadCourses();
                const newCourseId = (data.course && data.course.id) || data.id;
                const newCourseStatus = (data.course && data.course.status) || null;
                // مشاركة الرابط فقط إذا كانت الدورة منشورة فعلاً (غير قيد المراجعة)
                if (!editingId && newCourseId && newCourseStatus !== 'pending') {
                    setTimeout(() => {
                        if (confirm('✅ تم إنشاء الدورة بنجاح!\n\nهل ترغب في نسخ رابط مشاركة هذه الدورة لمشاركتها مع الطلا خارج المنصة الآن؟')) {
                            shareCourse(newCourseId);
                        }
                    }, 400);
                }
            } else {
                console.warn('Course save rejected:', data.error);
                showToast(data.error || '⚠️ أكمل الحقول المطلوبة وحاول مرة أخرى', 'warning');
            }
        } catch(e) {
            console.warn('Course save error:', e);
            if (e.message !== 'انتهت صلاحية الجلسة') showToast('⚠️ تعذر حفظ الدورة — أعد المحاولة', 'warning');
        } finally {
            isSavingCourse = false;
            if (createCourseBtn) {
                createCourseBtn.disabled = false;
                createCourseBtn.style.opacity = '';
                createCourseBtn.style.cursor = '';
                createCourseBtn.innerHTML = createCourseBtn.dataset.oldHtml || '<i class="fas fa-check"></i> إنشاء الدورة';
            }
        }
    }

    async function deleteCourse(id) {
        if (checkGuestAction()) return;
        if (!confirm('هل أنت متأكد من حذف هذه الدورة؟')) return;
        try {
            const res = await fetchWithAuth(`/api/course/delete/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('✅ تم حذف الدور', 'success');
                loadCourses();
            } else {
                console.warn('Course delete rejected:', data.error);
                showToast(data.error || '⚠️ تعذر حذف الدورة — أعد المحاولة', 'warning');
            }
        } catch(e) {
            console.warn('Course delete error:', e);
            if (e.message !== 'انتهت صلاحية الجلسة') showToast('⚠️ تعذر حذف الدورة — أعد المحاولة', 'warning');
        }
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
                        if (typeof loadBalance === 'function') loadBalance();
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
    // INIT
    // ================================================================

    function showInitialSection() {
        const urlParams = new URLSearchParams(window.location.search);
        const groupParam = urlParams.get('join_group') || urlParams.get('group');
        const exerciseParam = urlParams.get('exercise');
        const sectionParam = urlParams.get('section');

        // ✅ حالة الدفع بعد العودة من البوابة
        const paymentReturnStatus = urlParams.get('status');
        if (paymentReturnStatus) handlePaymentReturnStatus(paymentReturnStatus, urlParams.get('txn'));

        if (groupParam) {
            showSection('groups');
            setTimeout(() => {
                enterGroupChat(groupParam, '', '');
            }, 100);
            return;
        }

        if (exerciseParam) {
            showSection('exercises');
            return;
        }

        if (sectionParam) {
            showSection(sectionParam);
            return;
        }

        const isApproved = userData && userData.status === 'approved';
        // 🎯 التبويب الأول عند الدخول: «الدروس والتمارين» (كما طلب المستخدم)
        const defaultSection = isApproved ? 'exercises' : 'profile';
        showSection(defaultSection);
    }

    // ✅ ابدأ التهيئة فوراً وأظهر الواجهة مباشرة من بيانات localStorage
    // لتجنب شاشة فارغة، ث حدّث من الخادم في الخلفية
    function initTeacherDashboard() {
        const storedData = localStorage.getItem('userData') || localStorage.getItem('zoomdz_user') || localStorage.getItem('user');
        const storedToken = localStorage.getItem('token') || localStorage.getItem('zoomdz_token');

        if (!storedData || !storedToken) {
            console.warn('⚠️ مفقو التوكن أو البيانات، تحويل لصفحة الدخول فوراً');
            localStorage.removeItem('token');
            localStorage.removeItem('zoomdz_token');
            localStorage.removeItem('userData');
            localStorage.removeItem('zoomdz_user');
            localStorage.removeItem('user');
            window.location.href = '/index.html?login=1';
            return;
        }

        try {
            userData = JSON.parse(storedData);
            teacherId = userData ? userData.id : null;
            authToken = storedToken;
        } catch(e) {
            localStorage.clear();
            window.location.href = '/index.html?login=1';
            return;
        }

        if (!userData || !userData.id || (userData.role !== 'teacher' && !userData.is_guest)) {
            localStorage.clear();
            window.location.href = '/index.html?login=1';
            return;
        }

        if (checkAndHandleAutoLogout()) {
            return;
        }

        try {
            showInitialSection();
        } catch(e) {
            console.error('Error showing initial section:', e);
        }

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
            const loader = document.getElementById('platformPreloader');
            if (loader) {
                loader.classList.add('fade-out');
                loader.style.opacity = '0';
                loader.style.pointerEvents = 'none';
                setTimeout(() => {
                    loader.style.display = 'none';
                }, instant ? 50 : 250);
            }
        }

        // ✅ مؤقت أمان لضمان عدم بقاء المسبق مؤشراً بلا نهاية أبدًا
        setTimeout(() => {
            hidePreloader(true);
        }, 300);

        updatePreloaderProgress(30, 'جاري جلب معلومات الأستاذ...');
        // ✅ حدّث البيانات من الخادم في الخلفية
        loadUserData().then(() => {
            updatePreloaderProgress(85, 'جاري تهيئة اللوحة وتحديث الأقسام...');
            const urlParams = new URLSearchParams(window.location.search);
            const groupParam = urlParams.get('join_group') || urlParams.get('group');
            const exerciseParam = urlParams.get('exercise');
            if (groupParam) {
                showSection('groups');
                enterGroupChat(groupParam, '', '');
            } else if (exerciseParam) {
                showSection('exercises');
            }
            startAutoRefresh();
            hidePreloader(true);

            // ✅ فحص إكمال الملف للأستاذ المسجل عبر Google أو بحاجة لإكمال بياناته
            setTimeout(() => {
                try {
                    const isGuest = userData && (userData.is_guest || userData.id === -1);
                    if (!isGuest && userData) {
                        const needsCompletion = userData.requires_profile_completion === true || !userData.profile_completion;
                        const hasParam = new URLSearchParams(window.location.search).get('complete_profile') === 'true';
                        if (needsCompletion || hasParam) {
                            showToast('👋 مرحباً بك يا أستاذ في ZoomDz! يرجى إكمال ملفك الشخصي والوثائق للمراجعة والتفعيل', 'info');
                            if (typeof openCompleteProfileModal === 'function') {
                                openCompleteProfileModal();
                            }
                        }
                    }
                } catch(e) {}
            }, 1200);
        }).catch((err) => {
            console.error('Error in loadUserData:', err);
            hidePreloader(true);
        });

        // ✅ احصل على CSRF token
        getCsrfToken().catch(() => {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTeacherDashboard);
    } else {
        initTeacherDashboard();
    }

    let autoRefreshInterval = null;

    function startAutoRefresh() {
        checkUnreadPostsCount();
        checkUnreadMessagesCount();
        updateGroupsUnreadBadge();
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(async () => {
            if (!teacherId) return;
            try {
                await loadNotifications();
                await loadUserData();
                await loadBalance();
                await checkUnreadPostsCount();
                await checkUnreadMessagesCount();
                await updateGroupsUnreadBadge();

                const visibleTab = document.querySelector('.nav-tab.active');
                const section = visibleTab ? visibleTab.dataset.section : 'offers';

                if (section === 'offers') {
                    await loadOffers(true);
                } else if (section === 'messages') {
                    const chatView = document.getElementById('chatView');
                    if (chatView && chatView.style.display === 'block' && currentChatTeacher) {
                        await loadConversationMessages(currentChatTeacher.id, currentChatTeacher.type || 'teacher', true);
                    } else {
                        await loadConversations(true);
                    }
                } else if (section === 'earnings') {
                    await loadBalance();
                } else if (section === 'referral') {
                    if (typeof loadReferralData === 'function') await loadReferralData();
                }
            } catch (e) {
                // silent background polling
            }
        }, 60000);
    }

    async function manualRefresh() {
        const icon = document.getElementById('refreshIcon');
        if (icon) {
            icon.classList.add('fa-spin');
        }
        
        try {
            const visibleSection = document.querySelector('.nav-tab.active');
            if (visibleSection) {
                const section = visibleSection.dataset.section;
                if (section === 'offers') await loadOffers();
                else if (section === 'courses') await loadCourses();
                else if (section === 'messages') await loadConversations();
                else if (section === 'referral') await loadReferralData();
                else if (section === 'earnings') await loadBalance();
                else if (section === 'teachers') await loadTeachers();
                else if (section === 'profile') await loadUserData();
            }
            
            await loadBalance();
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

    async function fetchNewsTicker() {
        try {
            const res = await fetch('/api/settings/news_ticker?role=teacher');
            if (res.ok) {
                const rawData = await res.json();
                const data = rawData.teachers || rawData;
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
                
                if (ticker) ticker.style.display = 'block'; // Always show telegram and platform links
            }
        } catch (e) {
            console.error('Error fetching teacher news ticker:', e);
        }
    }
    
    // Fetch news on load
    fetchNewsTicker();

    // ================================================================
    // POSTS LOGIC (منشورات الأساتذة والمنتدى)
    // ================================================================
    let teacherPostsFilter = 'all'; // 'all' or 'saved'
    let teacherPostsOffset = 0;
    let teacherPostsLimit = 10;
    let teacherPostsHasMore = true;
    let teacherPostsLoading = false;
    let teacherPostsObserver = null;

    function setTeacherPostsFilter(filter) {
        if (teacherPostsFilter === filter) return;
        teacherPostsFilter = filter;

        const allBtn = document.getElementById('teacher-post-filter-all');
        const savedBtn = document.getElementById('teacher-post-filter-saved');

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

        loadTeacherPosts(true);
    }
    window.setTeacherPostsFilter = setTeacherPostsFilter;

    async function updateTeacherSavedCountBadge() {
        const badge = document.getElementById('teacherSavedPostsBadge');
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
    window.updateTeacherSavedCountBadge = updateTeacherSavedCountBadge;

    async function loadTeacherPosts(reset = true) {
        const feed = document.getElementById('postsFeedContainer');
        if (!feed) return;

        if (reset) {
            teacherPostsOffset = 0;
            teacherPostsHasMore = true;
            teacherPostsLoading = false;
            feed.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #6b7280;">
                    <i class="fas fa-spinner fa-spin fa-2x"></i>
                    <p style="margin-top: 10px;">جاري تحميل المنشورات...</p>
                </div>`;
        }

        if (teacherPostsLoading || (!reset && !teacherPostsHasMore)) return;
        teacherPostsLoading = true;

        try {
            let url = `/api/post?limit=${teacherPostsLimit}&offset=${teacherPostsOffset}`;
            if (teacherPostsFilter === 'saved') {
                url += '&saved_only=true';
            }

            const res = await fetchWithAuth(url);
            if (!res.ok) throw new Error('فشل جلب المنشورات');
            const data = await res.json();
            const posts = data.posts || [];
            
            updateTeacherSavedCountBadge();

            if (reset && posts.length === 0) {
                if (teacherPostsFilter === 'saved') {
                    feed.innerHTML = `
                        <div style="text-align: center; padding: 50px 20px; background: white; border-radius: 16px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 4px 18px rgba(0,0,0,0.03);">
                            <i class="fas fa-bookmark" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 12px;"></i>
                            <h4 style="font-weight: 800; color: #475569; margin-bottom: 6px;">لا توجد منشورات محفوظة</h4>
                            <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 16px;">يمكنك حفظ أي منشور للرجوع إليه لاحقاً بالنقر على زر حفظ 🔖 أسفل أي منشور.</p>
                            <button onclick="setTeacherPostsFilter('all')" style="background: var(--primary); color: white; border: none; padding: 8px 22px; border-radius: 20px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                                <i class="fas fa-stream"></i> استعراض جميع المنشورات
                            </button>
                        </div>`;
                } else {
                    feed.innerHTML = `
                        <div style="text-align: center; padding: 50px 20px; background: white; border-radius: 16px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 4px 18px rgba(0,0,0,0.03);">
                            <i class="fas fa-bullhorn" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 12px;"></i>
                            <h4 style="font-weight: 800; color: #475569; margin-bottom: 6px;">لا توجد منشورات حتى الآن</h4>
                            <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 16px;">كن أول من ينشر خبراً أو درساً مفيداً للطلاب والمعلمين!</p>
                            <button onclick="loadTeacherPosts(true)" style="background: var(--primary); color: white; border: none; padding: 8px 22px; border-radius: 20px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                                <i class="fas fa-sync-alt"></i> تحديث المنشورات
                            </button>
                        </div>`;
                }
                teacherPostsLoading = false;
                return;
            }

            const cardsHtml = posts.map(post => renderPostCardHtml(post, userData?.id)).join('');

            const oldSentinel = document.getElementById('teacherPostsSentinel');
            if (oldSentinel) oldSentinel.remove();

            if (reset) {
                feed.innerHTML = cardsHtml;
            } else {
                feed.insertAdjacentHTML('beforeend', cardsHtml);
            }

            teacherPostsOffset += posts.length;
            if (posts.length < teacherPostsLimit || (data && data.has_more === false)) {
                teacherPostsHasMore = false;
                const endCardHtml = `
                    <div style="text-align: center; padding: 25px 20px; background: white; border-radius: 16px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 4px 18px rgba(0,0,0,0.03); margin-top: 15px; margin-bottom: 25px;">
                        <i class="fas fa-check-circle" style="font-size: 2rem; color: var(--primary); margin-bottom: 8px;"></i>
                        <h4 style="font-weight: 800; color: #374151; margin-bottom: 4px; font-size: 0.95rem;">${teacherPostsFilter === 'saved' ? 'وصلت إلى نهاية منشوراتك المحفوظة' : 'شاهدت ميع المنشورات'}</h4>
                        <button onclick="loadTeacherPosts(true)" style="background: #f1f5f9; color: var(--primary); border: 1px solid #cbd5e1; padding: 8px 20px; border-radius: 20px; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; margin-top: 10px;">
                            <i class="fas fa-sync-alt"></i> تحديث من البداية
                        </button>
                    </div>`;
                feed.insertAdjacentHTML('beforeend', endCardHtml);
            } else {
                const sentinelHtml = `
                    <div id="teacherPostsSentinel" style="text-align: center; padding: 20px; color: #64748b; font-weight: 700;">
                        <i class="fas fa-spinner fa-spin"></i> جاري تحميل المزيد من المنشورات...
                    </div>`;
                feed.insertAdjacentHTML('beforeend', sentinelHtml);

                if (window.IntersectionObserver) {
                    if (teacherPostsObserver) teacherPostsObserver.disconnect();
                    teacherPostsObserver = new IntersectionObserver((entries) => {
                        if (entries[0].isIntersecting && teacherPostsHasMore && !teacherPostsLoading) {
                            loadTeacherPosts(false);
                        }
                    }, { threshold: 0.1 });
                    const newSentinel = document.getElementById('teacherPostsSentinel');
                    if (newSentinel) teacherPostsObserver.observe(newSentinel);
                }
            }
        } catch (e) {
            console.error('Error loading posts:', e);
            if (reset) {
                feed.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: #ef4444; background: white; border-radius: 16px;">
                        <i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom: 8px;"></i>
                        <p>حدث خطأ أثناء تحميل المنشورات</p>
                        <button onclick="loadTeacherPosts(true)" style="margin-top: 10px; background: #fee2e2; color: #991b1b; border: none; padding: 6px 16px; border-radius: 12px; font-weight: 700; cursor: pointer;">إعادة المحاولة</button>
                    </div>`;
            }
        } finally {
            teacherPostsLoading = false;
        }
    }
    window.loadTeacherPosts = loadTeacherPosts;
    window.loadPosts = loadTeacherPosts;

    function renderPostCardHtml(post, currentTeacherId) {
        const isStudentPost = !!post.is_student_post || post.author_type === 'student' || !!post.student_id;
        const isOwner = !isStudentPost && (post.teacher_id === currentTeacherId);
        const postDate = post.created_at ? new Date(post.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '';
        const authorImg = post.teacher_profile_image || '/images/default-avatar.svg';
        const isFollowing = post.is_following || false;

        let linkHtml = '';
        if (post.link_url) {
            const isPdf = post.link_url.toLowerCase().includes('.pdf');
            let href = post.link_url.startsWith('http') ? post.link_url : 'https://' + post.link_url;
            linkHtml = `
                <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; gap: 10px; background: ${isPdf ? '#fef2f2' : '#f0fdf4'}; border: 1px solid ${isPdf ? '#fecaca' : '#bbf7d0'}; color: ${isPdf ? '#991b1b' : '#166534'}; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; text-decoration: none; font-weight: 600; font-size: 0.88rem; word-break: break-all; transition: background 0.2s;">
                    <i class="fas ${isPdf ? 'fa-file-pdf' : 'fa-external-link-alt'}" style="color: ${isPdf ? '#ef4444' : '#16a34a'};"></i>
                    <span>${isPdf ? 'فتح تمرين الـ PDF المرفق' : escapeHtml(post.link_url)}</span>
                </a>`;
        }

        let actionArea = '';
        if (isOwner) {
            actionArea = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.75rem; background: #f1f5f9; color: #64748b; padding: 3px 10px; border-radius: 12px; font-weight: 700;">منشورك</span>
                    <button onclick="deletePost(${post.id})" style="background: #fef2f2; color: #ef4444; border: none; padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; cursor: pointer; font-weight: 700; display: flex; align-items: center; gap: 4px; transition: 0.2s; opacity: 0.8;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">
                        <i class="fas fa-trash-alt"></i> حذف
                    </button>
                </div>`;
        } else if (!isStudentPost && post.teacher_id) {
            actionArea = `
                <button class="follow-btn-${post.teacher_id}" onclick="event.stopPropagation(); toggleFollowTeacher(${post.teacher_id}, '${escapeHtml(post.teacher_name || 'أستاذ')}', '${authorImg}')" style="${isFollowing ? 'background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;' : 'background: var(--primary); color: white; border: none;'} padding: 6px 16px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.3s ease; box-shadow: ${isFollowing ? 'none' : '0 4px 12px rgba(15, 92, 191, 0.2)'};">
                    <i class="fas ${isFollowing ? 'fa-check-circle' : 'fa-user-plus'}"></i>
                    <span>${isFollowing ? 'تتابعه' : 'متابعة'}</span>
                </button>`;
        }

        const profileClick = isStudentPost
            ? `showStudentProfile(${post.student_id || post.user_id || post.teacher_id})`
            : `showTeacherProfileFromPost(${post.teacher_id})`;

        const authorName = post.teacher_name || (isStudentPost ? 'طالب المنصة' : 'أستاذ');
        const authorSpec = (typeof formatEduLevel === 'function' ? formatEduLevel(post.teacher_specialization) : post.teacher_specialization) || (isStudentPost ? 'طالب المنصة' : 'مدرس');

        let avatarBadgeHtml = '';
        let nameBadgeHtml = '';

        if (isStudentPost) {
            avatarBadgeHtml = '<span title="طالب 🎓" style="position: absolute; bottom: -2px; right: -2px; background: #0284c7; color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.55rem; border: 2px solid white; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.4); z-index: 2;"><i class="fas fa-user-graduate"></i></span>';
            nameBadgeHtml = '<span style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; font-size: 0.68rem; padding: 2px 8px; border-radius: 8px; font-weight: 800;"><i class="fas fa-user-graduate"></i> طالب</span>';
        } else {
            const isPostCertified = Boolean(post.is_certified === true || post.teacher_is_certified === true || post.status === 'certified');
            avatarBadgeHtml = isPostCertified
                ? '<span title="أستاذ معتمد 👑" style="position: absolute; bottom: -2px; right: -2px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; border: 2px solid white; box-shadow: 0 2px 5px rgba(217, 119, 6, 0.4); z-index: 2;"><i class="fas fa-crown"></i></span>'
                : '<span title="أستاذ موثق 🔵" style="position: absolute; bottom: -2px; right: -2px; background: #2563eb; color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.55rem; border: 2px solid white; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.4); z-index: 2;"><i class="fas fa-check"></i></span>';
            nameBadgeHtml = isPostCertified
                ? '<i class="fas fa-crown" style="font-size: 0.85rem; color: #f59e0b;" title="أستاذ معتمد (شارة ذهبية)"></i>'
                : '<i class="fas fa-check-circle" style="font-size: 0.85rem; color: #2563eb;" title="أستاذ موثق (شارة زرقاء)"></i>';
        }

        return `
            <div class="post-card" id="post-card-${post.id}" style="background: white; border-radius: 20px; padding: 24px; margin-bottom: 24px; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.05); border: 1px solid #cbd5e1; border-top: 3px solid #1e3a8a; transition: transform 0.2s ease;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;">
                    <div style="display: flex; align-items: center; gap: 14px; cursor: pointer;" onclick="${profileClick}" title="عرض الملف الشخصي">
                        <div style="position: relative;">
                            <img src="${escapeHtml(authorImg)}" alt="avatar" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2px solid white; box-shadow: 0 0 0 2px #cbd5e1;" referrerpolicy="no-referrer" onerror="this.src='/images/default-avatar.svg'">
                            ${avatarBadgeHtml}
                        </div>
                        <div>
                            <div style="font-weight: 800; font-size: 1.05rem; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                                <span>${escapeHtml(authorName)}</span>
                                ${nameBadgeHtml}
                            </div>
                            <div style="font-size: 0.8rem; color: #334155; font-weight: 700;">${escapeHtml(authorSpec)} • <span style="color: #64748b; font-weight: 500;">${postDate}</span></div>
                        </div>
                    </div>
                    ${actionArea}
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
                    ${(userData && (userData.is_guest || userData.id === -1)) ? `
                        <div style="background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 12px 16px; text-align: center; color: #64748b; font-size: 0.88rem; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer;" onclick="checkGuestAction()">
                            <i class="fas fa-lock" style="color: #1e3a8a;"></i>
                            <span>يجب عليك <strong style="color: #1e3a8a; text-decoration: underline;">تسجيل الدخول أو إنشاء حساب</strong> لإضافة تعليق</span>
                        </div>
                    ` : `
                        <div style="display: flex; gap: 10px; align-items: center; background: white; padding: 6px 8px 6px 8px; border-radius: 30px; border: 1.5px solid #cbd5e1; box-shadow: 0 1px 4px rgba(0,0,0,0.03);">
                            <input type="text" id="comment-input-${post.id}" placeholder="اكتب تعليقاً مميزاً على المنشور..." onkeypress="if(event.key==='Enter') submitPostComment(${post.id})" style="flex: 1; padding: 8px 14px; border: none; background: transparent; font-size: 0.9rem; outline: none; font-family: 'Cairo', sans-serif; font-weight: 600;">
                            <button onclick="submitPostComment(${post.id})" style="background: #1e3a8a; color: white; border: none; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.15s ease;" title="نشر التعليق" onmouseover="this.style.transform='scale(1.06)'" onmouseout="this.style.transform='scale(1)'">
                                <i class="fas fa-paper-plane" style="font-size: 0.9rem;"></i>
                            </button>
                        </div>
                    `}
                </div>
            </div>`;
    }

    async function toggleFollowTeacher(tId, teacherName, teacherImage) {
        if (checkGuestAction()) return;
        if (tId === teacherId) {
            showToast('⚠️ لا يمكنك متابعة نفسك', 'warning');
            return;
        }
        try {
            const res = await fetchWithAuth('/api/post/toggle-follow', {
                method: 'POST',
                body: JSON.stringify({ teacher_id: tId })
            });
            const data = await res.json();
            if (data.success) {
                const isFlw = data.is_following;
                showToast(isFlw ? '✅ تمت متابعة الأستاذ بنجاح' : 'ℹ️ تم إلغاء المتابعة', 'success');
                
                if (isFlw && teacherName && teacherImage) {
                    startChatWithTeacher(tId, teacherName, teacherImage);
                }
                
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
                    el.innerHTML = `<i class="fas fa-users" style="font-size: 1rem; opacity: 0.8; margin-left: 4px;"></i>${currentCount}`;
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

    async function showTeacherProfileFromPost(tId, forceModal = false) {
        if (tId === teacherId && !forceModal) {
            showSection('profile');
            return;
        }
        const modal = document.getElementById('viewTeacherModal');
        const body = document.getElementById('viewTeacherModalBody');
        if (!modal || !body) return;
        
        modal.style.display = 'flex';
        body.innerHTML = `<div style="text-align:center; padding:40px; color:#6b7280;"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top:12px; font-weight:700;">جاري تحميل بيانات الأستاذ...</p></div>`;
        
        try {
            const res = await fetchWithAuth(`/api/teacher/public/teacher/${tId}`);
            const data = await res.json();
            if (!data.success || !data.teacher) {
                body.innerHTML = `<div style="text-align:center; color:#ef4444; padding:30px;"><i class="fas fa-exclamation-circle fa-2x" style="margin-bottom:10px;"></i><p>تعذر جلب بيانات الأستاذ</p></div>`;
                return;
            }
            const t = data.teacher;
            const img = getValidImageUrl(t.profile_image, t.full_name || 'أستاذ', 120);
            
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
                'other': 'مستوى آخر / عام'
            };
            const teachingLevelDisplay = t.teaching_level ? (levelMap[t.teaching_level] || t.teaching_level) : null;

            let socialHtml = '';
            const socialLinks = [
                { url: t.facebook_url, icon: 'fab fa-facebook', color: '#1877f2', name: 'فيسبوك' },
                { url: t.instagram_url, icon: 'fab fa-instagram', color: '#e4405f', name: 'انستغرام' },
                { url: t.linkedin_url, icon: 'fab fa-linkedin-in', color: '#0a66c2', name: 'لينكدإن' },
                { url: t.youtube_url, icon: 'fab fa-youtube', color: '#ff0000', name: 'يوتيوب' },
                { url: t.twitter_url, icon: 'fab fa-x-twitter', color: '#000000', name: 'تويتر' },
                { url: t.website_url, icon: 'fas fa-globe', color: 'var(--primary)', name: 'الموقع' },
            ];
            const activeLinks = socialLinks.filter(l => l.url && l.url.trim());
            if (activeLinks.length > 0) {
                socialHtml = `<div style="display:flex; justify-content:center; gap:10px; margin-top:14px; flex-wrap:wrap;">
                    ${activeLinks.map(l => `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" style="color:${l.color}; background:#f8fafc; border:1px solid #e2e8f0; width:38px; height:38px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:1.1rem; transition:transform 0.2s;" title="${l.name}"><i class="${l.icon}"></i></a>`).join('')}
                </div>`;
            }

            body.innerHTML = `
                <div style="background: white; border-radius: 20px; overflow: hidden; text-align: center;">
                    <!-- Cover Header -->
                    <div style="background: linear-gradient(135deg, var(--primary) 0%, #4f46e5 100%); height: 110px; position: relative;">
                        ${(() => {
                            const isCertView = Boolean(t.is_certified === true || t.status === 'certified');
                            const viewBadgeOverlay = isCertView
                                ? '<span title="أستاذ معتمد - شارة ذهبية 👑" style="position: absolute; bottom: 0; right: 0; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; border: 3px solid white; box-shadow: 0 2px 6px rgba(217, 119, 6, 0.5); z-index: 2;"><i class="fas fa-crown"></i></span>'
                                : '<span title="أستاذ موثق - شارة زرقاء 🔵" style="position: absolute; bottom: 0; right: 0; background: #2563eb; color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; border: 3px solid white; box-shadow: 0 2px 5px rgba(37, 99, 235, 0.4); z-index: 2;"><i class="fas fa-check"></i></span>';
                            const viewNameIcon = isCertView
                                ? '<i class="fas fa-crown" style="font-size: 1.1rem; color: #f59e0b;" title="أستاذ معتمد (شارة ذهبية) 👑"></i>'
                                : '<i class="fas fa-check-circle" style="font-size: 1.1rem; color: #2563eb;" title="أستاذ موثق (شارة زرقاء) 🔵"></i>';
                            return `<div style="position: absolute; bottom: -45px; left: 50%; transform: translateX(-50%);">
                                <div style="position: relative; display: inline-block;">
                                    <img src="${img}" data-original-url="${img}" alt="avatar" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: ${isCertView ? '4px solid #f59e0b' : '4px solid #2563eb'}; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" referrerpolicy="no-referrer" onerror="handleImageFallback(this)">
                                    ${viewBadgeOverlay}
                                </div>
                            </div>
                        </div>
                        <div style="padding: 52px 20px 0 20px;">
                            <h3 style="font-weight: 850; color: #1e293b; font-size: 1.35rem; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                <span>${escapeHtml(t.full_name)}</span>
                                ${viewNameIcon}
                            </h3>`;
                        })()}
                        <div style="color: var(--primary); font-weight: 700; font-size: 0.92rem; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            <i class="fas fa-book-open"></i>
                            <span>${escapeHtml(t.specialization || 'تخصص عام')}</span>
                        </div>

                        <!-- Action Buttons (Follow/Message) -->
                        <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 20px;">
                            <button class="follow-btn-${t.id}" onclick="toggleFollowTeacher(${t.id})" style="${t.is_following ? 'background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;' : 'background: var(--primary); color: white; border: none;'} padding: 8px 20px; border-radius: 25px; font-weight: 800; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s;">
                                <i class="fas ${t.is_following ? 'fa-check-circle' : 'fa-user-plus'}"></i> <span>${t.is_following ? 'تتابعه' : 'متابعة'}</span>
                            </button>
                            <button onclick="document.getElementById('viewTeacherModal').style.display='none'; startChatWithTeacher(${t.id}, '${escapeHtml(t.full_name)}', '${escapeHtml(img)}'); showSection('messages');" style="background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; padding: 8px 20px; border-radius: 25px; font-weight: 800; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s;">
                                <i class="fas fa-paper-plane" style="color: var(--primary);"></i> مراسلة
                            </button>
                        </div>

                        <!-- Custom Tabs for Profile Modal -->
                        <div style="display: flex; border-bottom: 1px solid #f1f5f9; margin: 0 -20px; padding: 0 20px;">
                            <button onclick="switchTeacherProfileTab('info')" id="teacher-tab-info" style="flex: 1; padding: 12px 6px; border: none; background: none; font-weight: 800; font-size: 0.88rem; color: var(--primary); border-bottom: 3px solid var(--primary); cursor: pointer; transition: 0.2s;">
                                <i class="fas fa-info-circle" style="margin-left: 4px;"></i> معلومات
                            </button>
                            <button onclick="switchTeacherProfileTab('posts', ${t.id})" id="teacher-tab-posts" style="flex: 1; padding: 12px 6px; border: none; background: none; font-weight: 700; font-size: 0.88rem; color: #64748b; border-bottom: 3px solid transparent; cursor: pointer; transition: 0.2s;">
                                <i class="fas fa-newspaper" style="margin-left: 4px;"></i> المنشورات
                            </button>
                            <button onclick="switchTeacherProfileTab('ratings')" id="teacher-tab-ratings" style="flex: 1; padding: 12px 6px; border: none; background: none; font-weight: 700; font-size: 0.88rem; color: #64748b; border-bottom: 3px solid transparent; cursor: pointer; transition: 0.2s;">
                                <i class="fas fa-star" style="margin-left: 4px; color: #eab308;"></i> التقييمات (${t.ratings_count || 0})
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
                                ${socialHtml || '<p style="text-align:center; color:#94a3b8; font-size:0.85rem;">لا توجد روابط تواصل اجتماعي متوفرة</p>'}
                            </div>
                        </div>

                        <!-- Tab Content: Posts (Hidden by default) -->
                        <div id="teacher-content-posts" style="display: none;">
                            <div id="teacher-profile-posts-list" style="text-align: center; padding: 20px;">
                                <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary);"></i>
                                <p style="margin-top: 10px; color: #64748b;">جاري تحميل المنشورات...</p>
                            </div>
                        </div>

                        <!-- Tab Content: Ratings (Hidden by default - READ ONLY FOR TEACHERS) -->
                        <div id="teacher-content-ratings" style="display: none;">
                            <div style="background: #fefce8; border: 1px solid #fef08a; padding: 10px 14px; border-radius: 12px; margin-bottom: 16px; font-size: 0.82rem; color: #854d0e; font-weight: 700; display: flex; align-items: center; gap: 8px; text-align: right;">
                                <i class="fas fa-eye" style="color: #ca8a04; font-size: 0.95rem;"></i>
                                <span>تييمات الأستاذ (للقراءة فقط) - لا يمكن للمعلمين قييم بعضهم البعض.</span>
                            </div>

                            <!-- Rating Summary Box -->
                            <div style="background: white; padding: 16px; border-radius: 16px; border: 1px solid #f1f5f9; text-align: center; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                                <div style="font-size: 2.2rem; font-weight: 900; color: #1e293b; line-height: 1;">${t.avg_rating || 0} <span style="font-size: 1rem; color: #94a3b8; font-weight: 600;">/ 5</span></div>
                                <div style="color: #eab308; margin: 8px 0; font-size: 1.1rem;">
                                    ${(function(rating){
                                        let stars = '';
                                        const rounded = Math.round((rating || 0) * 2) / 2;
                                        for (let i = 1; i <= 5; i++) {
                                            if (i <= rounded) stars += '<i class="fas fa-star" style="color:#eab308; margin:0 1px;"></i>';
                                            else if (i - 0.5 === rounded) stars += '<i class="fas fa-star-half-alt" style="color:#eab308; margin:0 1px;"></i>';
                                            else stars += '<i class="far fa-star" style="color:#cbd5e1; margin:0 1px;"></i>';
                                        }
                                        return stars;
                                    })(t.avg_rating || 0)}
                                </div>
                                <div style="font-size: 0.82rem; color: #64748b; font-weight: 700;">إجمالي التقييمات: ${t.ratings_count || 0} تقييم</div>
                            </div>

                            <!-- Reviews list -->
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                ${t.ratings && t.ratings.length > 0 ? t.ratings.map(r => `
                                    <div style="background: white; padding: 14px; border-radius: 12px; border: 1px solid #f1f5f9; text-align: right; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                            <div style="font-weight: 700; font-size: 0.88rem; color: #1e293b; display: flex; align-items: center; gap: 6px;">
                                                <i class="fas fa-user-graduate" style="color: var(--primary);"></i>
                                                <span>${escapeHtml((r.students && r.students.full_name) || r.student_name || 'طالب')}</span>
                                            </div>
                                            <div style="color: #eab308; font-size: 0.8rem;">
                                                ${(function(val){
                                                    let stars = '';
                                                    for (let i = 1; i <= 5; i++) {
                                                        stars += `<i class="${i <= (val || 5) ? 'fas' : 'far'} fa-star" style="color:#eab308; margin:0 1px;"></i>`;
                                                    }
                                                    return stars;
                                                })(r.rating)}
                                            </div>
                                        </div>
                                        ${r.review ? `<p style="font-size: 0.85rem; color: #475569; margin: 6px 0 0 0; line-height: 1.5;">${escapeHtml(r.review)}</p>` : ''}
                                        <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 6px; text-align: left;">
                                            ${r.created_at ? new Date(r.created_at).toLocaleDateString('ar-EG') : ''}
                                        </div>
                                    </div>
                                `).join('') : '<div style="text-align: center; color: #94a3b8; font-size: 0.88rem; padding: 24px 0;"><i class="far fa-star fa-2x" style="margin-bottom: 8px; display: block; color: #cbd5e1;"></i> لا توجد تقييمات لهذا الأستاذ بعد</div>'}
                            </div>
                        </div>
                    </div>
                </div>`;
        } catch(e) {
            console.error('Error fetching teacher profile modal:', e);
            body.innerHTML = `<div style="text-align:center; color:#ef4444; padding:30px;"><i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom:10px;"></i><p>حدث خطأ أثناء جلب الملف الشخصي</p></div>`;
        }
    }

    // ✅ التبديل بين تبويبات الملف الشخصي للأستاذ
    function switchTeacherProfileTab(tab, tId) {
        const infoBtn = document.getElementById('teacher-tab-info');
        const postsBtn = document.getElementById('teacher-tab-posts');
        const ratingsBtn = document.getElementById('teacher-tab-ratings');
        
        const infoContent = document.getElementById('teacher-content-info');
        const postsContent = document.getElementById('teacher-content-posts');
        const ratingsContent = document.getElementById('teacher-content-ratings');
        
        if (!infoBtn || !postsBtn || !infoContent || !postsContent) return;

        [infoBtn, postsBtn, ratingsBtn].forEach(btn => {
            if (btn) {
                btn.style.color = '#64748b';
                btn.style.borderBottom = '3px solid transparent';
                btn.style.fontWeight = '700';
            }
        });

        [infoContent, postsContent, ratingsContent].forEach(cnt => {
            if (cnt) cnt.style.display = 'none';
        });

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
            if (ratingsBtn) {
                ratingsBtn.style.color = 'var(--primary)';
                ratingsBtn.style.borderBottom = '3px solid var(--primary)';
                ratingsBtn.style.fontWeight = '800';
            }
            if (ratingsContent) ratingsContent.style.display = 'block';
        }
    }

    // ✅ جلب منشورات أستاذ معين للمودال
    async function loadTeacherProfilePosts(tId) {
        const list = document.getElementById('teacher-profile-posts-list');
        if (!list) return;
        
        try {
            const res = await fetchWithAuth(`/api/post?teacher_id=${tId}&limit=10`);
            const data = await res.json();
            const posts = data.posts || [];
            
            if (posts.length === 0) {
                list.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: #94a3b8;">
                        <i class="fas fa-newspaper fa-3x" style="margin-bottom: 12px; opacity: 0.3;"></i>
                        <p style="font-weight: 700;">لا توجد منشورات لهذا الأستاذ حالياً</p>
                    </div>`;
                return;
            }
            
            // استخدام نفس وظيفة الرندر لكن مع تحسينات بسيطة للمودال
            list.style.textAlign = 'right';
            list.innerHTML = posts.map(p => renderPostCardHtml(p, userData?.id)).join('');
        } catch (e) {
            console.error('Error loading teacher profile posts:', e);
            list.innerHTML = `<p style="color: #ef4444; text-align: center;">فشل تحميل المنشورات</p>`;
        }
    }

    async function showStudentProfile(sId) {
        if (!sId) return;
        const modal = document.getElementById('viewStudentModal');
        const body = document.getElementById('viewStudentModalBody');
        if (!modal || !body) return;

        modal.style.display = 'flex';
        body.innerHTML = `<div style="text-align:center; padding:35px; color:#6b7280;"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;">جاري تحميل بيانات الطالب...</p></div>`;

        try {
            const res = await fetchWithAuth(`/api/student/public/student/${sId}`);
            const data = await res.json();
            if (!data.success || !data.student) {
                body.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">تعذر جلب بيانات الطالب</div>`;
                return;
            }
            const s = data.student;
            const img = s.profile_image || '/images/default-avatar.svg';

            // Check if student is blocked
            let isBlocked = false;
            try {
                const blockRes = await fetchWithAuth('/api/messages/blocked-students');
                const blockData = await blockRes.json();
                if (blockData.success && blockData.blocked_ids) {
                    isBlocked = blockData.blocked_ids.includes(s.id);
                }
            } catch (blockErr) {
                console.error('Error checking block status:', blockErr);
            }

            const isFollowing = s.is_following || false;
            body.innerHTML = `
                <div style="text-align:center;">
                    <img src="${escapeHtml(img)}" alt="avatar" style="width:90px; height:90px; border-radius:50%; object-fit:cover; border:3px solid var(--primary); margin-bottom:12px; box-shadow:0 4px 14px rgba(0,0,0,0.1);" referrerpolicy="no-referrer" onerror="this.src='/images/default-avatar.svg'">
                    <h3 style="font-weight:800; color:#1f2937; margin-bottom:4px; font-size:1.2rem;">${escapeHtml(s.full_name || 'طالب')}</h3>
                    <div class="student-followers-count-${s.id}" style="color:var(--primary); font-weight:700; font-size:0.9rem; margin-bottom:12px;"><i class="fas fa-user-graduate"></i> طالب المنصة (${s.followers_count || 0} متابع)</div>
                    ${s.education_level ? `<div style="font-size:0.88rem; color:#4b5563; background:#f8fafc; padding:10px 14px; border-radius:12px; display:inline-block; margin-bottom:16px; border:1px solid #e2e8f0;"><i class="fas fa-graduation-cap" style="color:var(--primary);"></i> <strong>المستوى التعليمي:</strong> ${escapeHtml(s.education_level)}</div>` : ''}
                    <div style="display:flex; gap:10px; justify-content:center; margin-top:8px; flex-wrap:wrap;">
                        <button onclick="document.getElementById('viewStudentModal').style.display='none'; startChatWithStudent(${s.id}, '${escapeHtml(s.full_name)}', '${escapeHtml(img)}'); showSection('messages');" style="background:var(--primary); color:white; border:none; padding:8px 22px; border-radius:20px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                            <i class="fas fa-paper-plane"></i> تواصل مع الطالب
                        </button>
                        <button class="student-follow-btn-${s.id}" onclick="toggleFollowStudent(${s.id})" style="${isFollowing ? 'background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;' : 'background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;'} padding: 8px 22px; border-radius: 20px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                            <i class="fas ${isFollowing ? 'fa-check-circle' : 'fa-user-plus'}"></i> <span>${isFollowing ? 'تتابعه' : 'متابعة'}</span>
                        </button>
                        <button id="blockStudentBtn-${s.id}" onclick="toggleBlockStudent(${s.id}, ${isBlocked})" style="background:${isBlocked ? '#fecaca' : '#f1f5f9'}; color:${isBlocked ? '#dc2626' : '#475569'}; border:1px solid ${isBlocked ? '#fca5a5' : '#cbd5e1'}; padding:8px 22px; border-radius:20px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                            <i class="fas ${isBlocked ? 'fa-unlock' : 'fa-ban'}"></i> <span>${isBlocked ? 'إلغاء الحظر' : 'حظر الطالب'}</span>
                        </button>
                    </div>
                </div>`;
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
                        el.innerHTML = `<i class="fas fa-user-graduate"></i> طالب المنصة (${data.followers_count} متابع)`;
                    }
                });
            } else {
                showToast(data.error || 'حدث خطأ', 'error');
            }
        } catch (e) {
            console.error('Error toggling student follow:', e);
            showToast('حدث خطأ في الشبكة', 'error');
        }
    }
    window.toggleFollowStudent = toggleFollowStudent;

    async function toggleBlockStudent(sId, currentlyBlocked) {
        const btn = document.getElementById(`blockStudentBtn-${sId}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...';
        }
        const endpoint = currentlyBlocked ? '/api/messages/unblock' : '/api/messages/block';
        try {
            const res = await fetchWithAuth(endpoint, {
                method: 'POST',
                body: JSON.stringify({ student_id: sId })
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, 'success');
                showStudentProfile(sId);
            } else {
                showToast(data.error || 'حدث خطأ', 'error');
                if (btn) btn.disabled = false;
            }
        } catch(e) {
            if (e.message !== 'انتهت صلاحية الجلسة') showToast('حدث خطأ غير متوقع', 'error');
            if (btn) btn.disabled = false;
        }
    }

    async function checkUnreadPostsCount() {
        try {
            const lastViewed = localStorage.getItem('last_teacher_posts_view_time') || '';
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
            if (e && e.message && (e.message.includes('Failed to fetch') || e.message.includes('انتهت صلاحية الجلسة'))) {
                console.warn('⚠️ متعذر التحقق من المنشورات غير المقروءة بسبب مؤشر الشبكة.');
            } else {
                console.error('Error checking unread posts count:', e);
            }
        }
    }

    async function checkUnreadMessagesCount() {
        try {
            if (!teacherId) return;
            const res = await fetchWithAuth(`/api/messages/unread-count/${teacherId}/teacher`);
            if (res.ok) {
                const data = await res.json();
                const count = data.unread_count || 0;
                const b1 = document.getElementById('messagesBadge');
                const b2 = document.getElementById('mobileMessagesBadge');
                const b3 = document.getElementById('messagesBadgeSidebar');
                if (count > 0) {
                    const displayVal = count > 99 ? '99+' : count;
                    if (b1) { b1.textContent = displayVal; b1.style.display = 'inline-block'; }
                    if (b2) { b2.textContent = displayVal; b2.style.display = 'flex'; }
                    if (b3) { b3.textContent = displayVal; b3.style.display = 'inline-block'; }
                } else {
                    if (b1) b1.style.display = 'none';
                    if (b2) b2.style.display = 'none';
                    if (b3) b3.style.display = 'none';
                }
            }
        } catch (e) {
            if (e && e.message && (e.message.includes('Failed to fetch') || e.message.includes('انتهت صلاحية الجلسة'))) {
                console.warn('⚠️ متعذر التحقق من الرسائل غير المقروءة بسبب مؤشر الشبكة.');
            } else {
                console.error('Error checking unread messages count:', e);
            }
        }
    }

    async function submitNewPost() {
        if (!checkTeacherProfileComplete()) return;
        if (checkGuestAction()) return;
        if (userData && userData.status !== 'approved') {
            showToast('⚠️ لا يمكنك إضافة منشور حتى يتم قبول حسابك من قبل الإدارة', 'warning');
            return;
        }
        const contentInput = document.getElementById('postContentInput');
        const linkInput = document.getElementById('postLinkInput');
        const hashtagsInput = document.getElementById('postHashtagsInput');
        const fileInput = document.getElementById('postFiles');
        let content = contentInput?.value.trim();
        const link_url = linkInput?.value.trim();
        const rawHashtags = hashtagsInput?.value.trim();

        if (!content) {
            showToast('⚠️ يرجى كتابة محتوى المنشور أولاً', 'warning');
            return;
        }

        if (rawHashtags) {
            const formattedHashtags = rawHashtags.split(/\s+/)
                .filter(tag => tag)
                .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
                .join(' ');
            if (formattedHashtags && !content.includes(formattedHashtags)) {
                content += `\n\n${formattedHashtags}`;
            }
        }

        const formData = new FormData();
        formData.append('content', content);
        if (link_url) {
            formData.append('link_url', link_url);
        }
        
        // استخدام المصفوفة العالمية بدلاً من input.files مباشرة
        if (postFilesArray.length > 0) {
            postFilesArray.forEach(file => {
                formData.append('files', file);
            });
        }
        
        const pdfFile = document.getElementById('postPdfInput')?.files[0];
        if (pdfFile) {
            if (pdfFile.size > 5 * 1024 * 1024) {
                showToast('⚠️ حجم ملف الـ PDF كبير جداً (أقصى حد 5 ميجابايت)', 'error');
                return;
            }
            formData.append('pdf_file', pdfFile);
        }

        // ✅ زر النشر: بدور يمنع الضغط المتكرر والنشر المزدوج أثناء الرفع
        const postSubmitBtn = document.getElementById('postSubmitBtn');
        if (postSubmitBtn) {
            postSubmitBtn.disabled = true;
            postSubmitBtn.style.opacity = '0.7';
            postSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري النشر...';
        }

        try {
            const res = await fetchWithAuth('/api/post/create', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ تم نشر المنشور بنجاح', 'success');
                contentInput.value = '';
                if (linkInput) linkInput.value = '';
                if (hashtagsInput) hashtagsInput.value = '';
                postFilesArray = [];
                document.getElementById('postPreviewContainer').innerHTML = '';
                const uploadArea = document.getElementById('uploadArea');
                if (uploadArea) {
                    uploadArea.style.borderColor = 'var(--gray-300)';
                    uploadArea.style.background = '#f8fafc';
                }
                hideAddPostModal(); // إغلاق النافذة بعد النشر الناجح
                loadTeacherPosts();
            } else {
                showToast('❌ ' + (data.error || 'فشل نشر المنشور'), 'error');
            }
        } catch (e) {
            console.error('Error submitting post:', e);
            showToast('❌ حدث خطأ أثناء النشر', 'error');
        } finally {
            if (postSubmitBtn) {
                postSubmitBtn.disabled = false;
                postSubmitBtn.style.opacity = '';
                postSubmitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> نشر';
            }
        }
    }

    async function deletePost(postId) {
        if (checkGuestAction()) return;
        if (!confirm('⚠️ هل أنت متأكد من حذف هذا المنشور؟ لا يمكن التراجع عن هذه العملية.')) return;
        try {
            const res = await fetchWithAuth(`/api/post/${postId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ تم حذف المنشور بنجاح', 'success');
                loadTeacherPosts();
            } else {
                showToast('❌ ' + (data.error || 'فشل حذف المنشور'), 'error');
            }
        } catch (e) {
            console.error('Error deleting post:', e);
            showToast('❌ حدث خطأ أثناء محاولة حذف المنشور', 'error');
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
                updateTeacherSavedCountBadge();

                // If currently viewing saved filter and item was removed, optionally refresh
                if (teacherPostsFilter === 'saved' && !isSaved) {
                    const card = document.getElementById(`post-card-${postId}`);
                    if (card) {
                        card.style.transition = 'all 0.3s ease';
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.95)';
                        setTimeout(() => {
                            card.remove();
                            const feed = document.getElementById('postsFeedContainer');
                            if (feed && !feed.querySelector('.post-card')) {
                                loadTeacherPosts(true);
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
                    <span>فشل تحميل الحفوظات</span>
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
                el.style.border = '1px solid #cbd5e1';
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
                    const feed = document.getElementById('postsFeedContainer');
                    if (feed) {
                        // remove placeholder/empty-state if present
                        if (feed.innerHTML.includes('لا توجد منشورات') || feed.innerHTML.includes('جاري تحميل منشورات')) {
                            feed.innerHTML = '';
                        }
                        const cardHtml = renderPostCardHtml(post, userData?.id);
                        feed.insertAdjacentHTML('afterbegin', cardHtml);
                        
                        setTimeout(() => {
                            const newEl = document.getElementById(`post-card-${postId}`);
                            if (newEl) {
                                newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                newEl.style.border = '2px solid #f59e0b';
                                newEl.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.3)';
                                setTimeout(() => {
                                    newEl.style.transition = 'all 1s ease';
                                    newEl.style.border = '1px solid #cbd5e1';
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

    function shareOffer(offerId) {
        const shareUrl = `${window.location.origin}/offer/${offerId}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('📋 تم نسخ رابط الدرس بنجاح! يمكنك الآن مشاركته خارج المنصة.', 'success');
        }).catch(err => {
            console.error('Failed to copy', err);
            showToast('⚠️ فشل نسخ الرابط تلقائياً، الرابط: ' + shareUrl, 'warning');
        });
    }
    window.shareOffer = shareOffer;

    function shareCourse(courseId) {
        const shareUrl = `${window.location.origin}/course/${courseId}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('📋 تم نسخ رابط الدورة بنجاح! يمكنك الآن مشاركته خارج المنصة.', 'success');
        }).catch(err => {
            console.error('Failed to copy', err);
            showToast('⚠️ فشل نسخ الرابط تلقائياً، الرابط: ' + shareUrl, 'warning');
        });
    }
    window.shareCourse = shareCourse;

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

            commentsLists.forEach(cl => {
                cl.innerHTML = html;
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
        // زر الحذف يظهر لصاحب التعليق فقط (لا يحق لأي أستاذ آخر حذف تعليقات زملائه)
        const canDelete = String(c.user_id) === String(userData?.id);
        const profileClick = c.author_role === 'teacher' ? `showTeacherProfileFromPost(${c.user_id})` : `showStudentProfile(${c.user_id})`;
        
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
        if (checkGuestAction()) return;
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

    async function loadTeacherLogs() {
        const type = document.getElementById('teacherLogTypeFilter')?.value || 'errors';
        const limit = document.getElementById('teacherLogLimitFilter')?.value || 50;
        const container = document.getElementById('teacherLogsContainer');
        const totalLabel = document.getElementById('teacherLogTotalLabel');

        if (!container) return;
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: #64748b;"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;">جاري جلب السجلات...</p></div>`;

        // Stats
        fetch('/api/logs/stats').then(r => r.json()).then(data => {
            if (data.success && data.stats) {
                if (document.getElementById('teacherLogErrorsCount')) document.getElementById('teacherLogErrorsCount').textContent = data.stats.totalErrors || 0;
                if (document.getElementById('teacherLogWarningsCount')) document.getElementById('teacherLogWarningsCount').textContent = data.stats.totalWarnings || 0;
                if (document.getElementById('teacherLogClientErrorsCount')) document.getElementById('teacherLogClientErrorsCount').textContent = data.stats.totalClientErrors || 0;
            }
        }).catch(e => console.warn(e));

        try {
            const url = type === 'errors' ? `/api/logs/errors?limit=${limit}` : `/api/logs/all?type=${type}&limit=${limit}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                let logs = data.errors || data.logs || [];
                if (totalLabel) totalLabel.textContent = `تم العثور على ${logs.length} سجل.`;

                if (logs.length === 0) {
                    container.innerHTML = `<div style="text-align: center; padding: 40px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;"><i class="fas fa-check-circle" style="font-size: 2.5rem; color: #10b981; margin-bottom: 12px;"></i><h3 style="color: #1e293b; font-weight: 800;">لا توجد سجلات أخطاء</h3><p style="color: #64748b; font-size: 0.85rem; margin-top: 4px;">المنصة تعمل بصورة ممتازة.</p></div>`;
                    return;
                }

                let html = `<div style="display: flex; flex-direction: column; gap: 10px;">`;
                logs.forEach(log => {
                    const level = (log.level || 'error').toLowerCase();
                    const isErr = level.includes('err');
                    const isWarn = level.includes('warn');
                    const color = isErr ? '#ef4444' : isWarn ? '#f59e0b' : '#3b82f6';
                    const bg = isErr ? '#fef2f2' : isWarn ? '#fffbeb' : '#eff6ff';
                    const time = new Date(log.timestamp).toLocaleString('ar-EG');

                    html += `
                        <div style="background: ${bg}; border: 1px solid rgba(0,0,0,0.05); border-radius: 10px; padding: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                                <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 800;">${level.toUpperCase()}</span>
                                <span style="font-size: 0.7rem; color: #64748b; font-weight: 600;">${time}</span>
                            </div>
                            <div style="font-size: 0.85rem; font-weight: 700; color: #1e293b; margin-bottom: 4px; word-break: break-all;">${log.message || 'No message'}</div>
                            ${log.meta ? `<div style="font-size: 0.75rem; color: #475569; font-family: monospace; background: rgba(0,0,0,0.03); padding: 6px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(log.meta, null, 2)}</div>` : ''}
                        </div>
                    `;
                });
                html += `</div>`;
                container.innerHTML = html;
            } else {
                container.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 20px;"><i class="fas fa-times-circle"></i> فشل تحميل السجلات.</div>`;
            }
        } catch (e) {
            container.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 20px;"><i class="fas fa-times-circle"></i> حدث خطأ أثنء الاتصال بالخادم.</div>`;
        }
    }

    function refreshTeacherLogs() {
        loadTeacherLogs();
        showToast('🔄 تم تحديث السجلات بنجاح', 'success');
    }

    async function clearTeacherLogs() {
        if (!confirm('⚠️ ه أنت متأكد من مسح جميع سجلات الأخطاء؟ لا يمكن التراجع عن هذه العملية.')) return;
        try {
            const res = await fetch('/api/logs/clear', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('✅ تم مسح السجلات بنجاح', 'success');
                loadTeacherLogs();
            } else {
                showToast('❌ ' + (data.error || 'فشل مسح السجلات'), 'error');
            }
        } catch (e) {
            showToast('❌ حدث خطأ أثناء محاولة مسح السجلات', 'error');
        }
    }

    async function runServerDiagnostics() {
        const list = document.getElementById('errorDiagnosticsList');
        const overlay = document.getElementById('errorDiagnostics');
        if (!list || !overlay) return;

        overlay.style.display = 'block';
        list.innerHTML = `<p style="color: #94a3b8;"><i class="fas fa-spinner fa-spin"></i> جاري فحص حالة السيرفر وقاعدة البيانات...</p>`;

        try {
            const res = await fetch('/api/diagnostics');
            const data = await res.json();

            let html = `<div style="margin-bottom: 10px; border-bottom: 1px solid #334155; padding-bottom: 8px;">`;
            html += `<p><i class="fas fa-server"></i> الحالة العامة: <span style="color: #10b981;">نشط ✅</span></p>`;
            html += `<p><i class="fas fa-database"></i> اتصال Supabase: ${data.server?.hasSupabaseUrl ? '<span style="color: #10b981;">متصل ✅</span>' : '<span style="color: #ef4444;">غير متصل ❌</span>'}</p>`;
            html += `<p><i class="fas fa-clock"></i> وقت السيرفر: ${new Date(data.timestamp).toLocaleString('ar-EG')}</p>`;
            html += `</div>`;
            
            if (data.server?.dbTestError) {
                html += `<p style="color: #fca5a5;"><i class="fas fa-exclamation-triangle"></i> خطأ في قاعدة البيانات: ${data.server.dbTestError}</p>`;
            } else {
                html += `<p style="color: #10b981;"><i class="fas fa-check-circle"></i> اختبار قاعدة البيانات: ناجح (صفوف: ${data.server?.dbTestRows || 0})</p>`;
            }

            list.innerHTML = html;
        } catch (e) {
            list.innerHTML = `<p style="color: #ef4444;"><i class="fas fa-times-circle"></i> فشل الاتصال بخدمة التشخيص.</p>`;
        }
    }

    // ============================================================
    // 📚 إدارة التمارين والحلول (Exercises & Solutions)
    // ============================================================
    let allExercisesList = [];
    let exerciseImagesToUpload = [];
    let currentExerciseSavedOnlyFilter = false;

    async function loadExercises(silent = false) {
        const grid = document.getElementById('exercisesGrid');
        if (!silent && grid) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b;">
                    <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary);"></i>
                    <p style="margin-top: 10px; font-weight: 700;">جاري تحميل التمارين والحلول...</p>
                </div>`;
        }

        try {
            const queryParams = new URLSearchParams();
            if (currentExerciseSavedOnlyFilter) queryParams.append('saved_only', 'true');

            const res = await fetchWithAuth('/api/exercise?' + queryParams.toString(), { cache: 'no-store' });
            const data = await res.json();

            if (!res.ok || (data && data.success === false)) {
                throw new Error(data.error || data.details || `خطأ HTTP رقم ${res.status}`);
            }

            allExercisesList = Array.isArray(data) ? data : (Array.isArray(data.exercises) ? data.exercises : []);
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
        } catch (e) {
            console.error('Error loading exercises:', e);
            if (grid) {
                grid.innerHTML = `
                    <div style="grid-column: 1 / -1; padding: 24px; color: #1e293b; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center; direction: rtl;">
                        <i class="fas fa-exclamation-circle" style="color: #64748b; font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                        <p style="margin: 0 0 14px 0; font-size: 0.95rem; font-weight: 700; color: #334155;">تعذر تحميل التمارين والحلول حالياً، يرجى إعادة المحاولة.</p>
                        <button onclick="loadExercises(true)" style="background: var(--primary, #2563eb); color: white; border: none; padding: 10px 22px; border-radius: 12px; cursor: pointer; font-family: inherit; font-weight: 800; font-size: 0.88rem; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">
                            <i class="fas fa-sync-alt" style="margin-left: 6px;"></i> إعادة المحاولة
                        </button>
                    </div>`;
            }
        }
    }

    function filterExercises() {
        const searchVal = (document.getElementById('exerciseSearchInput')?.value || '').toLowerCase().trim();
        const levelVal = document.getElementById('exerciseLevelFilter')?.value || 'all';
        const subjectVal = (document.getElementById('exerciseSubjectFilter')?.value || '').trim();
        const classVal = document.getElementById('exerciseClassFilter')?.value || 'all';

        let filtered = allExercisesList.filter(ex => {
            let levelMatch = true;
            if (levelVal !== 'all') {
                const el = ex.education_level || '';
                if (levelVal === 'primary_all') levelMatch = el.startsWith('primary') || el.includes('pri') || el === 'primary_all';
                else if (levelVal === 'middle_all') levelMatch = el.includes('am') || el === 'bem' || el === 'middle_all' || el === '4eme_am';
                else if (levelVal === 'secondary_all') levelMatch = el.includes('as') || el === 'bac' || el === 'secondary_all';
                else if (levelVal === 'university') levelMatch = el.includes('uni') || el === 'university' || el === 'master' || el === 'doctorat';
                else if (levelVal === 'vocational_all') levelMatch = ['cap', 'cmp', 'bt', 'bts', 'insfp', 'insta_uni', 'vocational_all'].includes(el);
                else levelMatch = (el === levelVal);
            }

            // فلترة حسب المادة الدراسية (كتابة جزئية مسموحة)
            let subjectMatch = true;
            if (subjectVal) {
                subjectMatch = ((ex.subject_name || ex.subject || 'عام').includes(subjectVal));
            }

            let searchMatch = true;
            if (searchVal) {
                searchMatch = (
                    (ex.title || '').toLowerCase().includes(searchVal) ||
                    (ex.description || '').toLowerCase().includes(searchVal) ||
                    (ex.subject_name || '').toLowerCase().includes(searchVal) ||
                    (ex.teacher_name || '').toLowerCase().includes(searchVal)
                );
            }

            // 🏷️ فلترة حسب نوع المحتوى: تمرين / درس / ملخص / فيديو
            let classMatch = true;
            if (classVal !== 'all') {
                classMatch = ((ex.classification || 'تمرين') === classVal);
            }

            return levelMatch && subjectMatch && searchMatch && classMatch;
        });

        renderExercisesList(filtered);
    }

    function toggleExerciseSavedFilter() {
        currentExerciseSavedOnlyFilter = !currentExerciseSavedOnlyFilter;
        const btn = document.getElementById('exerciseSavedFilterBtn');
        if (btn) {
            if (currentExerciseSavedOnlyFilter) {
                btn.style.background = '#fef3c7';
                btn.style.color = '#92400e';
                btn.style.borderColor = '#f59e0b';
                btn.innerHTML = `<i class="fas fa-bookmark" style="color:#d97706;"></i> <span>عرض جميع التمارين 📚</span>`;
            } else {
                btn.style.background = '#f8fafc';
                btn.style.color = '#475569';
                btn.style.borderColor = '#cbd5e1';
                btn.innerHTML = `<i class="fas fa-bookmark" style="color:#f59e0b;"></i> <span>المحفوظات فقط</span>`;
            }
        }
        loadExercises();
    }

    function renderExercisesList(list) {
        const grid = document.getElementById('exercisesGrid');
        if (!grid) return;

        if (!list || list.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: white; border-radius: 16px; border: 1px dashed #cbd5e1;">
                    <i class="fas fa-folder-open" style="font-size: 2.5rem; color: #94a3b8; margin-bottom: 12px;"></i>
                    <h4 style="font-size: 1.1rem; color: #334155; margin-bottom: 6px;">لا توجد تمارين وحلول متاحة الآن</h4>
                    <p style="font-size: 0.88rem; color: #64748b;">${currentExerciseSavedOnlyFilter ? 'لم تقم بحفظ أي منشور تمارين بعد.' : 'كن أول من يشارك تمارين جديدة مع أبنائنا الطلاب!'}</p>
                </div>`;
            return;
        }

        let currentTeacherId = teacherId;
        if (!currentTeacherId) {
            try {
                const stored = JSON.parse(localStorage.getItem('userData') || '{}');
                if (stored && stored.id) currentTeacherId = stored.id;
            } catch (e) {}
        }
        if (!currentTeacherId && typeof userData !== 'undefined' && userData && userData.id) {
            currentTeacherId = userData.id;
        }

        grid.innerHTML = list.map(ex => {
            const images = Array.isArray(ex.images) ? ex.images : [];
            const classification = ex.classification || 'تمرين';
            let classificationBadgeHtml = '';
            if (classification === 'تمرين') {
                classificationBadgeHtml = `
                    <span style="background: #eff6ff; color: #2563eb; padding: 3px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; border: 1px solid #bfdbfe; display: inline-flex; align-items: center; gap: 4px;">
                        <i class="fas fa-file-pen"></i> تمرين
                    </span>
                `;
            } else if (classification === 'درس') {
                classificationBadgeHtml = `
                    <span style="background: #ecfdf5; color: #059669; padding: 3px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; border: 1px solid #a7f3d0; display: inline-flex; align-items: center; gap: 4px;">
                        <i class="fas fa-book-open"></i> درس
                    </span>
                `;
            } else if (classification === 'ملخص') {
                classificationBadgeHtml = `
                    <span style="background: #fffbeb; color: #d97706; padding: 3px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; border: 1px solid #fde68a; display: inline-flex; align-items: center; gap: 4px;">
                        <i class="fas fa-file-invoice"></i> ملخص
                    </span>
                `;
            } else if (classification === 'فيديو') {
                classificationBadgeHtml = `
                    <span style="background: #fef2f2; color: #dc2626; padding: 3px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; border: 1px solid #fecaca; display: inline-flex; align-items: center; gap: 4px;">
                        <i class="fab fa-youtube"></i> فيديو
                    </span>
                `;
            } else {
                classificationBadgeHtml = `
                    <span style="background: #f1f5f9; color: #475569; padding: 3px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; border: 1px solid #cbd5e1; display: inline-flex; align-items: center; gap: 4px;">
                        <i class="fas fa-file"></i> ${escapeHtml(classification)}
                    </span>
                `;
            }
            const isOwner = currentTeacherId && (
                (parseInt(ex.teacher_id) && parseInt(ex.teacher_id) === parseInt(currentTeacherId)) ||
                String(ex.teacher_id).trim() === String(currentTeacherId).trim()
            );
            const createdDate = new Date(ex.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

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
                <span style="background: #f5f3ff; color: #7c3aed; padding: 3px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; border: 1px solid #ddd6fe; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fas fa-list-ol"></i> قائمة تشغيل (${ytIds.length} فيديوهات)
                </span>` : '';
            const hasTeacher = ex.teacher_id != null && parseInt(ex.teacher_id) > 0;

            let imagesGridHtml = '';
            if (images.length > 0) {
                const count = images.length;
                if (count === 1) {
                    imagesGridHtml = `
                        <div style="border-radius: 12px; overflow: hidden; margin: 12px 0; border: 1px solid #e2e8f0; background: #0f172a;">
                            <div onclick="openExerciseLightbox(${ex.id}, 0)" style="position: relative; height: 240px; cursor: pointer; overflow: hidden;">
                                <img src="${escapeHtml(images[0])}" style="width: 100%; height: 100%; object-fit: contain; background: #020617; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'" alt="صورة التمرين">
                            </div>
                        </div>
                    `;
                } else if (count === 2) {
                    imagesGridHtml = `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 12px 0; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
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
                        <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; grid-template-rows: 110px 110px; gap: 6px; margin: 12px 0; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
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

            return `
                <div id="exercise-card-${ex.id}" style="background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.03); display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 8px 25px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='0 2px 10px rgba(0,0,0,0.03)'">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div style="display: flex; gap: 10px; align-items: center;${hasTeacher ? ' cursor: pointer;' : ''}" ${hasTeacher ? `onclick="viewTeacherProfile(${ex.teacher_id})"` : ''}>
                                <img src="${escapeHtml(ex.teacher_profile_image || '/images/default-avatar.svg')}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;" alt="أستاذ" referrerpolicy="no-referrer" onerror="this.src='/images/default-avatar.svg'">
                                <div>
                                    <div style="font-weight: 800; font-size: 0.92rem; color: #1e293b; transition: color 0.2s;" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='#1e293b'">${escapeHtml(ex.teacher_name)}</div>
                                    <div style="font-size: 0.75rem; color: #64748b;">${escapeHtml(ex.subject_name || 'عام')} • ${createdDate}</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 6px;">
                                <button onclick="toggleSaveExercise(${ex.id})" title="${ex.is_saved ? 'إزالة من المحفوظات' : 'حفظ منشور التمارين'}" style="background: ${ex.is_saved ? '#fef3c7' : '#f1f5f9'}; color: ${ex.is_saved ? '#d97706' : '#64748b'}; border: none; width: 34px; height: 34px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">
                                    <i class="${ex.is_saved ? 'fas' : 'far'} fa-bookmark"></i>
                                </button>
                                ${isOwner ? `
                                    <button onclick="openEditExerciseModal(${ex.id})" title="تعديل المنشور" style="background: #f0fdf4; color: #16a34a; border: none; width: 34px; height: 34px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button onclick="deleteExercise(${ex.id})" title="حذف المنشور" style="background: #fee2e2; color: #ef4444; border: none; width: 34px; height: 34px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>

                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px;">
                            <span style="background: #eff6ff; color: var(--primary); font-weight: 800; font-size: 0.75rem; padding: 3px 10px; border-radius: 8px; border: 1px solid #bfdbfe;">
                                ${escapeHtml(getEducationLevelName(ex.education_level))}
                            </span>
                            ${classificationBadgeHtml}
                            ${playlistBadgeHtml}
                        </div>

                        <h3 style="font-size: 1.05rem; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; line-height: 1.5;">
                            ${escapeHtml(ex.title)}
                        </h3>

                        ${ex.description ? `<p style="font-size: 0.88rem; color: #475569; margin-bottom: 12px; line-height: 1.6; white-space: pre-line;">${escapeHtml(ex.description)}</p>` : ''}

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

                        ${imagesGridHtml}
                    </div>

                    <div style="border-top: 1px solid #f1f5f9; padding-top: 12px; margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 0.78rem; color: #94a3b8; display: flex; gap: 12px;">
                            <span><i class="fas fa-camera" style="margin-left: 4px;"></i> ${images.length} صور</span>
                        </div>
                        <button onclick="shareExercise(${ex.id}, '${escapeHtml(ex.title)}')" style="background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; padding: 7px 14px; border-radius: 10px; font-weight: 800; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);">
                            <i class="fas fa-share-nodes"></i> مشاركة الرابط
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function getEducationLevelName(code) {
        if (!code) return 'عام';
        const levels = {
            'all': 'جميع المستويات',
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
            'secondary_all': 'جميع مستويات الثانوي',
            '1ere_as': 'أولى ثانوي',
            '2eme_as': 'ثانية ثانوي',
            '3eme_as': 'ثالثة ثانوي (BAC)',
            'university': 'جميع المستويات الجامعية',
            '1ere_uni': 'أولى جامعي (L1)',
            '2eme_uni': 'ثانية جامعي (L2)',
            '3eme_uni': 'ثالثة جامعي (L3)',
            'master': 'ماستر',
            'doctorat': 'دكتوراه',
            'vocational_all': 'جميع مستويات التكوين المهني والمعاهد',
            'cap': 'شهادة الكفاءة المهنية (CAP)',
            'cmp': 'شهادة التحكم المهني (CMP)',
            'bt': 'شهادة التقني (BT)',
            'bts': 'شهادة التقني السامي (BTS)',
            'insfp': 'المعاهد الوطنية المتخصصة (INSFP)',
            'insta_uni': 'المعاهد الجامعية والتقنية (ISTA)'
        };
        return levels[code] || code;
    }

    let editingExerciseId = null;

    function openCreateExerciseModal() {
        if (userData && userData.status !== 'approved' && !(userData.is_guest || userData.id === -1)) {
            if (userData.requires_profile_completion || !userData.profile_completion) {
                showToast('⚠️ قم برفع الوثائق (صورة الشهادة/الدبلوم وإثبات الهوية) للتحقق من حسابك لإضافة تمارين', 'warning');
            } else if (userData.status === 'rejected') {
                showToast('❌ تم رفض طلبك. يرجى إعادة رفع اوثائق والصور لإضافة تمارين.', 'warning');
            } else {
                showToast('⏳ حسابك قيد التحقق ومراجعة الإدارة. لا يمكنك إضافة تمارين حتى يتم قبول حسابك.', 'warning');
            }
            return;
        }
        editingExerciseId = null;
        exerciseImagesToUpload = [];
        document.getElementById('exerciseModalTitle').value = '';
        document.getElementById('exerciseModalSubject').value = '';
        document.getElementById('exerciseModalDesc').value = '';
        if (document.getElementById('exerciseModalClassification')) {
            document.getElementById('exerciseModalClassification').value = 'تمرين';
        }
        if (document.getElementById('exerciseModalExternalLink')) {
            document.getElementById('exerciseModalExternalLink').value = '';
        }
        document.getElementById('exerciseModalImagesPreview').innerHTML = '';
        document.getElementById('exerciseImagesCountBadge').textContent = 'الصور المحددة: 0 / 10';

        // Restore titles
        const modalHeader = document.querySelector('#createExerciseModal .modal-header h3');
        if (modalHeader) {
            modalHeader.innerHTML = `<i class="fas fa-file-pen" style="color:var(--primary);"></i> نشر تمارين وحلول جديدة`;
        }
        const submitBtn = document.getElementById('btnSubmitExercise');
        if (submitBtn) {
            submitBtn.innerHTML = `<i class="fas fa-paper-plane"></i> نشر التمارين والحلول`;
        }

        const modal = document.getElementById('createExerciseModal');
        const overlay = document.getElementById('modalOverlay');
        if (modal) modal.style.display = 'block';
        if (overlay) overlay.style.display = 'block';
    }

    function openEditExerciseModal(id) {
        const ex = allExercisesList.find(e => e.id === id);
        if (!ex) return;

        editingExerciseId = id;
        
        // Fill form fields
        document.getElementById('exerciseModalTitle').value = ex.title || '';
        document.getElementById('exerciseModalSubject').value = ex.subject_name || '';
        // قيمة قديمة قد لا توجد ضمن الخيارات — نضمن بديلاً صالحاً حتى لا تُرفض عملية الحفظ
        const levelSel = document.getElementById('exerciseModalLevel');
        if (levelSel) {
            levelSel.value = ex.education_level || 'all';
            if (!levelSel.value) levelSel.value = 'all';
        }
        document.getElementById('exerciseModalDesc').value = ex.description || '';
        const clsSel = document.getElementById('exerciseModalClassification');
        if (clsSel) {
            clsSel.value = ex.classification || 'تمرين';
            if (!clsSel.value) clsSel.value = 'تمرين';
        }
        if (document.getElementById('exerciseModalExternalLink')) {
            document.getElementById('exerciseModalExternalLink').value = ex.external_link || '';
        }
        onExerciseClassificationChange();
        // منشور قائمة تشغيل: توزيع الروابط الزائدة على خانات إضافية
        if ((ex.classification || '') === 'فيديو') {
            restorePlaylistRows('teacher', ex.external_link);
        }
        
        // Pre-populate images
        exerciseImagesToUpload = Array.isArray(ex.images) ? [...ex.images] : [];
        renderExerciseImagePreviews();

        // Update titles
        const modalHeader = document.querySelector('#createExerciseModal .modal-header h3');
        if (modalHeader) {
            modalHeader.innerHTML = `<i class="fas fa-edit" style="color:var(--primary);"></i> تعديل تمارين وحلول`;
        }
        const submitBtn = document.getElementById('btnSubmitExercise');
        if (submitBtn) {
            submitBtn.innerHTML = `<i class="fas fa-save"></i> حفظ التعديلات`;
        }

        // Show modal
        const modal = document.getElementById('createExerciseModal');
        const overlay = document.getElementById('modalOverlay');
        if (modal) modal.style.display = 'block';
        if (overlay) overlay.style.display = 'block';
    }

    function closeCreateExerciseModal() {
        editingExerciseId = null;
        const modal = document.getElementById('createExerciseModal');
        const overlay = document.getElementById('modalOverlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
        // إعادة ضبط خيارات قائمة التشغيل
        const chk = document.getElementById('exercisePlaylistToggle');
        if (chk) chk.checked = false;
        const extra = document.getElementById('teacherPlaylistExtra');
        if (extra) { extra.style.display = 'none'; extra.innerHTML = ''; }
        const addBtn = document.getElementById('teacherPlaylistAddBtn');
        if (addBtn) addBtn.style.display = 'none';
    }

    function isImageFile(file) {
        return file && typeof file.type === 'string' && file.type.indexOf('image/') === 0;
    }

    function readFileAsDataUrl(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
        });
    }
    async function handleExerciseFilesSelected(event) {
        const files = Array.from(event.target.files || []);
        if (!files || files.length === 0) return;

        if (exerciseImagesToUpload.length + files.length > 10) {
            showToast('⚠️ أقصى عدد مسموح به هو 10 صور فقط', 'warning');
        }

        const availableSlots = 10 - exerciseImagesToUpload.length;
        const filesToProcess = files.slice(0, availableSlots);

        showToast('⏳ جاري إرفاق الصور...', 'info');

        for (const file of filesToProcess) {
            try {
                // كانت تُحفظ كما هي في حقل images داخل قاعدة البيانات،
                // أي base64 خام بلا ضغط، فيتضخم الصف بلا داع.
                let base64;
                if (isImageFile(file) && typeof window.compressBase64ImageFile === 'function') {
                    base64 = await window.compressBase64ImageFile(file, 1280, 1280, 0.82);
                } else {
                    base64 = await readFileAsDataUrl(file);
                }
                exerciseImagesToUpload.push(base64);
            } catch (e) {
                try { exerciseImagesToUpload.push(await readFileAsDataUrl(file)); } catch (e2) {}
            }
        }

        renderExerciseImagePreviews();
        event.target.value = '';
    }


    function renderExerciseImagePreviews() {
        const container = document.getElementById('exerciseModalImagesPreview');
        const badge = document.getElementById('exerciseImagesCountBadge');
        if (!container) return;

        container.innerHTML = exerciseImagesToUpload.map((imgSrc, idx) => `
            <div style="position: relative; height: 80px; border-radius: 8px; overflow: hidden; border: 1px solid #cbd5e1;">
                <img src="${imgSrc}" style="width: 100%; height: 100%; object-fit: cover;" alt="معاينة">
                <button type="button" onclick="removeExerciseImage(${idx})" style="position: absolute; top: 3px; right: 3px; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; justify-content: center;">
                    &times;
                </button>
            </div>
        `).join('');

        if (badge) {
            badge.textContent = `الصور المحددة: ${exerciseImagesToUpload.length} / 10`;
        }
    }

    function removeExerciseImage(index) {
        exerciseImagesToUpload.splice(index, 1);
        renderExerciseImagePreviews();
    }

    // ============================================================
    // 🎬 دعم فيديوهات يوتيوب داخل قسم الدروس والتمارين
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

    // 🔽 تنقّل +/- بين فيديوهات القائمة (يشتغل من الأزرار أو بلوحة المفاتيح)
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

    // عند تعديل منشور قائمة تشغيل: توزيع الروابط على الخانات تلقائياً
    function restorePlaylistRows(mode, linksText) {
        const isTeacher = mode === 'teacher';
        const lines = String(linksText || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (lines.length < 2) return;
        const checkbox = document.getElementById(isTeacher ? 'exercisePlaylistToggle' : 'studentVideoPlaylistToggle');
        if (checkbox) checkbox.checked = true;
        togglePlaylistFields(mode);
        const container = document.getElementById(isTeacher ? 'teacherPlaylistExtra' : 'studentPlaylistExtra');
        if (container) {
            container.innerHTML = '';
            lines.slice(1).forEach(() => addPlaylistRow(mode));
            const inputs = container.querySelectorAll('.' + (isTeacher ? 'teacher' : 'student') + 'PlaylistExtraInput');
            inputs.forEach((inp, i) => { inp.value = lines[i + 1] || ''; });
        }
    }

    function onExerciseClassificationChange() {
        const isVideo = document.getElementById('exerciseModalClassification')?.value === 'فيديو';
        const linkInput = document.getElementById('exerciseModalExternalLink');
        const hint = document.getElementById('exerciseExternalLinkHint');
        if (linkInput) {
            linkInput.placeholder = isVideo
                ? 'https://www.youtube.com/watch?v=...'
                : 'https://drive.google.com/... أو أي رابط للملف';
        }
        if (hint) {
            hint.innerHTML = isVideo
                ? '<i class="fas fa-video" style="color:#dc2626;"></i> الصق كود الـ iframe كما هو من يوتيوب أو الرابط — وللمقاطع المتعددة (قائمة تشغيل) ضع كل فيديو في سطر'
                : '<i class="fas fa-info-circle"></i> يمكنك وضع رابط ملف PDF من Google Drive أو أي موقع تخزين سحابي';
        }
    }

    async function submitNewExercise() {
        const title = document.getElementById('exerciseModalTitle')?.value.trim();
        const subject = document.getElementById('exerciseModalSubject')?.value.trim();
        const level = document.getElementById('exerciseModalLevel')?.value;
        const description = document.getElementById('exerciseModalDesc')?.value.trim();
        const externalLinkInput = document.getElementById('exerciseModalExternalLink')?.value.trim() || null;
        const classification = document.getElementById('exerciseModalClassification')?.value || 'تمرين';

        if (!title) {
            showToast('⚠️ يرجى أدخال عنوان التمارين والحلول', 'warning');
            return;
        }

        if (!level) {
            showToast('⚠️ يرجى اختيار المستوى الدراسي', 'warning');
            return;
        }

        // 🎬 اختيار «فيديو» يتطلب كود iframe أو رابط يوتيوب صالحاً
        if (classification === 'فيديو' && extractYouTubeVideoIds(externalLinkInput).length === 0) {
            showToast('⚠️ يرجى لصق كود الـ iframe للفيديو (من: مشاركة ← تضمين)', 'warning');
            return;
        }

        const btn = document.getElementById('btnSubmitExercise');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = editingExerciseId ? `<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...` : `<i class="fas fa-spinner fa-spin"></i> جاري النشر...`;
        }

        try {
            let externalLink = externalLinkInput;
            if (externalLink && !externalLink.startsWith('http://') && !externalLink.startsWith('https://')) {
                externalLink = 'https://' + externalLink;
            }
            // توحيد روابط الفيديو (الأساسي + خانات القائمة) إلى قائمة معيارية
            if (classification === 'فيديو') {
                externalLink = collectYouTubeIds('teacher').map(id => 'https://www.youtube.com/watch?v=' + id).join('\n');
            }

            const payload = {
                title: title,
                subject_name: subject || 'عام',
                education_level: level,
                description: description,
                images: exerciseImagesToUpload,
                external_link: externalLink,
                classification: classification
            };

            const url = editingExerciseId ? `/api/exercise/${editingExerciseId}` : '/api/exercise';
            const method = editingExerciseId ? 'PUT' : 'POST';

            const res = await fetchWithAuth(url, {
                method: method,
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                // ✨ تحديث فوري في القائمة المحلية قبل إعادة التحميل —
                //    حتى يرى الأستاذ تعديله لحظياً وإن بطي إعادة الجلب
                if (editingExerciseId) {
                    const item = allExercisesList.find(e => e.id === editingExerciseId);
                    if (item) {
                        item.title = payload.title;
                        item.subject_name = payload.subject_name;
                        item.education_level = payload.education_level;
                        item.description = payload.description;
                        item.classification = classification;
                        item.external_link = payload.external_link;
                        if (Array.isArray(payload.images) && payload.images.length > 0) item.images = payload.images;
                    }
                    filterExercises();
                }
                showToast(editingExerciseId ? '🎉 تم تعديل التمارين والحلول بنجاح!' : '🎉 تم نشر التمارين والحلول بنجاح!', 'success');
                closeCreateExerciseModal();
                loadExercises(true);
            } else {
                showToast('❌ ' + (data.error || (editingExerciseId ? 'فشل تعديل التمارين' : 'فشل نشر التمارين')) + (res.status && res.status >= 400 ? ` (HTTP ${res.status})` : ''), 'error');
            }
        } catch (e) {
            console.error('Full Error submitting exercise:', e);
            const errorMessage = e.message || (typeof e === 'string' ? e : JSON.stringify(e));
            showToast('❌ خطأ: ' + errorMessage, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = editingExerciseId ? `<i class="fas fa-save"></i> حفظ التعديلات` : `<i class="fas fa-paper-plane"></i> نشر التمارين والحلول`;
            }
        }
    }

    async function toggleSaveExercise(id) {
        if (checkGuestAction()) return;
        try {
            const res = await fetchWithAuth(`/api/exercise/${id}/bookmark`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast(data.message || (data.is_saved ? '🔖 تم الحفظ' : 'تم الإزالة من المحفوظات'), 'success');
                const item = allExercisesList.find(e => e.id === id);
                if (item) item.is_saved = data.is_saved;
                filterExercises();
            } else {
                showToast('❌ ' + (data.error || 'فشل حفظ المنشور'), 'error');
            }
        } catch (e) {
            console.error('Error toggling exercise bookmark:', e);
        }
    }

    async function shareExercise(id, title) {
        const shareUrl = `${window.location.origin}/student-dashboard.html?exercise=${id}`;
        
        fetch(`/api/exercise/${id}/share`, { method: 'POST' }).catch(() => {});

        if (navigator.share) {
            try {
                await navigator.share({
                    title: title || 'تمارين وحلول ممتازة على منصة زوم ديزاد',
                    text: `شاهد تمارين وحلول "${title}" المقدمة من أساتذة منصة ZoomDz:`,
                    url: shareUrl
                });
                showToast('✅ تم فتح نافذة المشاركة', 'success');
                return;
            } catch (e) {}
        }

        try {
            await navigator.clipboard.writeText(shareUrl);
            showToast('🔗 تم نسخ رابط التمارين والحلول بنجاح! يمكنك مشاركته في أي مكان.', 'success');
        } catch (e) {
            prompt('انسخ رابط التمارين لمشاركته:', shareUrl);
        }
    }

    async function deleteExercise(id) {
        if (!confirm('هل أنت متأكد من حذف منشور التمارين والحلول هذا؟')) return;

        try {
            const res = await fetchWithAuth(`/api/exercise/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('✅ تم حذف المنشور بنجاح', 'success');
                loadExercises(true);
            } else {
                showToast('❌ ' + (data.error || 'فشل حذف المنشور'), 'error');
            }
        } catch (e) {
            console.error('Error deleting exercise:', e);
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

    function openExerciseLightbox(exerciseId, index) {
        const ex = allExercisesList.find(e => e.id === exerciseId);
        if (!ex || !ex.images || ex.images.length === 0) return;

        // Record view when opening lightbox
        recordExerciseView(exerciseId);

        currentLightboxImages = ex.images;
        currentLightboxIndex = index || 0;
        resetExerciseImgZoom();

        const modal = document.getElementById('exerciseLightboxModal');
        const overlay = document.getElementById('modalOverlay');
        const titleEl = document.getElementById('exerciseLightboxTitle');

        if (titleEl) titleEl.textContent = ex.title || 'عرض التمارينات والحلول';
        updateLightboxImage();

        if (modal) modal.style.display = 'block';
        if (overlay) overlay.style.display = 'block';
    }

    function updateLightboxImage() {
        const imgEl = document.getElementById('exerciseLightboxImg');
        const counterEl = document.getElementById('exerciseLightboxCounter');
        const prevBtn = document.getElementById('lightboxPrevBtn');
        const nextBtn = document.getElementById('lightboxNextBtn');

        if (imgEl && currentLightboxImages[currentLightboxIndex]) {
            imgEl.src = currentLightboxImages[currentLightboxIndex];
        }

        if (counterEl) {
            counterEl.textContent = `صورة ${currentLightboxIndex + 1} من ${currentLightboxImages.length}`;
        }

        if (prevBtn) prevBtn.style.display = currentLightboxIndex > 0 ? 'flex' : 'none';
        if (nextBtn) nextBtn.style.display = currentLightboxIndex < currentLightboxImages.length - 1 ? 'flex' : 'none';
    }

    function navigateLightbox(dir) {
        currentLightboxIndex += dir;
        if (currentLightboxIndex < 0) currentLightboxIndex = 0;
        if (currentLightboxIndex >= currentLightboxImages.length) currentLightboxIndex = currentLightboxImages.length - 1;
        resetExerciseImgZoom();
        updateLightboxImage();
    }

    function closeExerciseLightbox() {
        const modal = document.getElementById('exerciseLightboxModal');
        const overlay = document.getElementById('modalOverlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
        resetExerciseImgZoom();
    }

    const viewedExercises = new Set();

    async function recordExerciseView(exerciseId) {
        if (!exerciseId || viewedExercises.has(exerciseId)) return;
        viewedExercises.add(exerciseId);

        try {
            fetch(`/api/exercise/${exerciseId}/view`, { method: 'POST' }).catch(() => {});
            const ex = allExercisesList.find(e => e.id === exerciseId);
            if (ex) {
                ex.views_count = (ex.views_count || 0) + 1;
                const viewEl = document.getElementById(`exercise-views-${exerciseId}`);
                if (viewEl) {
                    viewEl.innerHTML = `<i class="fas fa-eye" style="margin-left: 4px;"></i> ${ex.views_count}`;
                }
            }
        } catch (e) {
            console.error('Error recording view:', e);
        }
    }

    // ================================================================
    // ✅ REFERRAL SYSTEM
    // ================================================================

    async function loadReferralData() {
        try {
            if (!teacherId) return;
            const createRes = await fetchWithAuth('/api/referral/create', {
                method: 'POST',
                body: JSON.stringify({ user_id: teacherId, role: 'teacher' })
            });
            const createData = await createRes.json();
            if (createData.success) {
                var referralCode = createData.referral_code || 'غير متوفر';
                var referralLink = createData.referral_link || window.location.origin + '?ref=' + referralCode;
                const codeEl = document.getElementById('referralCodeText');
                if (codeEl) {
                    codeEl.textContent = referralCode;
                    codeEl.dataset.link = referralLink;
                }
            }

            const infoRes = await fetchWithAuth(`/api/referral/info/${teacherId}/teacher`);
            const infoData = await infoRes.json();
            if (infoData.success) {
                referralData = infoData;
                const refCountEl = document.getElementById('referredCount');
                if (refCountEl) refCountEl.textContent = infoData.referred_count || 0;

                const refBalEl = document.getElementById('referralBalance');
                if (refBalEl) refBalEl.textContent = (infoData.total_rewards || 0) + ' دج';

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
        if (!container) return;
        if (!rewards || rewards.length === 0) {
            container.innerHTML = '<p style="color:var(--gray-400); font-size:0.85rem; padding: 12px 0;">لا توجد مكافآت سابقة</p>';
            return;
        }
        let html = '';
        for (const reward of rewards) {
            const date = reward.created_at ? new Date(reward.created_at) : null;
            let icon = '💰';
            let label = 'مكافأة إحالة';
            let amountText = reward.amount ? `+${reward.amount} دج` : '';

            html += `
                <div class="reward-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:white; border-radius:10px; margin-bottom:8px; border:1px solid var(--gray-200);">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-size:1.2rem;">${icon}</span>
                        <div>
                            <span style="font-weight:700; color:var(--gray-800); font-size:0.85rem;">${label}</span>
                            <div style="font-size:0.7rem; color:var(--gray-400); margin-top:2px;">${date ? date.toLocaleDateString('ar') : ''}</div>
                        </div>
                    </div>
                    <div style="font-weight:800; color:#16a34a; font-size:0.9rem;">${amountText}</div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    function copyReferralCode() {
        const codeEl = document.getElementById('referralCodeText');
        if (!codeEl) return;
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
                showToast('✅ م نسخ رابط الإحالة بنجاح!', 'success');
            }
        } else {
            showToast('⚠️ يرجى الانتظار حتى تحميل رابط اإحالة', 'warning');
        }
    }

    function shareReferral() {
        const codeEl = document.getElementById('referralCodeText');
        if (!codeEl) return;
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
                showToast('✅ تم نسخ رابط الإحالة بنجاح! شاركه مع زملائك أو طلابك', 'success');
                if (navigator.share) {
                    navigator.share({
                        title: 'انضم إلى ZoomDz',
                        text: 'استخدم رابط الإحالة الخاص بي للانضمام إلى منصة ZoomDz واحصل على مكافآت!',
                        url: link
                    }).catch(() => {});
                }
            }).catch(() => {
                showToast('✅ تم نسخ رابط الإحالة بنجاح!', 'success');
            });
        } else {
            showToast('⚠️ يرجى الانتظار حتى تحميل رابط الإحالة', 'warning');
        }
    }

    window.openExerciseLightbox = openExerciseLightbox;
    window.navigateLightbox = navigateLightbox;
    window.closeExerciseLightbox = closeExerciseLightbox;
    window.zoomExerciseImg = zoomExerciseImg;
    window.resetExerciseImgZoom = resetExerciseImgZoom;
    window.recordExerciseView = recordExerciseView;
    window.loadReferralData = loadReferralData;
    window.copyReferralCode = copyReferralCode;
    window.shareReferral = shareReferral;
