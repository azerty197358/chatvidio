// ============================================================
// ZoomDz — مسارات نظام الإعلانات المستهدف
// المطابقة الآمنة: الوقت + المستوى + الموضع والنوع + مرة واحدة لكل طالب كل 24 ساعة
// ============================================================
const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { verifyToken } = require('../utils/jwt');
const { calculateAdPrice, TYPE_LABELS, PLACEMENT_LABELS, LEVEL_LABELS } = require('../utils/adPricing');
const logger = require('../utils/logger');
const multer = require('multer');
const { uploadToSupabase } = require('../utils/upload');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 } // 8MB — تُضغط تلقائياً في المتصفح ثم خادمياً
});

const VALID_TYPES = ['banner', 'static', 'notification'];
const VALID_PLACEMENTS = ['between_posts', 'comments', 'packages', 'courses', 'lessons_header'];
const VALID_LEVELS = ['all', 'bac', '3eme_as', '4eme_am', 'bem', '2eme_as', '1ere_as', '5eme_pri',
    '1ere_am', '2eme_am', '3eme_am', '5eme_am', '1ere_uni', '2eme_uni', '3eme_uni',
    'master', 'doctorat', 'vocational_all', 'other'];

const SEASONAL_SETTINGS_KEY = 'ad_seasonal_pricing';

// قراءة إعدادات التسعير الموسمي من platform_settings
async function getSeasonalSettings() {
    try {
        const { data } = await supabase
            .from('platform_settings')
            .select('value')
            .eq('key', SEASONAL_SETTINGS_KEY)
            .maybeSingle();
        const v = data && data.value;
        const multiplier = (v && typeof v.multiplier === 'number' && v.multiplier > 0) ? v.multiplier : 1.0;
        return { multiplier, note: (v && v.note) || '' };
    } catch (e) {
        return { multiplier: 1.0, note: '' };
    }
}

// حفظ إعدادات التسعير الموسمي (إدارة)
async function setSeasonalSettings(multiplier, note) {
    await supabase.from('platform_settings').upsert({
        key: SEASONAL_SETTINGS_KEY,
        value: { multiplier, note: note || '', updated_at: new Date().toISOString() }
    });
}

// تنظيف نص آمن للعرض
function cleanText(v, max = 500) {
    return String(v == null ? '' : v).trim().substring(0, max);
}

// التعرف الاختياري على الطالب من التوكن (بدون إلزام)
function optionalStudent(req) {
    try {
        const h = req.headers.authorization || '';
        if (!h.startsWith('Bearer ')) return null;
        const decoded = verifyToken(h.slice(7));
        if (!decoded || decoded.role !== 'student') return null;
        return decoded;
    } catch (e) {
        return null;
    }
}

// ------------------------------------------------------------
// 1) معاينة السعر (عامة) — يستخدمها حاسبة المعلن
// ------------------------------------------------------------
router.get('/price-preview', async (req, res) => {
    try {
        const seasonal = await getSeasonalSettings();
        const price = calculateAdPrice({
            education_level: req.query.education_level || 'all',
            ad_type: req.query.ad_type || 'static',
            // لا خيار موضع بعد الآن — الافتراضي "كل الأماكن" (تلقائي)
            placement: (req.query.placement === 'all' || VALID_PLACEMENTS.includes(req.query.placement)) ? req.query.placement : 'all',
            start_date: req.query.start_date,
            end_date: req.query.end_date,
            seasonalMultiplier: seasonal.multiplier
        });
        res.json({ success: true, price, seasonal: seasonal });
    } catch (e) {
        res.json({ success: true, price: calculateAdPrice({}) });
    }
});

// ------------------------------------------------------------
// 1b) قراءة معامل التسعير الموسمي الحالي (عامة — تعرضه حاسبة المعلن)
// ------------------------------------------------------------
router.get('/seasonal', async (req, res) => {
    const seasonal = await getSeasonalSettings();
    res.json({ success: true, seasonal });
});

