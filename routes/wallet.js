const logger = require('../utils/logger');
// ============================================================
// مسارات المحفظة - Wallet Routes (معدل بالكامل مع دعم الرصيد المعلق)
// ============================================================

const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const crypto = require('crypto');
const axios = require('axios');
const https = require('https');

const { supabase } = require('../config/database');
const { authenticate, checkBanned } = require('../middleware/auth');
const { getOne, insert, update } = require('../utils/helpers');
const { uploadToSupabase } = require('../utils/upload');
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit for receipt images
});

const defaultCcpSettings = {
    ccp_account_number: "0042539805",
    ccp_key: "05",
    ccp_rip: "00799999004253980505",
    baridimob_account: "004253980505",
    ccp_account_holder: "منصة ZoomDz التعليمية",
    baridimob_phone: "0555001122",
    instructions: "يرجى تحويل المبلغ بدقة عبر تطبيق BaridiMob أو مكتب البريد، ثم إرفاق صورة واضحة لوصل المعاملة ليتم تزويدك بالرصيد فور التأكد من التحويل."
};

// ✅ تعريف authorize محلياً
function authorize(roles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'غير مصرح به' });
        }
        if (roles.length > 0 && !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'صلاحيات غير كافية' });
        }
        next();
    };
}

// ============================================================
// ✅ بوابة الدفع سوفيز باي (SofizPay) — استقبال الدفع عبر CIB / EDAHABIA
// ============================================================
const SOFIZPAY_API_URL = process.env.SOFIZPAY_API_URL || 'https://sofizpay.com';
// Public Key (عنوان الحساب للاستقبال) — يوضع في معامل account عند إنشاء عملية الدفع
// ملاحظة مُتحقق منها: هذا هو العنوان الذي تصل إليه الأموال فعلياً (destination_account
// في فحص الطلبات الحقيقية مثل order 4103576109) — وليس المفتاح السري
const SOFIZPAY_ACCOUNT = process.env.SOFIZPAY_ACCOUNT || 'GCK4SGIRCVTT6PU5UW5SPDVOMF6H63YNHPHHWAN4CKQSNHRKYRPNOQYE';
// Secret Key — للخدمات التي تصرف من الحساب (يجب ألّا يُعرض أبداً في الواجهة)
const SOFIZPAY_SECRET_KEY = process.env.SOFIZPAY_SECRET_KEY || 'SBJMHDVWDMG5R6O3AUGOKAIOASNBYM6OF4TPLQFTM4JQEAIT2MXQ6GP7';
// فحص حالة المعاملة بعد الدفع — يُشتق تلقائياً حسب وضع الساند بوكس إن كان مفعّلاً
const SOFIZPAY_IS_SANDBOX = String(SOFIZPAY_API_URL).indexOf('/sandbox') !== -1;
const SOFIZPAY_TRANSACTION_CHECK_URL = process.env.SOFIZPAY_TRANSACTION_CHECK_URL
    || (SOFIZPAY_IS_SANDBOX
        ? 'https://sofizpay.com/sandbox/cib-transaction-check/'
        : 'https://sofizpay.com/cib-transaction-check/');

if (!SOFIZPAY_ACCOUNT) {
    console.warn('⚠️ SOFIZPAY_ACCOUNT غير مضبوط. تأكد من إعداد متغيرات البيئة الخاصة بـ SofizPay.');
}

console.log(`💳 SofizPay: وضع ${SOFIZPAY_IS_SANDBOX ? 'الساند بوكس (اختبار)' : 'الإنتاج'} — API: ${SOFIZPAY_API_URL}`);

