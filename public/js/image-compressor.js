// ============================================================================
//  🗜️ ضغط الصور والملفات + شبكة أمان للرفع
//  ---------------------------------------------------------------------------
//  1) نقطة واحدة ت��غطّي كل النماذج: أي FormData مرسل عبر fetch يمرّ من هنا،
//     فتشمل: المنشورات، صور المجموعات، محادثة المجموعة، صور التمارين،
//     صورة الملف الشخصي، إيصالات الإيداع، الباقات والدورات.
//  2)-pressure لا تُقرأ أي صورة في الذاكرة كاملة: نقرأ ترويستها فقط لمعرفة
//     الأبعاد، ثم نطلب من المتصفح فكّ الترميز والتصغير في خطوة واحدة،
//     فحتى صورة ١٠٠ ميغاب��يت لا تُسقط المتصفح.
//  3) كل خطوة لها مهلة زمنية، وأي فشل يعيد الملف الأصلي كما هو —
//     الرفع لا يتعطل أبداً بسبب الضغط.
//  4) إعادة محاولة عند فشل البوابة (502/503/504) أو انقطاع الشبكة، لأن
//    Render ينام بعد خمول فيفشل أول طلب有时اً.
// ============================================================================
(function () {
    'use strict';
    if (window.__zoomyImageCompression) return;
    window.__zoomyImageCompression = true;

    var DEFAULT_MAX_DIM = 1600;    // أطول ضلع
    var TARGET_KB = 400;           // الحجم المستهدف
    var FLOOR_KB = 90;
    var SKIP_BELOW = 45 * 1024;    // الصورة أصلاً صغيرة: نتركها
    var DECODE_TIMEOUT_MS = 25000; // فكّ الترميز لا يطول أكثر من هذا
    var GATEWAY_STATUSES = [502, 503, 504];
    var RETRY_DELAYS = [2000, 4500];

    // ---------------------------------------------------------------------
    //  أدوات
    // ---------------------------------------------------------------------
    function isImage(f) {
        return f && typeof f.type === 'string' && f.type.indexOf('image/') === 0;
    }

    function isAnimatedGif(f) {
        return f && f.type === 'image/gif';
    }

    function withTimeout(promise, ms, fallback) {
        return new Promise(function (resolve) {
            var done = false;
            var timer = setTimeout(function () {
                if (done) return;
                done = true;
                resolve(fallback);
            }, ms);
            promise.then(function (v) {
                if (done) return;
                done = true; clearTimeout(timer); resolve(v);
            }, function () {
                if (done) return;
                done = true; clearTimeout(timer); resolve(fallback);
            });
        });
    }

    /**
     *  أبعاد الصورة من ترويستها فقط — بلا فك ترميز وبلا ذاكرة تُذكر.
     *  بدونها لا نعرف كم يجب أن نصغّر، فنضطر لفك الترميز الكامل.
     */
    function readImageSize(file) {
        return file.slice(0, 262144).arrayBuffer().then(function (buf) {
            var b = new Uint8Array(buf);
            var v = new DataView(buf);

            // PNG
            if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
                return { width: v.getUint32(16), height: v.getUint32(20) };
            }
            // GIF
            if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
                return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
            }
            // WebP
            if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
                b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
                var fmt = String.fromCharCode(b[12], b[13], b[14], b[15]);
                if (fmt === 'VP8X') {
                    return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
                }
                if (fmt === 'VP8 ') return { width: v.getUint16(26, true) & 0x3FFF, height: v.getUint16(28, true) & 0x3FFF };
                if (fmt === 'VP8L') {
                    var bits = v.getUint32(21, true);
                    return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
                }
                return null;
            }
            // JPEG: نمشي على العلامات حتى نصل إلى إطار البداية
            if (b.length > 4 && b[0] === 0xFF && b[1] === 0xD8) {
                var i = 2;
                while (i < b.length - 9) {
                    if (b[i] !== 0xFF) { i++; continue; }
                    var marker = b[i + 1];
                    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
                    if (marker === 0xFF) { i++; continue; }
                    var isSOF = marker >= 0xC0 && marker <= 0xCF &&
                        marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
                    if (isSOF) return { width: v.getUint16(i + 7), height: v.getUint16(i + 5) };
                    i += 2 + v.getUint16(i + 2);
                }
            }
            return null;
        }).catch(function () { return null; });
    }

    /** يفكّ الترميز والتصغير في خطوة واحدة، فيبقى استخدام الذاكرة منخفضاً */
    function decodeScaled(file, maxDim) {
        return readImageSize(file).then(function (size) {
            var opts = {};
            if (size && size.width > 0 && size.height > 0) {
                var ratio = Math.min(1, maxDim / Math.max(size.width, size.height));
                if (ratio < 1) {
                    opts.resizeWidth = Math.max(1, Math.round(size.width * ratio));
                    opts.resizeHeight = Math.max(1, Math.round(size.height * ratio));
                    opts.resizeQuality = 'high';
                }
            }
            if (typeof createImageBitmap !== 'function') return null;

            return createImageBitmap(file, opts).catch(function () {
                return createImageBitmap(file).catch(function () { return null; });
            });
        }).catch(function () { return null; });
    }

    function drawOnCanvas(img, maxDim, size) {
        var w = size && size.width ? size.width : (img.width || 0);
        var h = size && size.height ? size.height : (img.height || 0);
        if (!w || !h) w = img.width || img.naturalWidth;
        if (!w || !h) h = img.height || img.naturalHeight;
        if (!w || !h) return null;

        var scale = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));

        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        // JPEG بلا قناة شفافية: نمدّ أبيض تحته وإلا صارت PNG الشفافة سوداء
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        return canvas;
    }

    function canvasToBlob(canvas, quality) {
        return new Promise(function (resolve) {
            if (canvas.toBlob) {
                canvas.toBlob(function (b) { resolve(b); }, 'image/jpeg', quality);
                return;
            }
            try {
                var dataUrl = canvas.toDataURL('image/jpeg', quality);
                var bin = atob(dataUrl.split(',')[1]);
                var arr = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                resolve(new Blob([arr], { type: 'image/jpeg' }));
            } catch (e) { resolve(null); }
        });
    }

    /**
     *  يضغط صورة. يقبل الشكلين:
     *      compressImageFile(file, options)
     *      compressImageFile(file, maxWidth, maxHeight, quality)   ← الشكل القديم
     *  ويعيد الملف الأصلي كما هو عند أي فشل.
     */
    window.compressImageFile = async function (file, a, b, c) {
        if (!isImage(file)) return file;
        try {
            if (isAnimatedGif(file)) return file;   // لا نكسر GIF متحرك
            if (file.size <= SKIP_BELOW) return file;

            var maxDim = DEFAULT_MAX_DIM;
            var first = 0.86;
            if (a && typeof a === 'object') {
                maxDim = a.maxDim || DEFAULT_MAX_DIM;
                first = a.startQuality || first;
            } else {
                if (typeof a === 'number') maxDim = a;
                if (typeof b === 'number') maxDim = Math.min(maxDim, b);
                if (typeof c === 'number') first = c;
            }

            var size = await readImageSize(file);
            var img = await withTimeout(decodeScaled(file, maxDim), DECODE_TIMEOUT_MS, null);
            if (!img) return file;

            var canvas = drawOnCanvas(img, maxDim, size);
            if (typeof img.close === 'function') { try { img.close(); } catch (e) {} }
            if (!canvas) return file;

            var qualities = [first, 0.78, 0.68, 0.58, 0.48, 0.38, 0.3];
            var best = null;
            for (var i = 0; i < qualities.length; i++) {
                var blob = await canvasToBlob(canvas, qualities[i]);
                if (!blob) continue;
                if (!best || blob.size < best.size) best = blob;
                if (blob.size <= TARGET_KB * 1024) return toFile(blob, file);
            }
            if (best && best.size <= FLOOR_KB * 1024) return toFile(best, file);
            return best ? toFile(best, file) : file;
        } catch (e) {
            return file;
        }
    };

    /** يبني File باسم .jpg حتى يطابق المحتوى نوعه على الخادم */
    function toFile(blob, original) {
        var base = String((original && original.name) || 'image').replace(/\.[^.]+$/, '');
        var name = /\.jpe?g$/i.test(base) ? base : base + '.jpg';
        try {
            return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
        } catch (e) {
            return blob;
        }
    }

    /** data URL مضغوطة — للمسارات التي تحفظ النص في قاعدة البيانات مباشرة */
    window.compressBase64ImageFile = function (file, maxWidth, maxHeight, quality) {
        return new Promise(function (resolve) {
            if (!isImage(file)) {
                var plain = new FileReader();
                plain.onload = function (e) { resolve(e.target.result); };
                plain.onerror = function () { resolve(''); };
                plain.readAsDataURL(file);
                return;
            }
            if (isAnimatedGif(file)) {
                var g = new FileReader();
                g.onload = function (e) { resolve(e.target.result); };
                g.onerror = function () { resolve(''); };
                g.readAsDataURL(file);
                return;
            }

            var limit = Math.max(maxWidth || 1280, maxHeight || 1280);
            var size = null;
            var img = null;
            try { size = readImageSize(file); } catch (e) {}

            Promise.resolve(size).then(function (sz) {
                return withTimeout(decodeScaled(file, limit), DECODE_TIMEOUT_MS, null).then(function (bm) {
                    img = bm;
                    return sz;
                });
            }).then(function (sz) {
                if (!img) throw new Error('decode failed');
                var canvas = drawOnCanvas(img, limit, sz);
                if (typeof img.close === 'function') { try { img.close(); } catch (e) {} }
                if (!canvas) throw new Error('canvas failed');

                var steps = [quality || 0.82, 0.72, 0.6, 0.5, 0.4, 0.3];
                var step = 0;
                (function attempt() {
                    if (step >= steps.length) { resolve(canvas.toDataURL('image/jpeg', steps[steps.length - 1])); return; }
                    var q = steps[step++];
                    var dataUrl = canvas.toDataURL('image/jpeg', q);
                    var bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
                    if (bytes <= TARGET_KB * 1024) { resolve(dataUrl); return; }
                    attempt();
                })();
            }).catch(function () {
                // نفشل بأمان: نقرأ الملف كما هو
                var raw = new FileReader();
                raw.onload = function (e) { resolve(e.target.result); };
                raw.onerror = function () { resolve(''); };
                raw.readAsDataURL(file);
            });
        });
    };

    /** data URL مضغوطة من نص */
    window.compressDataUrl = function (dataUrl, maxDim, targetKB) {
        return new Promise(function (resolve) {
            if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0) { resolve(dataUrl); return; }
            var img = new Image();
            img.onload = function () {
                var max = maxDim || DEFAULT_MAX_DIM;
                var scale = Math.min(1, max / Math.max(img.width, img.height));
                var canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                var steps = [0.86, 0.76, 0.64, 0.52, 0.4, 0.3];
                var step = 0;
                (function attempt() {
                    if (step >= steps.length) { resolve(canvas.toDataURL('image/jpeg', steps[steps.length - 1])); return; }
                    var q = steps[step++];
                    var out = canvas.toDataURL('image/jpeg', q);
                    var bytes = Math.round((out.length - out.indexOf(',') - 1) * 3 / 4);
                    if (bytes <= (targetKB || TARGET_KB) * 1024) { resolve(out); return; }
                    attempt();
                })();
            };
            img.onerror = function () { resolve(dataUrl); };
            img.src = dataUrl;
        });
    };

    // =====================================================================
    //  نقطة واحدة تغطّي كل النماذج: أي FormData مرسل عبر fetch
    // =====================================================================
    var ids = new WeakMap();
    var counter = 0;
    function keyOf(f) {
        if (!ids.has(f)) ids.set(f, ++counter);
        return ids.get(f);
    }

    function listEntries(form) {
        var entries = [];
        var jobs = [];
        var iter = form.entries();
        var step = iter.next();
        while (!step.done) {
            var pair = step.value;
            entries.push([pair[0], pair[1]]);
            if (isImage(pair[1])) jobs.push(pair[1]);
            step = iter.next();
        }
        return { entries: entries, jobs: jobs };
    }

    function prepareForm(form) {
        var listed;
        try { listed = listEntries(form); } catch (e) { return Promise.resolve(form); }
        if (!listed.jobs.length) return Promise.resolve(form);

        var jobs = listed.jobs;
        return Promise.all(jobs.map(function (f) {
            return Promise.resolve(window.compressImageFile(f)).catch(function () { return f; });
        })).then(function (compressed) {
            var map = {};
            compressed.forEach(function (c, i) { map[keyOf(jobs[i])] = c; });
            var out = new FormData();
            listed.entries.forEach(function (e) {
                var k = e[0], v = e[1];
                var replacement = (typeof File !== 'undefined' && v instanceof File) ? map[keyOf(v)] : null;
                if (replacement) {
                    // نُبقي الاسم الذي اختاره المتصل كما هو
                    var name = v.name || (replacement.name || 'file');
                    out.append(k, replacement, name);
                } else {
                    out.append(k, v);
                }
            });
            return out;
        }).catch(function () { return form; });
    }

    function sleep(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
        window.fetch = function (input, init) {
            var isFormPost = false;
            var canRetry = false;
            try {
                var method = String(((init && init.method) || (input && input.method) || 'GET')).toUpperCase();
                isFormPost = method === 'POST' &&
                    init && init.body && typeof FormData !== 'undefined' && init.body instanceof FormData;
                // القراءة لا تترك أثراً، فإعادتها آمنة تماماً. وهي أكثر
                // ما يقع على تبديل التبويب، فإعادتها تُخفي غالباً
                // الخادم النائم دون أن يرى المستخدم شيئاً.
                canRetry = (method === 'GET' || method === 'HEAD') || isFormPost;
            } catch (e) { isFormPost = false; canRetry = false; }

            if (!isFormPost && !canRetry) return origFetch.apply(window, arguments);

            var backgroundRead = !isFormPost;

            var original = init;
            var attempt = 0;

            function send(form, triesLeft) {
                var next = {};
                for (var k in original) {
                    if (Object.prototype.hasOwnProperty.call(original, k)) next[k] = original[k];
                }
                next.body = form;
                return origFetch.call(window, input, next).catch(function (err) {
                    // انقطاع الشبكة أو البوابة لم يوصل الطلب أصلاً: إعادة آمنة
                    if (triesLeft > 0) {
                        attempt++;
                        if (window.ZoomyNet && window.ZoomyNet.markFailure) window.ZoomyNet.markFailure();
                                        try { console.warn('[Zoomy] لم يصل الطلب، إعادة محاولة ' + attempt); } catch (e) {}
                        return sleep(RETRY_DELAYS[RETRY_DELAYS.length - triesLeft] || RETRY_DELAYS[0])
                            .then(function () { return send(form, triesLeft - 1); });
                    }
                    throw err;
                }).then(function (res) {
                    // 502/503/504 يعني أن الطلب لم يصل إلى التطبيق إطلاقاً
                    if (window.ZoomyNet && window.ZoomyNet.markSuccess) window.ZoomyNet.markSuccess();
                                        if (GATEWAY_STATUSES.indexOf(res.status) !== -1 && triesLeft > 0) {
                        attempt++;
                        try { console.warn('[Zoomy] الخادم مشغول (' + res.status + ')، إعادة محاولة ' + attempt); } catch (e) {}
                        return sleep(RETRY_DELAYS[RETRY_DELAYS.length - triesLeft] || RETRY_DELAYS[0])
                            .then(function () { return send(form, triesLeft - 1); });
                    }
                    return res;
                });
            }

            return prepareForm(original.body).then(function (form) {
                return send(form, RETRY_DELAYS.length);
            });
        };
    }
})();