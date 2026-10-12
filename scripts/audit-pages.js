// ============================================================================
//  حارس صلب: كل كتلة <script> داخل كل صفحة ل��تمرّ على محلّل حقيقي.
//  الخطأ الذي أوقف الموقع كان كلمة "async" منفصلة، فسقطت ٥٠٨ كيلوبايت
//  من السكربت كلها بسبب خطأ نحوي واحد. هذا الحارس يمنع تكراره.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGES = ['student-dashboard.html', 'teacher-dashboard.html', 'ai-tutor.html', 'index.html'];
let bad = 0;

function report(ok, label, detail) {
    console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '  -> ' + detail : ''));
    if (!ok) bad++;
}

function auditPage(page) {
    const file = path.join(ROOT, 'public', page);
    if (!fs.existsSync(file)) { report(false, page + ': file exists'); return; }
    const t = fs.readFileSync(file, 'utf8');

    // 1) a raw "</script>" inside a block would truncate it in the browser
    const blocks = [];
    const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(t))) blocks.push({ attrs: m[1] || '', code: m[2] });

    report(true, page + ': ' + blocks.length + ' inline blocks');

    blocks.forEach(function (b, i) {
        const label = page + ' block ' + (i + 1) + ' (' + b.code.length + ' chars)';
        if (/type\s*=\s*["'](text|application)\/(x-)?(java|ecma)script["']/i.test(b.attrs)
            || /ld\+json/i.test(b.attrs)) {
            report(true, label + ' [skipped: ' + (b.attrs.trim() || 'no type') + ']');
            return;
        }
        try {
            new vm.Script(b.code, { filename: page + '#block' + (i + 1) });
            report(true, label);
        } catch (e) {
            const loc = (String(e.stack || '').match(/block\d+:(\d+)/) || [])[1];
            let line = loc ? b.code.split('\n')[Number(loc) - 1] : '';
            report(false, label, e.message + (line ? '  >>> ' + line.trim().slice(0, 120) : ''));
        }
    });

    // 2) a bare "async" sitting on its own line is the exact shape of the bug
    t.split(/\r?\n/).forEach(function (l, i) {
        if (/^\s*async\s+$/.test(l)) report(false, page + ' L' + (i + 1) + ': a dangling "async"', l.trim());
    });

    // 3) no page may print an error to the console
    report(!/Platform Error caught:/.test(t) && !/Platform Error:/.test(t),
        page + ': the page handler prints nothing');

    // 4) where an error toast exists it must go through the guard
    if (/function showToast\(message, type/.test(t)) {
        report(/window\.onerror = function\(\)\s*\{\s*return true;\s*\};/.test(t), page + ': window.onerror is silent');
        report(/window\.onunhandledrejection = function\(\)\s*\{\s*return true;\s*\};/.test(t), page + ': rejections are silent');
        report(/shown = ZOOMY_ERROR_TEXT;/.test(t), page + ': error toasts show one calm line');
    }
}

console.log('=== script blocks ===');
PAGES.forEach(auditPage);

console.log('\n=== shared modules ===');
[
    'public/js/image-compressor.js', 'public/js/student-groups.js', 'public/js/student-nav-search.js',
    'public/js/packages-student.js', 'public/js/packages-teacher.js', 'public/js/site-branding.js',
    'utils/upload.js', 'utils/cache.js'
].forEach(function (f) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) { report(false, f + ' exists'); return; }
    try { new vm.Script(fs.readFileSync(p, 'utf8'), { filename: f }); report(true, f); }
    catch (e) { report(false, f, e.message); }
});