// ------------------------------------------------------------
// 1c) ضبط معامل التسعير الموسمي (إدارة)
// ------------------------------------------------------------
router.post('/admin/seasonal', authenticate, authorize(['admin']), async (req, res) => {
    try {
        // يقبل multiplier مباشرة (1.25) أو percent (25 تعني +25%)
        let multiplier = parseFloat(req.body.multiplier);
        if (isNaN(multiplier) && req.body.percent !== undefined) {
            const percent = parseFloat(req.body.percent);
            if (!isNaN(percent)) multiplier = 1 + percent / 100;
        }
        if (isNaN(multiplier) || multiplier <= 0 || multiplier > 5) {
            return res.status(400).json({ success: false, error: 'قيمة غير صالحة' });
        }
        multiplier = Math.round(multiplier * 100) / 100;
        await setSeasonalSettings(multiplier, String(req.body.note || '').substring(0, 200));
        res.json({
            success: true,
            message: '✅ تم تحديث نسبة تغيير الأسعار الموسمية',
            seasonal: { multiplier, note: req.body.note || '' }
        });
    } catch (e) {
        logger.warn('ads seasonal save error: ' + e.message);
        res.json({ success: false, error: 'تعذر حفظ الإعدادات' });
    }
});

// ------------------------------------------------------------
// 2) مطابقة إعلان لطالب في موضع معين (عامة/اختيارية المصادقة)
//    القواعد: نشط + ضمن المدة + يطابق المستوى + يطابق الموضع + لم يُعرض لهذا الطالب خلال 24 ساعة
// ------------------------------------------------------------
router.get('/match', async (req, res) => {
    try {
        const rawPlacement = String(req.query.placement || '');
        // 'notification' ليس موضعاً حقيقياً بل نوع الإشعار العلوي — يُطابق من كل
        // المواضع مع تفضيل الإعلانات ذات النوع notification (وإن كان أي إعلان مناسب)
        const preferNotificationType = rawPlacement === 'notification';
        const placement = preferNotificationType ? 'all' : rawPlacement;
        if (!VALID_PLACEMENTS.includes(placement)) {
            return res.json({ success: true, ad: null });
        }

        const student = optionalStudent(req);
        let studentLevel = 'all';
        if (student && student.userId) {
            try {
                const { data: st } = await supabase
                    .from('students')
                    .select('education_level')
                    .eq('id', student.userId)
                    .maybeSingle();
                if (st && st.education_level) studentLevel = st.education_level;
            } catch (e) {}
        }

        const now = new Date().toISOString();

        // الإعلانات المرشحة: نشطة + ضمن المدة + (الموضع المحدد أو "كل الأماكن" التلقائي) + (المستوى المستهدف أو الكل)
        const { data: candidates, error } = await supabase
            .from('ads')
            .select('*')
            .eq('status', 'active')
            .or(`placement.eq.all,placement.eq.${placement}`)
            .lte('start_date', now)
            .gte('end_date', now)
            .or(`education_level.eq.${studentLevel},education_level.eq.all`);

        if (error || !Array.isArray(candidates) || candidates.length === 0) {
            return res.json({ success: true, ad: null });
        }

        // استبعاد ما ظهر لهذا الطالب خلال آخر 24 ساعة
        let pool = candidates;
        if (student && student.userId) {
            try {
                const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                const { data: recent } = await supabase
                    .from('ad_impressions')
                    .select('ad_id')
                    .eq('student_id', student.userId)
                    .gte('created_at', since);
                const recentIds = new Set((recent || []).map(r => r.ad_id));
                pool = candidates.filter(a => !recentIds.has(a.id));
            } catch (e) {}
        }

        if (pool.length === 0) {
            return res.json({ success: true, ad: null });
        }

        // تفضيل نوع notification عند موضع الإشعار العلوي (وإن كان أي إعلان مناسباً)
        let finalPool = pool;
        if (preferNotificationType) {
            const typed = pool.filter(a => a.ad_type === 'notification');
            finalPool = typed.length > 0 ? typed : pool;
        }

        // تدوير عشوائي عادل بين المطابقين
        const ad = finalPool[Math.floor(Math.random() * finalPool.length)];

        // تسجيل الظهور (مرة واحدة لكل طالب كل 24 ساعة) — تكميلي لا يُبطل العرض
        if (student && student.userId) {
            try {
                await supabase.from('ad_impressions').insert({ ad_id: ad.id, student_id: student.userId, student_level: studentLevel });
            } catch (e) {}
        }
        try {
            await supabase
                .from('ads')
                .update({ impressions_count: (ad.impressions_count || 0) + 1, updated_at: now })
                .eq('id', ad.id);
        } catch (e) {}

        res.json({
            success: true,
            ad: {
                id: ad.id,
                title: ad.title || '',
                content: ad.content || '',
                image_url: ad.image_url || '',
                link_url: ad.link_url || '',
                ad_type: ad.ad_type,
                placement: ad.placement
            }
        });
    } catch (e) {
        logger.warn('ads match error: ' + e.message);
        res.json({ success: true, ad: null });
    }
});

