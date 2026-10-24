
    window.openPlatformImageLightbox = function(url, title) {
        const modal = document.getElementById('platformImageLightbox');
        const img = document.getElementById('lightboxImagePreview');
        const titleEl = document.getElementById('lightboxImageTitle');
        if (modal && img && titleEl) {
            img.src = url;
            titleEl.textContent = title || 'صورة';
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        } else {
            window.open(url, '_blank');
        }
    };
    window.closePlatformImageLightbox = function() {
        const modal = document.getElementById('platformImageLightbox');
        if (modal) {
            modal.style.display = 'none';
            document.getElementById('lightboxImagePreview').src = '';
            document.body.style.overflow = '';
        }
    };

    window.openCourseReviewsModal = async function(courseId, courseTitle) {
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
    };