// ============================================================
// ✅ التحقق المستقل عبر سجل Stellar العام (Horizon)
//    بوابة سوفيز باي لا تعرف أرقام طلباتها الجديدة أحياناً في واجهة
//    cib-transaction-check (تُعيد 404 لرقم طلب صحيح موجود في لوحة التاجر)،
//    لكن الحقيقة القاطعة تظهر في سجل Stellar: دفعة DZT إلى حساب المنصة
//    تحمل memo ينتهي بـ ZD-<رقم المعاملة>. السجل موقّع تلقائياً وغير قابل
//    للتزوير، ومصدر الأصل (المُصدِر) معلوم — فلا تُضاف الحصيلة إلا بproof.
// ============================================================
const STELLAR_HORIZON_URL = String(process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org').replace(/\/+$/, '');
// مُصدِر عملة DZT لدى SofizPay — أي أصل آخر لا يُعتمد مهما طابق اسمه
const SOFIZPAY_DZT_ISSUER = process.env.SOFIZPAY_DZT_ISSUER || 'GCAZI7YBLIDJWIVEL7ETNAZGPP3LC24NO6KAOBWZHUERXQ7M5BC52DLV';
// خزينة SofizPay التي ترسل الأموال فعلياً — تُسجَّل للأصلية فقط (لا شرط تحقق صارم حتى لا نعلّق عند تغيير محفظتهم)
const SOFIZPAY_FUNDING_ACCOUNT = process.env.SOFIZPAY_FUNDING_ACCOUNT || 'GBYCZO2R2QPLJ4DD2YMYSWSGTOVSFTHI3H22KZVK6DSHENLAJ5MBW4TY';

//  الدومين الأساسي لروابط الدفع (return_url و webhook_url):
//  PLATFORM_URL من البيئة يعلو كل شيء (لاختبار على نطاق آخر مثل نطاق Railway)،
//  وإلا نستعمل الدومين الرسمي zoomdz.com — لا نبني الروابط من طلب المتصفح
//  حتى لا تتجه روابط الويب هوك والعودة إلى نطاق مؤقت بالخطأ.
function getSofizPayBaseUrl() {
    return String(process.env.PLATFORM_URL || 'https://zoomdz.com').replace(/\/+$/, '');
}

// ============================================================
// إنشاء طلب دفع عبر بوابة سوفيز باي (SofizPay — CIB / EDAHABIA)
// ============================================================
async function createSofizPayCheckout(amount, returnUrl, transactionId, customer, baseUrl) {
    try {
        let finalAmount = Math.round(Number(amount));
        finalAmount = Math.max(finalAmount, 100); // الحد الأدنى للشحن 100 دج
        finalAmount = Math.min(finalAmount, 1000000);

        const safeName = String((customer && customer.name) || 'عميل ZoomDz')
            .replace(/[\u0000-\u001F\u007F<>&"']/g, '').trim().slice(0, 60) || 'عميل ZoomDz';

        const params = {
            account: SOFIZPAY_ACCOUNT,
            amount: finalAmount,
            full_name: safeName,
            phone: (customer && customer.phone) || '',
            email: (customer && customer.email) || '',
            return_url: returnUrl,
            webhook_url: `${baseUrl}/api/wallet/sofizpay-webhook`,
            language: 'ar',
            memo: ('ZD-' + transactionId).slice(0, 28),
            redirect: 'yes',
            keep_return_url: 'True'
        };

        let paymentUrl = null;
        let checkoutId = null;
        let apiRejected = false;   // رفض مؤكد من البوابة (4xx أو خطأ JSON صريح)
        let gatewayDown = false;   // عطل مؤقت (5xx أو انقطاع) ← يُعاد المحاولة

        // ✅ محاولتان مع انتظار قصير — لتمييز العطل المؤقت عن الرفض الفعلي
        for (let attempt = 1; attempt <= 2 && !paymentUrl && !apiRejected; attempt++) {
            if (attempt > 1) {
                await new Promise(resolve => setTimeout(resolve, 4000));
                gatewayDown = false;
            }
            try {
                const response = await axios.get(`${SOFIZPAY_API_URL}/make-cib-transaction/`, {
                    params,
                    timeout: 20000,
                    headers: { 'Accept': 'application/json' }
                });

                const data = response.data;
                if (data && typeof data === 'object' && !Array.isArray(data)) {
                    if (data.status === 'error' || (!data.payment_url && data.error)) {
                        apiRejected = true;
                        logger.error('❌ رفضت بوابة SofizPay إنشاء عملية الدفع:', data.message || data.error);
                    } else if (data.payment_url) {
                        paymentUrl = data.payment_url;
                        checkoutId = data.cib_transaction_id || data.transaction_id || null;
                    }
                }
                if (!paymentUrl && !apiRejected) {
                    // تحويل302 أو صفحة دفع مباشرة — نلتقط الرابط النهائي إن وجد
                    const headers = response.headers || {};
                    const finalUrl = headers.location ||
                        (response.request && response.request.res && response.request.res.responseUrl) ||
                        (typeof data === 'string' && data.indexOf('http') === 0 ? data : null);
                    if (finalUrl && String(finalUrl).indexOf('http') === 0) {
                        paymentUrl = String(finalUrl);
                    }
                }
            } catch (apiErr) {
                const status = apiErr.response && apiErr.response.status;
                if (status && status >= 500) {
                    gatewayDown = true;
                    logger.error(`⚠️ SofizPay: خطأ ${status} من البوابة أثناء المحاولة ${attempt}`);
                } else if (status) {
                    // رفض مؤكد (4xx) — لا داعي لإعادة المحاولة
                    apiRejected = true;
                    logger.error('❌ خطأ من بوابة SofizPay عند إنشاء الدفع:', status, apiErr.response.data);
                } else {
                    gatewayDown = true;
                    logger.error(`⚠️ SofizPay: تعذر الوصول للبوابة أثناء المحاولة ${attempt}:`, apiErr.message);
                }
            }
        }

        if (apiRejected) {
            return { success: false, error: 'رفضت بوابة الدفع إنشاء العملية، يرجى التحقق من المبلغ والمحاولة مرة أخرى' };
        }

        if (!paymentUrl && gatewayDown) {
            // فشل متكرر من البوابة — نميّز وضع الاختبار عن الإنتاج في الرسالة
            const unavailableMsg = SOFIZPAY_IS_SANDBOX
                ? 'بوابة الدفع التجريبية غير متاحة مؤقتاً، يرجى المحاولة بعد قليل'
                : 'تعذر إنشاء الدفع في البوابة الفعلية — تأكد من تفعيل حسابك في SofizPay للإنتاج (أوقف وضع الاختبار) أو حاول بعد قليل';
            return { success: false, error: unavailableMsg };
        }

        // ✅ احتياطي: نرسل المتصفح إلى رابط الإنشاء مباشرة (تقوم SofizPay بالتحويل إلى بوابة SATIM)
        if (!paymentUrl) {
            paymentUrl = `${SOFIZPAY_API_URL}/make-cib-transaction/?${new URLSearchParams(params).toString()}`;
        }

        return { success: true, payment_url: paymentUrl, checkout_id: checkoutId, amount: finalAmount };
    } catch (error) {
        logger.error('❌ خطأ في إنشاء رابط دفع SofizPay:', error.response?.data || error.message);
        return { success: false, error: 'تعذر الاتصال ببوابة سوفيز باي، يرجى المحاولة مرة أخرى' };
    }
}

async function checkSofizPayTransactionStatus(cibTransactionId) {
    try {
        // يدعم الصيغتين: cib-transaction-check/?order_number= (التوثيق الحالي) و sep24/transaction/check/?transaction_id= (القديم)
        const url = String(SOFIZPAY_TRANSACTION_CHECK_URL).indexOf('cib-transaction-check') !== -1
            ? `${SOFIZPAY_TRANSACTION_CHECK_URL}?order_number=${encodeURIComponent(cibTransactionId)}`
            : `${SOFIZPAY_TRANSACTION_CHECK_URL}?transaction_id=${encodeURIComponent(cibTransactionId)}`;
        const headers = { 'Accept': 'application/json' };
        if (SOFIZPAY_SECRET_KEY) {
            headers['Authorization'] = `Bearer ${SOFIZPAY_SECRET_KEY}`;
        }
        const response = await axios.get(url, { headers, timeout: 30000 });
        return response.data;
    } catch (error) {
        logger.error('❌ خطأ في فحص حالة المعاملة SofizPay:', error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}

// ✅ تفسير نتيجة فحص الحالة: 'success' | 'failed' | 'pending'
// (لا نثق بالحمولة أبداً — نتحقق مجدداً من البوابة وحساب الاستقبال قبل الإضافة)
function interpretSofizPayStatus(result) {
    if (!result || typeof result !== 'object') return 'pending';
    const st = (result.data && typeof result.data === 'object') ? Object.assign({}, result, result.data) : result;
    if (st.error && st.orderStatus == null && st.status == null && st.payment_status == null) {
        return 'pending'; // المعاملة غير موجودة بعد
    }
    if (st.destination_account && SOFIZPAY_ACCOUNT && String(st.destination_account) !== String(SOFIZPAY_ACCOUNT)) {
        logger.warn('⚠️ SofizPay: حساب الوصول لا يطابق حساب المنصة — تجاهل النتيجة');
        return 'pending';
    }
    const respCode = st.respCode != null ? String(st.respCode) : '';
    const orderStatus = st.orderStatus;
    if (respCode === '00' || orderStatus === 2 || st.status === 'success' || st.payment_status === 'success') {
        return 'success';
    }
    if (respCode === '05' || orderStatus === 6 || st.status === 'failed' || st.payment_status === 'failed') {
        return 'failed';
    }
    return 'pending';
}

// ✅ البحث في سجل Stellar عن دفعة حقيقية لهذه المعاملة:
//    memo ينتهي بـ ZD-<id>، أصل DZT من مُصدِر SofizPay، بمبلغ يغطي طلبنا،
//    ولم تصدر العملية نفسها قبل إنشاء الطلب.
async function findStellarPaymentForTransaction(transaction) {
    try {
        const suffix = 'ZD-' + transaction.id;
        const minAmount = parseFloat(transaction.amount) || 0;
        const createdAt = Date.parse(transaction.created_at || '') || 0;
        let cursor = '';

        for (let page = 0; page < 8; page++) {
            const url = `${STELLAR_HORIZON_URL}/accounts/${SOFIZPAY_ACCOUNT}/operations?limit=50&order=desc&join=transactions${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
            const response = await axios.get(url, { timeout: 15000 });
            const records = (response.data && response.data._embedded && response.data._embedded.records) || [];
            if (records.length === 0) break;

            for (const op of records) {
                if (!op || op.type !== 'payment') continue;
                if (op.to && op.to !== SOFIZPAY_ACCOUNT) continue;
                if (String(op.asset_code || '') !== 'DZT') continue;
                if (SOFIZPAY_DZT_ISSUER && op.asset_issuer && op.asset_issuer !== SOFIZPAY_DZT_ISSUER) continue;
                const memo = String((op.transaction && op.transaction.memo) || '').trim();
                if (!memo.endsWith(suffix)) continue;
                const opTime = Date.parse(op.created_at || '') || 0;
                // الدفعة يجب أن تأتي بعد إنشاء الطلب (دقيقتان هامش للتزامن)
                if (createdAt && opTime && opTime < createdAt - 120000) continue;
                if ((parseFloat(op.amount) || 0) < minAmount) continue;
                if (op.source_account && op.source_account !== SOFIZPAY_FUNDING_ACCOUNT) {
                    logger.warn(`⚠️ Stellar: دفعة المعاملة ${transaction.id} من محفظة غير متوقعة: ${op.source_account}`);
                }
                return {
                    found: true,
                    amount: parseFloat(op.amount) || 0,
                    memo: memo,
                    source: op.source_account || null,
                    created_at: op.created_at || null
                };
            }

            const oldest = records[records.length - 1];
            const oldestTime = Date.parse(oldest.created_at || '') || 0;
            // توقف عند وصولنا لما قبل يوم من إنشاء الطلب أو نهاية السجل
            if (createdAt && oldestTime && oldestTime < createdAt - 86400000) break;
            if (records.length < 50) break;
            if (!oldest.paging_token || oldest.paging_token === cursor) break;
            cursor = oldest.paging_token;
        }
    } catch (error) {
        logger.warn('⚠️ تعذر البحث في سجل Stellar للتحقق من الدفع:', error.message);
    }
    return { found: false };
}

// ✅ التحقق الشامل في معاملة شحن معلّقة: بوابة سوفيز باي بكل معرّفاتها
//    المتوفرة، ثم إثبات الدفع من سجل Stellar العام.
//    النتيجة: 'success' | 'failed' | 'pending'
async function verifyDepositTransaction(transaction, extraIds) {
    const candidates = [];
    const pushId = (value) => {
        const text = String(value || '').trim();
        if (text && candidates.indexOf(text) === -1) candidates.push(text);
    };
    (Array.isArray(extraIds) ? extraIds : []).forEach(pushId);
    pushId(transaction.cib_transaction_id);
    pushId(transaction.sofizpay_transaction_id);

    let checkFailed = false;
    for (const id of candidates) {
        const verdict = interpretSofizPayStatus(await checkSofizPayTransactionStatus(id));
        if (verdict === 'success') return 'success';
        if (verdict === 'failed') checkFailed = true;
    }

    // الدفعة الحقيقية في السجل العام تغلب أي خلل مؤقت في واجهة الفحص
    const stellar = await findStellarPaymentForTransaction(transaction);
    if (stellar.found) {
        logger.info(`✅ Stellar: إثبات دفع للمعاملة ${transaction.id} — ${stellar.amount} DZT (memo: ${stellar.memo})`);
        return 'success';
    }

    return checkFailed ? 'failed' : 'pending';
}

// ✅ إضافة المبلغ إلى المحفظة بشكل ذرّي (pending → completed) — لا تُضاف الحصيلة أبداً مرتين
async function creditWalletTransaction(transaction) {
    const { data: txUpdate, error: txError } = await supabase
        .from('wallet_transactions')
        .update({ status: 'completed' })
        .eq('id', transaction.id)
        .in('status', ['pending', 'cancelled'])
        .select();

    if (txError || !txUpdate || txUpdate.length === 0) {
        return false; // جاري المعالجة أو مكتملة بالفعل
    }

    const addAmount = parseFloat(transaction.amount) || 0;

    try {
        if (transaction.student_id) {
            const student = await getOne('students', 'id', transaction.student_id);
            if (!student) throw new Error('الطالب غير موجود');
            const newBalance = (parseInt(student.wallet_balance) || 0) + addAmount;
            await supabase.from('students').update({ wallet_balance: newBalance }).eq('id', transaction.student_id);
            await update('wallet_transactions', transaction.id, {
                description: `تم شحن الرصيد بنجاح بمبلغ ${addAmount} دج عبر سوفيز باي`
            });
            await insert('notifications', {
                user_id: student.id,
                user_type: 'student',
                title: '💰 تم شحن الرصيد',
                message: `تم شحن رصيدك بمبلغ ${addAmount} دج عبر بوابة سوفيز باي. رصيدك الحالي: ${newBalance} دج`,
                is_read: false,
                created_at: new Date().toISOString()
            });
            console.log(`✅ SofizPay: تم تأكيد الدفع وإضافة ${addAmount} دج للطالب ${student.full_name || student.id}`);
        } else if (transaction.teacher_id) {
            const teacher = await getOne('teachers', 'id', transaction.teacher_id);
            if (!teacher) throw new Error('الأستاذ غير موجود');
            const newBalance = (parseFloat(teacher.balance) || 0) + addAmount;
            await supabase.from('teachers').update({ balance: newBalance }).eq('id', transaction.teacher_id);
            await update('wallet_transactions', transaction.id, {
                description: `تم شحن الرصيد بنجاح بمبلغ ${addAmount} دج عبر سوفيز باي`
            });
            await insert('notifications', {
                user_id: teacher.id,
                user_type: 'teacher',
                title: '💰 تم شحن الرصيد',
                message: `تم شحن رصيدك بمبلغ ${addAmount} دج عبر بوابة سوفيز باي. رصيدك الحالي: ${newBalance} دج`,
                is_read: false,
                created_at: new Date().toISOString()
            });
            console.log(`✅ SofizPay: تم تأكيد الدفع وإضافة ${addAmount} دج للأستاذ ${teacher.full_name || teacher.id}`);
        } else {
            throw new Error('المعاملة لا تملك student_id أو teacher_id');
        }
        return true;
    } catch (creditErr) {
        // فشلت الإضافة ← نعيد الحالة السابقة ليتم المحاولة لاحقاً (كولباك أو ويب هوك)
        logger.error('❌ SofizPay: فشلت إضافة المبلغ — إعادة الحالة السابقة:', creditErr.message);
        try {
            const revertTo = (transaction.status === 'cancelled') ? 'cancelled' : 'pending';
            await supabase.from('wallet_transactions').update({ status: revertTo }).eq('id', transaction.id);
        } catch (e) {}
        return false;
    }
}

//  الرصيد الحالي لصاحب المعاملة (طالب أو أستاذ) — يُعاد مع تأكيد الدفع
//  لتحديث الواجهة فوراً بدل انتظار إعادة تحميل.
async function getWalletOwnerBalance(transaction) {
    try {
        if (transaction.student_id) {
            const student = await getOne('students', 'id', transaction.student_id);
            return student ? (parseInt(student.wallet_balance) || 0) : null;
        }
        if (transaction.teacher_id) {
            const teacher = await getOne('teachers', 'id', transaction.teacher_id);
            return teacher ? (parseFloat(teacher.balance) || 0) : null;
        }
    } catch (e) {}
    return null;
}

// ✅ تسوية معاملة شحن: تحقق شامل ثم إضافة ذرّية أو تعليم — تتشاركها
//    كل مسارات التأكيد (الكولباك، الويب هوك، فحص الحالة من الواجهة،
//    ومؤقت إعادة الفحص في الخادم). لا تُضاف الحصيلة مرتين مهما تكرر النداء.
async function settlePendingDeposit(transaction, extraIds) {
    const verdict = await verifyDepositTransaction(transaction, extraIds);

    if (verdict === 'success') {
        const credited = await creditWalletTransaction(transaction);
        if (credited) {
            return {
                status: 'success',
                amount: parseFloat(transaction.amount) || 0,
                balance: await getWalletOwnerBalance(transaction)
            };
        }
        // الإضافة تأجلت (سبق أن أكملها مسار آخر أو خطأ عابر) — نبقى pending
        // ويعيد المسار التالي فحص الحالة فيجد المعاملة completed
        return { status: 'pending' };
    }

    if (verdict === 'failed') {
        await update('wallet_transactions', transaction.id, {
            status: 'failed',
            description: 'فشلت عملية الدفع عبر بوابة سوفيز باي'
        });
        return { status: 'failed' };
    }

    return { status: 'pending' };
}

// ============================================================
// شحن الرصيد عبر بوابة سوفيز باي (SofizPay)
// ============================================================
router.post('/deposit', authenticate, authorize(['student']), [
    body('student_id').isInt().withMessage('معرف الطالب غير صالح'),
    body('amount').isInt({ min: 1, max: 1000000 }).withMessage('المبلغ غير صالح (الحد الأدنى يُحدَّد من إعدادات المنصة)')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { student_id, amount } = req.body;

        if (Number(req.user.userId) !== Number(student_id)) {
            return res.status(403).json({ success: false, error: 'غير مصرح لك بشحن رصيد هذا الحساب' });
        }

        const student = await getOne('students', 'id', student_id);
        if (!student) {
            return res.status(404).json({ success: false, error: 'الطالب غير موجود' });
        }

        // ✅ قراءة رسوم شحن الرصيد والحد الأدنى من إعدادات لوحة الإدارة
        let depositFeePct = 1, depositFeeFixed = 0, minDepositAmount = 100;
        try {
            const { data: revRow } = await supabase
                .from('platform_settings')
                .select('value')
                .eq('key', 'revenue_settings')
                .maybeSingle();
            if (revRow && revRow.value) {
                const pct = parseFloat(revRow.value.deposit_fee_percentage);
                const fixed = parseFloat(revRow.value.deposit_fee_fixed);
                const minDep = parseFloat(revRow.value.min_deposit_amount);
                if (!isNaN(pct)) depositFeePct = pct;
                if (!isNaN(fixed)) depositFeeFixed = fixed;
                if (!isNaN(minDep) && minDep >= 0) minDepositAmount = minDep;
            }
        } catch (e) { /* استخدام القيم الافتراضية */ }
        if (Number(amount) < minDepositAmount) {
            return res.status(400).json({ success: false, error: `الحد الأدنى لشحن الرصيد هو ${minDepositAmount} دج` });
        }

        const finalAmount = Math.round(Math.max(Number(amount), minDepositAmount));
        const paymentFee = Math.round(finalAmount * (depositFeePct / 100)) + depositFeeFixed;
        const totalCharged = finalAmount + paymentFee;

        const transaction = await insert('wallet_transactions', {
            student_id: student_id,
            amount: finalAmount,
            type: 'deposit',
            status: 'pending',
            description: `طلب شحن رصيد بقيمة ${finalAmount} دج (+ ${depositFeePct}% رسوم دفع: ${paymentFee} دج | الإجمالي المسدد: ${totalCharged} دج)`,
            created_at: new Date().toISOString()
        });

        if (!transaction || !transaction.id) {
            logger.error('❌ فشل إنشاء سجل المعاملة في قاعدة البيانات:', { student_id, amount: finalAmount });
            return res.status(500).json({ success: false, error: 'فشل إنشاء سجل المعاملة. يرجى المحاولة لاحقاً.' });
        }

        const baseUrl = getSofizPayBaseUrl();

        // ✅ العودة تمر عبر كولباك الخادم للتحقق من الحالة مجدداً ثم التحويل إلى لوحة التحكم
        const returnUrl = `${baseUrl}/api/wallet/sofizpay-callback?txn=${transaction.id}`;

        console.log('ℹ️ جاري إنشاء طلب دفع عبر سوفيز باي (SofizPay):', {
            transaction_id: transaction.id, amount: finalAmount, fee: paymentFee, totalCharged,
            base_url: baseUrl, return_url: returnUrl, webhook_url: `${baseUrl}/api/wallet/sofizpay-webhook`
        });

        const checkout = await createSofizPayCheckout(
            totalCharged,
            returnUrl,
            transaction.id,
            { name: student.full_name || student.name || student.username || '', phone: student.phone || '', email: student.email || '' },
            baseUrl
        );

        if (checkout.success && checkout.payment_url) {
            try {
                await update('wallet_transactions', transaction.id, {
                    sofizpay_transaction_id: checkout.checkout_id || null,
                    cib_transaction_id: checkout.checkout_id || null
                });
            } catch (updateError) {
                console.warn('⚠️ تنبيه: فشل تحديث أعمدة المعاملة في قاعدة البيانات:', updateError.message);
            }

            return res.json({
                success: true,
                checkout_url: checkout.payment_url,
                transaction_id: transaction.id,
                amount: finalAmount,
                fee: paymentFee,
                total_charged: totalCharged
            });
        } else {
            await update('wallet_transactions', transaction.id, {
                status: 'failed',
                description: `فشل إنشاء رابط الدفع: ${checkout.error}`
            });

            return res.status(400).json({
                success: false,
                error: checkout.error || 'حدث خطأ في عملية الدفع، يرجى المحاولة مرة أخرى'
            });
        }
    } catch (error) {
        logger.error('❌ خطأ في شحن الرصيد:', error.message);
        res.status(500).json({ success: false, error: 'حدث خطأ داخلي في الخادم' });
    }
});

// ============================================================
// شحن الرصيد للأستاذ عبر بوابة سوفيز باي (SofizPay)
// ============================================================
router.post('/deposit-teacher', authenticate, authorize(['teacher']), [
    body('teacher_id').isInt().withMessage('معرف الأستاذ غير صالح'),
    body('amount').isInt({ min: 1, max: 1000000 }).withMessage('المبلغ غير صالح (الحد الأدنى يُحدَّد من إعدادات المنصة)')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { teacher_id, amount } = req.body;

        if (Number(req.user.userId) !== Number(teacher_id)) {
            return res.status(403).json({ success: false, error: 'غير مصرح لك بشحن رصيد هذا الحساب' });
        }

        const teacher = await getOne('teachers', 'id', teacher_id);
        if (!teacher) {
            return res.status(404).json({ success: false, error: 'الأستاذ غير موجود' });
        }

        // ✅ قراءة رسوم شحن الرصيد والحد الأدنى من إعدادات لوحة الإدارة
        let depositFeePct = 1, depositFeeFixed = 0, minDepositAmount = 100;
        try {
            const { data: revRow } = await supabase
                .from('platform_settings')
                .select('value')
                .eq('key', 'revenue_settings')
                .maybeSingle();
            if (revRow && revRow.value) {
                const pct = parseFloat(revRow.value.deposit_fee_percentage);
                const fixed = parseFloat(revRow.value.deposit_fee_fixed);
                const minDep = parseFloat(revRow.value.min_deposit_amount);
                if (!isNaN(pct)) depositFeePct = pct;
                if (!isNaN(fixed)) depositFeeFixed = fixed;
                if (!isNaN(minDep) && minDep >= 0) minDepositAmount = minDep;
            }
        } catch (e) { /* استخدام القيم الافتراضية */ }
        if (Number(amount) < minDepositAmount) {
            return res.status(400).json({ success: false, error: `الحد الأدنى لشحن الرصيد هو ${minDepositAmount} دج` });
        }

        const finalAmount = Math.round(Math.max(Number(amount), minDepositAmount));
        const paymentFee = Math.round(finalAmount * (depositFeePct / 100)) + depositFeeFixed;
        const totalCharged = finalAmount + paymentFee;

        const transaction = await insert('wallet_transactions', {
            teacher_id: teacher_id,
            amount: finalAmount,
            type: 'deposit',
            status: 'pending',
            description: `طلب شحن رصيد بقيمة ${finalAmount} دج للأستاذ (+ ${depositFeePct}% رسوم دفع: ${paymentFee} دج | الإجمالي المسدد: ${totalCharged} دج)`,
            created_at: new Date().toISOString()
        });

        if (!transaction || !transaction.id) {
            logger.error('❌ فشل إنشاء سجل المعاملة في قاعدة البيانات للأستاذ:', { teacher_id, amount: finalAmount });
            return res.status(500).json({ success: false, error: 'فشل إنشاء سجل المعاملة. يرجى المحاولة لاحقاً.' });
        }

        const baseUrl = getSofizPayBaseUrl();

        // ✅ العودة تمر عبر كولباك الخادم للتحقق من الحالة مجدداً ثم التحويل إلى لوحة التحكم
        const returnUrl = `${baseUrl}/api/wallet/sofizpay-callback?txn=${transaction.id}`;

        console.log('ℹ️ جاري إنشاء طلب دفع عبر سوفيز باي للأستاذ:', {
            transaction_id: transaction.id, amount: finalAmount, fee: paymentFee, totalCharged,
            base_url: baseUrl, return_url: returnUrl, webhook_url: `${baseUrl}/api/wallet/sofizpay-webhook`
        });

        const checkout = await createSofizPayCheckout(
            totalCharged,
            returnUrl,
            transaction.id,
            { name: teacher.full_name || teacher.name || teacher.username || '', phone: teacher.phone || '', email: teacher.email || '' },
            baseUrl
        );

        if (checkout.success && checkout.payment_url) {
            try {
                await update('wallet_transactions', transaction.id, {
                    sofizpay_transaction_id: checkout.checkout_id || null,
                    cib_transaction_id: checkout.checkout_id || null
                });
            } catch (updateError) {
                console.warn('⚠️ تنبيه: فشل تحديث أعمدة المعاملة للأستاذ في قاعدة البيانات:', updateError.message);
            }

            return res.json({
                success: true,
                checkout_url: checkout.payment_url,
                transaction_id: transaction.id,
                amount: finalAmount,
                fee: paymentFee,
                total_charged: totalCharged
            });
        } else {
            await update('wallet_transactions', transaction.id, {
                status: 'failed',
                description: `فشل إنشاء رابط الدفع: ${checkout.error}`
            });

            return res.status(400).json({
                success: false,
                error: checkout.error || 'فشل إنشاء رابط الدفع'
            });
        }
    } catch (error) {
        logger.error('❌ خطأ في شحن رصيد الأستاذ:', error.message);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

// ============================================================
// 🏦 جلب معلومات حساب بريدي موب و CCP للمنصة (لإظهارها للمستخدم)
// ============================================================
router.get('/ccp-info', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('platform_settings')
            .select('value')
            .eq('key', 'ccp_settings')
            .maybeSingle();

        if (!error && data && data.value) {
            const settings = { ...defaultCcpSettings, ...data.value };
            // Ensure outdated mock account numbers are upgraded to 004253980505
            if (settings.ccp_account_number === '0022334455' || settings.ccp_rip === '00799999002233445545') {
                settings.ccp_account_number = defaultCcpSettings.ccp_account_number;
                settings.ccp_key = defaultCcpSettings.ccp_key;
                settings.ccp_rip = defaultCcpSettings.ccp_rip;
                settings.baridimob_account = defaultCcpSettings.baridimob_account;
            }
            if (!settings.baridimob_account) {
                settings.baridimob_account = defaultCcpSettings.baridimob_account;
            }
            return res.json({ 
                success: true, 
                settings: settings 
            });
        }
    } catch (e) {
        logger.warn('⚠️ تعذر جلب ccp_settings من قاعدة البيانات:', e.message);
    }
    return res.json({ success: true, settings: defaultCcpSettings });
});

// ============================================================
// 📝 تقديم طلب شحن يدوي عبر بريدي موب / CCP مع رفع وصل المعاملة
// ============================================================
router.post('/manual-deposit', authenticate, upload.single('receipt'), async (req, res) => {
    try {
        const userId = Number(req.user.userId);
        const userType = req.user.role === 'teacher' ? 'teacher' : 'student';
        const amount = parseFloat(req.body.amount);
        const notes = req.body.notes || '';
        let receiptUrl = req.body.receipt_url || '';

        // ✅ الحد الأدنى لشحن الرصيد من إعدادات لوحة الإدارة
        let minDepositAmount = 100;
        try {
            const { data: revRow } = await supabase
                .from('platform_settings')
                .select('value')
                .eq('key', 'revenue_settings')
                .maybeSingle();
            const minDep = parseFloat(revRow?.value?.min_deposit_amount);
            if (!isNaN(minDep) && minDep >= 0) minDepositAmount = minDep;
        } catch (e) { /* استخدام القيمة الافتراضية */ }
        if (!amount || isNaN(amount) || amount < minDepositAmount) {
            return res.status(400).json({ success: false, error: `المبلغ المطلوب شحنه يجب ألا يقل عن ${minDepositAmount} دج` });
        }

        // معالجة رفع صورة الوصل
        if (req.file) {
            try {
                const uploadRes = await uploadToSupabase(req.file, 'deposit_receipts');
                if (uploadRes && uploadRes.url) {
                    receiptUrl = uploadRes.url;
                }
            } catch (upErr) {
                logger.warn('⚠️ خطأ في uploadToSupabase للوصل:', upErr.message);
            }

            // تخزين احتياطي محلي في حال تعذر التخزين السحابي
            if (!receiptUrl && req.file.buffer) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const { v4: uuidv4 } = require('uuid');
                    const uploadDir = path.join(__dirname, '../public/uploads/deposit_receipts');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    const ext = path.extname(req.file.originalname) || '.jpg';
                    const filename = `${uuidv4()}${ext}`;
                    fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
                    receiptUrl = `/uploads/deposit_receipts/${filename}`;
                } catch (localErr) {
                    logger.error('❌ خطأ في الحفظ المحلي لوصل الدفع:', localErr.message);
                }
            }

            if (!receiptUrl) {
                return res.status(400).json({ success: false, error: 'فشل في حفظ صورة وصل الدفع. يرجى المحاولة مرة أخرى بصورة واضحة.' });
            }
        }

        if (!receiptUrl) {
            return res.status(400).json({ success: false, error: 'يرجى إرفاق صورة واضحة لوصل الدفع أو لقطة شاشة المعاملة' });
        }

        // جلب معلومات المستخدم لتوثيقها في الطلب
        let userName = '';
        let userEmail = '';
        let userPhone = '';

        if (userType === 'student') {
            const student = await getOne('students', 'id', userId);
            if (student) {
                userName = student.full_name || '';
                userEmail = student.email || '';
                userPhone = student.phone || '';
            }
        } else {
            const teacher = await getOne('teachers', 'id', userId);
            if (teacher) {
                userName = teacher.full_name || '';
                userEmail = teacher.email || '';
                userPhone = teacher.phone || '';
            }
        }

        // 1. تسجيل الطلب في جدول manual_deposit_requests
        let depositRequest = null;
        try {
            const { data, error } = await supabase
                .from('manual_deposit_requests')
                .insert({
                    user_id: userId,
                    user_type: userType,
                    user_name: userName,
                    user_email: userEmail,
                    user_phone: userPhone,
                    amount: amount,
                    receipt_url: receiptUrl,
                    notes: notes,
                    status: 'pending',
                    created_at: new Date().toISOString()
                })
                .select();

            if (!error && data && data.length > 0) {
                depositRequest = data[0];
            } else if (error) {
                logger.warn('⚠️ تنبيه: تعذر إدراج الطلب في manual_deposit_requests:', error.message);
            }
        } catch (dbErr) {
            logger.error('❌ خطأ في إدراج طلب الشحن اليدوي:', dbErr.message);
        }

        // 2. تسجيل معاملة معلقة في جدول wallet_transactions
        try {
            await insert('wallet_transactions', {
                [userType === 'teacher' ? 'teacher_id' : 'student_id']: userId,
                amount: amount,
                type: 'deposit_manual',
                status: 'pending',
                description: `طلب شحن يدوي (بريدي موب / CCP) بقيمة ${amount} دج - في انتظار مراجعة الإدارة`,
                created_at: new Date().toISOString()
            });
        } catch (txErr) {
            logger.warn('⚠️ تنبيه: تعذر إدراج المعاملة في wallet_transactions:', txErr.message);
        }

        // 3. إرسال إشعار للمستخدم
        try {
            const notifText = `تم استلام طلب شحن رصيدك عبر بريدي موب بمبلغ ${amount} دج وهو الآن قيد مراجعة الإدارة وسيتم إضافة الرصيد إلى حسابك فور التحقق.`;
            await insert('notifications', {
                user_id: userId,
                user_type: userType,
                title: 'تم استلام طلب الشحن بنجاح ⏳',
                message: notifText,
                content: notifText,
                type: 'wallet',
                is_read: false,
                created_at: new Date().toISOString()
            });
        } catch (notifErr) {}

        // 4. إشعار للمدير في admin_notifications
        try {
            await supabase.from('admin_notifications').insert({
                title: '📥 طلب شحن رصيد جديد (بريدي موب / CCP)',
                message: `قام ${userType === 'teacher' ? 'الأستاذ' : 'الطالب'} ${userName || `#${userId}`} بطلب شحن رصيد بمبلغ ${amount} دج مع إرفاق وصل التحويل.`,
                type: 'deposit_request',
                reference_id: depositRequest?.id || userId,
                is_read: false,
                created_at: new Date().toISOString()
            });
        } catch (adminNotifErr) {}

        return res.json({
            success: true,
            message: 'تم إرسال طلب الشحن بنجاح! سيتم التحقق من الوصل وإضافة الرصيد إلى حسابك قريباً.',
            request: depositRequest
        });
    } catch (error) {
        logger.error('❌ خطأ غير متوقع في معالجة طلب الشحن اليدوي:', error.message);
        return res.status(500).json({ success: false, error: 'حدث خطأ في الخادم أثناء إرسال طلب الشحن' });
    }
});

// ============================================================
// جلب معاملات الأستاذ
// ============================================================
router.get('/transactions-teacher/:teacher_id', authenticate, authorize(['teacher']), async (req, res) => {
    try {
        const teacher_id = parseInt(req.params.teacher_id);

        if (Number(req.user.userId) !== Number(teacher_id)) {
            return res.status(403).json({ success: false, error: 'غير مصرح لك' });
        }

        // 1. جلب معاملات الشحن للأستاذ
        const { data: transactions, error } = await supabase
            .from('wallet_transactions')
            .select('*')
            .eq('teacher_id', teacher_id)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('خطأ في جلب معاملات الأستاذ:', error.message);
            return res.status(500).json({ success: false, error: error.message });
        }

        // 2. جلب طلبات السحب للأستاذ
        const { data: withdrawals, error: withError } = await supabase
            .from('withdraw_requests')
            .select('*')
            .eq('teacher_id', teacher_id)
            .order('created_at', { ascending: false });

        let withdrawalTransactions = [];
        if (!withError && withdrawals) {
            withdrawalTransactions = withdrawals.map(w => ({
                id: w.id,
                amount: w.amount || 0,
                type: 'withdraw',
                status: w.status,
                description: `سحب رصيد | ${w.description || 'طلب سحب'}`,
                created_at: w.created_at
            }));
        }

        // دمج وترتيب المعاملات
        const allTransactions = [...(transactions || []), ...withdrawalTransactions];
        allTransactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const teacher = await getOne('teachers', 'id', teacher_id);

        res.json({
            success: true,
            balance: teacher ? (teacher.balance || 0) : 0,
            transactions: allTransactions
        });
    } catch (error) {
        logger.error('❌ خطأ في جلب معاملات الأستاذ:', error.message);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

// ============================================================
// جلب رصيد الطالب ومعاملاته (مع الرصيد المعلق)
// ============================================================
router.get('/balance/:student_id', authenticate, authorize(['student']), async (req, res) => {
    try {
        const student_id = parseInt(req.params.student_id);

        if (Number(req.user.userId) !== Number(student_id)) {
            return res.status(403).json({ success: false, error: 'غير مصرح لك' });
        }

        const student = await getOne('students', 'id', student_id);
        if (!student) {
            return res.status(404).json({ success: false, error: 'الطالب غير موجود' });
        }

        // ✅ جلب معاملات المحفظة
        const { data: transactions, error: transactionsError } = await supabase
            .from('wallet_transactions')
            .select('*')
            .eq('student_id', student_id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (transactionsError) {
            logger.error('خطأ في جلب المعاملات:', transactionsError.message);
        }

        // ✅ جلب الرصيد المعلق من الحجوزات
        const { data: pendingSessions, error: pendingError } = await supabase
            .from('sessions')
            .select('payment_amount, payment_status')
            .eq('student_id', student_id)
            .eq('payment_status', 'pending_stream');

        let totalPendingBalance = 0;
        if (!pendingError && pendingSessions) {
            totalPendingBalance = pendingSessions.reduce((sum, s) => sum + (s.payment_amount || 0), 0);
        }

        // ✅ جلب المبلغ المعلق في معاملات المحفظة
        const { data: pendingTransactions, error: pendingTransError } = await supabase
            .from('wallet_transactions')
            .select('amount')
            .eq('student_id', student_id)
            .eq('status', 'pending_stream');

        if (!pendingTransError && pendingTransactions) {
            const pendingTransAmount = pendingTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
            totalPendingBalance += pendingTransAmount;
        }

        res.json({
            success: true,
            balance: student.wallet_balance || 0,
            pending_balance: totalPendingBalance,
            total_balance: (student.wallet_balance || 0) - totalPendingBalance,
            transactions: transactions || [],
            gift_box_chances: student.gift_box_chances || 0,
            referral_balance: student.referral_balance || 0
        });
    } catch (error) {
        logger.error('❌ خطأ في جلب الرصيد:', error.message);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

// ============================================================
// ✅ كولباك سوفيز باي — العودة من بوابة الدفع بعد إتمام العملية
// ============================================================
router.get('/sofizpay-callback', async (req, res) => {
    try {
        const { txn } = req.query;
        const cibId = req.query.cib_transaction_id || req.query.order_number || req.query.transaction_id;

        const transaction = txn ? await getOne('wallet_transactions', 'id', txn) : null;
        const dash = (transaction && transaction.teacher_id) ? '/teacher-dashboard.html' : '/student-dashboard.html';

        if (!txn) {
            return res.redirect('/student-dashboard.html?status=invalid');
        }

        if (!transaction) {
            return res.redirect(`/student-dashboard.html?status=not_found`);
        }

        if (transaction.status === 'completed') {
            return res.redirect(`${dash}?status=completed`);
        }

        // ✅ إلغاء صريح من البوابة (payment_status=canceled) — نعلّم المعاملة ونعيد بحالة واضحة
        const gwStatus = String(req.query.payment_status || '').toLowerCase();
        if (gwStatus === 'canceled' || gwStatus === 'cancelled') {
            if (transaction.status === 'pending') {
                await update('wallet_transactions', transaction.id, {
                    status: 'cancelled',
                    description: 'أُلغيت عملية الدفع قبل إتمامها'
                });
            }
            return res.redirect(`${dash}?status=canceled`);
        }

        // ✅ نحفظ معرّفات البوابة القادمة في الرابط — من دونها لا يستطيع
        //    فحص الحالة لاحقاً ولا الويب هوك إيجاد المعاملة
        const queryCibId = String(req.query.cib_transaction_id || '').trim();
        const queryTxId = String(req.query.transaction_id || '').trim();
        const idPatch = {};
        if (queryCibId && !transaction.cib_transaction_id) idPatch.cib_transaction_id = queryCibId;
        if (queryTxId && !transaction.sofizpay_transaction_id) idPatch.sofizpay_transaction_id = queryTxId;
        if (Object.keys(idPatch).length > 0) {
            try {
                await update('wallet_transactions', transaction.id, idPatch);
                Object.assign(transaction, idPatch);
            } catch (e) {}
        }

        // ✅ التحقق الشامل (بوابة سوفيز باي بكل معرّفاتها ثم سجل Stellar العام)
        //    قبل إضافة أي مبلغ — لا نثق بالرابط وحده
        const settled = await settlePendingDeposit(transaction, [cibId, queryTxId]);

        res.redirect(`${dash}?status=${settled.status === 'success' ? 'paid' : settled.status}&txn=${transaction.id}`);
    } catch (error) {
        logger.error('❌ خطأ في معالجة كولباك SofizPay:', error.message);
        res.redirect(`/student-dashboard.html?status=error`);
    }
});

// ============================================================
// ✅ ويب هوك سوفيز باي — إشعار فوري من البوابة عند تغير حالة الدفع
// (لا نثق بالحمولة: نفحص الحالة مجدداً من البوابة نفسها قبل الإضافة)
// ============================================================
router.post('/sofizpay-webhook', async (req, res) => {
    try {
        const event = (req.body && typeof req.body === 'object') ? req.body : {};
        const paymentStatus = event.payment_status || event.status || '';
        const cibId = event.cib_transaction_id || event.order_number || '';
        const sofizTxId = event.transaction_id || '';

        console.log(`📥 ويب هوك SofizPay: status=${paymentStatus} cib=${cibId || '-'}`);

        // البحث عن المعاملة لدينا برقم البوابة أو رقم الطلب
        let transaction = null;
        try {
            if (cibId) {
                const { data } = await supabase.from('wallet_transactions')
                    .select('*').eq('cib_transaction_id', cibId).maybeSingle();
                if (data) transaction = data;
            }
            if (!transaction && sofizTxId) {
                const { data } = await supabase.from('wallet_transactions')
                    .select('*').eq('sofizpay_transaction_id', sofizTxId).maybeSingle();
                if (data) transaction = data;
            }
        } catch (e) {}

        if (!transaction) {
            // معرّفات غير مطابقة (قد لا نخزّنها أبداً عند الإنشاء) ← نستخرج
            // رقم المعاملة من memo الذي أرسلناه نحن أنفسنا: ZD-<id>
            const memoText = String(event.memo || event.transaction_memo || (event.data && event.data.memo) || '').trim();
            const memoMatch = /ZD-(\d+)$/.exec(memoText);
            if (memoMatch) {
                try { transaction = await getOne('wallet_transactions', 'id', memoMatch[1]); } catch (e) {}
            }
        }

        if (!transaction) {
            // لا توجد معاملة مطابقة — نعيد200 حتى لا تعيد البوابة الإرسال بلا نهاية
            return res.json({ success: true, message: 'ignored: no matching transaction' });
        }

        if (transaction.status === 'completed') {
            return res.json({ success: true, message: 'already completed' });
        }

        // ✅ نحفظ معرّفات البوابة من الحدث إن كانت معاملتنا بلا معرّفات
        const idPatch = {};
        if (cibId && !transaction.cib_transaction_id) idPatch.cib_transaction_id = cibId;
        if (sofizTxId && !transaction.sofizpay_transaction_id) idPatch.sofizpay_transaction_id = sofizTxId;
        if (Object.keys(idPatch).length > 0) {
            try {
                await update('wallet_transactions', transaction.id, idPatch);
                Object.assign(transaction, idPatch);
            } catch (e) {}
        }

        // ✅ تحقق شامل (البوابة ثم سجل Stellar العام) — لا نضيف الحصيلة
        //    إلا بproof حقيقي من مصدر لا يُزوى حتى لو قيل لنا success
        const settled = await settlePendingDeposit(transaction, [cibId, sofizTxId]);

        res.json({ success: true, status: settled.status });
    } catch (error) {
        logger.error('❌ خطأ في معالجة ويب هوك SofizPay:', error.message);
        res.status(500).json({ success: false, error: 'خطأ داخلي' });
    }
});

// ============================================================
// ✅ فحص حالة شحن الرصيد — تستخدمه الواجهة لإعادة المحاولة كل
//    10 ثوانٍ لمدة دقيقة بعد العودة من البوابة: تأخير تأكيد
//    البنك طبيعي، وعند التأكيد تُضاف الحصة ويُعاد الرصيد المحدّث.
// ============================================================
router.get('/deposit/status/:transaction_id', authenticate, async (req, res) => {
    try {
        const transaction = await getOne('wallet_transactions', 'id', req.params.transaction_id);
        if (!transaction) {
            return res.status(404).json({ success: false, error: 'المعاملة غير موجودة' });
        }

        const isOwner = (transaction.student_id && Number(transaction.student_id) === Number(req.user.userId))
            || (transaction.teacher_id && Number(transaction.teacher_id) === Number(req.user.userId));
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'غير مصرح لك بعرض هذه المعاملة' });
        }

        if (transaction.status === 'completed') {
            return res.json({ success: true, status: 'success', amount: parseFloat(transaction.amount) || 0, balance: await getWalletOwnerBalance(transaction) });
        }
        if (transaction.status === 'failed' || transaction.status === 'cancelled') {
            return res.json({ success: true, status: transaction.status === 'cancelled' ? 'canceled' : 'failed' });
        }

        // pending → تحقق شامل (البوابة بجميع معرّفاتها ثم سجل Stellar العام)
        // ثم إضافة ذرّية — تعيد {status, amount, balance} للواجهة
        const settled = await settlePendingDeposit(transaction, []);
        res.json({
            success: true,
            status: settled.status,
            amount: settled.amount,
            balance: settled.balance
        });
    } catch (error) {
        logger.error('❌ خطأ في فحص حالة شحن الرصيد:', error.message);
        res.status(500).json({ success: false, error: 'خطأ داخلي' });
    }
});

// ============================================================
// نجاح الدفع (قديم - نحتفظ به للتوافق)
// ============================================================
router.get('/deposit/success/:transaction_id', [
    query('token').notEmpty().withMessage('رمز التحقق مطلوب')
], async (req, res) => {
    const { transaction_id } = req.params;
    const { token } = req.query;

    try {
        const expectedToken = crypto.createHash('sha256')
            .update(`${transaction_id}-${process.env.JWT_SECRET || 'zoomdz_webhook_secret_2024'}`)
            .digest('hex');
        
        if (token !== expectedToken) {
            return res.status(403).send(renderErrorPage('طلب غير مصرح به', 'رمز التحقق غير صحيح'));
        }

        const transaction = await getOne('wallet_transactions', 'id', transaction_id);
        if (!transaction) {
            return res.status(404).send(renderErrorPage('خطأ', 'المعاملة غير موجودة'));
        }

        if (transaction.status === 'completed') {
            return res.send(renderSuccessPage('تمت المعاملة', 'تم شحن رصيدك بالفعل', '', 'العودة للوحة', '/student-dashboard.html'));
        }

        if (transaction.status !== 'pending') {
            return res.status(400).send(renderErrorPage('خطأ', 'هذه المعاملة لا يمكن معالجتها'));
        }

        // Atomic update to prevent race conditions
        const { data: txUpdate, error: txError } = await supabase
            .from('wallet_transactions')
            .update({ status: 'completed' })
            .eq('id', transaction.id)
            .eq('status', 'pending')
            .select();
            
        if (txError || !txUpdate || txUpdate.length === 0) {
            return res.send(renderSuccessPage('تمت المعاملة', 'تم شحن رصيدك بالفعل', '', 'العودة للوحة', '/student-dashboard.html'));
        }

        const amount = transaction.amount;
        
        const student = await getOne('students', 'id', transaction.student_id);
        if (!student) {
            return res.status(404).send(renderErrorPage('خطأ', 'الطالب غير موجود'));
        }

        const currentBalance = parseInt(student.wallet_balance) || 0;
        const addAmount = parseInt(amount) || 0;
        const newBalance = currentBalance + addAmount;
        
        await supabase
            .from('students')
            .update({ wallet_balance: newBalance })
            .eq('id', transaction.student_id);

        await update('wallet_transactions', transaction_id, {
            status: 'completed',
            description: `تم شحن الرصيد بنجاح بمبلغ ${amount} دج`
        });

        await insert('notifications', {
            user_id: student.id,
            user_type: 'student',
            title: '💰 تم شحن الرصيد',
            message: `تم شحن رصيدك بمبلغ ${amount} دج. رصيدك الحالي: ${newBalance} دج`,
            is_read: false,
            created_at: new Date().toISOString()
        });

        res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>تم شحن الرصيد</title>
            <style>
                body{font-family:Cairo;background:#0f5cbf;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;direction:rtl}
                .card{background:white;padding:40px;border-radius:20px;text-align:center;max-width:500px;box-shadow:0 10px 40px rgba(0,0,0,0.2)}
                h1{color:#10b981;font-size:2.5rem}
                .amount{font-size:2rem;font-weight:900;color:#0f5cbf;margin:10px 0}
                .btn{background:#0f5cbf;color:white;padding:12px 30px;border-radius:30px;text-decoration:none;display:inline-block;margin-top:20px}
                .btn:hover{background:#0a4a9a}
                .sub{color:#666;margin-top:10px}
            </style>
            </head>
            <body>
            <div class="card">
                <h1>✅ تم الشحن بنجاح!</h1>
                <div class="amount">+${amount} دج</div>
                <p style="font-size:1.1rem;">تم إضافة المبلغ إلى رصيدك</p>
                <p class="sub">الرصيد الجديد: ${newBalance} دج</p>
                <a href="/student-dashboard.html" class="btn">العودة للوحة</a>
            </div>
            </body>
            </html>
        `);
    } catch (error) {
        logger.error('❌ خطأ في معالجة نجاح الدفع:', error.message);
        res.status(500).send(renderErrorPage('حدث خطأ', 'حدث خطأ أثناء معالجة الدفع. يرجى التواصل مع الدعم الفني.', '/student-dashboard.html'));
    }
});

// ============================================================
// فشل الدفع (قديم - نحتفظ به للتوافق)
// ============================================================
router.get('/deposit/failure/:transaction_id', async (req, res) => {
    const { transaction_id } = req.params;

    try {
        await update('wallet_transactions', transaction_id, {
            status: 'failed',
            description: 'فشلت عملية الدفع'
        });

        res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>فشل الشحن</title>
            <style>
                body{font-family:Cairo;background:#0f5cbf;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;direction:rtl}
                .card{background:white;padding:40px;border-radius:20px;text-align:center;max-width:500px;box-shadow:0 10px 40px rgba(0,0,0,0.2)}
                h1{color:#f59e0b}
                .btn{background:#0f5cbf;color:white;padding:12px 30px;border-radius:30px;text-decoration:none;display:inline-block;margin-top:20px}
                .btn:hover{background:#0a4a9a}
            </style>
            </head>
            <body>
            <div class="card">
                <h1>❌ فشل الشحن</h1>
                <p>حدث خطأ أثناء عملية الدفع. لم يتم خصم أي مبلغ من حسابك.</p>
                <a href="/student-dashboard.html" class="btn">المحاولة مرة أخرى</a>
            </div>
            </body>
            </html>
        `);
    } catch (error) {
        logger.error('❌ خطأ في معالجة فشل الدفع:', error.message);
        res.redirect('/student-dashboard.html');
    }
});

// ============================================================
// جلب سجل معاملات الطالب
// ============================================================
router.get('/transactions/:student_id', authenticate, authorize(['student']), async (req, res) => {
    try {
        const student_id = parseInt(req.params.student_id);

        if (Number(req.user.userId) !== Number(student_id)) {
            return res.status(403).json({ success: false, error: 'غير مصرح لك' });
        }

        const { data: transactions, error } = await supabase
            .from('wallet_transactions')
            .select('*')
            .eq('student_id', student_id)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('خطأ في جلب المعاملات:', error.message);
            return res.status(500).json({ success: false, error: error.message });
        }

        // ✅ إضافة معلومات الرصيد المعلق من الحجوزات
        const { data: pendingSessions, error: pendingError } = await supabase
            .from('sessions')
            .select('id, payment_amount, created_at, offers:offer_id(subject_name)')
            .eq('student_id', student_id)
            .eq('payment_status', 'pending_stream');

        let pendingTransactions = [];
        if (!pendingError && pendingSessions) {
            pendingTransactions = pendingSessions.map(s => ({
                id: s.id,
                amount: s.payment_amount || 0,
                type: 'withdraw_pending',
                status: 'pending_stream',
                description: `حجز حصة "${s.offers?.subject_name || 'غير معروف'}" (في انتظار البث)`,
                created_at: s.created_at
            }));
        }

        // ✅ دمج المعاملات
        const allTransactions = [...(transactions || []), ...pendingTransactions];
        allTransactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json({
            success: true,
            transactions: allTransactions,
            pending_count: pendingTransactions.length
        });
    } catch (error) {
        logger.error('❌ خطأ في جلب المعاملات:', error.message);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

// ============================================================
// دوال درس الصفحات
// ============================================================
function renderSuccessPage(title, message, subMessage, buttonText, buttonLink) {
    return `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>${title}</title>
        <style>
            body{font-family:Cairo;background:#0f5cbf;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;direction:rtl}
            .card{background:white;padding:40px;border-radius:20px;text-align:center;max-width:500px;box-shadow:0 10px 40px rgba(0,0,0,0.2)}
            h1{color:#10b981;font-size:2.5rem}
            .btn{background:#0f5cbf;color:white;padding:12px 30px;border-radius:30px;text-decoration:none;display:inline-block;margin-top:20px}
            .btn:hover{background:#0a4a9a}
            .sub{color:#666;margin-top:10px}
        </style>
        </head>
        <body>
        <div class="card">
            <h1>✅ ${title}</h1>
            <p style="font-size:1.2rem;">${message}</p>
            <p class="sub">${subMessage}</p>
            <a href="${buttonLink || '/'}" class="btn">${buttonText || 'العودة للرئيسية'}</a>
        </div>
        </body>
        </html>
    `;
}

function renderErrorPage(title, message, buttonLink) {
    return `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>خطأ</title>
        <style>
            body{font-family:Cairo;background:#0f5cbf;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;direction:rtl}
            .card{background:white;padding:40px;border-radius:20px;text-align:center;max-width:500px;box-shadow:0 10px 40px rgba(0,0,0,0.2)}
            h1{color:#dc2626}
            .btn{background:#0f5cbf;color:white;padding:12px 30px;border-radius:30px;text-decoration:none;display:inline-block;margin-top:20px}
        </style>
        </head>
        <body>
        <div class="card">
            <h1>❌ ${title}</h1>
            <p>${message}</p>
            <a href="${buttonLink || '/'}" class="btn">العودة للرئيسية</a>
        </div>
        </body>
        </html>
    `;
}

module.exports = router;
//  تُصدَّر للـcron في server.js: إعادة فحص الشحنات المعلّقة دورياً
module.exports.settlePendingDeposit = settlePendingDeposit;