// ------------------------------------------------------------
// 3) تسجيل نقرة على إعلان (عامة — تكميلية)
// ------------------------------------------------------------
router.post('/:id/click', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ success: false });
        const student = optionalStudent(req);
        let level = null;
        if (student && student.userId) {
            try {
                const { data: st } = await supabase.from('students').select('education_level').eq('id', student.userId).maybeSingle();
                if (st && st.education_level) level = st.education_level;
            } catch (e) {}
        }
        const { data: ad } = await supabase.from('ads').select('clicks_count').eq('id', id).maybeSingle();
        if (ad) {
            await supabase.from('ads').update({ clicks_count: (ad.clicks_count || 0) + 1 }).eq('id', id);
        }
        // تسجيل النقرة مفصّلة (لحساب إحصائيات المستوى)
        if (student && student.userId) {
            try {
                await supabase.from('ad_clicks').insert({ ad_id: id, student_id: student.userId, student_level: level });
            } catch (e) {}
        }
        res.json({ success: true });
    } catch (e) {
        res.json({ success: true });
    }
});

// ------------------------------------------------------------
// 4) حجز إعلان جديد (أستاذ/مدرسة)
// ------------------------------------------------------------
router.post('/teacher/book', authenticate, authorize(['teacher']), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const teacherName = req.user.full_name || req.user.name || 'معلن';

        const title = cleanText(req.body.title, 120);
        const content = cleanText(req.body.content, 500);
        const imageUrl = cleanText(req.body.image_url, 500);
        const linkUrl = cleanText(req.body.link_url, 500);
        const adType = VALID_TYPES.includes(req.body.ad_type) ? req.body.ad_type : 'static';
        // 📢 إزالة خيار الموضع من لوحة المدرّس: كل إعلان جديد يُحجز ليظهر
        //    تلقائياً في كل المواضع (بين المنشورات + التعليقات + الباقات + الدورات + ترويسة الدروس)
        const placement = 'all';
        const level = VALID_LEVELS.includes(req.body.education_level) ? req.body.education_level : 'all';
        const startDate = new Date(req.body.start_date);
        const endDate = new Date(req.body.end_date);

        if (!title) {
            return res.status(400).json({ success: false, error: 'عنوان الإعلان مطلوب' });
        }
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
            return res.status(400).json({ success: false, error: 'فترة الإعلان غير صالحة' });
        }

        const seasonal = await getSeasonalSettings();
        const price = calculateAdPrice({
            education_level: level,
            ad_type: adType,
            placement,
            start_date: startDate,
            end_date: endDate,
            seasonalMultiplier: seasonal.multiplier
        });

        const { data: created, error } = await supabase
            .from('ads')
            .insert({
                advertiser_id: teacherId,
                advertiser_name: teacherName,
                title,
                content,
                image_url: imageUrl || null,
                link_url: linkUrl || null,
                ad_type: adType,
                placement,
                education_level: level,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                status: 'pending',
                price_paid: price.total,
                impressions_count: 0,
                clicks_count: 0
            })
            .select()
            .single();

        if (error) {
            logger.warn('ads book insert error: ' + error.message);
            return res.status(500).json({ success: false, error: 'تعذر حفظ الإعلان، حاول مرة أخرى' });
        }

        res.json({
            success: true,
            message: '✅ تم إرسال إعلانك للمراجعة — سيظهر للطلاب بعد تفعيله من الإدارة',
            ad: created,
            price
        });
    } catch (e) {
        logger.warn('ads book error: ' + e.message);
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء حجز الإعلان' });
    }
});

