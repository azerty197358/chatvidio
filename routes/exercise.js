// ============================================================
// مسارات التمارين والحلول - Exercises & Solutions Routes
// ============================================================

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/database');
const { authenticate, optionalAuth, authorize } = require('../middleware/auth');
const { getOne, insert, remove, update } = require('../utils/helpers');
const { uploadToSupabase } = require('../utils/upload');
const logger = require('../utils/logger');
const memoryCache = require('../utils/cache');
const sharp = require('sharp');

// ============================================================
// ترحيل صور base64 المخزّنة داخل قاعدة البيانات إلى التخزين
// بعض المنتورات القديمة تحفظ الصور كـ data URLs داخل عمود
// images (حتى 2.8MB للصورة الواحدة) — كل تحميل لصفحة التمارين
// كان يسحب 10MB ويبطّئ اللوحة كاملة. تُرفع الصورة مرة واحدة
// إلى bucket exercises ثم يُحفظ الرابط مكان البيانات.
// ============================================================
const _migratingExerciseIds = new Set();

// إحصاءات الترحيل تُعرض في ترويسة X-Ex-Migration لتشخيص الإنتاج
const _exMigrationStats = { attempted: 0, migrated: 0, failed: 0, lastError: '' };
let _exBucketEnsured = false;

// الحاوية exercises قد لا تكون منشأة أصلاً — نإنشها مرة واحدة ثم نكمل
async function ensureExercisesBucket() {
    if (_exBucketEnsured) return;
    _exBucketEnsured = true;
    try {
        const { error } = await supabase.storage.createBucket('exercises', { public: true });
        if (error && !/already exists|duplicate/i.test(error.message || '')) {
            logger.warn('تعذر إنشاء حاوية التخزين exercises: ' + error.message);
        }
    } catch (e) {
        logger.warn('استثناء عند إنشاء حاوية exercises: ' + e.message);
    }
}

// يرفع أي data URLs في المصفوفة إلى التخزين ويعيد مصفوفة الروابط
async function migrateImageListToStorage(imagesList) {
    const migrated = [];
    let changed = false;
    for (const img of imagesList) {
        if (typeof img !== 'string' || !img.startsWith('data:')) {
            migrated.push(img);
            continue;
        }
        const match = img.match(/^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=\s]+)$/);
        if (!match) { migrated.push(img); continue; }

        const buffer = Buffer.from(match[2], 'base64');
        if (buffer.length === 0 || buffer.length > 12 * 1024 * 1024) {
            migrated.push(img);
            continue;
        }
        _exMigrationStats.attempted++;

        // ضغط محافظ: حتى 1500px وجودة 72 تكفي لقراءة الصور عند التكبير
        let outBuffer = buffer;
        let contentType = match[1];
        try {
            let pipeline = sharp(buffer).rotate().flatten({ background: '#ffffff' });
            const meta = await pipeline.metadata();
            const largest = Math.max(meta.width || 0, meta.height || 0);
            if (largest > 1500) {
                pipeline = pipeline.resize({ width: 1500, height: 1500, fit: 'inside', withoutEnlargement: true });
            }
            outBuffer = await pipeline.jpeg({ quality: 72, progressive: true }).toBuffer();
            contentType = 'image/jpeg';
        } catch (sharpErr) {
            // نرفع الأصل كما هو إن تعذر الضغط
        }

        const ext = contentType === 'image/png' ? 'png' : 'jpg';
        const fileTail = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const uploadOpts = { contentType: contentType, cacheControl: '86400' };

        // الحاوية الأساسية exercises — إن لم تكن منشأة نإنشها ثم نعيد
        let storedPath = null;
        let storedBucket = null;
        let lastUpErr = null;
        const primaryPath = `migrated/${fileTail}`;
        let up = await supabase.storage.from('exercises').upload(primaryPath, outBuffer, uploadOpts);
        if (up.error && /bucket/i.test(up.error.message || '')) {
            await ensureExercisesBucket();
            up = await supabase.storage.from('exercises').upload(primaryPath, outBuffer, uploadOpts);
        }
        if (!up.error) {
            storedPath = primaryPath;
            storedBucket = 'exercises';
        } else {
            lastUpErr = up.error;
            // حل أخير: الحاضنة المعروفة profiles (تُستخدم للصور الشخصية أصلاً)
            const fbPath = `exercise-migrated/${fileTail}`;
            const fb = await supabase.storage.from('profiles').upload(fbPath, outBuffer, uploadOpts);
            if (!fb.error) {
                storedPath = fbPath;
                storedBucket = 'profiles';
            } else {
                lastUpErr = fb.error;
            }
        }

        if (!storedPath) {
            _exMigrationStats.failed++;
            _exMigrationStats.lastError = ((lastUpErr && lastUpErr.message) || 'upload failed').slice(0, 80);
            logger.warn('تعذر رفع صورة base64 إلى التخزين: ' + _exMigrationStats.lastError);
            migrated.push(img);
            continue;
        }

        const { data: pub } = supabase.storage.from(storedBucket).getPublicUrl(storedPath);
        migrated.push((pub && pub.publicUrl) || img);
        changed = true;
        _exMigrationStats.migrated++;
    }
    return { list: migrated, changed: changed };
}

async function migrateBase64ExerciseImages(row) {
    try {
        if (!row || row.id == null || _migratingExerciseIds.has(row.id)) return row;

        let imagesList = [];
        if (Array.isArray(row.images)) {
            imagesList = row.images;
        } else if (typeof row.images === 'string') {
            try { imagesList = JSON.parse(row.images); } catch (e) { return row; }
        }
        if (!Array.isArray(imagesList) || !imagesList.some(im => typeof im === 'string' && im.startsWith('data:'))) {
            return row;
        }

        _migratingExerciseIds.add(row.id);
        try {
            const { list, changed } = await migrateImageListToStorage(imagesList);
            if (changed) {
                const { error: updErr } = await supabase
                    .from('exercise_posts')
                    .update({ images: JSON.stringify(list) })
                    .eq('id', row.id);
                if (!updErr) row.images = list;
            }
        } finally {
            _migratingExerciseIds.delete(row.id);
        }
        return row;
    } catch (e) {
        logger.warn('تعذر ترحيل صور base64 للتمرين ' + (row && row.id) + ': ' + e.message);
        return row;
    }
}

// ============================================================
// 1.5. رفع ملف PDF (للأساتذة فقط)
// ============================================================
router.post('/get-signed-upload-url', authenticate, authorize(['teacher']), async (req, res) => {
    try {
        const { fileName, contentType } = req.body;
        const fileExt = fileName.split('.').pop();
        const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `exercises/${uniqueFileName}`;
        
        const { data, error } = await supabase.storage.from('exercises').createSignedUploadUrl(filePath);
        
        if (error) throw error;
        
        res.json({ success: true, url: data.signedUrl, path: filePath });
    } catch (err) {
        logger.error('❌ خطأ في توليد رابط الرفع:', err.message);
        res.status(500).json({ error: 'حدث خطأ أثناء إعداد الرفع' });
    }
});

// ============================================================
// 1. جلب قائمة التمارين والحلول (تطبيق الفلترة، البحث، والمحفوظات)
// ============================================================
// ============================================================
// 🎬 استخراج معرفات الفيديو من كود الـ iframe الكامل أو الروابط
//    (watch?v= / youtu.be / embed / shorts / live /
//    youtube-nocookie) — يقبل نصاً متعدد الأسطر لقائمة تشغيل
// ============================================================
function extractYouTubeVideoIds(text) {
    if (!text || typeof text !== 'string') return [];
    const re = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
    const ids = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        if (ids.indexOf(m[1]) === -1) ids.push(m[1]);
    }
    return ids;
}

function extractYouTubeVideoId(text) {
    return extractYouTubeVideoIds(text)[0] || null;
}

// توحيد المدخلات (رابط أو كود iframe أو عدة أسطر) إلى
// روابط معيارية — سطر واحد لكل فيديو في قائمة التشغيل
function normalizeYouTubePlaylist(text) {
    return extractYouTubeVideoIds(text)
        .map(id => 'https://www.youtube.com/watch?v=' + id)
        .join('\n');
}

router.get('/', optionalAuth, async (req, res) => {
    // تُعلن خارج try ليبتعد أيضاً عنها معالج الأخطاء (abandon) — وإلا يبقى
    // انتظار الكاش مسجلاً للأبد وتتوقف كل الطلبات اللاحقة لهذا المفتاح
    const { level, search, saved_only } = req.query;
    const currentUserId = req.user ? (req.user.userId || req.user.id) : null;
    const currentUserType = req.user ? req.user.role : null;
    const cacheKey = `exercises:${level || ''}:${search || ''}:${saved_only || ''}:${currentUserId || ''}`;
    // ترويسة تشخيص: تُظهر إن كان كود الترحيل منشوراً في الإنتاج ونتائجه
    res.setHeader('X-Ex-Migration', `att=${_exMigrationStats.attempted}; ok=${_exMigrationStats.migrated}; fail=${_exMigrationStats.failed}; err=${(_exMigrationStats.lastError || '-').replace(/[^\x20-\x7E]/g, '')}`);
    try {
        // one query serves every visitor that asks in the same window
        const cached = memoryCache.get(cacheKey);
        if (cached) {
            res.setHeader('Cache-Control', 'public, max-age=20');
            // is_saved خاص بكل مستخدم → فصل مفتاح الكاش العام عن التوكن
            if (!currentUserId) res.append('Vary', 'Authorization');
            return res.json(cached);
        }

        // another request is already loading this exact list: wait for it
        // instead of hammering the database a second time — لكن بمهلة قصوى:
        // طلب مالك عالق (لم يُنهِ كاشه) لا يحقّ لكل الطلبات اللاحقة التجمّد
        const joined = memoryCache.join(cacheKey);
        if (joined) {
            try {
                const value = await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('join-timeout')), 9000);
                    joined.then(
                        v => { clearTimeout(timer); resolve(v); },
                        e => { clearTimeout(timer); reject(e); }
                    );
                });
                res.setHeader('Cache-Control', 'public, max-age=20');
                return res.json(value);
            } catch (e) { /* the shared load failed or stalled: do it ourselves */ }
        }
        memoryCache.track(cacheKey);

        // جلب التمارين المحفوظة إذا كان الطالب يطلب المحفوظات فقط
        let savedExerciseIds = [];
        if (currentUserId && (saved_only === 'true' || saved_only === true)) {
            try {
                const { data: savedData } = await supabase
                    .from('exercise_bookmarks')
                    .select('exercise_id')
                    .eq('user_id', currentUserId)
                    .eq('user_type', currentUserType);
                
                if (savedData && Array.isArray(savedData)) {
                    savedExerciseIds = savedData.map(b => b.exercise_id);
                }
            } catch (err) {
                logger.warn('لم يتم العثور على جدول exercise_bookmarks في Supabase أو أنه فارغ');
            }

            if (savedExerciseIds.length === 0) {
                // publish بدل return مجرّد: وإلا يبقى منتظِر الكاش مسجلاً
                // للأبد وتبدأ كل طلبات هذا المستخدم في انتظار وعد لا يتحقق
                memoryCache.publish(cacheKey, [], 20);
                return res.json([]);
            }
        }

        // بناء استعلام Supabase — أعمدة مطلوبة فقط (لا select('*')):
        // صور التمارين (حتى 10 لكل منشور) كانت تُسحب مع كل الأعمدة فتضخّم
        // الاستجابة وتبطّئها حتى التعليق
        let query = supabase
            .from('exercise_posts')
            // views_count غير موجود فعلياً في الجدول — ذكره يُفشل الاستعلام
            // student_id يتيح تمييز فيديوهات الطلاب (يُستبدل select('*') تلقائياً إن غاب)
            .select('id, teacher_id, student_id, title, description, education_level, subject_name, images, external_link, classification, created_at')
            .order('created_at', { ascending: false })
            // was unbounded: one busy table could ship thousands of rows
            .limit(300);

        if (saved_only === 'true' && savedExerciseIds.length > 0) {
            query = query.in('id', savedExerciseIds);
        }

        // مهلة قصوى 8 ثوانٍ: supabase-js لا يضع مهلة افتراضية للاستعلام،
        // وكان طلب واحد بطيء يعلّق الدالة 30 ثانية ثم — بتسجيل المنتظِر —
        // يُجمّد كل طلب لاحق لنفس المفتاح حتى إعادة التشغيل
        const listAbort = new AbortController();
        const listTimer = setTimeout(() => listAbort.abort(), 8000);
        let listResult;
        try {
            listResult = await query.abortSignal(listAbort.signal);
        } finally {
            clearTimeout(listTimer);
        }

        // إن كان لدى الجدول أعمدة قديمة ناقصة (exercise_posts.views_count
        // مثلاً غير موجودة فعلياً) نعود إلى select('*') مع نفس المهلة
        if (listResult.error && /column|PGRST204/i.test(listResult.error.message || '')) {
            logger.warn('⚠️ أعمدة ضيقة غير متاحة على exercise_posts، الرجوع إلى select(*): ' + listResult.error.message);
            let fallbackQuery = supabase
                .from('exercise_posts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(300);
            if (saved_only === 'true' && savedExerciseIds.length > 0) {
                fallbackQuery = fallbackQuery.in('id', savedExerciseIds);
            }
            const fbAbort = new AbortController();
            const fbTimer = setTimeout(() => fbAbort.abort(), 8000);
            try {
                listResult = await fallbackQuery.abortSignal(fbAbort.signal);
            } finally {
                clearTimeout(fbTimer);
            }
        }
        const { data: rawExercises, error } = listResult;

        if (error && error.code !== 'PGRST116') {
            logger.warn('⚠️ تعذر جلب التمارين من Supabase: ' + error.message);
            memoryCache.abandon(cacheKey);
            return res.status(500).json({ 
                success: false, 
                error: error.message, 
                code: error.code, 
                details: error.details,
                hint: 'تعذر جلب التمارين من قاعدة البيانات. تأكد من إنشاء جدول exercise_posts في Supabase.' 
            });
        }

        let exercises = Array.isArray(rawExercises) ? rawExercises : [];

        // ترحيل أي صور base64 قديمة إلى التخزين — مرة واحدة لكل منشور
        // ثم تُحفظ الروابط فيتخفّض حجم الاستجابة من 10MB إلى كيلوبايتات
        await Promise.all(exercises.map(exRow => migrateBase64ExerciseImages(exRow)));

        // جلب معلومات الأساتذة المقترنين بالتمارين
        const teacherIds = [...new Set(exercises.map(e => e.teacher_id).filter(Boolean))];
        let teachersMap = {};
        if (teacherIds.length > 0) {
            try {
                const { data: teachersData } = await supabase
                    .from('teachers')
                    .select('id, full_name, profile_image, profile_url, specialization')
                    .in('id', teacherIds);

                if (teachersData && Array.isArray(teachersData)) {
                    teachersData.forEach(t => {
                        teachersMap[t.id] = t;
                    });
                }
            } catch (tErr) {
                logger.warn('خطأ في جلب بيانات الأساتذة للتمارين: ' + tErr.message);
            }
        }

        // جلب قائمة التمارين المحفوظة للمستخدم الحالي لمعرفة الحالة is_saved
        let allUserBookmarks = new Set();
        if (currentUserId) {
            try {
                const { data: userBookmarks } = await supabase
                    .from('exercise_bookmarks')
                    .select('exercise_id')
                    .eq('user_id', currentUserId)
                    .eq('user_type', currentUserType);

                if (userBookmarks && Array.isArray(userBookmarks)) {
                    userBookmarks.forEach(b => allUserBookmarks.add(b.exercise_id));
                }
            } catch (bErr) {
                // تجاهل إذا لم ينشأ الجدول بعد
            }
        }

        // تصفية وحقن بيانات الأستاذ و is_saved
        let formatted = exercises.map(ex => {
            const teacher = teachersMap[ex.teacher_id] || {};
            let imagesList = [];
            if (Array.isArray(ex.images)) {
                imagesList = ex.images;
            } else if (typeof ex.images === 'string') {
                try { imagesList = JSON.parse(ex.images); } catch(e) { imagesList = []; }
            }
            
            if (Array.isArray(imagesList)) {
                imagesList = imagesList.filter(img => typeof img === 'string' && img.trim() !== '' && img !== '[object Object]');
            } else {
                imagesList = [];
            }

            return {
                ...ex,
                teacher_name: teacher.full_name || ex.teacher_name || (ex.student_id ? 'طالب في المنصة' : 'أستاذ المادة'),
                teacher_profile_image: teacher.profile_image || teacher.profile_url || '/images/default-avatar.svg',
                teacher_specialization: teacher.specialization || ex.subject_name || (ex.student_id ? 'طالب في المنصة' : 'أستاذ المحتوى'),
                images: imagesList,
                is_saved: allUserBookmarks.has(ex.id)
            };
        });

        // فلترة بالبحث والتصنيف والمستوى
        if (level && level !== 'all') {
            formatted = formatted.filter(ex => {
                const el = ex.education_level || '';
                if (level === 'primary_all') return el.startsWith('primary') || el.includes('pri');
                if (level === 'middle_all') return el.includes('am') || el === 'bem' || el === 'middle_all';
                if (level === 'secondary_all') return el.includes('as') || el === 'bac' || el === 'secondary_all';
                if (level === 'university') return el.includes('uni') || el === 'university' || el === 'master' || el === 'doctorat';
                return el === level;
            });
        }

        if (search) {
            const s = search.toLowerCase().trim();
            formatted = formatted.filter(ex => 
                (ex.title || '').toLowerCase().includes(s) ||
                (ex.description || '').toLowerCase().includes(s) ||
                (ex.subject_name || '').toLowerCase().includes(s) ||
                (ex.teacher_name || '').toLowerCase().includes(s)
            );
        }

        const page = parseInt(req.query.page) || 1;
        const limit = req.query.limit ? parseInt(req.query.limit) : null;

        let paginated = formatted;
        if (limit && limit > 0 && limit < formatted.length) {
            const startIndex = (page - 1) * limit;
            paginated = formatted.slice(startIndex, startIndex + limit);
        }

        memoryCache.publish(cacheKey, paginated, 20);
        res.setHeader('Cache-Control', 'public, max-age=20');
        // is_saved خاص بكل مستخدم → فصل مفتاح الكاش العام عن التوكن
        if (!currentUserId) res.append('Vary', 'Authorization');

        if (req.query.paginated === 'true' || req.query.page || req.query.limit) {
            return res.json({
                success: true,
                exercises: paginated,
                total: formatted.length,
                page: page,
                limit: limit || formatted.length,
                has_more: limit ? (page * limit) < formatted.length : false
            });
        }

        res.json(paginated);
    } catch (err) {
        // حرّر منتظِر الكاش قبل الرد — وإلا يبقى المفتاح مسجلاً وتتجمّد
        // كل طلبات هذا المسار اللاحقة على نفس المفتاح
        memoryCache.abandon(cacheKey);
        logger.error('❌ خطأ في جلب التمارين والحلول:', err.message);
        res.status(500).json({ success: false, error: err.message, stack: err.stack });
    }
});

// ============================================================
// 1.5. عدد التمارين والحلول الجديدة غير المشاهدة (يجب أن يكون قبل /:id)
// ============================================================
router.get('/unread-count', optionalAuth, async (req, res) => {
    try {
        const { last_viewed } = req.query;

        let query = supabase
            .from('exercise_posts')
            .select('id', { count: 'exact', head: true });

        if (last_viewed && last_viewed !== 'null' && last_viewed !== 'undefined' && last_viewed !== '') {
            query = query.gt('created_at', last_viewed);
        } else {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            query = query.gt('created_at', oneDayAgo);
        }

        const { count, error: countErr } = await query;
        if (countErr && countErr.code !== 'PGRST116') throw countErr;

        res.json({
            success: true,
            unread_count: count || 0
        });
    } catch (error) {
        logger.error('Error getting unread exercises count:', error.message);
        res.json({ success: true, unread_count: 0 });
    }
});

// ============================================================
// 2. جلب تمارين محدد بواسطة الـ ID (للمشاركة والزوار)
// ============================================================
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const exerciseId = parseInt(req.params.id);
        if (!exerciseId) {
            return res.status(400).json({ error: 'رقم التمرين غير صحيح' });
        }

        const exercise = await getOne('exercise_posts', 'id', exerciseId);
        if (!exercise) {
            return res.status(404).json({ error: 'منشور التمارين والحلول غير موجود' });
        }

        // ترحيل صورة base64 قديمة إلى التخزين إن وُجدت (مرة واحدة)
        await migrateBase64ExerciseImages(exercise);

        // زيادة عداد المشاهدات
        try {
            await supabase
                .from('exercise_posts')
                .update({ views_count: (exercise.views_count || 0) + 1 })
                .eq('id', exerciseId);
        } catch (vErr) {}

        // جلب بيانات الأستاذ
        let teacherData = {};
        if (exercise.teacher_id) {
            teacherData = await getOne('teachers', 'id', exercise.teacher_id) || {};
        }

        // تحقق من المحفوظات
        let isSaved = false;
        if (req.user) {
            try {
                const { data: bookmark } = await supabase
                    .from('exercise_bookmarks')
                    .select('id')
                    .eq('user_id', req.user.userId || req.user.id)
                    .eq('user_type', req.user.role)
                    .eq('exercise_id', exerciseId)
                    .single();
                if (bookmark) isSaved = true;
            } catch(bErr) {}
        }

        let imagesList = [];
        if (Array.isArray(exercise.images)) {
            imagesList = exercise.images;
        } else if (typeof exercise.images === 'string') {
            try { imagesList = JSON.parse(exercise.images); } catch(e) { imagesList = []; }
        }

        if (Array.isArray(imagesList)) {
            imagesList = imagesList.filter(img => typeof img === 'string' && img.trim() !== '' && img !== '[object Object]');
        } else {
            imagesList = [];
        }

        res.json({
            ...exercise,
            teacher_name: teacherData.full_name || 'أستاذ المادة',
            teacher_profile_image: teacherData.profile_image || teacherData.profile_url || '/images/default-avatar.svg',
            teacher_specialization: teacherData.specialization || 'أستاذ المحتوى',
            images: imagesList,
            is_saved: isSaved
        });
    } catch (err) {
        logger.error('❌ خطأ في جلب تفاصيل التمرين:', err.message);
        res.status(500).json({ error: 'حدث خطأ أثناء جلب تفاصيل التمرين' });
    }
});

