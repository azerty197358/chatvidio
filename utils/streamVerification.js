const logger = require('./logger');
const { sendStreamStartReminderEmail } = require('./email');
// ============================================================
// نظام التحقق المستقل من وقت البث - Stream Verification System
// ============================================================

const { supabase } = require('../config/database');
const axios = require('axios');

// ============================================================
// دوال التحقق من Jitsi
// ============================================================

/**
 * التحقق من غرفة Jitsi وجمع معلوماتها
 * ملاحظة: Jitsi لا يوفر API عام للتحقق من الاجتماعات
 * لذلك نستخدم نظامنا الداخلي للتحقق
 */
async function verifyJitsiRoom(roomName) {
    try {
        // التحقق من وجود الغرفة في جدول الدروس
        const { data: offer, error } = await supabase
            .from('offers')
            .select('id, room_name, stream_url, status, stream_started_at')
            .eq('room_name', roomName)
            .single();

        if (error || !offer) {
            return { valid: false, error: 'الغرفة غير موجودة' };
        }

        // التحقق من حالة البث
        if (offer.status !== 'live' && offer.status !== 'paused') {
            return { valid: false, error: 'البث ليس نشطاً' };
        }

        return {
            valid: true,
            offer: offer,
            roomActive: true
        };
    } catch (error) {
        logger.error('خطأ في التحقق من Jitsi:', error.message);
        return { valid: false, error: error.message };
    }
}

/**
 * تسجيل بداية البث المستقلة (timestamp من الخادم)
 */
async function recordStreamStart(offerId, teacherId) {
    const serverTimestamp = new Date().toISOString();

    const { data, error } = await supabase
        .from('stream_verification')
        .insert({
            offer_id: offerId,
            teacher_id: teacherId,
            server_start_time: serverTimestamp,
            status: 'started',
            created_at: serverTimestamp
        })
        .select()
        .single();

    if (error) {
        logger.error('خطأ في تسجيل بداية البث:', error.message);
        // إذا فشل الإدراج، حاول التحديث — مع تصفير عدادات الإيقاف القديمة
        // (تمنع بقاء إيقافات جلسة سابقة تُظهر مؤقتاً أو نسبة إنجازاً خاطئة)
        await supabase
            .from('stream_verification')
            .update({
                server_start_time: serverTimestamp,
                status: 'started',
                last_pause_time: null,
                total_paused_seconds: 0,
                actual_live_seconds: 0
            })
            .eq('offer_id', offerId)
            .eq('teacher_id', teacherId);
    }

    return data;
}

/**
 * تسجيل إيقاف البث مؤقتاً
 */
async function recordStreamPause(offerId) {
    const serverTimestamp = new Date().toISOString();

    const { data, error } = await supabase
        .from('stream_verification')
        .update({
            last_pause_time: serverTimestamp,
            total_paused_seconds: supabase.rpc('add_seconds', {
                current: supabase.rpc('get_total_paused', { offer_id: offerId }),
                add: serverTimestamp
            })
        })
        .eq('offer_id', offerId)
        .select()
        .single();

    return data;
}

/**
 * حساب الوقت الفعلي للبث من الخادم
 */
async function calculateActualStreamDuration(offerId) {
    const { data: verification, error } = await supabase
        .from('stream_verification')
        .select('*')
        .eq('offer_id', offerId)
        .single();

    if (error || !verification) {
        return null;
    }

    if (!verification.server_start_time) {
        return {
            total_seconds: 0,
            paused_seconds: 0,
            actual_live_seconds: 0,
            started_at: null,
            ended_at: verification.server_end_time
        };
    }

    const startTime = new Date(verification.server_start_time);
    if (isNaN(startTime.getTime())) {
        return {
            total_seconds: 0,
            paused_seconds: 0,
            actual_live_seconds: 0,
            started_at: verification.server_start_time,
            ended_at: verification.server_end_time
        };
    }

    const endTime = verification.server_end_time 
        ? new Date(verification.server_end_time) 
        : new Date();
    
    let totalSeconds = Math.floor((endTime - startTime) / 1000);
    if (isNaN(totalSeconds) || totalSeconds < 0) {
        totalSeconds = 0;
    }
    
    // حساب وقت الإيقاف الكلي (يمكن تحسينه لاحقاً)
    const pausedSeconds = verification.total_paused_seconds || 0;
    
    // الوقت الفعلي للبث = الوقت الكلي - وقت الإيقاف
    let actualLiveSeconds = Math.max(0, totalSeconds - pausedSeconds);
    if (isNaN(actualLiveSeconds)) {
        actualLiveSeconds = 0;
    }

    return {
        total_seconds: totalSeconds,
        paused_seconds: pausedSeconds,
        actual_live_seconds: actualLiveSeconds,
        started_at: verification.server_start_time,
        ended_at: verification.server_end_time
    };
}

/**
 * إنهاء البث وتسجيل الوقت النهائي
 */
async function recordStreamEnd(offerId, teacherId) {
    const serverTimestamp = new Date().toISOString();

    // البحث عن سجل التحقق
    const { data: existing, error: findError } = await supabase
        .from('stream_verification')
        .select('*')
        .eq('offer_id', offerId)
        .single();

    let updateData = {
        server_end_time: serverTimestamp,
        status: 'completed'
    };

    // حساب الوقت الفعلي للبث
    if (existing && existing.server_start_time) {
        const startTime = new Date(existing.server_start_time);
        const endTime = new Date(serverTimestamp);
        const totalSeconds = Math.floor((endTime - startTime) / 1000);
        
        updateData.total_duration_seconds = totalSeconds;
        
        // حساب وقت الإيقاف
        const pausedSeconds = existing.total_paused_seconds || 0;
        updateData.actual_live_seconds = Math.max(0, totalSeconds - pausedSeconds);
    }

    if (existing) {
        // تحديث السجل الموجود
        const { data, error } = await supabase
            .from('stream_verification')
            .update(updateData)
            .eq('offer_id', offerId)
            .select()
            .single();

        return data;
    } else {
        // إنشاء سجل جديد إذا لم يكن موجوداً
        const { data, error } = await supabase
            .from('stream_verification')
            .insert({
                offer_id: offerId,
                teacher_id: teacherId,
                server_start_time: serverTimestamp,
                server_end_time: serverTimestamp,
                total_duration_seconds: 0,
                actual_live_seconds: 0,
                status: 'completed',
                created_at: serverTimestamp
            })
            .select()
            .single();

        return data;
    }
}

/**
 * التحقق من اكتمال البث للمحفظة
 */
async function verifyStreamCompletion(offerId) {
    // ✅ جلب متدرّج الأعمدة: يضمن حساب الإكتمال حتى لو غاب عمود واحد من جدول offers
    let offer = null;
    const offerSelects = [
        'id, duration, total_seconds, remaining_seconds, stream_started_at, teacher_id, subject_name, price',
        'id, duration, remaining_seconds, stream_started_at, teacher_id, subject_name, price',
        'id, duration, stream_started_at, teacher_id, subject_name, price',
        'id'
    ];
    for (const cols of offerSelects) {
        try {
            const { data, error } = await supabase.from('offers').select(cols).eq('id', offerId).single();
            if (!error && data) { offer = data; break; }
        } catch (e) {}
    }

    if (!offer) {
        logger.error(`verifyStreamCompletion: لا يمكن جلب الدرس ${offerId}`);
        return { complete: false, completion_percentage: 0, error: 'الدرس غير موجود' };
    }

    // مدة البث المخطط لها بالثواني بناءً على بيانات الأستاذ
    const durationMins = offer.duration || 60;
    const expectedDuration = Number(offer.total_seconds || (durationMins * 60)) || 3600;
    
    // ✅ نسبة الإنجاز المطلوبة: 90% من المدة المخطط لها (ضمان حقوق الطالب —
    // إذا لم يكتمل 90% من وقت البث عند الإنهاء يتم استرداد المبلغ كاملاً للطالب)
    const completionRatio = 0.9;
    const requiredDuration = expectedDuration * completionRatio;

    // 2. حساب الوقت المنقضي بناءً على موقت الأستاذ المقاس بالسيرفر
    let actualDurationFromTimer = 0;
    const remainingSec = (offer.remaining_seconds != null && !isNaN(Number(offer.remaining_seconds))) 
        ? Number(offer.remaining_seconds) 
        : null;

    if (remainingSec !== null) {
        // الوقت المنقضي = الوقت الكلي - الوقت المتبقي في موقت الأستاذ
        actualDurationFromTimer = Math.max(0, expectedDuration - remainingSec);
    }

    // 3. حساب الوقت المنقضي بناءً على زمن بدء البث إن وجد
    let actualDurationFromStartTime = 0;
    if (offer.stream_started_at) {
        const startTime = new Date(offer.stream_started_at).getTime();
        if (!isNaN(startTime)) {
            actualDurationFromStartTime = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
        }
    }

    // 4. جلب سجل التحقق إن وجد
    const verification = await calculateActualStreamDuration(offerId);
    const actualDurationFromVerif = verification ? (verification.actual_live_seconds || 0) : 0;

    // قياس الوقت المنقضي الفعلي من موقت الأستاذ أو السيرفر
    let actualDuration = Math.max(actualDurationFromTimer, actualDurationFromStartTime, actualDurationFromVerif);
    
    // تأكيد ألا يتجاوز الوقت الفعلي مدة البث الكلية
    actualDuration = Math.min(expectedDuration, actualDuration);

    // التحقق من أن الأستاذ أتم 90% على الأقل من مدة البث المخططة
    const isComplete = actualDuration >= requiredDuration;

    let completionPercentage = (actualDuration / expectedDuration) * 100;
    if (isNaN(completionPercentage) || completionPercentage < 0) {
        completionPercentage = 0;
    }
    completionPercentage = Math.min(100, Math.round(completionPercentage * 100) / 100);

    // ✅ حفظ نسبة الإكتمال والمدة الفعلية للبث في قاعدة البيانات (جدول offers وجدول stream_verification)
    const completionPctRounded = Math.round(completionPercentage);
    try {
        await supabase
            .from('offers')
            .update({
                completion_percentage: completionPctRounded,
                actual_duration: actualDuration,
                actual_live_seconds: actualDuration
            })
            .eq('id', offerId);
    } catch(e) {}

    try {
        await supabase
            .from('stream_verification')
            .update({
                actual_live_seconds: actualDuration,
                total_duration_seconds: expectedDuration,
                completion_percentage: completionPctRounded
            })
            .eq('offer_id', offerId);
    } catch(e) {}

    return {
        complete: isComplete,
        completion_percentage: completionPercentage,
        expected_seconds: expectedDuration,
        actual_seconds: actualDuration,
        shortfall_seconds: Math.max(0, expectedDuration - actualDuration)
    };
}

// ===== قفل تسلسلي لكل درس: يمنع التحرير أو الاسترداد المزدوج عند تزامن نبضة المؤقت مع إنهاء البث =====
const offerFlowLocks = new Map();
function withOfferFlowLock(offerId, fn) {
    const key = String(offerId);
    const prev = offerFlowLocks.get(key) || Promise.resolve();
    const run = prev.then(fn, fn);
    const guard = run.then(function () {}, function () {});
    offerFlowLocks.set(key, guard);
    guard.then(function () {
        if (offerFlowLocks.get(key) === guard) offerFlowLocks.delete(key);
    });
    return run;
}

/**
 * حساب الزمن المنقضي الحقيقي للبث على الخادم حصراً (لا شيء من العميل):
 * من لحظة بدء البث (stream_started_at) ناقص مدد الإيقاف المتراكمة والجارية.
 */
