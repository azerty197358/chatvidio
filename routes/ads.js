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

const VALID_TYPES = ['banner', 'static', 'notification'];
const VALID_PLACEMENTS = ['between_posts', 'comments', 'packages', 'courses', 'lessons_header'];
const VALID_LEVELS = ['all', 'bac', '3eme_as', '4eme_am', 'bem', '2eme_as', '1ere_as', '5eme_pri',
    '1ere_am', '2eme_am', '3eme_am', '5eme_am', '1ere_uni', '2eme_uni', '3eme_uni',
    'master', 'doctorat', 'vocational_all', 'other'];

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
router.get('/price-preview', (req, res) => {
    try {
        const price = calculateAdPrice({
            education_level: req.query.education_level || 'all',
            ad_type: req.query.ad_type || 'static',
            placement: req.query.placement || 'between_posts',
            start_date: req.query.start_date,
            end_date: req.query.end_date
        });
        res.json({ success: true, price });
    } catch (e) {
        res.json({ success: true, price: calculateAdPrice({}) });
    }
});

// ------------------------------------------------------------
// 2) مطابقة إعلان لطالب في موضع معين (عامة/اختيارية المصادقة)
//    القواعد: نشط + ضمن المدة + يطابق المستوى + يطابق الموضع + لم يُعرض لهذا الطالب خلال 24 ساعة
// ------------------------------------------------------------
router.get('/match', async (req, res) => {
    try {
        const placement = String(req.query.placement || '');
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

        // الإعلانات المرشحة: نشطة + ضمن المدة + تطابق الموضع + (المستوى المستهدف أو الكل)
        const { data: candidates, error } = await supabase
            .from('ads')
            .select('*')
            .eq('status', 'active')
            .eq('placement', placement)
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

        // تدوير عشوائي عادل بين المطابقين
        const ad = pool[Math.floor(Math.random() * pool.length)];

        // تسجيل الظهور (مرة واحدة لكل طالب كل 24 ساعة) — تكميلي لا يُبطل العرض
        if (student && student.userId) {
            try {
                await supabase.from('ad_impressions').insert({ ad_id: ad.id, student_id: student.userId });
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
        const { data: ad } = await supabase.from('ads').select('clicks_count').eq('id', id).maybeSingle();
        if (ad) {
            await supabase.from('ads').update({ clicks_count: (ad.clicks_count || 0) + 1 }).eq('id', id);
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
        const placement = VALID_PLACEMENTS.includes(req.body.placement) ? req.body.placement : 'between_posts';
        const level = VALID_LEVELS.includes(req.body.education_level) ? req.body.education_level : 'all';
        const startDate = new Date(req.body.start_date);
        const endDate = new Date(req.body.end_date);

        if (!title) {
            return res.status(400).json({ success: false, error: 'عنوان الإعلان مطلوب' });
        }
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
            return res.status(400).json({ success: false, error: 'فترة الإعلان غير صالحة' });
        }

        const price = calculateAdPrice({
            education_level: level,
            ad_type: adType,
            placement,
            start_date: startDate,
            end_date: endDate
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
        const { error } = await supabase.from('ads').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) {
            return res.json({ success: false, error: 'تعذر تحديث الحالة' });
        }
        res.json({ success: true, message: status === 'active' ? '✅ تم تفعيل الإعلان' : 'تم تحديث الحالة' });
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