console.log('\n=== the compressor must exist exactly once ===');
{
    const mod = path.join(ROOT, 'public', 'js', 'image-compressor.js');
    const src = fs.readFileSync(mod, 'utf8');
    const defs = (src.match(/window\.compressImageFile\s*=/g) || []).length;
    report(defs === 1, 'one definition in image-compressor.js (' + defs + ')');

    let total = defs;
    PAGES.forEach(function (page) {
        const p = path.join(ROOT, 'public', page);
        if (!fs.existsSync(p)) return;
        const n = (fs.readFileSync(p, 'utf8').match(/function\s+compressImageFile\s*\(/g) || []).length;
        if (n) total += n;
        report(n === 0, page + ': no private copy of compressImageFile (' + n + ')');
    });
    report(total === 1, 'the whole project has one implementation (' + total + ')');

    // لا صفحة تحمّل الوحدة مرتين
    PAGES.forEach(function (page) {
        const p = path.join(ROOT, 'public', page);
        if (!fs.existsSync(p)) return;
        const n = (fs.readFileSync(p, 'utf8').match(/image-compressor\.js/g) || []).length;
        report(n <= 1, page + ': image-compressor.js loaded once (' + n + ')');
    });

    // الضمانات التي منعت تعليق الصفحة عند ملف تالف
    [['reads the dimensions from the header', /function readImageSize\(file\)/],
        ['decodes with a resize hint', /resizeWidth\s*=/],
        ['every decode has a timeout', /withTimeout\(decodeScaled/],
        ['returns the original on failure', /catch \(e\) \{\s*return file;/],
        ['retries gateway failures', /GATEWAY_STATUSES/],
        ['never retries a GET', /=== 'POST' &&/]
    ].forEach(function (p) { report(p[1].test(src), 'compressor: ' + p[0]); });
}

console.log('\n=== free AI points must stay at zero ===');
{
    const SERVER_FILES = ['server.js', 'routes/auth.js', 'routes/student.js',
        'routes/teacher.js', 'routes/admin.js', 'utils/ai-points.js'];

    SERVER_FILES.forEach(function (rel) {
        const p = path.join(ROOT, rel);
        if (!fs.existsSync(p)) return;
        const src = fs.readFileSync(p, 'utf8');
        src.split(/\r?\n/).forEach(function (l, i) {
            // أي رقم 5 بجانب أي اسم من أسماء النقاط المجانية خطأ
            if (/(free_ai_points|ai_tokens|STARTING_AI_TOKENS|DEFAULT_FREE_AI_POINTS)[^\n]{0,30}\b5\b/.test(l)
                || /\b5\b[^\n]{0,30}(free_ai_points|ai_tokens|STARTING_AI_TOKENS)/.test(l)) {
                report(false, rel + ' L' + (i + 1) + ': a free allowance of 5', l.trim().slice(0, 90));
            }
        });
    });

    const mod = fs.readFileSync(path.join(ROOT, 'utils', 'ai-points.js'), 'utf8');
    report(/STARTING_AI_TOKENS = 0;/.test(mod), 'a new account starts at 0');
    report(/DEFAULT_FREE_AI_POINTS = 0;/.test(mod), 'the free daily allowance defaults to 0');

    // المنح اليومي يضاف ولا يُمحى: لا يوجد مسار يرجع رصيداً أقل
    const daily = mod.substring(mod.indexOf('function dailyGrant'), mod.indexOf('module.exports'));
    report(!/tokens:\s*current\s*-/.test(daily) && !/Math\.max\(0,\s*current/.test(daily),
        'the daily grant can never lower the balance');
    report(/if \(granted <= 0\) return \{ tokens: current, granted: 0 \};/.test(daily),
        'a zero allowance leaves the balance untouched');

    // ولا يستبدل الرصيد في الخادم
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const resets = (srv.match(/dailyGrant\(/g) || []).length;
    report(resets === 3, 'all three daily resets use dailyGrant (' + resets + ')');
    report(!/ai_tokens:\s*dailyFreeTokens/.test(srv), 'no reset writes the free amount over the balance');
    report(!/ai_tokens:\s*default(Student|Teacher)AiPoints/.test(srv), 'no /me reset overwrites the balance');

    // الواجهة لا تَعِد بتجديد مجاني
    const tutor = fs.readFileSync(path.join(ROOT, 'public', 'ai-tutor.html'), 'utf8');
    report(tutor.indexOf('تجدد النقاط المجانية') === -1, 'ai-tutor no longer promises a free daily refill');
}

console.log('\n=== the connection banner must stay wired up ===');
{
    const mod = path.join(ROOT, 'public', 'js', 'connection.js');
    report(fs.existsSync(mod), 'connection.js exists');
    const src = fs.readFileSync(mod, 'utf8');
    try { new vm.Script(src, { filename: 'connection.js' }); report(true, 'connection.js parses'); }
    catch (e) { report(false, 'connection.js parses', e.message); }

    [['listens to the browser events', /addEventListener\('offline'/],
        ['learns from real requests', /markFailure/],
        ['needs two failures, not one', /FAILURES_BEFORE_OFFLINE = 2/],
        ['exposes isOnline', /isOnline: function/],
        ['knows a network error by name', /isNetworkishError/],
        ['the offline class matches the css', /zoomy-net-off'/]
    ].forEach(function (p) { report(p[1].test(src), 'connection: ' + p[0]); });

    ['student-dashboard.html', 'teacher-dashboard.html', 'ai-tutor.html', 'index.html'].forEach(function (page) {
        const t = fs.readFileSync(path.join(ROOT, 'public', page), 'utf8');
        const n = (t.match(/connection\.js/g) || []).length;
        report(n === 1, page + ': loads connection.js once (' + n + ')');
        report(/\.zoomy-net-banner\.zoomy-net-off \{/.test(t), page + ': the offline style is present');
        report(/html\.zoomy-net-offline \.toast-container/.test(t),
            page + ': the toasts step aside for the banner');
    });

    ['student-dashboard.html', 'teacher-dashboard.html'].forEach(function (page) {
        const t = fs.readFileSync(path.join(ROOT, 'public', page), 'utf8');
        const fn = t.substring(t.indexOf('async function fetchWithAuth'), t.indexOf('async function getCsrfToken'));
        report(/isBackgroundRead/.test(fn), page + ': a background GET is told apart from an action');
        report(!/window\.location\.reload\(\)/.test(fn), page + ': no auto page reload on failure');
        report(!/تعذر إكمال العملية/.test(fn), page + ': no raw network text in the toast');
        report(/ZoomyNet\.markSuccess/.test(fn) && /ZoomyNet\.markFailure/.test(fn),
            page + ': requests report their outcome');
        report(/if \(window\.ZoomyNet && window\.ZoomyNet\.isOnline\(\) === false\) return;/.test(t),
            page + ': the toast stays silent while offline');
    });
}

console.log('\n=== the guide must stay complete ===');
{
    const docs = path.join(ROOT, 'public', 'docs.html');
    report(fs.existsSync(docs), 'docs.html exists');
    if (fs.existsSync(docs)) {
        const t = fs.readFileSync(docs, 'utf8');
        ['packages', 'courses', 'rest'].forEach(function (id) {
            report(t.indexOf('id="' + id + '"') !== -1, 'docs: the ' + id + ' section exists');
            report(t.indexOf('href="#' + id + '"') !== -1, 'docs: ' + id + ' is in the contents bar');
        });
        report(t.indexOf('location.reload') === -1, 'docs: reconnecting does not reload the page');
        report(t.indexOf('/js/connection.js') !== -1, 'docs: uses the shared connection banner');

        // نص دخيل لا مكان له في دليل عربي
        const cjk = t.match(/[\u4e00-\u9fff]+/g);
        report(!cjk, 'docs: no stray characters', (cjk || []).join(' '));
        report(!/precipitate/.test(t), 'docs: no stray words');
    }
}

console.log('\n=== writes must not repeat a known failure ===');
{
    const h = fs.readFileSync(path.join(ROOT, 'utils', 'helpers.js'), 'utf8');
    try { new vm.Script(h, { filename: 'helpers.js' }); report(true, 'helpers.js parses'); }
    catch (e) { report(false, 'helpers.js parses', e.message); }

    report(/const MISSING_COLUMNS = new Map\(\);/.test(h), 'the server remembers missing columns');
    report(!/while \(attempts < 10\)/.test(h), 'no ten-try write loop');
    report(/stripKnownMissingColumns\(table, sanitizedData\);/.test(h), 'known-missing columns are stripped up front');
    const ins = h.substring(h.indexOf('async function insert(table, data)'));
    const upd = h.substring(h.indexOf('async function update(table, id, data)'));
    const insEnd = ins.indexOf('async function update');
    const body = ins.slice(0, insEnd > -1 ? insEnd : ins.length);
    report(/retriesLeft > 0\)/.test(body) && /retriesLeft > 0\)/.test(upd),
        'a write only retries when it can actually remove the column');
    report(!/data: sanitizedData/.test(h),
        'error logs carry column names, never row values');
}

console.log('\n=== polling must stop when nobody is looking ===');
{
    ['student-dashboard.html', 'teacher-dashboard.html'].forEach(function (page) {
        const t = fs.readFileSync(path.join(ROOT, 'public', page), 'utf8');
        report(/__zoomyIdlePaused/.test(t), page + ': intervals pause when the tab is hidden');
        report((t.match(/if \(window\.__zoomyIdlePaused\) return;/g) || []).length === 1,
            page + ': the idle guard is installed exactly once');
        report(!/setInterval\(chatTypingAsk, 2500\)/.test(t) && !/setInterval\(groupChatTypingAsk, 2500\)/.test(t),
            page + ': the typing poll is no longer every 2.5 seconds');
    });
}

console.log('\n' + (bad ? 'PROBLEMS: ' + bad : 'EVERYTHING PARSES'));
process.exit(bad ? 1 : 0);