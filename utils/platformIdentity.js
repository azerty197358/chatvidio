// ============================================================
// حساب المنصة الرسمي (منصة ZoomDz)
// يُنشأ تلقائياً عند أول إنشاء محتوى من لوحة الإدارة
// (دروس/دورات/باقات/منشورات/المجموعات) فيظهر باسم المنصة.
// ============================================================
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const logger = require('./logger');
const { supabase } = require('../config/database');
const { getOne, insert } = require('./helpers');

const PLATFORM_TEACHER_EMAIL = 'platform@zoomdz.com';
const PLATFORM_TEACHER_NAME = 'منصة ZoomDz';

async function getPlatformTeacherIdFromSettings() {
    try {
        const { data: row } = await supabase
            .from('platform_settings')
            .select('value')
            .eq('key', 'platform_identity')
            .maybeSingle();
        const id = row && row.value ? parseInt(row.value.platform_teacher_id) : NaN;
        return isNaN(id) ? null : id;
    } catch (e) {
        return null;
    }
}

async function savePlatformTeacherId(id) {
    try {
        await supabase.from('platform_settings').upsert({
            key: 'platform_identity',
            value: { platform_teacher_id: id },
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
    } catch (e) {
        // حفظ اختياري — في المرة القادمة نبحث بالبريد الثابت
    }
}

/**
 * يعيد صف حساب المنصة (ينشئه مرة واحدة فقط ثم يخزّن معرّفه في platform_settings)
 */
async function getOrCreatePlatformTeacher() {
    // 1) المعرّف المخزّن مسبقاً
    const savedId = await getPlatformTeacherIdFromSettings();
    if (savedId) {
        const teacher = await getOne('teachers', 'id', savedId);
        if (teacher) return teacher;
    }

    // 2) البحث بالبريد الثابت
    try {
        const { data: byEmail } = await supabase
            .from('teachers')
            .select('*')
            .eq('email', PLATFORM_TEACHER_EMAIL)
            .maybeSingle();
        if (byEmail && byEmail.id) {
            await savePlatformTeacherId(byEmail.id);
            return byEmail;
        }
    } catch (e) {
        logger.warn('تعذر البحث عن حساب المنصة بالبريد:', { message: e.message });
    }

    // 3) إنشاء الحساب لأول مرة
    try {
        const created = await insert('teachers', {
            full_name: PLATFORM_TEACHER_NAME,
            email: PLATFORM_TEACHER_EMAIL,
            password: bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10),
            phone: '',
            specialization: 'منصة التعليم الجزائرية',
            bio: 'الحساب الرسمي لمنصة ZoomDz — دروس وباقات ومنشورات ومنصات رسمية من صميم المنصة.',
            profile_image: null,
            diploma_image: null,
            id_image: null,
            status: 'approved',
            is_certified: true,
            email_verified: true,
            balance: 0,
            referral_balance: 0,
            total_earned: 0,
            total_withdrawn: 0,
            pending_withdraw: 0,
            referral_code: null,
            is_banned: false,
            profile_completion: true,
            subject: 'منصة ZoomDz',
            profile_url: null,
            ai_tokens: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });

        if (created && created.id) {
            await savePlatformTeacherId(created.id);
            logger.info('✅ تم إنشاء الحساب الرسمي للمنصة', { teacher_id: created.id });
            return created;
        }
    } catch (e) {
        logger.error('فشل إنشاء حساب المنصة الرسمي:', { message: e.message });
    }

    return null;
}

module.exports = {
    getOrCreatePlatformTeacher,
    PLATFORM_TEACHER_NAME,
    PLATFORM_TEACHER_EMAIL
};