async function computeElapsedLiveSeconds(offerId, offer) {
    const durationMins = offer.duration || offer.duration_minutes || 60;
    const total = Math.max(60, Number(offer.total_seconds || (durationMins * 60)) || 3600);
    let elapsed = 0;
    const startedAt = offer.stream_started_at ? Date.parse(offer.stream_started_at) : NaN;
    let hasBasis = !isNaN(startedAt);
    try {
        const { data: sv } = await supabase
            .from('stream_verification')
            .select('actual_live_seconds, total_paused_seconds, last_pause_time, server_start_time')
            .eq('offer_id', offerId)
            .maybeSingle();
        if (sv) {
            let paused = Number(sv.total_paused_seconds || 0);
            if (sv.last_pause_time) {
                const lp = Date.parse(sv.last_pause_time);
                if (!isNaN(lp)) paused += Math.max(0, (Date.now() - lp) / 1000);
            }
            if (isNaN(startedAt) && sv.server_start_time) {
                const sst = Date.parse(sv.server_start_time);
                if (!isNaN(sst)) { elapsed = Math.max(0, (Date.now() - sst) / 1000 - paused); hasBasis = true; }
            } else if (!isNaN(startedAt)) {
                elapsed = Math.max(0, (Date.now() - startedAt) / 1000 - paused);
            }
            // القيمة المحسوبة سابقاً على الخادم كحد أدنى احتياطي
            elapsed = Math.max(elapsed, Number(sv.actual_live_seconds || 0));
        }
    } catch (e) {}
    if (!hasBasis && elapsed <= 0) return { elapsed: 0, total: total };
    return { elapsed: Math.min(total, elapsed), total: total };
}

// ✅ نسبة الوقت الفعلي الذي درسه طالب واحد داخل البث:
//    انضمام الطالب = أحدث من (لحظة بدء البث، لحظة حجزه) — الطالب الذي يحجز متأخراً
//    يُحتسب له وقت دراسته فقط من لحظة دخوله حتى نهاية البث، فلا يُضاف للأستاذ
//    ثمن وقت لم يدرسه هذا الطالب ويُسترد له ما لم يدرسه عند التسوية النهائية.
function computeStudiedFraction(sessionCreatedAt, streamStartMs, elapsedSeconds, totalSeconds) {
    const bookedMs = sessionCreatedAt ? Date.parse(sessionCreatedAt) : NaN;
    const joinMs = (!isNaN(bookedMs) && bookedMs > streamStartMs) ? bookedMs : streamStartMs;
    const studiedSeconds = Math.max(0, Math.min(totalSeconds, elapsedSeconds - (joinMs - streamStartMs) / 1000));
    return Math.max(0, Math.min(1, studiedSeconds / Math.max(1, totalSeconds)));
}

/**
 * التحرير التدريجي لمستحقات الأستاذ أثناء البث:
 * كلما انقضى جزء فعلي من مدة الدرس المختارة يُحرر نسبته من مبلغ الحصة
 * إلى رصيده القابل للسحب — الحساب كله على الخادم (محمي من التلاعب بالمؤقت).
 */
async function releaseEarnedSoFar(offerId) {
    return withOfferFlowLock(offerId, async function () {
        try {
            // ✅ جلب متدرّج الأعمدة: التحرير التدريجي يجب أن يعمل حتى لو غاب عمود واحد
            let offer = null;
            const offerSelects = [
                'id, teacher_id, subject_name, is_free, price, price_per_session, total_sessions, plan_type, duration, duration_minutes, total_seconds, total_released_amount, stream_started_at, status',
                'id, teacher_id, subject_name, is_free, price, price_per_session, total_sessions, plan_type, duration, total_seconds, stream_started_at, status',
                'id, teacher_id, subject_name, is_free, price, price_per_session, total_sessions, plan_type, duration, stream_started_at, status',
                'id, teacher_id, subject_name, is_free, price, price_per_session, total_sessions, plan_type, duration, status'
            ];
            for (const cols of offerSelects) {
                try {
                    const { data, error } = await supabase
                        .from('offers')
                        .select(cols)
                        .eq('id', offerId)
                        .maybeSingle();
                    if (!error && data) { offer = data; break; }
                } catch (e) {}
            }
            if (!offer) return { skipped: true };

            const isFree = offer.is_free === true || offer.is_free === 'true' || offer.is_free === 1 || parseFloat(offer.price || 0) === 0;
            if (isFree) return { skipped: true };
            if (offer.status !== 'live' && offer.status !== 'paused') return { skipped: true };

            const { elapsed, total } = await computeElapsedLiveSeconds(offerId, offer);
            if (elapsed < 1 || total <= 0) return { skipped: true };

            const isMultiSession = offer.total_sessions > 1 || offer.plan_type;
            const pricePerSession = isMultiSession ? parseFloat(offer.price_per_session || offer.price || 0) : parseFloat(offer.price || 0);
            if (pricePerSession <= 0) return { skipped: true };

            // الحصة التالية غير المسوّاة (أو الحصة الوحيدة للدرس المفرد)
            let streamSessions = null;
            const ssSelects = [
                'id, session_number, status, is_escrow_released, teacher_released_amount, price_per_session',
                'id, session_number, status, teacher_released_amount',
                'id, status, teacher_released_amount',
                'id, status'
            ];
            for (const cols of ssSelects) {
                try {
                    const { data, error } = await supabase
                        .from('stream_sessions')
                        .select(cols)
                        .eq('offer_id', offerId)
                        .order('session_number', { ascending: true });
                    if (!error && data) { streamSessions = data; break; }
                } catch (e) {}
            }
            let target = (streamSessions || []).find(s => s.status !== 'completed' && s.status !== 'refunded' && !s.is_escrow_released);
            if (!target) {
                // سجل مفقود للدرس المفرد: ننشئه مرة واحدة ليكون مخزّن التحرير
                if (!isMultiSession) {
                    try {
                        const { data: created } = await supabase
                            .from('stream_sessions')
                            .insert({
                                offer_id: offerId,
                                teacher_id: offer.teacher_id,
                                session_number: 1,
                                title: offer.subject_name || 'حصة',
                                price_per_session: pricePerSession,
                                status: 'live',
                                teacher_released_amount: 0,
                                is_escrow_released: false,
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            })
                            .select('id')
                            .single();
                        target = created || null;
                    } catch (e) {}
                }
                if (!target) return { skipped: true };
            }

            // ✅ جلب المشتركين مع لحظة حجز كل واحد (created_at = لحظة الانضمام)
            let subRows = null;
            const subSelects = [
                'id, payment_amount, payment_status, created_at',
                'id, payment_amount, payment_status'
            ];
            for (const cols of subSelects) {
                try {
                    const { data, error } = await supabase
                        .from('sessions')
                        .select(cols)
                        .eq('offer_id', offerId)
                        .in('payment_status', ['pending_stream', 'paid']);
                    if (!error && data) { subRows = data; break; }
                } catch (e) {}
            }
            if (!subRows || subRows.length === 0) return { skipped: true }; // لا مشتردين ⇒ لا مبلغ يُحرَّر
            const subscriberCount = subRows.length || 1;

            const prevReleased = Math.max(0, parseFloat(target.teacher_released_amount || 0));
            const basePerSession = isMultiSession ? parseFloat(target.price_per_session || pricePerSession) : pricePerSession;

            // ✅ لكل مشترك نسبة وقته الفعلي في البث — الحجز المتأخر يُحتسب من لحظة الحجز،
            //    فلا يُحرَّر للأستاذ ثمن وقت لم يدره هذا الطالب (يُسترد له عند التسوية).
            //    الحجوزات السابقة للبدء تدخل جميعها من لحظة البدء (نفس السلوك القديم تماماً).
            const releaseStartMs = Date.now() - elapsed * 1000;
            let studiedFracSum = 0;
            for (const row of subRows) {
                studiedFracSum += computeStudiedFraction(row.created_at, releaseStartMs, elapsed, total);
            }
            const targetTotal = Math.min(basePerSession * subscriberCount, basePerSession * studiedFracSum);
            const earned = Math.min(basePerSession * subscriberCount, Math.floor(targetTotal));
            const delta = earned - prevReleased;
            if (delta <= 0) return { skipped: true, elapsed: Math.round(elapsed) };

            // حجز شرطي يمنع التحرير المزدوج عند التزامن مع نهاية البث (ويدعم القيم القديمة NULL)
            // ✅ عمود واحد فقط في التحديث — لا يجوز أن يفشل الحجز بسبب عمود تجميلي مفقود
            const { data: claimed } = await supabase
                .from('stream_sessions')
                .update({ teacher_released_amount: earned })
                .eq('id', target.id)
                .or(`teacher_released_amount.eq.${prevReleased},teacher_released_amount.is.null`)
                .select('id');
            if (!claimed || claimed.length === 0) return { skipped: true };

            // نقل الجزء الجديد من المعلق إلى الرصيد القابل للسحب
            const { data: teacher } = await supabase
                .from('teachers')
                .select('pending_withdraw, total_earned, balance')
                .eq('id', offer.teacher_id)
                .single();
            if (teacher) {
                await supabase
                    .from('teachers')
                    .update({
                        pending_withdraw: Math.max(0, (parseFloat(teacher.pending_withdraw) || 0) - delta),
                        total_earned: (parseFloat(teacher.total_earned) || 0) + delta,
                        balance: (parseFloat(teacher.balance) || 0) + delta
                    })
                    .eq('id', offer.teacher_id);
            }

            // مزامنة عداد التحرير الكلي للخطة (يُستخدم في التسوية النهائية والاسترداد)
            if (isMultiSession) {
                try {
                    await supabase
                        .from('offers')
                        .update({ total_released_amount: (parseFloat(offer.total_released_amount) || 0) + delta })
                        .eq('id', offerId);
                } catch (e) {}
            }

            return { released: delta, earned_total: earned, elapsed: Math.round(elapsed), total: total };
        } catch (e) {
            console.warn('releaseEarnedSoFar:', e.message);
            return { error: true };
        }
    });
}

/**
 * معالجة المدفوعات حسب وقت البث الفعلي
 * (تُنفَّذ داخل قفل تسلسلي لكل درس حتى لا تتعارض مع التحرير التدريجي أثناء البث)
 */
async function processStreamPayments(offerId, earlyEnd = false) {
    return withOfferFlowLock(offerId, function () {
        return processStreamPaymentsUnlocked(offerId, earlyEnd);
    });
}

async function processStreamPaymentsUnlocked(offerId, earlyEnd = false) {
    // ✅ جلب متدرّج الأعمدة: الاسترداد لا يجب أن يتوقف أبداً بسبب غياب عمود واحد
    let offer = null;
    const offerSelects = [
        'id, teacher_id, price, subject_name, is_free, price_per_session, total_sessions, plan_type',
        'id, teacher_id, price, subject_name, is_free',
        'id, teacher_id, price, subject_name',
        'id, teacher_id, price'
    ];
    for (const cols of offerSelects) {
        try {
            const { data, error } = await supabase.from('offers').select(cols).eq('id', offerId).single();
            if (!error && data) { offer = data; break; }
        } catch (e) {}
    }

    if (!offer) {
        logger.error(`خطأ في جلب الدرس ${offerId} — تم تجاهل معالجة المدفوعات لهذه الدورة`);
        return;
    }

    const isOfferFree = (offer.is_free === true || offer.is_free === 'true' || offer.is_free === 1 || offer.price === 0 || parseFloat(offer.price) === 0);
    if (isOfferFree) {
        console.log('الدرس مجاني، لا حاجة لمعالجة المدفوعات');
        return;
    }

    const isMultiSession = offer.total_sessions > 1 || offer.plan_type;
    const pricePerSession = isMultiSession ? parseFloat(offer.price_per_session || offer.price || 0) : parseFloat(offer.price || 0);
    
    let isCompleted = false;
    let completionPctRounded = 0;
    let actualSeconds = 0;
    let expectedSeconds = 0;

    if (!earlyEnd) {
        try {
            const completion = await verifyStreamCompletion(offerId);
            isCompleted = completion.complete;
            completionPctRounded = Math.round(completion.completion_percentage);
            actualSeconds = completion.actual_seconds;
            expectedSeconds = completion.expected_seconds || 0;
        } catch (e) {
            // ✅ في أي خطأ غير متوقع: نفترض أن البث غير مكتمل ⇒ استرداد للطالب (حماية حقوقه أولاً)
            logger.error('verifyStreamCompletion فشل — معاملات عدم الاكتمال (استرداد):', e.message);
            isCompleted = false;
            completionPctRounded = 0;
            actualSeconds = 0;
        }
    }

    if (isMultiSession) {
        if (isCompleted && !earlyEnd) {
            try {
                await releasePlanSessionEscrow(offerId);
            } catch (e) {
                console.error('خطأ في تحرير مستحقات حصة الخطة:', e.message);
            }
        } else {
            try {
                await refundPlanSessionEscrow(offerId);
            } catch (e) {
                console.error('خطأ في استرداد مبلغ الحصة للطلاب:', e.message);
            }
        }

        const { data: updatedOffer } = await supabase
            .from('offers')
            .select('completed_sessions_count, total_sessions')
            .eq('id', offerId)
            .single();
            
        const isAllCompleted = updatedOffer && (updatedOffer.completed_sessions_count || 0) >= (updatedOffer.total_sessions || 1);
        
        // تبقى دفعة حجز الخطة معلقة حتى اكتمال الخطة كاملة؛ تحرير الأستاذ
        // يتم أدناه لكل حصة مكتملة فقط، لذلك لا نحرر إجمالي الخطة هنا.
        if (isAllCompleted) {
            await supabase
                .from('sessions')
                .update({
                    payment_status: 'paid',
                    completed_at: new Date().toISOString(),
                    partial_payment_note: 'اكتملت جميع حصص الخطة'
                })
                .eq('offer_id', offerId)
                .eq('payment_status', 'pending_stream');
        }
        
        await supabase
            .from('notifications')
            .insert({
                user_id: offer.teacher_id,
                user_type: 'teacher',
                title: '📊 تقرير حصة',
                message: `تم إنهاء حصة من الخطة "${offer.subject_name}". ${(isCompleted && !earlyEnd) ? 'تمت الحصة بنجاح.' : 'لم يتم إكمال مدة البث المطلوبة.'}`,
                is_read: false,
                created_at: new Date().toISOString()
            });
            
        return;
    }

    if (earlyEnd) {
        return await processEarlyEndRefund(offerId);
    }

    // ✅ جلب متدرّج الأعمدة — لا يجوز أن يتوقف الاسترداد بسبب غياب عمود واحد
    let sessions = null;
    const sessionSelects = [
        'id, student_id, payment_amount, payment_status, created_at',
        'id, student_id, payment_amount, created_at',
        'id, student_id, payment_amount',
        'id, student_id'
    ];
    for (const cols of sessionSelects) {
        try {
            const { data, error } = await supabase
                .from('sessions')
                .select(cols)
                .eq('offer_id', offerId)
                .eq('payment_status', 'pending_stream');
            if (!error && data) { sessions = data; break; }
        } catch (e) {}
    }

    if (!sessions) return;

    // ✅ ما حُرر من المبلغ تدريجياً أثناء البث (محسوب على الخادم) يبقى للأستاذ —
    //    تُسوَّى هنا حصيلة الجزء المتبقي فقط عند الإنهاء
    let releasedSessionTotal = 0;
    try {
        const { data: ssRows } = await supabase
            .from('stream_sessions')
            .select('teacher_released_amount')
            .eq('offer_id', offerId);
        (ssRows || []).forEach(function (r) {
            releasedSessionTotal += Math.max(0, parseFloat(r.teacher_released_amount || 0));
        });
    } catch (e) {}
    const subscriberCount = (sessions || []).length || 1;
    const releasedPerStudent = Math.floor(releasedSessionTotal / subscriberCount);

    // ✅ أساس حساب نصيب كل طالب وقت دراسته الفعلي — الدخول المتأخر يُحتسب من لحظة حجزه
    const settleTotal = Math.max(60, expectedSeconds || 3600);
    const settleElapsed = Math.min(settleTotal, Math.max(0, actualSeconds || 0));
    const settleStartMs = Date.now() - settleElapsed * 1000;

    for (const session of (sessions || [])) {
        // ✅ دخول متأخر: حتى على درس مكتمل لا يُضاف للأستاذ إلا وقته الفعلي مع هذا الطالب
        const bookedMsLate = session.created_at ? Date.parse(session.created_at) : NaN;
        const isLateJoiner = !isNaN(bookedMsLate) && bookedMsLate > settleStartMs;
        if (isCompleted && !isLateJoiner) {
            const releasedAlready = Math.min(pricePerSession, releasedPerStudent);
            const teacherAmount = Math.max(0, pricePerSession - releasedAlready); // الجزء المتبقي فقط — البقيّة حُررت أثناء البث
            await supabase
                .from('sessions')
                .update({
                    payment_status: 'paid',
                    teacher_earned: pricePerSession,
                    completed_at: new Date().toISOString(),
                    completion_percentage: completionPctRounded,
                    actual_duration: actualSeconds,
                    partial_payment_note: releasedAlready > 0
                        ? `بث مكتمل - حُرر ${releasedAlready} دج تدريجياً أثناء البث والمتبقي ${teacherAmount} دج عند الإنهاء (نسبة الإكتمال: ${completionPctRounded}%)`
                        : `بث مكتمل - نسبة الإكتمال: ${completionPctRounded}%`
                })
                .eq('id', session.id);

            if (teacherAmount > 0) {
                const { data: teacher } = await supabase
                    .from('teachers')
                    .select('pending_withdraw, total_earned, balance')
                    .eq('id', offer.teacher_id)
                    .single();

                await supabase
                    .from('teachers')
                    .update({
                        pending_withdraw: Math.max(0, (parseFloat(teacher?.pending_withdraw) || 0) - teacherAmount),
                        total_earned: (parseFloat(teacher?.total_earned) || 0) + teacherAmount,
                        balance: (parseFloat(teacher?.balance) || 0) + teacherAmount
                    })
                    .eq('id', offer.teacher_id);
            }
        } else {
            // ✅ الطالب يسترد ما لم يدرسه فقط — ونصيب الأستاذ = وقته الفعلي مع هذا الطالب
            //    (الدخول المتأخر يُحتسب من لحظة حجزه) — رسوم المنصة لا تُسترد أبداً
            const settleFrac = computeStudiedFraction(session.created_at, settleStartMs, settleElapsed, settleTotal);
            const teacherShare = Math.min(pricePerSession, Math.floor(pricePerSession * settleFrac));
            const payAmount = parseFloat(session.payment_amount || pricePerSession || 0);
            const studentEscrow = Math.max(0, Math.min(payAmount || pricePerSession, pricePerSession)); // ما دفعه للأستاذ دون رسوم المنصة
            const refundAmount = Math.max(0, studentEscrow - teacherShare);
            const pendingToRelease = Math.max(0, pricePerSession - teacherShare);
            // ✅ الحصة المكتملة مع دخول متأخر: تبقى 'paid' (حجز سليم) مع تسجيل الاسترداد الجزئي
            await supabase
                .from('sessions')
                .update({
                    payment_status: isCompleted ? 'paid' : 'refunded',
                    teacher_earned: teacherShare,
                    refund_amount: isCompleted ? refundAmount : undefined,
                    completed_at: new Date().toISOString(),
                    completion_percentage: completionPctRounded,
                    actual_duration: actualSeconds,
                    partial_payment_note: isCompleted
                        ? `دخول متأخر - حصة مكتملة: نصيب الأستاذ ${teacherShare} دج عن وقتك الفعلي، واستُرد ${refundAmount} دج لك`
                        : (teacherShare > 0
                            ? `استرداد جزئي - نصيب الأستاذ ${teacherShare} دج عن الوقت الفعلي الذي درسه الطالب، واستُرد ${refundAmount} دج للطالب (نسبة الإكتمال: ${completionPctRounded}%)`
                            : `استرداد - البث غير مكتمل (نسبة الإكتمال: ${completionPctRounded}%)`)
                })
                .eq('id', session.id);

            const { data: teacher } = await supabase
                .from('teachers')
                .select('pending_withdraw')
                .eq('id', offer.teacher_id)
                .single();

            if (teacher) {
                await supabase
                    .from('teachers')
                    .update({
                        pending_withdraw: Math.max(0, (parseFloat(teacher.pending_withdraw) || 0) - pendingToRelease)
                    })
                    .eq('id', offer.teacher_id);
            }

            const { data: student } = await supabase
                .from('students')
                .select('wallet_balance')
                .eq('id', session.student_id)
                .single();
                
            await supabase
                .from('students')
                .update({
                    wallet_balance: (student?.wallet_balance || 0) + refundAmount
                })
                .eq('id', session.student_id);

            await supabase
                .from('wallet_transactions')
                .insert({
                    student_id: session.student_id,
                    amount: refundAmount,
                    type: 'refund',
                    status: 'completed',
                    description: isCompleted
                        ? `استرداد وقت لم تدرسه (دخول متأخر) ${refundAmount} دج — نصيب الأستاذ ${teacherShare} دج عن وقتك الفعلي من الحصة المكتملة`
                        : (teacherShare > 0
                            ? `استرداد جزئي (بقيمة ${refundAmount} دج — نصيب الأستاذ ${teacherShare} دج عن وقتك الفعلي داخل البث، ورسوم المنصة ثابتة) - نسبة إكتمال ${completionPctRounded}%`
                            : `استرداد مبلغ حصة غير مكتملة بنسبة ${completionPctRounded}%`),
                    created_at: new Date().toISOString()
                });
                
            await supabase
                .from('notifications')
                .insert({
                    user_id: session.student_id,
                    user_type: 'student',
                    title: isCompleted ? '💰 استرداد وقت لم تدرسه' : (teacherShare > 0 ? '💰 استرداد جزئي' : '💰 استرداد كامل'),
                    message: isCompleted
                        ? `انضممت متأخراً فاستُرد لك ${refundAmount} دج من حصة "${offer.subject_name}" المكتملة — نصيب الأستاذ ${teacherShare} دج عن وقتك الفعلي فقط.`
                        : (teacherShare > 0
                            ? `تم استرداد ${refundAmount} دج من أصل ${studentEscrow} دج (سعر الحصة) لحصة "${offer.subject_name}" — نصيب الأستاذ ${teacherShare} دج عن الوقت الفعلي الذي درسته داخل البث.`
                            : `تم استرداد مبلغ ${refundAmount} دج لحصة "${offer.subject_name}" لعدم إكمال مدة البث.`),
                    is_read: false,
                    created_at: new Date().toISOString()
                });
        }
    }
    
    await supabase
        .from('notifications')
        .insert({
            user_id: offer.teacher_id,
            user_type: 'teacher',
            title: '📊 تقرير البث',
            message: `تم إنهاء البث "${offer.subject_name}". ${isCompleted ? 'تمت الحصة بنجاح.' : 'لم يتم إكمال مدة البث المطلوبة.'}${releasedSessionTotal > 0 ? ` حُرر ${releasedSessionTotal} دج من المبلغ أثناء البث.` : ''}`,
            is_read: false,
            created_at: new Date().toISOString()
        });
}