// ------------------------------------------------------------
// 4b) رفع صورة الإعلان (أستاذ) — تُضغط ثم تُخزَّن في التخزين
// ------------------------------------------------------------
router.post('/teacher/upload-image', authenticate, authorize(['teacher']), upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'لم يتم إرفاق صورة' });
        }
        const uploaded = await uploadToSupabase(req.file, 'ad_images');
        if (!uploaded || !uploaded.url) {
            return res.status(500).json({ success: false, error: 'تعذر رفع الصورة، حاول مرة أخرى' });
        }
        res.json({ success: true, url: uploaded.url });
    } catch (e) {
        logger.warn('ads image upload error: ' + e.message);
        res.status(500).json({ success: false, error: 'تعذر رفع الصورة، حاول مرة أخرى' });
    }
});

// ------------------------------------------------------------
// 5) إعلانات المعلن الحالي
// ------------------------------------------------------------
router.get('/teacher/mine', authenticate, authorize(['teacher']), async (req, res) => {
    try {
        const { data: ads, error } = await supabase
            .from('ads')
            .select('*')
            .eq('advertiser_id', req.user.userId)
            .order('id', { ascending: false })
            .limit(100);
        if (error) {
            return res.json({ success: false, error: 'تعذر جلب الإعلانات' });
        }
        res.json({ success: true, ads: ads || [] });
    } catch (e) {
        res.json({ success: true, ads: [] });
    }
});

// ------------------------------------------------------------
// 5b) إحصائيات إعلان معلن معيّن (مشاهدات/نقرات + التوزيع حسب المستوى)
// ------------------------------------------------------------
router.get('/teacher/:id/stats', authenticate, authorize(['teacher']), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'معرف غير صالح' });

        // التأكد أن الإعلان ملك هذا المعلن
        const { data: ad } = await supabase.from('ads').select('*').eq('id', id).maybeSingle();
        if (!ad || ad.advertiser_id !== req.user.userId) {
            return res.status(404).json({ success: false, error: 'الإعلان غير موجود' });
        }

        // التوزيع حسب المستوى للمشاهدات
        const { data: impressions } = await supabase
            .from('ad_impressions')
            .select('student_level')
            .eq('ad_id', id);
        // التوزيع حسب المستوى للنقرات
        const { data: clicks } = await supabase
            .from('ad_clicks')
            .select('student_level')
            .eq('ad_id', id);

        function groupByLevel(rows) {
            const map = {};
            (rows || []).forEach(r => {
                const k = r.student_level || 'غير محدد';
                map[k] = (map[k] || 0) + 1;
            });
            return map;
        }

        res.json({
            success: true,
            stats: {
                id: ad.id,
                title: ad.title,
                status: ad.status,
                impressions_count: ad.impressions_count || 0,
                clicks_count: ad.clicks_count || 0,
                impressions_by_level: groupByLevel(impressions),
                clicks_by_level: groupByLevel(clicks)
            }
        });
    } catch (e) {
        logger.warn('ads stats error: ' + e.message);
        res.status(500).json({ success: false, error: 'تعذر جلب الإحصائيات' });
    }
});

// ------------------------------------------------------------
// 6) قائمة الإعلانات للإدارة + الإحصائيات
// ------------------------------------------------------------
router.get('/admin/list', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const { data: ads, error } = await supabase
            .from('ads')
            .select('*')
            .order('id', { ascending: false })
            .limit(500);
        if (error) {
            return res.json({ success: false, error: 'تعذر جلب الإعلانات' });
        }
        const { data: impressions } = await supabase.from('ad_impressions').select('id').limit(1);
        res.json({
            success: true,
            ads: ads || [],
            total_impressions: impressions ? impressions.length : 0
        });
    } catch (e) {
        res.json({ success: true, ads: [] });
    }
});

// ------------------------------------------------------------
// 7) تغيير حالة إعلان (تفعيل/إيقاف) — إدارة
// ------------------------------------------------------------
router.post('/admin/:id/status', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const status = ['active', 'paused', 'pending'].includes(req.body.status) ? req.body.status : 'paused';
        if (!id) return res.status(400).json({ success: false, error: 'معرف غير صالح' });

        // جلب الإعلان قبل التحديث لمعرفة المعلن والحالة السابقة (لإشعاره عند التفعيل)
        let adRow = null;
        try {
            const { data } = await supabase.from('ads').select('advertiser_id, title, status').eq('id', id).maybeSingle();
            adRow = data;
        } catch (e) {}

        const { error } = await supabase.from('ads').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) {
            return res.json({ success: false, error: 'تعذر تحديث الحالة' });
        }

        // ✅ إشعار الأستاذ المعلن فور تفعيل إعلانه (كانت الفجوة: التفعيل يمر دون أي إشعار)
        if (adRow && adRow.advertiser_id && status === 'active' && adRow.status !== 'active') {
            try {
                await supabase.from('notifications').insert({
                    user_id: adRow.advertiser_id,
                    user_type: 'teacher',
                    title: '🎉 تم قبول إعلانك',
                    message: `إعلانك "${adRow.title || ''}" تمت مراجعته وتم تفعيله الآن — سيظهر للطلاب في مواضع المنصة حسب استهدافه.`,
                    is_read: false,
                    created_at: new Date().toISOString()
                });
            } catch (notifErr) {
                logger.warn('تعذر إشعار المعلن بالتفعيل: ' + (notifErr && notifErr.message));
            }
        }

        res.json({ success: true, message: status === 'active' ? '✅ تم تفعيل الإعلان وإشعار المعلن' : 'تم تحديث الحالة' });
    } catch (e) {
        res.json({ success: false, error: 'حدث خطأ' });
    }
});

// ------------------------------------------------------------
// 7b) رفض إعلان مع سبب (إدارة)
// ------------------------------------------------------------
router.post('/admin/:id/reject', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'معرف غير صالح' });
        const reason = String(req.body.reason || '').trim().substring(0, 300);
        if (!reason) {
            return res.status(400).json({ success: false, error: 'يرجى كتابة سبب الرفض' });
        }

        // جلب الإعلان قبل الرفض لإشعار المعلن بالسبب
        let adRow = null;
        try {
            const { data } = await supabase.from('ads').select('advertiser_id, title').eq('id', id).maybeSingle();
            adRow = data;
        } catch (e) {}

        const { error } = await supabase
            .from('ads')
            .update({ status: 'rejected', rejection_reason: reason, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) {
            return res.json({ success: false, error: 'تعذر رفض الإعلان' });
        }

        // ✅ إشعار الأستاذ برفض إعلانه وسبب الرفض (يظهر أيضاً في إدارة إعلاناته)
        if (adRow && adRow.advertiser_id) {
            try {
                await supabase.from('notifications').insert({
                    user_id: adRow.advertiser_id,
                    user_type: 'teacher',
                    title: '❌ تم رفض إعلانك',
                    message: `إعلانك "${adRow.title || ''}" لم يُعتمد. السبب: ${reason} — يمكنك تعديل الإعلان وإعادة إرساله للمراجعة.`,
                    is_read: false,
                    created_at: new Date().toISOString()
                });
            } catch (notifErr) {
                logger.warn('تعذر إشعار المعلن بالرفض: ' + (notifErr && notifErr.message));
            }
        }

        res.json({ success: true, message: 'تم رفض الإعلان وإشعار المعلن بالسبب' });
    } catch (e) {
        res.json({ success: false, error: 'حدث خطأ' });
    }
});

// ------------------------------------------------------------
// 8) حذف إعلان — إدارة
// ------------------------------------------------------------
router.delete('/admin/:id', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'معرف غير صالح' });
        await supabase.from('ad_impressions').delete().eq('ad_id', id);
        await supabase.from('ads').delete().eq('id', id);
        res.json({ success: true, message: 'تم حذف الإعلان' });
    } catch (e) {
        res.json({ success: false, error: 'حدث خطأ أثناء الحذف' });
    }
});

module.exports = router;
