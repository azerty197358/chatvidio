
        // ============ إعلانات الأستاذ ============
        var adUploadedImageUrl = '';

        // رفع صورة الإعلان من الجهاز مع ضغطها (تتم عبر fetchWithAuth → الضغط التلقائي)
        async function onAdImageSelected(input) {
            var file = input.files && input.files[0];
            var preview = document.getElementById('adImagePreview');
            var img = document.getElementById('adImagePreviewImg');
            var state = document.getElementById('adImageUploadState');
            adUploadedImageUrl = '';
            if (!file) { if (preview) preview.style.display = 'none'; return; }
            try { if (img) img.src = URL.createObjectURL(file); } catch (e) {}
            if (preview) preview.style.display = 'block';
            if (state) state.textContent = 'جاري رفع الصورة وضغطها...';
            try {
                var fd = new FormData();
                fd.append('image', file);
                var res = await fetchWithAuth('/api/ads/teacher/upload-image', { method: 'POST', body: fd });
                var d = await res.json();
                if (d && d.success && d.url) {
                    adUploadedImageUrl = d.url;
                    if (state) state.textContent = '✅ تم رفع الصورة وضغطها بنجاح';
                    if (img) img.src = d.url;
                } else {
                    if (state) state.textContent = '⚠️ تعذر رفع الصورة — يمكنك المتابعة بدونها';
                }
            } catch (e) {
                if (state) state.textContent = '⚠️ تعذر رفع الصورة — يمكنك المتابعة بدونها';
            }
        }

        // عرض رصيد الأستاذ بجانب حاسبة السعر (يُحدَّث بعد الحجز/الحذف)
        var adTeacherBalance = null;
        function setAdBalanceInfo(bal) {
            if (typeof bal === 'number') adTeacherBalance = bal;
            var el = document.getElementById('adBalanceInfo');
            if (!el) return;
            if (adTeacherBalance === null) {
                el.textContent = '💳 سيتم خصم السعر من رصيدك — يُعاد كاملاً إذا رُفض الإعلان';
                return;
            }
            el.innerHTML = '💳 رصيدك الحالي: <b style="color:#0f172a;">' + adTeacherBalance.toLocaleString('ar-DZ') + ' دج</b> — سيتم خصم السعر منه (يُعاد إذا رُفض الإعلان)';
        }
        async function loadAdBalance() {
            try {
                var tid = teacherId || (window.userData && (window.userData.id || window.userData.teacher_id)) || '';
                if (!tid) return;
                var res = await fetchWithAuth('/api/wallet/transactions-teacher/' + tid);
                var d = await res.json();
                if (d && typeof d.balance === 'number') setAdBalanceInfo(d.balance);
            } catch (e) {}
        }

        function updateAdPricePreview() {
            try {
                var p = window.ZoomDzAds.pricePreview({
                    education_level: (document.getElementById('adLevelInput') || {}).value || 'all',
                    ad_type: (document.getElementById('adTypeInput') || {}).value || 'static',
                    placement: 'all', // لا خيار موضع بعد الآن — يظهر تلقائياً في كل المواضع
                    start_date: (document.getElementById('adStartInput') || {}).value,
                    end_date: (document.getElementById('adEndInput') || {}).value
                });
                var el = document.getElementById('adPricePreview');
                if (el) el.innerHTML = 'السعر التقديري: <span style="color:#f59e0b;font-size:1.2rem;">' + p.total + '</span> دج '
                    + '<span style="font-size:0.78rem;color:#94a3b8;">(' + p.days + ' يوم × وزن ' + p.levelWeight + ' × نوع ' + p.typeMultiplier + ' × مواضع ' + p.placementMultiplier
                    + (p.seasonalMultiplier && p.seasonalMultiplier !== 1 ? ' × موسم ' + p.seasonalMultiplier : '') + ')</span>';
            } catch (e) {}
        }

        // عرض إحصائيات إعلان معلن (مشاهدات/نقرات + التوزيع حسب المستوى)
        async function showAdStats(id) {
            var box = document.getElementById('adStatsModal');
            var body = document.getElementById('adStatsBody');
            if (!box || !body) return;
            box.style.display = 'flex';
            body.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
            try {
                var res = await fetchWithAuth('/api/ads/teacher/' + id + '/stats');
                var d = await res.json();
                if (d && d.success && d.stats) {
                    var s = d.stats;
                    var LL = (window.ZoomDzAds && window.ZoomDzAds.LEVEL_LABELS) || {};
                    function levelRows(map) {
                        var keys = Object.keys(map || {});
                        if (keys.length === 0) return '<div style="color:#94a3b8;font-size:0.85rem;">لا توجد بيانات بعد</div>';
                        return keys.map(function (k) {
                            return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #e2e8f0;font-size:0.85rem;">'
                                + '<span style="font-weight:700;color:#334155;">' + escapeHtml(LL[k] || (k === 'غير محدد' ? 'غير محدد' : k)) + '</span>'
                                + '<span style="font-weight:800;color:#0f5cbf;">' + map[k] + '</span></div>';
                        }).join('');
                    }
                    body.innerHTML = '<h4 style="margin:0 0 12px 0;color:#0f172a;">' + escapeHtml(s.title || 'إعلان') + '</h4>'
                        + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">'
                        + '<div style="background:#eff6ff;border-radius:12px;padding:14px;text-align:center;"><div style="font-size:1.4rem;font-weight:900;color:#1e40af;">' + (s.impressions_count || 0) + '</div><div style="font-size:0.78rem;color:#64748b;font-weight:700;">مشاهدة</div></div>'
                        + '<div style="background:#ecfdf5;border-radius:12px;padding:14px;text-align:center;"><div style="font-size:1.4rem;font-weight:900;color:#059669;">' + (s.clicks_count || 0) + '</div><div style="font-size:0.78rem;color:#64748b;font-weight:700;">نقرة</div></div>'
                        + '</div>'
                        + '<div style="font-weight:800;color:#334155;margin-bottom:6px;">👁 المشاهدات حسب المستوى:</div>'
                        + '<div style="background:#f8fafc;border-radius:10px;padding:10px 12px;margin-bottom:14px;">' + levelRows(s.impressions_by_level) + '</div>'
                        + '<div style="font-weight:800;color:#334155;margin-bottom:6px;">🖱 النقرات حسب المستوى:</div>'
                        + '<div style="background:#f8fafc;border-radius:10px;padding:10px 12px;">' + levelRows(s.clicks_by_level) + '</div>';
                } else {
                    body.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">تعذر جلب الإحصائيات</div>';
                }
            } catch (e) {
                body.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">تعذر الاتصال بالخادم</div>';
            }
        }

        async function loadTeacherAds() {
            var list = document.getElementById('teacherAdsList');
            if (!list) return;
            try {
                var res = await fetchWithAuth('/api/ads/teacher/mine');
                var d = await res.json();
                var ads = (d && d.success && d.ads) ? d.ads : [];
                var expiredCount = ads.filter(function (a) { return a.end_date && new Date(a.end_date) < new Date(); }).length;
                if (ads.length === 0) {
                    list.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;background:#fff;border:1px dashed #cbd5e1;border-radius:14px;">لا توجد إعلانات بعد — احجز أول إعلان لك من الأعلى!</div>';
                    return;
                }
                var deleteExpiredBtn = expiredCount > 0
                    ? '<div style="text-align:left;margin-bottom:12px;"><button onclick="deleteExpiredAds()" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-weight:800;font-size:0.8rem;padding:7px 16px;border-radius:10px;cursor:pointer;"><i class="fas fa-trash-alt"></i> حذف الحملات المنتهية (' + expiredCount + ')</button></div>'
                    : '';
                list.innerHTML = deleteExpiredBtn + ads.map(function (ad) {
                    var statusMap = {
                        pending: ['قيد المراجعة', '#f59e0b', '#fffbeb'],
                        active: ['نشط', '#10b981', '#ecfdf5'],
                        paused: ['متوقف', '#64748b', '#f1f5f9'],
                        rejected: ['مرفوض', '#dc2626', '#fef2f2']
                    };
                    var st = statusMap[ad.status] || ['غير معروف', '#64748b', '#f1f5f9'];
                    var typeLabel = (window.ZoomDzAds.TYPE_LABELS || {})[ad.ad_type] || ad.ad_type;
                    var placeLabel = (window.ZoomDzAds.PLACEMENT_LABELS || {})[ad.placement] || ad.placement;
                    var levelLabel = (window.ZoomDzAds.LEVEL_LABELS || {})[ad.education_level] || ad.education_level || 'الكل';
                    var reasonHtml = (ad.status === 'rejected' && ad.rejection_reason)
                        ? '<div style="font-size:0.8rem;color:#dc2626;margin-top:6px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:6px 10px;">سبب الرفض: ' + escapeHtml(ad.rejection_reason) + '</div>'
                        : '';
                    // عداد الأيام المتبقية (أو المنتهية)
                    var daysHtml = '';
                    if (ad.end_date) {
                        var msLeft = new Date(ad.end_date).getTime() - Date.now();
                        var daysLeft = Math.ceil(msLeft / 86400000);
                        if (msLeft <= 0) {
                            daysHtml = '<span style="background:#f1f5f9;color:#64748b;font-weight:800;font-size:0.75rem;padding:4px 10px;border-radius:8px;">⏳ انتهت الحملة</span>';
                        } else {
                            daysHtml = '<span style="background:#eff6ff;color:#1e40af;font-weight:800;font-size:0.75rem;padding:4px 10px;border-radius:8px;">📅 متبقي ' + daysLeft + ' يوم</span>';
                        }
                    }
                    var statsBtn = (ad.status === 'active')
                        ? '<button onclick="showAdStats(' + ad.id + ')" style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;font-weight:800;font-size:0.78rem;padding:6px 14px;border-radius:8px;cursor:pointer;white-space:nowrap;">📊 الإحصائيات</button>'
                        : '';
                    var pauseBtn = (ad.status === 'active' || ad.status === 'paused')
                        ? '<button onclick="toggleAdPause(' + ad.id + ')" style="background:' + (ad.status === 'active' ? '#fffbeb;color:#d97706;border:1px solid #fde68a;' : '#ecfdf5;color:#059669;border:1px solid #a7f3d0;') + 'font-weight:800;font-size:0.78rem;padding:6px 14px;border-radius:8px;cursor:pointer;white-space:nowrap;">' + (ad.status === 'active' ? '⏸ إيقاف' : '▶ استئناف') + '</button>'
                        : '';
                    var deleteBtn = '<button onclick="deleteTeacherAd(' + ad.id + ')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-weight:800;font-size:0.78rem;padding:6px 14px;border-radius:8px;cursor:pointer;white-space:nowrap;">🗑 حذف</button>';
                    return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
                        + '<div style="flex:1;min-width:220px;">'
                        + '<div style="font-weight:800;color:#0f172a;">' + (ad.title || 'بدون عنوان') + '</div>'
                        + '<div style="font-size:0.8rem;color:#64748b;margin-top:4px;">' + typeLabel + ' · ' + placeLabel + ' · 🎯 ' + levelLabel + ' · ' + (ad.impressions_count || 0) + ' ظهور · ' + (ad.clicks_count || 0) + ' نقرة · ' + (ad.price_paid || 0) + ' دج</div>'
                        + '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">' + daysHtml + '</div>'
                        + reasonHtml
                        + '</div>'
                        + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;">'
                        + statsBtn + pauseBtn + deleteBtn
                        + '<span style="background:' + st[2] + ';color:' + st[1] + ';font-weight:800;font-size:0.78rem;padding:5px 12px;border-radius:20px;white-space:nowrap;">' + st[0] + '</span>'
                        + '</div>'
                        + '</div>';
                }).join('');
            } catch (e) {
                list.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">تعذر تحميل الإعلانات</div>';
            }
        }

        // إيقاف/استئناف حملة
        async function toggleAdPause(id) {
            try {
                var res = await fetchWithAuth('/api/ads/teacher/' + id + '/pause', { method: 'POST' });
                var d = await res.json();
                if (d && d.success) {
                    showToast(d.message || 'تم تحديث الحالة', 'success');
                    loadTeacherAds();
                } else {
                    showToast((d && d.error) || 'تعذر تحديث الحالة', 'warning');
                }
            } catch (e) {
                showToast('تعذر الاتصال بالخادم', 'warning');
            }
        }

        // حذف إعلان (مع استرداد الأيام غير المستهلكة تلقائياً)
        async function deleteTeacherAd(id) {
            if (!confirm('هل أنت متأكد من حذف هذا الإعلان؟\n✅ الأيام غير المستهلكة من قيمة الإعلان ستُعاد إلى رصيدك تلقائياً.')) return;
            try {
                var res = await fetchWithAuth('/api/ads/teacher/' + id, { method: 'DELETE' });
                var d = await res.json();
                if (d && d.success) {
                    showToast(d.message || 'تم حذف الإعلان', 'success');
                    loadAdBalance();
                    loadTeacherAds();
                } else {
                    showToast((d && d.error) || 'تعذر حذف الإعلان', 'warning');
                }
            } catch (e) {
                showToast('تعذر الاتصال بالخادم', 'warning');
            }
        }

        // حذف كل الحملات المنتهية
        async function deleteExpiredAds() {
            if (!confirm('هل أنت متأكد من حذف جميع حملاتك المنتهية؟')) return;
            try {
                var res = await fetchWithAuth('/api/ads/teacher/expired', { method: 'DELETE' });
                var d = await res.json();
                if (d && d.success) {
                    showToast(d.message || 'تم الحذف', 'success');
                    loadTeacherAds();
                } else {
                    showToast((d && d.error) || 'تعذر الحذف', 'warning');
                }
            } catch (e) {
                showToast('تعذر الاتصال بالخادم', 'warning');
            }
        }

        async function bookTeacherAd() {
            var title = (document.getElementById('adTitleInput') || {}).value || '';
            var content = (document.getElementById('adContentInput') || {}).value || '';
            var link = (document.getElementById('adLinkInput') || {}).value || '';
            var image = adUploadedImageUrl || '';
            var type = (document.getElementById('adTypeInput') || {}).value || 'static';
            var placement = 'all'; // لا خيار موضع بعد الآن — يظهر تلقائياً في كل المواضع
            var level = (document.getElementById('adLevelInput') || {}).value || 'all';
            var start = (document.getElementById('adStartInput') || {}).value || '';
            var end = (document.getElementById('adEndInput') || {}).value || '';

            if (!title.trim()) return showToast('عنوان الإعلان مطلوب', 'warning');
            if (!start || !end) return showToast('حدد تاريخي البدء والانتهاء', 'warning');
            if (new Date(end) <= new Date(start)) return showToast('تاريخ الانتهاء يجب أن يكون بعد البدء', 'warning');

            try {
                var res = await fetchWithAuth('/api/ads/teacher/book', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: title.trim(), content: content.trim(), link_url: link.trim(),
                        image_url: image.trim(), ad_type: type, placement: placement,
                        education_level: level, start_date: start, end_date: end
                    })
                });
                var d = await res.json();
                if (d && d.success) {
                    showToast(d.message || 'تم حجز إعلانك وخصم قيمته من رصيدك', 'success');
                    if (typeof d.balance === 'number') setAdBalanceInfo(d.balance);
                    ['adTitleInput', 'adContentInput', 'adLinkInput', 'adImageInput'].forEach(function (id) {
                        var el = document.getElementById(id); if (el) el.value = '';
                    });
                    updateAdPricePreview();
                    loadTeacherAds();
                } else {
                    showToast((d && d.error) || 'تعذر حجز الإعلان', 'warning');
                }
            } catch (e) {
                showToast('تعذر الاتصال بالخادم', 'warning');
            }
        }

        // تفعيل الحاسبة عند فتح القسم
        var _origShowSectionAds = window.showSection;
        window.showSection = async function (section) {
            await _origShowSectionAds(section);
            if (section === 'ads') {
                if (window.ZoomDzAds && window.ZoomDzAds.loadSeasonal) await window.ZoomDzAds.loadSeasonal();
                updateAdPricePreview();
                loadAdBalance();
                loadTeacherAds();
            }
        };
    