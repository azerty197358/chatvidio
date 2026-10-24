
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
