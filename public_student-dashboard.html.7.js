
        // ✅ تهيئة الإعلانات:
        //    1) الإشعار العلوي يبدأ طلبه فور تحليل الصفحة (يكسب سباق match — لكل طالب مشاهدة واحدة لكل إعلان كل 24 ساعة)
        //    2) مساحات الباقات/الدورات/الدروس بعد اكتمال التحميل
        //    3) تبويبات جديدة (الرسائل/المجموعات/التمارين/المجتمع/الأساتذة/المعاملات/الإحالة/الحجوزات)
        //       تُعرض عند أول فتح لكل تبويب — كي تُحتسب المشاهدة وقت الرؤية الفعلية فقط
        if (window.ZoomDzAds) {
            try { ZoomDzAds.notify(); } catch (e) {}
        }
        window.addEventListener('DOMContentLoaded', function () {
            if (window.ZoomDzAds) {
                try { ZoomDzAds.renderInto(document.getElementById('studentPackagesAdSlot'), 'packages'); } catch (e) {}
                try { ZoomDzAds.renderInto(document.getElementById('studentCoursesAdSlot'), 'courses'); } catch (e) {}
                try { ZoomDzAds.renderInto(document.getElementById('studentLessonsAdSlot'), 'lessons_header'); } catch (e) {}
            }
            var _adTabsRendered = {};
            var adTabMap = {
                messages: ['studentMessagesAdSlot', 'messages'],
                groups: ['studentGroupsAdSlot', 'groups'],
                exercises: ['studentExercisesAdSlot', 'exercises'],
                'community-channels': ['studentCommunityAdSlot', 'community'],
                teachers: ['studentTeachersAdSlot', 'teachers'],
                transactions: ['studentTransactionsAdSlot', 'transactions'],
                referral: ['studentReferralAdSlot', 'referral'],
                bookings: ['studentBookingsAdSlot', 'bookings']
            };
            var _origShowSectionAds = window.showSection;
            if (typeof _origShowSectionAds === 'function') {
                window.showSection = function (section) {
                    var r = _origShowSectionAds.apply(this, arguments);
                    try {
                        var slot = adTabMap[section];
                        if (slot && !_adTabsRendered[section] && window.ZoomDzAds) {
                            _adTabsRendered[section] = true;
                            ZoomDzAds.renderInto(document.getElementById(slot[0]), slot[1]);
                        }
                    } catch (e) {}
                    return r;
                };
            }
        });
    