/**
 * تحرير مستحقات حصة محددة ضمن خطة اشتراك
 * @param {number} offerId 
 * @param {number} sessionNumber - رقم الحصة (اختياري، إن لم يحدد يتم أخذ الحصة التالية غير المكتملة)
 */
async function releasePlanSessionEscrow(offerId, sessionNumber = null) {
    try {
        const { data: offer, error: offerError } = await supabase
            .from('offers')
            .select('*')
            .eq('id', offerId)
            .single();

        if (offerError || !offer) {
            console.error('العرض غير موجود لتحرير المستحقات:', offerId);
            return { success: false, error: 'الدرس غير موجود' };
        }

        const totalSessions = offer.total_sessions || 1;
        const pricePerSession = parseFloat(offer.price_per_session || offer.price || 0);
        const isFree = (offer.is_free === true || offer.is_free === 'true' || offer.is_free === 1) && pricePerSession === 0;

        if (isFree || pricePerSession <= 0) {
            console.log('الحصة مجانية - لا توجد مستحقات لتحريرها');
            return { success: true, message: 'حصة مجانية' };
        }

        // جلب الحصص المجدولة
        const { data: streamSessions } = await supabase
            .from('stream_sessions')
            .select('*')
            .eq('offer_id', offerId)
            .order('session_number', { ascending: true });

        let targetSession = null;
        if (sessionNumber) {
            targetSession = (streamSessions || []).find(s => s.session_number === sessionNumber);
        } else {
            // أول حصة غير مكتملة
            targetSession = (streamSessions || []).find(s => s.status !== 'completed');
            if (!targetSession && streamSessions && streamSessions.length > 0) {
                targetSession = streamSessions[streamSessions.length - 1];
            }
        }

        const currentSessionNum = targetSession ? targetSession.session_number : ((offer.completed_sessions_count || 0) + 1);

        // منع تحرير نفس الحصة أكثر من مرة عند تكرار webhook أو طلب الإنهاء
        if (targetSession?.is_escrow_released || targetSession?.status === 'completed') {
            return {
                success: true,
                already_processed: true,
                session_number: currentSessionNum,
                amount_released: 0
            };
        }

        // ✅ جلب المشتركين أنفسهم مع لحظة كل حجز — نصيب كل طالب عند اكتمال الحصة:
        //    من حجز قبل البدء يستلم السعر كاملاً (قاعدة الإكتمال 90%)، ومن دخل متأخراً
        //    لا يُضاف للأستاذ إلا وقته الفعلي معه ويُسترد له ما لم يدرسه من هذه الحصة.
        let planStudentRows = null;
        const planStudSelects = [
            'id, student_id, payment_amount, payment_status, created_at',
            'id, student_id, payment_amount, created_at',
            'id, student_id, payment_amount'
        ];
        for (const cols of planStudSelects) {
            try {
                const { data, error } = await supabase
                    .from('sessions')
                    .select(cols)
                    .eq('offer_id', offerId)
                    .in('payment_status', ['pending_stream', 'paid']);
                if (!error && data) { planStudentRows = data; break; }
            } catch (e) {}
        }

        let studentCount = null;
        if (!planStudentRows) {
            const { count } = await supabase
                .from('sessions')
                .select('*', { count: 'exact', head: true })
                .eq('offer_id', offerId)
                .in('payment_status', ['pending_stream', 'paid']);
            studentCount = count;
        }
        const activeSubscribers = ((planStudentRows ? planStudentRows.length : (studentCount || offer.booked_count)) || 1);

        // ✅ أساس الوقت الفعلي للحصة الحالية (محسوب على الخادم)
        const relElapsedInfo = await computeElapsedLiveSeconds(offerId, offer);
        const relTotal = Math.max(60, relElapsedInfo.total);
        const relElapsed = Math.min(relTotal, Math.max(0, relElapsedInfo.elapsed));
        const relStartMs = Date.now() - relElapsed * 1000;
        const relRealStartMs = offer.stream_started_at ? Date.parse(offer.stream_started_at) : NaN;

        let amountToRelease = 0;
        const lateJoinerRefunds = [];
        if (planStudentRows && planStudentRows.length > 0) {
            for (const row of planStudentRows) {
                const bookedMs = row.created_at ? Date.parse(row.created_at) : NaN;
                const isLateJoiner = !isNaN(bookedMs) && !isNaN(relRealStartMs) && bookedMs > relRealStartMs;
                let sessionShare = pricePerSession;
                if (isLateJoiner) {
                    sessionShare = Math.min(pricePerSession, Math.floor(pricePerSession * computeStudiedFraction(row.created_at, relStartMs, relElapsed, relTotal)));
                    const rowRefund = Math.max(0, pricePerSession - sessionShare);
                    if (rowRefund > 0) lateJoinerRefunds.push({ row: row, refund: rowRefund, share: sessionShare });
                }
                amountToRelease += sessionShare;
            }
            amountToRelease = Math.min(amountToRelease, pricePerSession * activeSubscribers);
        } else {
            // بيانات قديمة بلا صفوف — السلوك القديم (سعر الحصة × عدد المشتركين)
            amountToRelease = pricePerSession * activeSubscribers;
        }

        // ✅ ما حُرر تدريجياً أثناء البث لا يُعاد تحريره — نُكمل الجزء المتبقي فقط عند الإنهاء
        const alreadyReleased = Math.max(0, parseFloat(targetSession?.teacher_released_amount || 0));
        const remainderToRelease = Math.max(0, amountToRelease - alreadyReleased);

        // ✅ ادّعاء علامة التحرير في stream_sessions أولاً — قبل أي خصم من المعلق أو إضافة رصيد:
        //    العلامة هي مرجع حساب الاسترداد لاحقاً؛ إن كُتب الرصيد من دون علامة (كتابة صامتة تفشل)
        //    كان الطالب يسترد المبلغ كاملاً لاحقاً بينما الأستاذ أخذه أيضاً (استرداد زائد).
        //    إن فشلت الكتابة هنا لم يُحرَّر شيء ولا يُخصم شيء — اتساق تام بلا طباعة أموال.
        if (targetSession) {
            let claimRows = null;
            try {
                const { data, error } = await supabase
                    .from('stream_sessions')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        teacher_released_amount: amountToRelease,
                        is_escrow_released: true
                    })
                    .eq('id', targetSession.id)
                    .or('is_escrow_released.eq.false,is_escrow_released.is.null')
                    .select('id');
                if (!error) claimRows = data;
            } catch (e) {}
            if (!claimRows || claimRows.length === 0) {
                console.warn('⚠️ تعذر تسجيل علامة تحرير الحصة — لم يُخصم أي مبلغ ولن يُضاف أي رصيد (شغّل schema_progressive_release_timer.sql)');
                return {
                    success: true,
                    already_processed: true,
                    session_number: currentSessionNum,
                    amount_released: 0
                };
            }
        }

        // تحديث رصيد المعلم: نقل المبلغ من المعلق إلى المتاح والأرباح
        // (العلامة سُجّلت أعلاه — هذا الرصيد موثّق حتماً في stream_sessions)
        const { data: teacher } = await supabase
            .from('teachers')
            .select('pending_withdraw, total_earned, balance')
            .eq('id', offer.teacher_id)
            .single();

        if (teacher && remainderToRelease > 0) {
            const newPending = Math.max(0, (parseFloat(teacher.pending_withdraw) || 0) - remainderToRelease);
            const newEarned = (parseFloat(teacher.total_earned) || 0) + remainderToRelease;
            const newBalance = (parseFloat(teacher.balance) || 0) + remainderToRelease;

            await supabase
                .from('teachers')
                .update({
                    pending_withdraw: newPending,
                    total_earned: newEarned,
                    balance: newBalance
                })
                .eq('id', offer.teacher_id);
        }

        // تسجيل في جدول stream_escrow_releases
        try {
            await supabase
                .from('stream_escrow_releases')
                .insert({
                    offer_id: offerId,
                    teacher_id: offer.teacher_id,
                    session_number: currentSessionNum,
                    amount_released: remainderToRelease,
                    students_count: activeSubscribers,
                    note: alreadyReleased > 0
                        ? `تحرير متبقي الحصة رقم ${currentSessionNum}: ${remainderToRelease} دج — حُرر ${alreadyReleased} دج تدريجياً أثناء البث (الإجمالي ${amountToRelease} دج)`
                        : `تحرير مستحقات الحصة رقم ${currentSessionNum} بمبلغ ${amountToRelease} دج (${activeSubscribers} طالب × ${pricePerSession} دج)`,
                    created_at: new Date().toISOString()
                });
        } catch (e) {
            console.warn('⚠️ تعذر إدراج stream_escrow_releases:', e.message);
        }

        // ✅ استرداد نصيب كل طالب دخل متأخراً من هذه الحصة: ما لم يدرسه من سعرها.
        //    الحجز يبقى 'paid' (سليم — حصص الخطة القادمة تُسوّى كالمعتاد) مع تسجيل
        //    الاسترداد في refund_amount حتى لا يُسترد المبلغ مجدداً في أي مسار لاحق.
        for (const rf of lateJoinerRefunds) {
            try {
                // ✅ أولاً: خصم المبلغ المسترد من معلق الأستاذ — يعود من غير المحرَّر لديه،
                //    لا من محفظة المنصة. هكذا يعود المعلق بالكامل إلى صفر بعد التسوية.
                try {
                    const { data: tRow } = await supabase
                        .from('teachers')
                        .select('pending_withdraw')
                        .eq('id', offer.teacher_id)
                        .single();
                    if (tRow) {
                        const pendNow = Math.max(0, parseFloat(tRow.pending_withdraw) || 0);
                        const debitAmt = Math.min(rf.refund, pendNow);
                        if (debitAmt > 0) {
                            await supabase
                                .from('teachers')
                                .update({ pending_withdraw: pendNow - debitAmt })
                                .eq('id', offer.teacher_id);
                        }
                    }
                } catch (e) {}

                const { data: stRow } = await supabase
                    .from('students')
                    .select('wallet_balance')
                    .eq('id', rf.row.student_id)
                    .single();
                await supabase
                    .from('students')
                    .update({ wallet_balance: (parseFloat(stRow?.wallet_balance) || 0) + rf.refund })
                    .eq('id', rf.row.student_id);

                await supabase
                    .from('wallet_transactions')
                    .insert({
                        student_id: rf.row.student_id,
                        amount: rf.refund,
                        type: 'refund',
                        status: 'completed',
                        description: `استرداد وقت لم تدرسه (دخول متأخر) ${rf.refund} دج من الحصة ${currentSessionNum} — نصيب الأستاذ ${rf.share} دج عن وقتك الفعلي داخل البث`,
                        created_at: new Date().toISOString()
                    });

                await supabase
                    .from('notifications')
                    .insert({
                        user_id: rf.row.student_id,
                        user_type: 'student',
                        title: '💰 استرداد وقت لم تدرسه',
                        message: `انضممت إلى البث متأخراً فاستُرد لك ${rf.refund} دج من الحصة ${currentSessionNum} (نصيب الأستاذ ${rf.share} دج عن وقتك الفعلي فقط) — عدل تام.`,
                        is_read: false,
                        created_at: new Date().toISOString()
                    });

                await supabase
                    .from('sessions')
                    .update({
                        refund_amount: (parseFloat(rf.row.refund_amount) || 0) + rf.refund,
                        teacher_earned: Math.max(0, (parseFloat(rf.row.teacher_earned) || 0) - rf.refund),
                        partial_payment_note: `دخول متأخر - استُرد ${rf.refund} دج من الحصة ${currentSessionNum} ونصيب الأستاذ ${rf.share} دج عن الوقت الفعلي`
                    })
                    .eq('id', rf.row.id);
            } catch (e) {
                console.warn('⚠️ تعذر استرداد نصيب الطالب المتأخر:', e.message);
            }
        }

        // تحديث عدد الحصص المكتملة في العرض وتحديث جدول الحصص sessions_schedule
        const newCompletedCount = Math.min(totalSessions, (offer.completed_sessions_count || 0) + 1);
        let updatedSchedule = offer.sessions_schedule || [];
        if (Array.isArray(updatedSchedule)) {
            updatedSchedule = updatedSchedule.map(s => {
                if (s.session_number === currentSessionNum) {
                    return { ...s, status: 'completed', completed_at: new Date().toISOString(), is_escrow_released: true };
                }
                return s;
            });
        }

        const isAllCompleted = newCompletedCount >= totalSessions;
        const offerUpdates = {
            completed_sessions_count: newCompletedCount,
            sessions_schedule: updatedSchedule,
            total_released_amount: (parseFloat(offer.total_released_amount) || 0) + remainderToRelease
        };

        if (isAllCompleted) {
            offerUpdates.status = 'completed';
            offerUpdates.completed_at = new Date().toISOString();
        }

        // ✅ تحديث متدرّج المحاولات: عدّاد الحصص المكتملة يجب أن يُكتب حتماً —
        //    فشله الصامت كان يجعل الدرس يبقى 'upcoming' بعد إقامة حصة كاملة،
        //    فيأتي مؤقّت الانتهاء ويرد المبلغ كاملاً للأستاذ والأستاذ معاً (استرداد زائد)
        const offerAttempts = [
            offerUpdates,
            Object.assign(
                { completed_sessions_count: newCompletedCount },
                isAllCompleted ? { status: 'completed', completed_at: offerUpdates.completed_at } : {}
            ),
            { completed_sessions_count: newCompletedCount }
        ];
        for (let i = 0; i < offerAttempts.length; i++) {
            try {
                const { error } = await supabase
                    .from('offers')
                    .update(offerAttempts[i])
                    .eq('id', offerId);
                if (!error) break;
            } catch (e) {}
        }

        // تحديث اشتراكات الطلاب
        try {
            await supabase
                .from('stream_subscriptions')
                .update({
                    completed_sessions: newCompletedCount,
                    teacher_released_so_far: (parseFloat(offer.total_released_amount) || 0) + remainderToRelease,
                    status: isAllCompleted ? 'completed' : 'active',
                    updated_at: new Date().toISOString()
                })
                .eq('offer_id', offerId);
        } catch (e) {
            console.warn('⚠️ تعذر تحديث stream_subscriptions:', e.message);
        }

        // إشعار الأستاذ بتحرير الدفعة
        await supabase
            .from('notifications')
            .insert({
                user_id: offer.teacher_id,
                user_type: 'teacher',
                title: '💰 تم تحرير مستحقات الحصة',
                message: alreadyReleased > 0
                    ? `حُرر ${remainderToRelease} دج الآن (بعد ${alreadyReleased} دج حُررت تدريجياً أثناء البث) بإجمالي ${amountToRelease} دج عن الحصة رقم (${currentSessionNum}) من (${totalSessions}) حصص في خطة "${offer.subject_name}".`
                    : `تم تحرير مبلغ ${amountToRelease} دج وإضافته لأرباحك بعد اكتمال الحصة رقم (${currentSessionNum}) من إجمالي (${totalSessions}) حصص في خطة "${offer.subject_name}".`,
                is_read: false,
                created_at: new Date().toISOString()
            });

        console.log(`✅ تم بنجاح تحرير ${remainderToRelease} دج للأستاذ عن الحصة ${currentSessionNum}/${totalSessions} (إجمالي الحصة ${amountToRelease} دج)`);
        return {
            success: true,
            session_number: currentSessionNum,
            amount_released: remainderToRelease,
            amount_for_session: amountToRelease,
            completed_sessions_count: newCompletedCount,
            is_all_completed: isAllCompleted
        };
    } catch (err) {
        console.error('خطأ في تحرير مستحقات الحصة:', err);
        return { success: false, error: err.message };
    }
}

