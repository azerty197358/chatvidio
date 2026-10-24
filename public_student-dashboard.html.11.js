
// ============================================================================
//  ترتيب التبويبات حسب الأولوية
//  نرتّب عناصر DOM داخل كل حاوية تنقّل (#navTabs، القوائم الجانبية، شريط
//  الجوال السفلي) بدل تعديل CSS، فيصل الترتيب لكل الشاشات معاً.
// ============================================================================
(function () {
    if (window.__zoomyNavOrderDone) return;
    window.__zoomyNavOrderDone = true;

    // من الأعلى الأولوية إلى الأقل
    const TEACHER_ORDER = [
        'offers',            // ZoomDz Live / البثوث
        'messages',          // الرسائل
        'groups',            // المجموعات
        'all-lessons',       // دروس الطلاب
        'exercises',         // التمارين
        'earnings',          // الأرباح والمدفوعات
        'courses',           // الدورات
        'packages',          // الباقات
        'teachers',          // الأساتذة
        'community-channels',
        'ai-assistant',
        'transactions',
        'referral',
        'profile'
    ];

    const STUDENT_ORDER = [
        'exercises',         // التمارين - النشاط اليومي
        'offers',            // ZoomDz Live
        'messages',          // الرسائل
        'groups',            // المجموعات
        'teachers',          // الأساتذة
        'packages',          // الباقات
        'courses',           // الدورات
        'community-channels',
        'ai-assistant',
        'transactions',
        'referral',
        'profile'
    ];

    const isTeacher = (typeof teacherId !== 'undefined' && teacherId) ||
        (typeof userData !== 'undefined' && userData && userData.role === 'teacher');
    const order = isTeacher ? TEACHER_ORDER : STUDENT_ORDER;

    function rank(el) {
        const i = order.indexOf(el.getAttribute('data-section'));
        // أي عنصر بلا مفتاح يبقى في نهاية القائمة
        return i === -1 ? order.length : i;
    }

    function sortContainer(container) {
        const kids = Array.prototype.slice.call(container.children);
        const movable = kids.filter(function (el) {
            return el.getAttribute && el.getAttribute('data-section');
        });
        if (movable.length < 2) return 0;

        const sorted = movable.slice().sort(function (a, b) { return rank(a) - rank(b); });
        let k = 0;
        const result = kids.map(function (el) {
            return movable.indexOf(el) === -1 ? el : sorted[k++];
        });

        let changed = 0;
        result.forEach(function (el, i) { if (kids[i] !== el) changed++; });
        if (!changed) return 0;

        // appendChild على عنصر موجود ينقله، فالتنفيذ يبدّل الترتيب في مكانه
        result.forEach(function (el) { container.appendChild(el); });
        return changed;
    }

    function apply() {
        const targets = [];
        const tabs = document.getElementById('navTabs');
        if (tabs) targets.push(tabs);
        document.querySelectorAll('.sidebar-nav-list').forEach(function (el) { targets.push(el); });
        document.querySelectorAll('.mobile-bottom-nav').forEach(function (el) { targets.push(el); });

        let moved = 0;
        targets.forEach(function (c) { moved += sortContainer(c); });
        window.__zoomyNavOrderMoved = moved;
        document.dispatchEvent(new CustomEvent('zoomy:nav-ordered'));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
    else apply();
    // بعض الأقسام تُبنى لاحقاً بالـ JS، نعيد الترتيب بعدها أيضاً
    window.addEventListener('load', function () { setTimeout(apply, 1200); });
    window.addEventListener('zoomy:nav-reapply', apply);
})();
