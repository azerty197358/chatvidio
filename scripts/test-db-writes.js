// ============================================================================
//  اختبار: كم رحلة إلى قاعدة البيانات ندفع عند عمود ناقص؟
//  قبل: 2 إلى 10 رحلات لكل طلب، إلى الأبد.  بعد: واحدة لكل جدول ثم واحدة.
// ============================================================================
const fs = require('fs');
const path = require('path');
const Module = require('module');

const MISSING = process.env.MISSING_COLUMN || 'ai_tokens';
let TRIPS = 0;

function fakeSupabase() {
    function chain(kind) {
        let row = null;
        const api = {
            insert(r) { TRIPS++; row = r; return api; },
            update(r) { TRIPS++; row = r; return api; },
            select() { return api; },
            eq() { return api; },
            single() { return api; },
            then(resolve, reject) {
                const payload = row || {};
                const has = Object.keys(payload).indexOf(MISSING) !== -1;
                const out = has
                    ? { data: null, error: { message: "Could not find the '" + MISSING + "' column of 'public' in the schema cache" } }
                    : { data: [{ id: 1, ...payload }], error: null };
                return Promise.resolve(out).then(resolve, reject);
            }
        };
        return api;
    }
    return { from() { return chain(); } };
}

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

// خطّاف التحميل: نمنع أي وحدة خارجية ونعطي mocks
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '@supabase/supabase-js') {
        return { createClient() { return { from: fakeSupabase() }; } };
    }
    if (/config[\\/]database$/.test(request)) return { supabase: fakeSupabase() };
    if (/[\\/]logger$/.test(request)) return noopLogger;
    if (request === 'xss') return function (s) { return s; };
    if (request === 'dotenv') return { config() {} };
    return originalLoad.apply(this, arguments);
};

const helpers = require(path.join(__dirname, '..', 'utils', 'helpers.js'));
Module._load = originalLoad;

let bad = 0;
function ck(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) bad++;
    console.log((ok ? '  ok   ' : '  FAIL ') + name + '  got=' + JSON.stringify(actual) + (ok ? '' : ' want=' + JSON.stringify(expected)));
}

(async function () {
    const row = () => ({ full_name: 'سعيد', email: 'a@b.c', [MISSING]: 0 });

    TRIPS = 0;
    const first = await helpers.insert('students', row());
    const firstTrips = TRIPS;

    TRIPS = 0;
    const second = await helpers.insert('students', row());
    const secondTrips = TRIPS;

    TRIPS = 0;
    for (let i = 0; i < 50; i++) await helpers.insert('students', row());
    const after50 = TRIPS;

    // جدول آخر يبدأ من الصفر - لا نتشارك معه الذاكرة
    TRIPS = 0;
    await helpers.insert('teachers', row());
    const otherTable = TRIPS;

    console.log('  first request   trips=' + firstTrips);
    console.log('  second request  trips=' + secondTrips);
    console.log('  next 50         trips=' + after50 + '  (before: 100 to 500)');
    console.log('  a fresh table   trips=' + otherTable);
    console.log('');

    ck('the first request never exceeds 4 trips', firstTrips <= 4, true);
    ck('every later request is a single trip', secondTrips, 1);
    ck('50 more requests cost 50 trips, not 200 or more', after50, 50);
    ck('a different table starts fresh', otherTable, firstTrips);
    ck('the missing column was stripped before sending', second && second[MISSING], undefined);
    ck('the rest of the row survived', second && second.full_name, 'سعيد');
    ck('the server remembers what it learned',
        Array.from(helpers.missingColumnsFor('students') || []).indexOf(MISSING) !== -1, true);

    // التحديث يشارك نفس الذاكرة فلا يدفع ثمناً جديداً
    TRIPS = 0;
    await helpers.update('students', 1, { [MISSING]: 3, wallet_balance: 10 });
    ck('update on a known table is a single trip', TRIPS, 1);

    console.log('');
    console.log('  before : 2 to 10 trips on every single request, forever');
    console.log('  after  : one trip on the first, one trip on every one after');
    console.log('');
    console.log(bad ? 'PROBLEMS: ' + bad : 'ALL GOOD');
    process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });