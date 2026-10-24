
// ============================================================================
//  🔔 أصوات الإشعارات والرسائل
//  أصوات مولَّدة عبر Web Audio API - بلا ملفات صوتية، فلا اعتماد على CDN
//  وتعمل حتى بدون إنترنت.
//
//  لماذا كان الصوت صامتاً على الجوال؟
//  المتصفحات على الهاتف ترفض تشغيل الصوت قبل أن يلمس المستخدم الشاشة،
//  وتحفظ حالة "موقوف" AudioContext عند رجوع المستخدم من الخلفية. الحل هنا:
//    * نستدعي unlock عند كل نقرة/لمسة/ضغط حتى تصبح الحالة "running" فعلاً
//    * نستأنف الصوت عند العودة إلى التبويب
//    * nosc de vibración: منبه صامت إضافي حيث لا يُسمح بالصوت
// ============================================================================
(function () {
    if (window.__zoomySoundInstalled) return;
    window.__zoomySoundInstalled = true;

    var ctx = null;
    var unlocked = false;
    var muted = false;
    var gestureCount = 0;
    var lastPlayed = {};

    function build() {
        if (ctx) return ctx;
        try {
            var Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) return null;
            ctx = new Ctor();
        } catch (e) { return null; }
        return ctx;
    }

    /** محاولة إيقاظ الصوت؛ تُعيد true حين يصبح السياق يعمل فعلاً */
    function wake() {
        var ac = build();
        if (!ac) return false;
        if (ac.state === 'running') {
            if (!unlocked) { unlocked = true; markUnlocked(); }
            return true;
        }
        // بعض المتصفحات ترفض حتى resume() المتزامن، فنجرب كل الصيغ
        try {
            var p = ac.resume();
            if (p && typeof p.then === 'function') {
                p.then(function () {
                    if (ac.state === 'running') { unlocked = true; markUnlocked(); }
                }).catch(function () {});
            }
        } catch (e) {}
        try { ac.state === 'suspended' && ac.resume && ac.resume(); } catch (e) {}
        return false;
    }

    /** لمسة اهتزاز خفيفة - تصلUser حتى مع الصوت مكتوم */
    function buzz(ms) {
        try {
            if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(ms || 18);
        } catch (e) {}
    }

    function markUnlocked() {
        window.__zoomySoundUnlocked = true;
        document.dispatchEvent(new Event('zoomy:sound-ready'));
    }

    // لا نستخدم once: نتكرر عند كل تفاعل حتى يقبل المتصفح الصوت
    ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(function (ev) {
        window.addEventListener(ev, function () {
            gestureCount++;
            wake();
        }, { passive: true });
    });

    // العودة من الخلفية: السياق يكون موقوفاً، فنستأنفه
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) wake();
    });
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('load', function () { wake(); });

    function tone(ac, freq, startAt, duration, gainPeak) {
        var osc = ac.createOscillator();
        var g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startAt);
        g.gain.setValueAtTime(0.0001, startAt);
        g.gain.exponentialRampToValueAtTime(gainPeak, startAt + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        osc.connect(g);
        g.connect(ac.destination);
        osc.start(startAt);
        osc.stop(startAt + duration + 0.02);
    }

    function play(fn) {
        var ac = build();
        if (!ac) return false;
        if (ac.state !== 'running') {
            // محاولة أخيرة قبل إسقاط الصوت
            wake();
            if (ac.state !== 'running') return false;
        }
        try { fn(ac, ac.currentTime); return true; } catch (e) { return false; }
    }

    // نغمة قصيرة: إشعار
    function playChime() {
        return play(function (ac, t) {
            tone(ac, 880, t, 0.16, 0.18);
            tone(ac, 1320, t + 0.10, 0.22, 0.15);
        });
    }

    // نغمة واحدة هابطة: رسالة واردة
    function playPop() {
        return play(function (ac, t) {
            var osc = ac.createOscillator();
            var g = ac.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(760, t);
            osc.frequency.exponentialRampToValueAtTime(430, t + 0.16);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.17, t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
            osc.connect(g);
            g.connect(ac.destination);
            osc.start(t);
            osc.stop(t + 0.21);
        });
    }

    // نغمة ثلاثية: تنبيه مهم
    function playAlert() {
        return play(function (ac, t) {
            tone(ac, 660, t, 0.13, 0.17);
            tone(ac, 880, t + 0.09, 0.13, 0.17);
            tone(ac, 1170, t + 0.18, 0.24, 0.15);
        });
    }

    function throttled(key, ms) {
        var now = Date.now();
        if (lastPlayed[key] && (now - lastPlayed[key]) < ms) return false;
        lastPlayed[key] = now;
        return true;
    }

    /** يشغّل النغمة إن كان الصوت جاهزاً، وإلا يحاول إيقاظه أولاً */
    function fire(fn, key, gap, vibrate) {
        if (muted) return false;
        if (!throttled(key, gap)) return false;
        if (!unlocked) wake();
        var played = play(fn);
        if (played) buzz(vibrate);
        return played;
    }

    window.zoomySound = {
        unlock: function () { gestureCount++; return wake(); },
        isUnlocked: function () { return unlocked; },
        gestures: function () { return gestureCount; },
        notification: function () { return fire(playChime, 'notif', 4000, 25); },
        message: function (key) { return fire(playPop, 'msg' + (key || ''), 1800, 18); },
        alert: function (key) { return fire(playAlert, 'alert' + (key || ''), 3000, [18, 40, 18]); },
        setMuted: function (v) { muted = !!v; },
        isMuted: function () { return muted; }
    };

    // ---- 1) الإشعارات: نقارن القائمة الجديدة بالسابقة ----
    window.zoomySoundWatchNotifications = function (list, myId) {
        var arr = Array.isArray(list) ? list : [];
        var prev = window.__zoomySeenNotifications;
        if (prev && prev.size > 0) {
            var fresh = 0;
            for (var i = 0; i < arr.length; i++) {
                var n = arr[i];
                if (!n || n.is_read) continue;
                if (!prev.has(String(n.id))) fresh++;
            }
            if (fresh > 0) window.zoomySound.notification();
        }
        window.__zoomySeenNotifications = new Set(arr.map(function (n) { return String(n && n.id); }));
    };

    // ---- 2) الرسائل: نقارن أعلى معرّف مستقبَل بالسابق ----
    window.zoomySoundWatchMessages = function (messages, myIds) {
        var arr = Array.isArray(messages) ? messages : [];
        if (!arr.length) return false;
        var prev = window.__zoomySeenMessages;
        var mine = {};
        (myIds || []).forEach(function (id) { mine[String(id)] = true; });
        var incoming = 0;
        for (var i = 0; i < arr.length; i++) {
            var m = arr[i];
            if (!m) continue;
            var senderId = m.sender_id !== undefined ? m.sender_id : m.senderId;
            if (senderId !== undefined && mine[String(senderId)]) continue;
            if (prev && prev.has(String(m.id))) continue;
            if (prev) incoming++;
        }
        var ids = arr.map(function (m) { return String(m && m.id); });
        window.__zoomySeenMessages = new Set(ids);
        if (incoming > 0) {
            window.zoomySound.message();
            return true;
        }
        return false;
    };
})();