// ============================================================
// 3. إضافة منشور تمارين وحلول جديد (للأساتذة فقط - حتى 10 صور)
// ============================================================
router.post('/', authenticate, [
    body('title').notEmpty().withMessage('عنوان التمارين والحلول مطلوب'),
    body('education_level').notEmpty().withMessage('المستوى الدراسي مطلوب')
], async (req, res) => {
    try {
        const isTeacher = req.user.role === 'teacher';
        const isStudent = req.user.role === 'student';
        if (!isTeacher && !isStudent) {
            return res.status(403).json({ error: 'عذراً، يقتصر النشر على الأساتذة والطلاب فقط' });
        }

        const currentUserId = req.user.userId || req.user.id;
        if (isTeacher) {
            const teacher = await getOne('teachers', 'id', currentUserId);
            if (!teacher || teacher.status !== 'approved') {
                return res.status(403).json({ error: 'حسابك غير معتمد بعد، لا يمكنك إضافة تمارين حتى يتم قبول حسابك من قبل الإدارة' });
            }
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join('، ') });
        }

        const { title, description, education_level, subject_name, images, external_link, classification } = req.body;

        // 🎬 الطالب ينشر فيديوهات تعليمية فقط: يُفرض عليه تصنيف «فيديو»
        //    ويجب أن يكون الرابط رابط فيديو يوتيوب صالحاً
        let finalClassification = (classification || 'تمرين').trim();
        let finalExternalLink = (external_link || '').trim() || null;
        if (isStudent) {
            finalClassification = 'فيديو';
            const normalizedVideos = normalizeYouTubePlaylist(finalExternalLink);
            if (!normalizedVideos) {
                return res.status(400).json({ error: 'يرجى لصق كود iframe أو رابط فيديو يوتيوب صحيح (يمكن لصق أكثر من فيديو — كل فيديو في سطر)' });
            }
            finalExternalLink = normalizedVideos;

            // 🛡️ حد يومي بسيط يمنع الإزعاج — يتخطّى بهدوء إن لم يوجد العمود بعد
            try {
                const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                const { count, error: countErr } = await supabase
                    .from('exercise_posts')
                    .select('id', { count: 'exact', head: true })
                    .eq('student_id', currentUserId)
                    .gte('created_at', dayAgo);
                if (!countErr && count >= 10) {
                    return res.status(429).json({ error: 'لقد نشرت 10 فيديوهات خلال 24 ساعة — انتظر قليلاً قبل النشر مجدداً' });
                }
            } catch (limitErr) { /* لا شيء */ }
        }

        // 🎬 الأستاذ أيضاً يستطيع نشر فيديو (أو قائمة تشغيل بعدة فيديوهات)
        if (finalClassification === 'فيديو' && !isStudent) {
            const normalizedVideos = normalizeYouTubePlaylist(finalExternalLink);
            if (!normalizedVideos) {
                return res.status(400).json({ error: 'يرجى لصق كود iframe أو رابط فيديو يوتيوب صحيح (يمكن لصق أكثر من فيديو — كل فيديو في سطر)' });
            }
            finalExternalLink = normalizedVideos;
        }

        // التأكد من أن الصور مصفوفة ولا تتجاوز 10 صور
        let imagesArray = [];
        if (Array.isArray(images)) {
            imagesArray = images.slice(0, 10);
        } else if (typeof images === 'string') {
            imagesArray = [images];
        }

        // صور base64 تُرفع فوراً إلى التخزين — لا تُخزَّن بيانات ضخمة داخل قاعدة البيانات
        const { list: postSafeImages } = await migrateImageListToStorage(imagesArray);

        const newExerciseData = {
            teacher_id: isTeacher ? currentUserId : null,
            student_id: isStudent ? currentUserId : null,
            title: title.trim(),
            description: (description || '').trim(),
            education_level: education_level.trim(),
            subject_name: (subject_name || '').trim() || 'عام',
            images: JSON.stringify(postSafeImages),
            external_link: finalExternalLink,
            likes_count: 0,
            views_count: 0,
            shares_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            classification: finalClassification
        };

        let created;
        try {
            created = await insert('exercise_posts', newExerciseData);
        } catch (insertErr) {
            if (insertErr.message && (insertErr.message.includes('classification') || insertErr.message.includes('column'))) {
                // Fallback if column does not exist yet on database
                const fallbackData = { ...newExerciseData };
                delete fallbackData.classification;
                created = await insert('exercise_posts', fallbackData);
            } else if (isStudent && insertErr.message && insertErr.message.includes('teacher_id')) {
                // بعض قواعد البيانات تجعل teacher_id غير قابل للفراغ — نحفظه بصفر كحجز
                created = await insert('exercise_posts', { ...newExerciseData, teacher_id: 0 });
            } else {
                throw insertErr;
            }
        }

        // 🔄 إبطال كاش القوائم فوراً — وإلا يرى الناشر قائمته القديمة
        //    (حتى20 ثانية) ويظن أن منشوره أو قائمة تشغيله لم تُنشر
        memoryCache.clearByPattern('exercises:');

        res.json({
            success: true,
            message: isStudent ? '🎬 تم نشر الفيديو التعليمي بنجاح!' : '🎉 تم نشر التمارين والحلول بنجاح!',
            exercise: created
        });
    } catch (err) {
        logger.error('❌ خطأ في إضافة التمارين والحلول:', err.message);
        res.status(500).json({ error: 'حدث خطأ أثناء حفظ منشور التمارين والحلول' });
    }
});

// ============================================================
// 3.5. تعديل منشور تمارين وحلول موجود (للأساتذة فقط)
// ============================================================
router.put('/:id', authenticate, [
    body('title').notEmpty().withMessage('عنوان التمارين والحلول مطلوب'),
    body('education_level').notEmpty().withMessage('المستوى الدراسي مطلوب')
], async (req, res) => {
    try {
        const exerciseId = parseInt(req.params.id);
        const currentUserId = req.user.userId || req.user.id;

        // Fetch existing exercise
        const existingExercise = await getOne('exercise_posts', 'id', exerciseId);
        if (!existingExercise) {
            return res.status(404).json({ error: 'عذراً، لم يتم العثور على منشور التمارين والحلول هذا' });
        }

        // Authorize: المالك (أستاذ أو طالب صاحب الفيديو) أو الأدمن فقط
        const isTeacherOwner = req.user.role === 'teacher' && parseInt(existingExercise.teacher_id) === parseInt(currentUserId);
        const isStudentOwner = req.user.role === 'student' && existingExercise.student_id != null && parseInt(existingExercise.student_id) === parseInt(currentUserId);
        if (req.user.role !== 'admin' && !isTeacherOwner && !isStudentOwner) {
            return res.status(403).json({ error: 'عذراً، لا تملك الصلاحية لتعديل هذا المنشور' });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join('، ') });
        }

        const { title, description, education_level, subject_name, images, external_link, classification } = req.body;

        // Process images array if provided
        let imagesArray = [];
        if (Array.isArray(images)) {
            imagesArray = images.slice(0, 10);
        } else if (typeof images === 'string') {
            imagesArray = [images];
        } else if (existingExercise.images) {
            try {
                imagesArray = JSON.parse(existingExercise.images);
            } catch (e) {
                imagesArray = [];
            }
        }

        let externalLink = external_link;
        if (externalLink && !externalLink.startsWith('http://') && !externalLink.startsWith('https://')) {
            externalLink = 'https://' + externalLink;
        }

        // الطالب لا يملك إلا فيديوهاته — يبقى تصنيفها «فيديو»
        let putClassification = (classification || 'تمرين').trim();
        if (isStudentOwner) {
            putClassification = 'فيديو';
        }
        // 🎬 «فيديو» يتطلب كود iframe أو رابطاً صالحاً — يقبل قائمة تشغيل
        if (putClassification === 'فيديو') {
            const normalizedVideos = normalizeYouTubePlaylist(externalLink);
            if (!normalizedVideos) {
                return res.status(400).json({ error: 'يرجى لصق كود iframe أو رابط فيديو يوتيوب صحيح (يمكن لصق أكثر من فيديو — كل فيديو في سطر)' });
            }
            externalLink = normalizedVideos;
        }

        // صور base64 تُرفع فوراً إلى التخزين — لا تُخزَّن بيانات ضخمة داخل قاعدة البيانات
        const { list: putSafeImages } = await migrateImageListToStorage(imagesArray);

        const updatedData = {
            title: title.trim(),
            description: (description || '').trim(),
            education_level: education_level.trim(),
            subject_name: (subject_name || '').trim() || 'عام',
            images: JSON.stringify(putSafeImages),
            external_link: (externalLink || '').trim() || null,
            updated_at: new Date().toISOString(),
            classification: putClassification
        };

        let updated;
        try {
            updated = await update('exercise_posts', exerciseId, updatedData);
        } catch (updateErr) {
            if (updateErr.message && (updateErr.message.includes('classification') || updateErr.message.includes('column'))) {
                // Fallback if column does not exist yet on database
                const fallbackData = { ...updatedData };
                delete fallbackData.classification;
                delete fallbackData.updated_at;
                updated = await update('exercise_posts', exerciseId, fallbackData);
            } else {
                throw updateErr;
            }
        }

        // ⚠️ update() تُرجع null حين لا يُحدَّث أي صف (يحدث بصمت حين تكون
        // سياسة UPDATE مفقودة على الجدول). لا نعرض «نجاحاً» كاذباً —
        // نخبر المستخدم بما حدث فعلاً بدل أن يظن أن التعديل حُفظ.
        if (!updated) {
            logger.error('❌ تعديل التمارين لم يُطبَّق على قاعدة البيانات (0 صف مُحدَّث) — تحقق من سياسة UPDATE على exercise_posts', { exerciseId, currentUserId });
            return res.status(500).json({
                success: false,
                error: 'لم يتم حفظ التعديل في قاعدة البيانات — قد تكون صلاحيات الجدول تمنع التحديث. شغّل ملف scripts/allow_exercise_posts_update.sql في Supabase ثم أعد المحاولة'
            });
        }

        // 🔄 إبطال كاش القوائم حتى تنعكس التعديلات فوراً لكل الزوار
        memoryCache.clearByPattern('exercises:');

        logger.info('✏️ تم تعديل منشور تمارين بنجاح', { exerciseId, currentUserId, role: req.user.role });

        res.json({
            success: true,
            message: '🎉 تم تعديل التمارين والحلول بنجاح!',
            exercise: updated
        });
    } catch (err) {
        logger.error('❌ خطأ في تعديل التمارين والحلول:', err.message);
        res.status(500).json({ error: 'حدث خطأ أثناء تعديل منشور التمارين والحلول' });
    }
});

// ============================================================
// 4. حفظ / إلغاء حفظ منشور تمارين في المحفوظات (حفظ المنشور)
// ============================================================
router.post('/:id/bookmark', authenticate, async (req, res) => {
    try {
        const exerciseId = parseInt(req.params.id);
        const userId = req.user.userId || req.user.id;
        const userType = req.user.role;

        if (!exerciseId) {
            return res.status(400).json({ error: 'رقم التمرين غير صحيح' });
        }

        // التحقق مما إذا كان موجوداً مسبقاً في المحفوظات
        let existingBookmark = null;
        try {
            const { data } = await supabase
                .from('exercise_bookmarks')
                .select('*')
                .eq('user_id', userId)
                .eq('user_type', userType)
                .eq('exercise_id', exerciseId)
                .single();
            existingBookmark = data;
        } catch(e) {}

        if (existingBookmark) {
            // إزالة من المحفوظات
            await supabase
                .from('exercise_bookmarks')
                .delete()
                .eq('id', existingBookmark.id);

            memoryCache.clearByPattern('exercises:'); // قوائم «المحفوظات» تتغير
            return res.json({
                success: true,
                is_saved: false,
                message: 'تم إزالة منشور التمارين والحلول من المحفوظات'
            });
        } else {
            // إضافة للمحفوظات
            await insert('exercise_bookmarks', {
                user_id: userId,
                user_type: userType,
                exercise_id: exerciseId,
                created_at: new Date().toISOString()
            });

            memoryCache.clearByPattern('exercises:'); // قوائم «المحفوظات» تتغير
            return res.json({
                success: true,
                is_saved: true,
                message: '🔖 تم حفظ منشور التمارين والحلول في المحفوظات بنجاح!'
            });
        }
    } catch (err) {
        logger.error('❌ خطأ في حفظ/إلغاء حفظ التمارين:', err.message);
        res.status(500).json({ error: 'حدث خطأ أثناء تحديث المحفوظات' });
    }
});

// ============================================================
// 4.5. زيادة عداد المشاهدات للمنشور
// ============================================================
router.post('/:id/view', async (req, res) => {
    try {
        const exerciseId = parseInt(req.params.id);
        if (!exerciseId) return res.status(400).json({ error: 'رقم التمرين غير صحيح' });

        const exercise = await getOne('exercise_posts', 'id', exerciseId);
        if (exercise) {
            await supabase
                .from('exercise_posts')
                .update({ views_count: (exercise.views_count || 0) + 1 })
                .eq('id', exerciseId);
        }
        res.json({ success: true });
    } catch (err) {
        logger.error('❌ خطأ في زيادة عداد المشاهدات:', err.message);
        res.json({ success: false });
    }
});

// ============================================================
// 5. زيادة عداد المشاركة للمنشور
// ============================================================
router.post('/:id/share', async (req, res) => {
    try {
        const exerciseId = parseInt(req.params.id);
        const exercise = await getOne('exercise_posts', 'id', exerciseId);
        if (exercise) {
            await supabase
                .from('exercise_posts')
                .update({ shares_count: (exercise.shares_count || 0) + 1 })
                .eq('id', exerciseId);
        }
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false });
    }
});

// ============================================================
// 6. حذف منشور تمارين (للأستاذ صاحب المنشور أو الأدمن)
// ============================================================
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const exerciseId = parseInt(req.params.id);
        const exercise = await getOne('exercise_posts', 'id', exerciseId);

        if (!exercise) {
            return res.status(404).json({ error: 'المنشور غير موجود' });
        }

        const currentUserId = req.user.userId || req.user.id;
        const isTeacherOwner = req.user.role === 'teacher' && parseInt(exercise.teacher_id) === parseInt(currentUserId);
        const isStudentOwner = req.user.role === 'student' && exercise.student_id != null && parseInt(exercise.student_id) === parseInt(currentUserId);
        if (req.user.role !== 'admin' && !isTeacherOwner && !isStudentOwner) {
            return res.status(403).json({ error: 'غير مصرح لك بحذف هذا المنشور' });
        }

        await remove('exercise_posts', 'id', exerciseId);
        
        try {
            await supabase.from('exercise_bookmarks').delete().eq('exercise_id', exerciseId);
        } catch(e) {}

        // 🔄 إبطال كاش القوائم حتى يختفي المنشور المحذوف فوراً
        memoryCache.clearByPattern('exercises:');

        res.json({ success: true, message: 'تم حذف منشور التمارين والحلول بنجاح' });
    } catch (err) {
        logger.error('❌ خطأ في حذف منشور التمارين:', err.message);
        res.status(500).json({ error: 'حدث خطأ أثناء الحذف' });
    }
});

// ============================================================
// 7. عدد التمارين والحلول الجديدة غير المشاهدة
// ============================================================
router.get('/unread-count', optionalAuth, async (req, res) => {
    try {
        const { last_viewed } = req.query;

        let query = supabase
            .from('exercise_posts')
            .select('id', { count: 'exact', head: true });

        if (last_viewed && last_viewed !== 'null' && last_viewed !== 'undefined' && last_viewed !== '') {
            query = query.gt('created_at', last_viewed);
        } else {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            query = query.gt('created_at', oneDayAgo);
        }

        const { count, error: countErr } = await query;
        if (countErr && countErr.code !== 'PGRST116') throw countErr;

        res.json({
            success: true,
            unread_count: count || 0
        });
    } catch (error) {
        logger.error('Error getting unread exercises count:', error.message);
        res.json({ success: true, unread_count: 0 });
    }
});

module.exports = router;