async function refundPlanSessionEscrow(offerId, sessionNumber = null) {
  try {
  const { data: offer, error: offerError } = await supabase
  .from('offers')
  .select('*')
  .eq('id', offerId)
  .single();

  if (offerError || !offer) return;

  const totalSessions = offer.total_sessions || 1;
  const pricePerSession = parseFloat(offer.price_per_session || offer.price || 0);
  const { data: subscription } = await supabase
  .from('stream_subscriptions')
  .select('id, total_sessions, teacher_total_escrow, completed_sessions, teacher_released_so_far')
  .eq('offer_id', offerId)
  .eq('status', 'active')
  .order('created_at', { ascending: true })
  .limit(1)
  .maybeSingle();
  const teacherSharePerSession = subscription
  ? parseFloat(subscription.teacher_total_escrow || 0) / Math.max(1, Number(subscription.total_sessions || totalSessions))
  : pricePerSession;
  const isFree = (offer.is_free === true || offer.is_free === 'true' || offer.is_free === 1) && pricePerSession === 0;

        if (isFree || pricePerSession <= 0) return;

        const { data: streamSessions } = await supabase
            .from('stream_sessions')
            .select('*')
            .eq('offer_id', offerId)
            .order('session_number', { ascending: true });

        let targetSession = null;
        if (sessionNumber) {
            targetSession = (streamSessions || []).find(s => s.session_number === sessionNumber);
        } else {
            targetSession = (streamSessions || []).find(s => s.status !== 'completed' && s.status !== 'refunded');
            if (!targetSession && streamSessions && streamSessions.length > 0) {
                targetSession = streamSessions[streamSessions.length - 1];
            }
        }
        
        const currentSessionNum = targetSession ? targetSession.session_number : ((offer.completed_sessions_count || 0) + 1);

        // الاسترداد يكون لحصة واحدة فقط، ولا يتكرر عند إعادة استقبال حدث الإنهاء
        if (targetSession?.status === 'refunded' || targetSession?.is_escrow_released) {
            return {
                success: true,
                already_processed: true,
                session_number: currentSessionNum,
                amount_refunded: 0
            };
        }

        // ✅ الاسترداد يشمل الحجوزات المعلقة فقط ('pending_stream') — لا يمسّ حجوزاً مؤدّاة ('paid')
        //    فالحجوزات المؤدّاة تعني أن الخطة اكتملت وسُوّي كل شيء؛ استردادها لاحقاً (حذف/مؤقّت)
        //    كان يعيد المبلغ للطالب بينما الأستاذ أخذه بالفعل (مبلغ زائد)
        const { data: students } = await supabase
            .from('sessions')
            .select('student_id, id, payment_amount')
            .eq('offer_id', offerId)
            .eq('payment_status', 'pending_stream');

        // ✅ منع الاسترداد المزدوج: إن لم يبقَ أي مبلغ معلق (تم استرداده عند إنهاء البث سابقاً)
        //    لا نكرر الاسترداد عند إعادة الاستدعاء (مثلاً عند حذف الدرس بعد إنهاء البث)
        if (!students || students.length === 0) {
            return {
                success: true,
                already_processed: true,
                session_number: currentSessionNum,
                amount_refunded: 0
            };
        }

        // ✅ الأستاذ يحتفظ بما حُرر تدريجياً أثناء البث — الطالب يسترد الباقي من سعر الحصة(ات)
        //    للأستاذ فقط. رسوم المنصة الثابتة لا تُسترد أبداً عند فشل الحصة: الحد الأقصى
        //    القابل للاسترداد = سعر الحصة(ات) للأستاذ لا كامل ما دفعه الطالب.
        //    (مثال واقعي: دفع الطالب 330 = سعر250 + رسوم80، حُرر 6 ⇒ الاسترداد 244 لا 324)
        const planReleasedTotal = (streamSessions || []).reduce(function (sum, s) {
            return sum + Math.max(0, parseFloat(s.teacher_released_amount || 0));
        }, 0);
        const perStudentReleased = Math.floor(planReleasedTotal / ((students || []).length || 1));
        const planTeacherEscrowTotal = Math.max(0, pricePerSession * totalSessions); // سعر الحصة(ات) للأستاذ

        let studentsEscrowSum = 0;
        for (const session of (students || [])) {
            // ✅ الحد الأقصى القابل للاسترداد لهذا الطالب = سعر الحصة(ات) دون رسوم المنصة
            const maxRefundable = Math.max(0, Math.min(parseFloat(session.payment_amount || 0) || planTeacherEscrowTotal, planTeacherEscrowTotal));
            studentsEscrowSum += maxRefundable;
            const refundAmountSession = Math.max(0, maxRefundable - perStudentReleased);
            const { data: student } = await supabase
                .from('students')
                .select('wallet_balance')
                .eq('id', session.student_id)
                .single();
            
            await supabase
                .from('students')
                .update({
  wallet_balance: (student?.wallet_balance || 0) + refundAmountSession
  })
  .eq('id', session.student_id);

  await supabase
  .from('wallet_transactions')
  .insert({
  student_id: session.student_id,
  amount: refundAmountSession,
                    type: 'refund',
                    status: 'completed',
                    description: perStudentReleased > 0
                        ? `استرداد جزئي للحصة ${currentSessionNum} من خطة "${offer.subject_name || 'غير معروف'}" (بقيمة ${refundAmountSession} دج بعد تحرير ${perStudentReleased} دج للأستاذ)`
                        : `استرداد مبلغ الحصة ${currentSessionNum} من خطة "${offer.subject_name || 'غير معروف'}" لعدم اكتمالها`,
                    created_at: new Date().toISOString()
                });

            await supabase
                .from('notifications')
                .insert({
                    user_id: session.student_id,
                    user_type: 'student',
                    title: perStudentReleased > 0 ? '💰 استرداد جزئي للحصة' : '💰 استرداد مبلغ الحصة',
                    message: perStudentReleased > 0
                        ? `تم استرداد ${refundAmountSession} دج للحصة ${currentSessionNum} (حُرر ${perStudentReleased} دج للأستاذ أثناء البث).`
                        : `تم استرداد ${refundAmountSession} دج للحصة ${currentSessionNum} لأن البث لم يكتمل.`,
                    is_read: false,
                    created_at: new Date().toISOString()
                });
        }

        // ✅ تعليم الجلسات كمستردة لمنع أي استرداد مكرر لاحقاً (عند حذف الدرس بعد إنهاء البث مثلاً)
        try {
            await supabase
                .from('sessions')
                .update({
                    payment_status: 'refunded',
                    teacher_earned: perStudentReleased,
                    partial_payment_note: perStudentReleased > 0
                        ? `استرداد الحصة ${currentSessionNum} — حُرر ${perStudentReleased} دج تدريجياً للأستاذ أثناء البث`
                        : 'استرداد مبلغ الحصة — البث لم يكتمل'
                })
                .eq('offer_id', offerId)
                .in('id', (students || []).map(s => s.id));
        } catch (e) {}

  // ✅ نخصم من المعلق غير المحرر فقط — ما حُرر تدريجياً انتقل أصلاً إلى الرصيد القابل للسحب
  //    (المعلق لكل طالب = سعر الحصة(ات) دون رسوم المنصة)
  const amountToRefundTotal = Math.max(0, studentsEscrowSum - planReleasedTotal);
  const { data: teacher } = await supabase
            .from('teachers')
            .select('pending_withdraw')
            .eq('id', offer.teacher_id)
            .single();

  if (teacher && amountToRefundTotal > 0) {
  const newPending = Math.max(0, (parseFloat(teacher.pending_withdraw) || 0) - amountToRefundTotal);
  const { error: teacherUpdateError } = await supabase
  .from('teachers')
  .update({ pending_withdraw: newPending })
  .eq('id', offer.teacher_id);
  if (teacherUpdateError) throw teacherUpdateError;
  }

  if (subscription) {
  await supabase.from('stream_subscriptions').update({
  status: 'active',
  updated_at: new Date().toISOString()
  }).eq('id', subscription.id);
  }

  if (targetSession) {
            await supabase
                .from('stream_sessions')
  .update({
  status: 'refunded',
  completed_at: new Date().toISOString(),
  teacher_released_amount: Math.max(0, parseFloat(targetSession.teacher_released_amount || 0)),
  refund_amount: parseFloat(targetSession.refund_amount || teacherSharePerSession || 0),
  is_escrow_released: true,
  updated_at: new Date().toISOString()
  })
  .eq('id', targetSession.id);
        }

        const newCompletedCount = Math.min(totalSessions, (offer.completed_sessions_count || 0) + 1);
        let updatedSchedule = offer.sessions_schedule || [];
        if (Array.isArray(updatedSchedule)) {
            updatedSchedule = updatedSchedule.map(s => {
                if (s.session_number === currentSessionNum) {
                    return { ...s, status: 'refunded', completed_at: new Date().toISOString() };
                }
                return s;
            });
        }
        // ✅ تحديث متدرّج: عدّاد الحصص يجب أن يُكتب حتماً (فشل الصامت كان يعيد الدرس لـ'upcoming')
        const refundOfferAttempts = [
            {
                completed_sessions_count: newCompletedCount,
                sessions_schedule: updatedSchedule
            },
            { completed_sessions_count: newCompletedCount }
        ];
        for (let i = 0; i < refundOfferAttempts.length; i++) {
            try {
                const { error } = await supabase
                    .from('offers')
                    .update(refundOfferAttempts[i])
                    .eq('id', offerId);
                if (!error) break;
            } catch (e) {}
        }

    } catch (e) {
        console.error('خطأ في refundPlanSessionEscrow:', e);
    }
}


