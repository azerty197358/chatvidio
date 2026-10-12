// ============================================================================
//  انحدار سابق: غلاف fetch كان يقرأ init.body حيث init غير معرَّف، فأي طلب
//  بسيط بلا إعدادات - وهو شكل الباقات والدورات وكل القوائم - كان يرمي
//  استثناءً ولا يصل إلى الخادم أصلاً.
//  هذا الاختبار يمرّ على كل أشكال الاستدعاء التي تستخدمها المنصة.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'image-compressor.js'), 'utf8');

let bad = 0;
function ck(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) bad++;
    console.log((ok ? '  ok   ' : '  FAIL ') + name + '  got=' + JSON.stringify(actual) +
        (ok ? '' : ' want=' + JSON.stringify(expected)));
}

async function main() {
    // ---------------------------------------------------------------------
    // 1) الطلب البسيط بلا إعدادات - هو الشكل الذي كسر
    // ---------------------------------------------------------------------
    {
        const calls = [];
        const sandbox = makeSandbox(function (input, init) {
            calls.push({ input: input, init: init });
            return Promise.resolve({ status: 200 });
        });
        vm.createContext(sandbox);
        vm.runInContext(SRC, sandbox, { filename: 'image-compressor.js' });

        let threw = null;
        let res = null;
        try { res = await sandbox.window.fetch('/api/packages/public?page=1'); }
        catch (e) { threw = e.message; }

        ck('a bare fetch(url) does not throw', threw, null);
        ck('a bare fetch(url) reaches the network', calls.length, 1);
        ck('a bare fetch(url) sends the url untouched', calls[0] && calls[0].input, '/api/packages/public?page=1');
        ck('a bare fetch(url) adds no options', calls[0] && calls[0].init, undefined);
        ck('the response comes back', res && res.status, 200);
    }

    // ---------------------------------------------------------------------
    // 2) GET بترويسات
    // ---------------------------------------------------------------------
    {
        const calls = [];
        const sandbox = makeSandbox(function (input, init) {
            calls.push({ input: input, init: init });
            return Promise.resolve({ status: 200 });
        });
        vm.createContext(sandbox);
        vm.runInContext(SRC, sandbox, { filename: 'image-compressor.js' });

        let threw = null;
        try { await sandbox.window.fetch('/api/course/public', { headers: { 'X-Test': '1' } }); }
        catch (e) { threw = e.message; }

        ck('a GET with headers does not throw', threw, null);
        ck('a GET with headers reaches the network', calls.length, 1);
        ck('the headers survive', calls[0] && calls[0].init && calls[0].init.headers['X-Test'], '1');
    }

    // ---------------------------------------------------------------------
    // 3) POST JSON يمرّ كما هو
    // ---------------------------------------------------------------------
    {
        const calls = [];
        const sandbox = makeSandbox(function (input, init) {
            calls.push({ input: input, init: init });
            return Promise.resolve({ status: 200 });
        });
        vm.createContext(sandbox);
        vm.runInContext(SRC, sandbox, { filename: 'image-compressor.js' });

        await sandbox.window.fetch('/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });

        ck('a JSON POST reaches the network', calls.length, 1);
        ck('a JSON POST keeps its method', calls[0] && calls[0].init.method, 'POST');
        ck('a JSON POST keeps its body', calls[0] && calls[0].init.body, '{"a":1}');
    }

    // ---------------------------------------------------------------------
    // 4) FormData POST يمرّ بالضغط ولا يضيع حقل
    // ---------------------------------------------------------------------
    {
        const calls = [];
        const sandbox = makeSandbox(function (input, init) {
            calls.push({ input: input, init: init });
            return Promise.resolve({ status: 200 });
        });
        vm.createContext(sandbox);
        vm.runInContext(SRC, sandbox, { filename: 'image-compressor.js' });

        //  ضغط بلا canvas في هذه البيئة: نتحقق أن الحقول محفوظة
        sandbox.window.compressImageFile = function (file) {
            return Promise.resolve(new File(['xx'], 'same.jpg', { type: 'image/jpeg' }));
        };

        const fd = new FormData();
        fd.append('content', 'مرحبا');
        fd.append('files', new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));

        await sandbox.window.fetch('/api/upload', { method: 'POST', body: fd });

        const sent = calls[0] && calls[0].init && calls[0].init.body;
        const entries = [];
        if (sent && typeof sent.entries === 'function') {
            const it = sent.entries();
            let s = it.next();
            while (!s.done) { entries.push(s.value[0]); s = it.next(); }
        }
        ck('a FormData POST reaches the network', calls.length, 1);
        ck('every field survives compression', entries.sort(), ['content', 'files']);
    }

    // ---------------------------------------------------------------------
    // 5) DELETE لا يُلمس
    // ---------------------------------------------------------------------
    {
        const calls = [];
        const sandbox = makeSandbox(function (input, init) {
            calls.push({ input: input, init: init });
            return Promise.resolve({ status: 200 });
        });
        vm.createContext(sandbox);
        vm.runInContext(SRC, sandbox, { filename: 'image-compressor.js' });

        await sandbox.window.fetch('/api/x/1', { method: 'DELETE' });
        ck('a DELETE reaches the network untouched', calls.length, 1);
        ck('a DELETE keeps its method', calls[0] && calls[0].init.method, 'DELETE');
    }

    console.log('');
    console.log(bad ? 'PROBLEMS: ' + bad : 'ALL GOOD');
    process.exit(bad ? 1 : 0);
}

/** بيئة تنفيذ مصغّرة بما تحتاجه الوحدة فقط */
function makeSandbox(fetchImpl) {
    const noopEl = {
        getContext() { return { fillRect() {}, drawImage() {}, fillStyle: '' }; },
        toBlob(cb) { cb(new Blob(['x'], { type: 'image/jpeg' })); },
        toDataURL() { return 'data:image/jpeg;base64,AAAA'; },
        width: 0, height: 0
    };
    const documentStub = {
        createElement() { return Object.create(noopEl); },
        addEventListener() {},
        getElementById() { return null; },
        body: { appendChild() {} },
        hidden: false
    };
    const windowStub = { fetch: fetchImpl, addEventListener() {} };
    return {
        window: windowStub,
        document: documentStub,
        navigator: { onLine: true },
        FormData, Blob, File, URL, DataView, ArrayBuffer, Uint8Array, Promise, Math, JSON,
        setTimeout, clearTimeout, console: { warn() {}, log() {}, error() {} },
        atob: (s) => Buffer.from(s, 'base64').toString('binary')
    };
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });