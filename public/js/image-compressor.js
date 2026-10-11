// ============================================================================
//  🗜️ ضغط الصور والملفات قبل حفظها
//  كل صورة تخرج من هذه الصفحة تمرّ من هنا قبل أن تصل إلى الخادم أو إلى
//  Supabase Storage:
//
//   1) نقطرة واحدة تعترض fetch وتضغط أي ملف صورة داخل FormData، فتشمل كل
//      النماذج: المنشورات، صور المجموعات، صورة المجموعة، إيصالات الإيداع،
//      صور التمارين، ملف الأستاذ الشخصي، الباقات والدورات.
//   2) compressBase64ImageFile是被遗留的未被调用的函数，现由共享实现提供，
//      它用于把图片直接转成 data URL 存入数据库的场景（当前用于习题图片）。
//   3) compressImageFile(file) 作为本地 helper 保留，供选择器使用。
//
//  如果压缩失败会原样返回原文件，因此永远不会破坏上传。
// ============================================================================
(function () {
    'use strict';
    if (window.__zoomyImageCompression) return;
    window.__zoomyImageCompression = true;

    var DEFAULT_MAX_DIM = 1600;   // أطول ضلع
    var TARGET_KB = 400;         // الحجم المستهدف
    var FLOOR_KB = 90;           // لا ننزل تحت هذا مهما كان الضغط
    var SKIP_BELOW = 45 * 1024;  // الصورة أصلاً أصغر من هذا: نتركها

    function isImage(f) {
        return f && typeof f.type === 'string' && f.type.indexOf('image/') === 0;
    }

    function loadBitmap(file) {
        if (typeof createImageBitmap === 'function') {
            return createImageBitmap(file).catch(function () { return null; });
        }
        return new Promise(function (resolve) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        });
    }

    function drawToCanvas(img, maxDim) {
        var w = img.width || img.naturalWidth;
        var h = img.height || img.naturalHeight;
        if (!w || !h) return null;

        var scale = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));

        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        // JPEG 没有透明通道：铺一层白底，避免 PNG 透明区域变成黑色
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
            // 老浏览器兜底
            var dataUrl = canvas.toDataURL('image/jpeg', quality);
            var bin = atob(dataUrl.split(',')[1]);
            var arr = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            resolve(new Blob([arr], { type: 'image/jpeg' }));
        });
    }

    function blobToFile(blob, originalName) {
        var base = String(originalName || 'image').replace(/\.[^.]+$/, '');
        var name = /\.jpe?g$/i.test(base) ? base : base + '.jpg';
        try {
            return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
        } catch (e) {
            return blob;
        }
    }

    /** يضغط ملف صورة؛ يعيد الملف الأصلي عند أي فشل */
    window.compressImageFile = async function (file, options) {
        if (!isImage(file)) return file;
        try {
            if (file.size <= SKIP_BELOW && !(options && options.force)) return file;
            if (file.type === 'image/gif') return file;   // GIF متحرك: لا نكسره

            var opts = options || {};
            var maxDim = opts.maxDim || DEFAULT_MAX_DIM;
            var targetKB = opts.maxKB || TARGET_KB;

            var img = await loadBitmap(file);
            if (!img) return file;
            var canvas = drawToCanvas(img, maxDim);
            if (!canvas) return file;
            if (typeof img.close === 'function') img.close();

            var qualities = [0.86, 0.78, 0.68, 0.58, 0.48, 0.38, 0.3];
            var best = null;
            for (var i = 0; i < qualities.length; i++) {
                var blob = await canvasToBlob(canvas, qualities[i]);
                if (!blob) continue;
                if (!best || blob.size < best.size) best = blob;
                if (blob.size <= targetKB * 1024) return blobToFile(blob, file.name);
            }
            if (best && best.size <= FLOOR_KB * 1024) return blobToFile(best, file.name);
            return blobToFile(best, file.name);
        } catch (e) {
            return file;
        }
    };

    /** data URL مضغوطة — للاستخدام مع الصور المحفوظة كنص داخل قاعدة البيانات */
    window.compressBase64ImageFile = function (file, maxWidth, maxHeight, quality) {
        return new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function (e) {
                var img = new Image();
                img.onload = function () {
                    var w = img.width;
                    var h = img.height;
                    var limitW = maxWidth || 1200;
                    var limitH = maxHeight || 1200;
                    if (w > limitW || h > limitH) {
                        if (w / h > limitW / limitH) { h = Math.round(h * limitW / w); w = limitW; }
                        else { w = Math.round(w * limitH / h); h = limitH; }
                    }
                    var canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    var ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);

                    var steps = [quality || 0.82, 0.72, 0.6, 0.5, 0.4, 0.3];
                    var step = 0;
                    (function attempt() {
                        if (step >= steps.length) { resolve(canvas.toDataURL('image/jpeg', steps[steps.length - 1])); return; }
                        var q = steps[step++];
                        var dataUrl = canvas.toDataURL('image/jpeg', q);
                        // base64 يضيف نحو 33%؛ نتحقق من الحجم الحقيقي للملف
                        var approxBytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
                        if (approxBytes <= TARGET_KB * 1024) { resolve(dataUrl); return; }
                        attempt();
                    })();
                };
                img.onerror = function () { resolve(e.target.result); };
                img.src = e.target.result;
            };
            reader.onerror = function () { resolve(''); };
            reader.readAsDataURL(file);
        });
    };

    /**	data URL مضغوطة مباشرة من نص */
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

    // ---------------------------------------------------------------------
    //  نقطة واحدة تغطّي كل النماذج: أي FormData مرسل عبر fetch
    // ---------------------------------------------------------------------
    var IN_FLIGHT = typeof WeakSet === 'function' ? new WeakSet() : null;

    function prepareForm(form) {
        var jobs = [];
        var entries = [];
        try {
            var iter = form.entries();
            var step = iter.next();
            while (!step.done) {
                entries.push([step.value[0], step.value[1]]);
                if (isImage(step.value[1])) jobs.push(step.value[1]);
                step = iter.next();
            }
        } catch (e) {
            return Promise.resolve(form);
        }
        if (!jobs.length) return Promise.resolve(form);

        var targets = {};
        jobs.forEach(function (f) { targets[File_key(f)] = f; });

        return Promise.all(jobs.map(function (f) { return window.compressImageFile(f); }))
            .then(function (compressed) {
                var map = {};
                compressed.forEach(function (c, i) { map[File_key(jobs[i])] = c; });
                var out = new FormData();
                entries.forEach(function (e) {
                    var key = e[0];
                    var val = e[1];
                    if (typeof File !== 'undefined' && val instanceof File && map[File_key(val)]) {
                        out.append(key, map[File_key(val)], map[File_key(val)].name);
                    } else {
                        out.append(key, val);
                    }
                });
                return out;
            })
            .catch(function () { return form; });
    }

    var _id = 0;
    var ids = new WeakMap();
    function File_key(f) {
        if (!ids.has(f)) { ids.set(f, ++_id); }
        return ids.get(f);
    }

    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
        window.fetch = function (input, init) {
            try {
                if (init && init.body && typeof FormData !== 'undefined' && init.body instanceof FormData) {
                    var original = init;
                    return prepareForm(init.body).then(function (form) {
                        var next = {};
                        for (var k in original) { if (Object.prototype.hasOwnProperty.call(original, k)) next[k] = original[k]; }
                        next.body = form;
                        return origFetch.call(window, input, next);
                    });
                }
            } catch (e) { /* نتابع بالطريقة القديمة */ }
            return origFetch.apply(window, arguments);
        };
    }
})();