/**
 * معالجة الاسترداد الكامل عند الإنهاء المبكر
 * - لا يحصل الأستاذ على أي مال
 * - يتم استرداد جميع الأموال للطلاب
 */
async function processEarlyEndRefund(offerId) {
    // ✅ جلب متدرّج الأعمدة — أساس حساب الوقت الفعلي للدخول المتأخر
    let offer = null;
    const earlyOfferSelects = [
        'id, teacher_id, subject_name, is_free, price, price_per_session, total_sessions, duration, total_seconds, stream_started_at',
        'id, teacher_id, subject_name, is_free, price, price_per_session, duration, stream_started_at',
        'id, teacher_id, subject_name, is_free, price, duration',
        'id, teacher_id, subject_name, is_free, price'
    ];
    for (const cols of earlyOfferSelects) {
        try {
            const { data, error } = await supabase.from('offers').select(cols).eq('id', offerId).single();
            if (!error && data) { offer = data; break; }
        } catch (e) {}
    }

    if (!offer) {
        logger.error('خطأ في جلب الدرس للاسترداد:', offerId);
        return;
    }

    // إذا كان مجانياً، لا حاجة للمعالجة
    const isOfferFree = offer ? (offer.is_free === true || offer.is_free === 'true' || offer.is_free === 1 || offer.price === 0 || parseFloat(offer.price) === 0) : false;
    if (isOfferFree) {
        console.log('الدرس مجاني، لا حاجة لمعالجة الاسترداد');
        return;
    }

    const earlyTotalSessions = offer.total_sessions || 1;
    const earlyPricePerSession = parseFloat(offer.price_per_session || offer.price || 0);

    // جلب جميع الجلسات المعلقة (مع لحظة الحجز = لحظة انضمام الطالب)
    let sessions = null;
    const earlySessionSelects = [
        'id, student_id, payment_amount, payment_status, created_at',
        'id, student_id, payment_amount, created_at',
        'id, student_id, payment_amount'
    ];
    for (const cols of earlySessionSelects) {
        try {
            const { data, error } = await supabase
                .from('sessions')
                .select(cols)
                .eq('offer_id', offerId)
                .eq('payment_status', 'pending_stream');
            if (!error && data) { sessions = data; break; }
        } catch (e) {}
    }

    if (!sessions) {
        logger.error('خطأ في جلب الجلسات للإنهاء المبكر');
        return;
    }

    // ✅ منع التكرار: إن لم تبقَ جلسات معلقة فالمبالغ استُرددت بالفعل (عند الإنهاء ثم الحذف)
    if (!sessions || sessions.length === 0) {
        return;
    }

    // ✅ الجزء الذي حُرر تدريجياً أثناء البث يبقى للأستاذ — الباقي يُسترد للطلاب
    let earlyReleasedTotal = 0;
    try {
        const { data: ssRows } = await supabase
            .from('stream_sessions')
            .select('teacher_released_amount')
            .eq('offer_id', offerId);
        (ssRows || []).forEach(function (r) {
            earlyReleasedTotal += Math.max(0, parseFloat(r.teacher_released_amount || 0));
        });
    } catch (e) {}

    // ✅ أساس الوقت الفعلي: نصيب كل طالب = ما درسه فعلياً (الدخول المتأخر من لحظة حجزه)
    //    ورسوم المنصة لا تُسترد — الاسترداد من سعر الحصة للأستاذ فقط
    const earlyElapsedInfo = await computeElapsedLiveSeconds(offerId, offer);
    const earlyTotal = Math.max(60, earlyElapsedInfo.total);
    const earlyElapsed = Math.min(earlyTotal, Math.max(0, earlyElapsedInfo.elapsed));
    const earlyStartMs = Date.now() - earlyElapsed * 1000;
    const earlyEscrowPerSession = Math.max(0, earlyPricePerSession * earlyTotalSessions);

    console.log(`⚠️ معالجة إنهاء مبكر للبث ${offerId} - استرداد المبالغ غير المحررة للطلاب`);

    for (const session of (sessions || [])) {
        // التحقق الإضافي من الحالة قبل المعالجة (تجنب التكرار)
        const { data: currentSession } = await supabase
            .from('sessions')
            .select('payment_status')
            .eq('id', session.id)
            .single();
            
        if (!currentSession || currentSession.payment_status !== 'pending_stream') {
            console.log(`ℹ️ الجلسة ${session.id} تم استردادها بالفعل أو تغيرت حالتها`);
            continue;
        }

        // ✅ نصيب الأستاذ = وقته الفعلي مع هذا الطالب، والاسترداد = سعر الحصة(ات) ناقصه (الرسوم ثابتة)
        const earlyFrac = computeStudiedFraction(session.created_at, earlyStartMs, earlyElapsed, earlyTotal);
        const earlyTeacherShare = Math.min(earlyPricePerSession, Math.floor(earlyPricePerSession * earlyFrac));
        const earlyMaxRefundable = Math.max(0, Math.min(parseFloat(session.payment_amount || 0) || earlyEscrowPerSession, earlyEscrowPerSession));
        const earlyRefundAmount = Math.max(0, earlyMaxRefundable - earlyTeacherShare);
        const { data: student } = await supabase
            .from('students')
            .select('wallet_balance')
            .eq('id', session.student_id)
            .single();

        await supabase
            .from('students')
            .update({
                wallet_balance: (student?.wallet_balance || 0) + earlyRefundAmount
            })
            .eq('id', session.student_id);

        // تحديث حالة الجلسة
        await supabase
            .from('sessions')
            .update({
                payment_status: 'refunded',
                teacher_earned: earlyTeacherShare,
                completed_at: new Date().toISOString(),
                partial_payment_note: earlyTeacherShare > 0
                    ? `استرداد جزئي - نصيب الأستاذ ${earlyTeacherShare} دج عن الوقت الفعلي الذي درسه الطلاب وأنهى الأستاذ البث مبكراً`
                    : 'استرداد مبلغ الحصة - أنهى الأستاذ البث مبكراً'
            })
            .eq('id', session.id);

        // تسجيل المعاملة
        await supabase
            .from('wallet_transactions')
            .insert({
                student_id: session.student_id,
                amount: earlyRefundAmount,
                type: 'refund',
                status: 'completed',
                description: earlyTeacherShare > 0
                    ? `استرداد جزئي ${earlyRefundAmount} دج من حصة ملغاة (نصيب الأستاذ ${earlyTeacherShare} دج عن الوقت الفعلي) - أنهى الأستاذ البث مبكراً`
                    : `استرداد مبلغ الحصة ${earlyRefundAmount} دج - أنهى الأستاذ البث مبكراً`,
                created_at: new Date().toISOString()
            });

        // إشعار الطالب
        await supabase
            .from('notifications')
            .insert({
                user_id: session.student_id,
                user_type: 'student',
                title: earlyTeacherShare > 0 ? '💰 استرداد جزئي' : '💰 استرداد مبلغ الحصة',
                message: earlyTeacherShare > 0
                    ? `تم استرداد ${earlyRefundAmount} دج لحصة "${offer.subject_name}" (نصيب الأستاذ ${earlyTeacherShare} دج عن الوقت الفعلي المدروس) لأن الأستاذ أنهى البث مبكراً`
                    : `تم استرداد ${earlyRefundAmount} دج لحصة "${offer.subject_name}" لأن الأستاذ أنهى البث مبكراً`,
                is_read: false,
                created_at: new Date().toISOString()
            });

        console.log(`💰 تم استرداد ${earlyRefundAmount} دج للطالب ${session.student_id} (نصيب الأستاذ ${earlyTeacherShare} دج)`);
    }

    // ✅ إلغاء معلق هذا الدرس غير المحرَّر فقط (لا مساس بمعلق دروس أخرى) —
    //    ما حُرر تدريجياً أثناء البث يبقى في رصيد الأستاذ القابل للسحب
    let earlyStudentsEscrowSum = 0;
    (sessions || []).forEach(function (s) {
        earlyStudentsEscrowSum += Math.max(0, Math.min(parseFloat(s.payment_amount || 0) || earlyEscrowPerSession, earlyEscrowPerSession));
    });
    const { data: teacher } = await supabase
        .from('teachers')
        .select('pending_withdraw')
        .eq('id', offer.teacher_id)
        .single();

    if (teacher) {
        const thisOfferUnreleased = Math.max(0, earlyStudentsEscrowSum - earlyReleasedTotal);
        const pendingDebit = Math.min(thisOfferUnreleased, Math.max(0, parseFloat(teacher.pending_withdraw) || 0));
        if (pendingDebit > 0) {
            await supabase
                .from('teachers')
                .update({
                    pending_withdraw: Math.max(0, (parseFloat(teacher.pending_withdraw) || 0) - pendingDebit)
                })
                .eq('id', offer.teacher_id);
        }
    }

    // إشعار الأستاذ
    await supabase
        .from('notifications')
        .insert({
            user_id: offer.teacher_id,
            user_type: 'teacher',
            title: '⚠️ تم إنهاء البث مبكراً',
            message: earlyReleasedTotal > 0
                ? `تم إنهاء البث "${offer.subject_name}" مبكراً. حُرر ${earlyReleasedTotal} دج لك عن ما قدمته أثناء البث، وتم استرداد الباقي للطلاب (دون رسوم المنصة).`
                : `تم إنهاء البث "${offer.subject_name}" مبكراً. لم تحصل على أي مال وتم استرداد مبالغ الطلاب (دون رسوم المنصة).`,
            is_read: false,
            created_at: new Date().toISOString()
        });

    console.log(earlyReleasedTotal > 0
        ? `⚠️ تم إنهاء البث مبكراً - حُرر للأستاذ ${earlyReleasedTotal} دج عن ما قدمته`
        : `⚠️ تم إنهاء البث مبكراً - لم يحصل الأستاذ على أي مال`);
}

