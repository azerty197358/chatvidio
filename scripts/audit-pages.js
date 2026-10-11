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

console.log('\n' + (bad ? 'PROBLEMS: ' + bad : 'EVERYTHING PARSES'));
process.exit(bad ? 1 : 0);