/**
 * جلب بيانات التحقق للبث
 */
async function getStreamVerification(offerId) {
    const { data: verification, error } = await supabase
        .from('stream_verification')
        .select('*')
        .eq('offer_id', offerId)
        .single();

    if (error || !verification) {
        return null;
    }

    const { data: offer } = await supabase
        .from('offers')
        .select('duration')
        .eq('id', offerId)
        .single();

    const completion = await verifyStreamCompletion(offerId);

    return {
        ...verification,
        expected_duration: offer ? offer.duration * 60 : 0,
        completion_percentage: completion.completion_percentage,
        is_complete: completion.complete
    };
}

/**
 * انتهاء الدرس قبل بدئه (فات أوانه أو انقضت مدته بدون بث)
 * يُرجع أموال الطلاب الذين حجزوا ويحذف الدرس نهائياً من قاعدة البيانات
 */
async function expireOverdueOffer(offerId) {
    // ✅ جلب متدرّج الأعمدة — الاسترداد التلقائي لا يتوقف أبداً بسبب غياب عمود واحد
    let offer = null;
    const expireSelects = [
        'id, teacher_id, subject_name, price, is_free, status, offer_date, duration, total_sessions, plan_type, completed_sessions_count',
        'id, teacher_id, subject_name, price, is_free, status, offer_date, duration, total_sessions, completed_sessions_count',
        'id, teacher_id, subject_name, price, is_free, status, offer_date, duration',
        'id, teacher_id, subject_name, price, is_free, status'
    ];
    for (const cols of expireSelects) {
        try {
            const { data, error } = await supabase.from('offers').select(cols).eq('id', offerId).single();
            if (!error && data) { offer = data; break; }
        } catch (e) {}
    }

    if (!offer) {
        logger.error('expireOverdueOffer: الدرس غير موجود', offerId);
        return;
    }

    if (['completed', 'expired'].includes(offer.status)) return;

    // ✅ حراسة صارمة: هذا المسار للدروس التي لم يُبدأ بثها قط — "فات أوانه ولم يُقام".
    //    أي درس أُقامت منه حصة (حتى واحدة من خطة) لا يُلمس هنا إطلاقاً:
    //    الاسترداد الكامل هنا كان يعيد مبلغاً زائداً للطالب بعد أن حصل الأستاذ على مستحقته.
    if ((offer.total_sessions || 1) > 1 || offer.plan_type) return; // الخطط تُدار حصّة حصّة عبر مسارات البث
    if ((offer.completed_sessions_count || 0) > 0) return;
    try {
        const { data: ssRows } = await supabase
            .from('stream_sessions')
            .select('id, status')
            .eq('offer_id', offerId)
            .in('status', ['completed', 'refunded']);
        if (ssRows && ssRows.length > 0) return; // أُقامت حصة من هذا الدرس فعلاً
    } catch (e) {}

    console.log(`⏰ انتهاء الدرس ${offerId} (${offer.subject_name}) - جاري رد الأموال وحذف الدرس`);

    const isOfferFree = offer ? (offer.is_free === true || offer.is_free === 'true' || offer.is_free === 1 || offer.price === 0 || parseFloat(offer.price) === 0) : false;

    if (!isOfferFree) {
        // ✅ الحجوزات المعلقة فقط ('pending_stream') — لا يُسترد حجز مؤدّى ('paid') أبداً هنا
        const { data: sessions } = await supabase
            .from('sessions')
            .select('id, student_id, payment_amount, payment_status')
            .eq('offer_id', offerId)
            .eq('payment_status', 'pending_stream');

        // ✅ الجزء الذي حُرر تدريجياً أثناء البث يبقى للأستاذ — الطالب يسترد المتبقي فقط
        let expReleasedTotal = 0;
        try {
            const { data: ssRel } = await supabase
                .from('stream_sessions')
                .select('teacher_released_amount')
                .eq('offer_id', offerId);
            (ssRel || []).forEach(function (r) {
                expReleasedTotal += Math.max(0, parseFloat(r.teacher_released_amount || 0));
            });
        } catch (e) {}
        const expPerStudentReleased = Math.floor(expReleasedTotal / ((sessions || []).length || 1));

        for (const session of (sessions || [])) {
            const expRefundAmount = Math.max(0, (session.payment_amount || 0) - expPerStudentReleased);
            const { data: student } = await supabase
                .from('students')
                .select('wallet_balance')
                .eq('id', session.student_id)
                .single();

            await supabase
                .from('students')
                .update({ wallet_balance: (student?.wallet_balance || 0) + expRefundAmount })
                .eq('id', session.student_id);

            await supabase
                .from('sessions')
                .update({
                    payment_status: 'refunded',
                    teacher_earned: expPerStudentReleased,
                    partial_payment_note: expPerStudentReleased > 0
                        ? `استرداد جزئي - حُرر ${expPerStudentReleased} دج للأستاذ أثناء البث وأنهى الدرس دون إكماله`
                        : 'استرداد كامل - الدرس انتهى قبل البدء أو فات أوانه'
                })
                .eq('id', session.id);

            await supabase.from('wallet_transactions').insert({
                student_id: session.student_id,
                amount: expRefundAmount,
                type: 'refund',
                status: 'completed',
                description: expPerStudentReleased > 0
                    ? `استرداد جزئي ${expRefundAmount} دج - الدرس "${offer.subject_name}" (حُرر ${expPerStudentReleased} دج للأستاذ أثناء البث)`
                    : `استرداد ${expRefundAmount} دج - الدرس "${offer.subject_name}" لم يُقام`,
                created_at: new Date().toISOString()
            });

            await supabase.from('notifications').insert({
                user_id: session.student_id,
                user_type: 'student',
                title: '💰 استرداد تلقائي',
                message: `تم استرداد ${expRefundAmount} دج - لم تُكتمل حصة "${offer.subject_name}" في الموعد المحدد`,
                is_read: false,
                created_at: new Date().toISOString()
            });

            console.log(`💰 تم استرداد ${expRefundAmount} دج للطالب ${session.student_id}`);
        }

        // ✅ إلغاء معلق هذا الدرس غير المحرَّر فقط (ما حُرر تدريجياً بقي في رصيد الأستاذ)
        try {
            const { data: teacher } = await supabase
                .from('teachers')
                .select('pending_withdraw')
                .eq('id', offer.teacher_id)
                .single();
            const expUnreleased = Math.max(0, (parseFloat(offer.price || 0) * (sessions || []).length) - expReleasedTotal);
            const expDebit = Math.min(expUnreleased, Math.max(0, parseFloat(teacher?.pending_withdraw) || 0));
            if (teacher && expDebit > 0) {
                await supabase
                    .from('teachers')
                    .update({ pending_withdraw: Math.max(0, (parseFloat(teacher.pending_withdraw) || 0) - expDebit) })
                    .eq('id', offer.teacher_id);
            }
        } catch (e) {}
    }

    // إشعار الأستاذ
    await supabase.from('notifications').insert({
        user_id: offer.teacher_id,
        user_type: 'teacher',
        title: '⏰ تم إلغاء وحذف الدرس تلقائياً',
        message: `الدرس "${offer.subject_name}" تم إلغاؤه وحذفه تلقائياً لأنه لم يُبدأ في الوقت المحدد وانتهت مدته.`,
        is_read: false,
        created_at: new Date().toISOString()
    });

    // ✅ حذف البيانات المرتبطة بالدرس من الجداول التابعة
    const tables = [
        'active_stream', 
        'waiting_room', 
        'student_room_passwords'
    ];
    for (const table of tables) {
        try {
            await supabase.from(table).delete().eq('offer_id', offerId);
        } catch (e) {
            logger.error(`expireOverdueOffer: خطأ في حذف بيانات ${table}:`, e.message);
        }
    }

    // ✅ تحديث حالة الدرس إلى completed بدلاً من حذفه
    try {
        await supabase
            .from('offers')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('id', offerId);
        console.log(`✅ تم تحديث الدرس رقم ${offerId} إلى الحالة completed بنجاح`);
    } catch (e) {
        logger.error('expireOverdueOffer: خطأ في تحديث الدرس في جدول offers:', e.message);
    }
}

/**
 * إغلاق البث إجبارياً بعد انتهاء فترة السماح (10 دقائق)
 * يُستدعى من cron أو عند انتهاء grace period
 */
async function forceEndStream(offerId, reason = 'grace_timeout') {
    const { data: offer, error: offerError } = await supabase
        .from('offers')
        .select('id, teacher_id, subject_name, status, price, is_free')
        .eq('id', offerId)
        .single();

    if (offerError || !offer) return;
    if (!['live', 'paused'].includes(offer.status)) return;

    console.log(`🔴 إغلاق إجباري للبث ${offerId} - السبب: ${reason}`);

    // تسجيل نهاية البث
    await recordStreamEndWithReason(offerId, offer.teacher_id, reason);

    const completion = await verifyStreamCompletion(offerId);
    await processStreamPayments(offerId, false);

    // أرشفة سجل البث
    try {
        await archiveStreamLog(offerId, `force_ended_${reason}`, offer.teacher_id);
    } catch (archErr) {
        logger.error('⚠️ خطأ في أرشفة البث الإجباري:', archErr.message);
    }

    const isAllCompleted = (offer.completed_sessions_count || 0) >= (offer.total_sessions || 1);
    
    await supabase.from('offers').update({
        status: isAllCompleted ? 'completed' : 'upcoming',
        completed_at: isAllCompleted ? new Date().toISOString() : null,
        force_ended_at: new Date().toISOString()
    }).eq('id', offerId);

    await supabase.from('active_stream').delete().eq('offer_id', offerId);
    await supabase.from('waiting_room').delete().eq('offer_id', offerId);

    // إشعار الأستاذ
    const reasonMessages = {
        grace_timeout: 'انتهت فترة السماح (10 دقائق) بعد انتهاء وقت الحصة',
        heartbeat_lost: 'غادرت صفحة البث أثناء الحصة',
        expired_offer: 'انتهت مدة الدرس'
    };

    await supabase.from('notifications').insert({
        user_id: offer.teacher_id,
        user_type: 'teacher',
        title: '🔴 تم إغلاق البث تلقائياً',
        message: `تم إغلاق بث "${offer.subject_name}" تلقائياً - ${reasonMessages[reason] || reason}. يرجى إنشاء درس جديد لحصة جديدة.`,
        is_read: false,
        created_at: new Date().toISOString()
    });

    console.log(`✅ تم الإغلاق الإجباري للبث ${offerId}`);
}

/**
 * أرشفة وحفظ سجل البث المحذوف/المنتهي بكافة تفاصيله قبل الحذف
 * @param {number} offerId - معرف الدرس
 * @param {string} deleteReason - سبب الحذف/الإنهاء ('ended', 'deleted', 'early_end', 'force_ended')
 * @param {number|string} endedByUserId - معرف من قام بإيقاف/حذف البث
 */
async function archiveStreamLog(offerId, deleteReason = 'ended', endedByUserId = null) {
    try {
        if (!offerId) return null;

        // 1. جلب بيانات الدرس بالكامل من جدول offers
        const { data: offer } = await supabase
            .from('offers')
            .select('*')
            .eq('id', offerId)
            .single();

        if (!offer) {
            logger.warn(`archiveStreamLog: لم يتم العثور على الدرس ${offerId} لأرشفته`);
            return null;
        }

        // 2. جلب بيانات الأستاذ
        let teacherName = `أستاذ رقم ${offer.teacher_id}`;
        let teacherEmail = '';
        let teacherPhone = '';
        if (offer.teacher_id) {
            const { data: teacher } = await supabase
                .from('teachers')
                .select('full_name, email, phone')
                .eq('id', offer.teacher_id)
                .single();
            if (teacher) {
                teacherName = teacher.full_name || teacherName;
                teacherEmail = teacher.email || '';
                teacherPhone = teacher.phone || '';
            }
        }

        // 3. حساب نسب ومدد البث الفعلية
        let completion = { completion_percentage: offer.completion_percentage || 0, actual_seconds: offer.actual_duration || offer.actual_live_seconds || 0 };
        try {
            completion = await verifyStreamCompletion(offerId);
        } catch (e) {}

        // 4. جلب جميع الطلاب المسجلين/الحاضرين في الجلسات والغرفة لهذا البث
        let studentList = [];
        let totalEarningsCalculated = 0;
        let totalRefundedCalculated = 0;

        try {
            const { data: sessions } = await supabase
                .from('sessions')
                .select('id, student_id, payment_amount, payment_status, completion_percentage, actual_duration, partial_payment_note, created_at')
                .eq('offer_id', offerId);

            if (sessions && sessions.length > 0) {
                const studentIds = Array.from(new Set(sessions.map(s => s.student_id).filter(Boolean)));
                let studentMap = {};

                if (studentIds.length > 0) {
                    const { data: students } = await supabase
                        .from('students')
                        .select('id, full_name, email, phone')
                        .in('id', studentIds);

                    if (students) {
                        students.forEach(st => { studentMap[st.id] = st; });
                    }
                }

                studentList = sessions.map(sess => {
                    const st = studentMap[sess.student_id] || {};
                    const pAmount = Number(sess.payment_amount || offer.price || 0);
                    if (sess.payment_status === 'paid') {
                        totalEarningsCalculated += pAmount;
                    } else if (sess.payment_status === 'refunded') {
                        totalRefundedCalculated += pAmount;
                    }
                    return {
                        session_id: sess.id,
                        student_id: sess.student_id,
                        student_name: st.full_name || `طالب رقم ${sess.student_id}`,
                        student_email: st.email || '',
                        student_phone: st.phone || '',
                        payment_amount: pAmount,
                        payment_status: sess.payment_status || 'unknown',
                        note: sess.partial_payment_note || ''
                    };
                });
            } else {
                // إذا لم توجد جلسات، نبحث في غرفة الانتظار
                const { data: waiting } = await supabase
                    .from('waiting_room')
                    .select('student_id, created_at')
                    .eq('offer_id', offerId);

                if (waiting && waiting.length > 0) {
                    const studentIds = Array.from(new Set(waiting.map(w => w.student_id).filter(Boolean)));
                    if (studentIds.length > 0) {
                        const { data: students } = await supabase
                            .from('students')
                            .select('id, full_name, email, phone')
                            .in('id', studentIds);

                        studentList = (students || []).map(st => ({
                            student_id: st.id,
                            student_name: st.full_name || `طالب رقم ${st.id}`,
                            student_email: st.email || '',
                            student_phone: st.phone || '',
                            payment_amount: offer.price || 0,
                            payment_status: 'joined_waiting_room',
                            note: 'انضم لغرفة الانتظار/البث'
                        }));
                    }
                }
            }
        } catch (sessErr) {
            logger.error('archiveStreamLog: خطأ في جلب تفاصيل الطلاب والجلسات:', sessErr.message);
        }

        const expectedSeconds = offer.total_seconds || (offer.duration * 60) || (offer.duration_minutes * 60) || 3600;
        const actualLiveSeconds = completion.actual_seconds || offer.actual_duration || offer.actual_live_seconds || 0;
        const completionPct = Math.round(completion.completion_percentage || offer.completion_percentage || 0);

        // 5. بناء كائن الأرشيف النهائي الشامل
        const archiveRecord = {
            id: `stream_log_${Date.now()}_${offerId}`,
            offer_id: offerId,
            subject_name: offer.subject_name || offer.title || 'درس بدون عنوان',
            teacher_id: offer.teacher_id,
            teacher_name: teacherName,
            teacher_email: teacherEmail,
            teacher_phone: teacherPhone,
            price: Number(offer.price || 0),
            is_free: !!(offer.is_free || offer.price === 0),
            expected_duration_seconds: expectedSeconds,
            expected_duration_minutes: Math.round(expectedSeconds / 60),
            actual_live_seconds: actualLiveSeconds,
            actual_live_minutes: Math.round(actualLiveSeconds / 60),
            completion_percentage: completionPct,
            is_completed_80pct: completionPct >= 80,
            students_count: studentList.length,
            students_list: studentList,
            total_earned: totalEarningsCalculated,
            total_refunded: totalRefundedCalculated,
            stream_started_at: offer.stream_started_at || offer.created_at || null,
            stream_ended_at: new Date().toISOString(),
            archived_at: new Date().toISOString(),
            delete_reason: deleteReason,
            ended_by_user_id: endedByUserId,
            original_status: offer.status || 'unknown'
        };

        // 6. الحفظ في جدول archived_stream_logs أولاً
        try {
            await supabase.from('archived_stream_logs').insert(archiveRecord);
        } catch (dbErr) {
            logger.warn('archiveStreamLog: لم يتم الحفظ في جدول archived_stream_logs، سيتم الحفظ في platform_settings:', dbErr.message);
        }

        // 7. الحفظ أيضاً في platform_settings تحت المفتاح archived_stream_logs لضمان استمرارية الحفظ 100%
        try {
            const { data: settingData } = await supabase
                .from('platform_settings')
                .select('value')
                .eq('key', 'archived_stream_logs')
                .single();

            let logsList = (settingData && Array.isArray(settingData.value)) ? settingData.value : [];
            // تجنب تكرار إدخال نفس ID للدرس
            logsList = logsList.filter(item => String(item.offer_id) !== String(offerId));
            logsList.unshift(archiveRecord);
            if (logsList.length > 500) {
                logsList = logsList.slice(0, 500);
            }

            await supabase
                .from('platform_settings')
                .upsert({ key: 'archived_stream_logs', value: logsList });

            logger.info(`✅ تم أرشفة بيانات البث ${offerId} بنجاح في platform_settings`);
        } catch (psErr) {
            logger.error('archiveStreamLog: خطأ أثناء الحفظ في platform_settings:', psErr.message);
        }

        return archiveRecord;
    } catch (error) {
        logger.error('❌ خطأ كلي في archiveStreamLog:', error.message);
        return null;
    }
}

/**
 * نسخة من recordStreamEnd مع سبب الإنهاء
 */
async function recordStreamEndWithReason(offerId, teacherId, reason) {
    const serverTimestamp = new Date().toISOString();

    const { data: existing } = await supabase
        .from('stream_verification')
        .select('*')
        .eq('offer_id', offerId)
        .single();

    let updateData = {
        server_end_time: serverTimestamp,
        status: 'completed',
        end_reason: reason
    };

    if (existing?.server_start_time) {
        const totalSeconds = Math.floor((new Date(serverTimestamp) - new Date(existing.server_start_time)) / 1000);
        const pausedSeconds = existing.total_paused_seconds || 0;
        updateData.total_duration_seconds = totalSeconds;
        updateData.actual_live_seconds = Math.max(0, totalSeconds - pausedSeconds);
    }

    if (existing) {
        await supabase.from('stream_verification').update(updateData).eq('offer_id', offerId);
    } else {
        await supabase.from('stream_verification').insert({
            offer_id: offerId,
            teacher_id: teacherId,
            server_start_time: serverTimestamp,
            server_end_time: serverTimestamp,
            total_duration_seconds: 0,
            actual_live_seconds: 0,
            status: 'completed',
            end_reason: reason,
            created_at: serverTimestamp
        });
    }
}

/**
 * اكتشاف الدروس التي فات أوانها أو انتهت مدتها بدون بث
 * يُستدعى من cron كل دقيقة
 */
async function checkAndExpireOverdueOffers() {
    const now = new Date();

    // 0) التحقق من الدروس التي حان موعدها ولم يتم إرسال تنبيه للأستاذ عبر البريد بعد
    const { data: upcomingOffersForNotification } = await supabase
        .from('offers')
        .select('id, teacher_id, subject_name, offer_date, notification_sent')
        .eq('status', 'upcoming');

    for (const offer of (upcomingOffersForNotification || [])) {
        if (!offer.notification_sent && offer.offer_date) {
            const offerStart = new Date(offer.offer_date);
            if (now >= offerStart) {
                try {
                    const { data: teacher } = await supabase
                        .from('teachers')
                        .select('email, full_name')
                        .eq('id', offer.teacher_id)
                        .single();

                    if (teacher && teacher.email) {
                        await sendStreamStartReminderEmail(teacher.email, teacher.full_name || 'الأستاذ', offer.subject_name || 'درس مباشر', offer.id);
                    }

                    await supabase
                        .from('offers')
                        .update({ notification_sent: true })
                        .eq('id', offer.id);
                } catch (notifErr) {
                    console.error(`❌ خطأ في إرسال بريد تذكير موعد البث للدرس ${offer.id}:`, notifErr.message);
                }
            }
        }
    }

    // 1) دروس upcoming فات موعد بدئها + مدتها (أي لم تُبدأ أبداً)
    const { data: overdueOffers } = await supabase
        .from('offers')
        .select('id, offer_date, duration, subject_name')
        .eq('status', 'upcoming');

    for (const offer of (overdueOffers || [])) {
        const offerStart = new Date(offer.offer_date);
        const offerEnd = new Date(offerStart.getTime() + offer.duration * 60 * 1000);
        // إذا انقضى وقت الدرس الكامل ولم يُبدأ
        if (now > offerEnd) {
            await expireOverdueOffer(offer.id);
        }
    }

    // 2) دروس live/paused تجاوزت grace period (10 دقائق بعد انتهاء وقتها)
    const GRACE_MS = 10 * 60 * 1000;
    const { data: liveOffers } = await supabase
        .from('offers')
        .select('id, offer_date, duration, subject_name')
        .in('status', ['live', 'paused']);

    for (const offer of (liveOffers || [])) {
        const offerStart = new Date(offer.offer_date);
        const offerEnd = new Date(offerStart.getTime() + offer.duration * 60 * 1000);
        const graceEnd = new Date(offerEnd.getTime() + GRACE_MS);

        if (now >= graceEnd) {
            console.log(`⏰ انتهت فترة السماح للبث ${offer.id} (${offer.subject_name}) - يتم الإنهاء الإجباري`);
            await forceEndStream(offer.id, 'grace_timeout');
        }
    }
}

module.exports = {
    verifyJitsiRoom,
    recordStreamStart,
    recordStreamPause,
    recordStreamEnd,
    recordStreamEndWithReason,
    calculateActualStreamDuration,
    verifyStreamCompletion,
    processStreamPayments,
    getStreamVerification,
    expireOverdueOffer,
    forceEndStream,
    checkAndExpireOverdueOffers,
    archiveStreamLog,
    releasePlanSessionEscrow,
    releaseEarnedSoFar
};
