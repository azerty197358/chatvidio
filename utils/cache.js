// ============================================================
// Memory Cache Utility to dramatically reduce Supabase Egress
//
// Three layers on top of a plain map:
//   1. TTL            - a value is served until it expires
//   2. single flight  - ten concurrent callers share ONE database query
//   3. stale-while-revalidate - once a value expires the next caller still
//      gets the old value immediately while one background refresh runs, so
//      the page never waits on the database once it is warm
// ============================================================

class MemoryCache {
    constructor() {
        this.cache = new Map();
        this.inflight = new Map();
        this.waiters = new Map();
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
            // expired: keep it around as a stale fallback, but do not serve it
            // from get() - wrap() decides what to do with it
            return null;
        }
        return item.value;
    }

    /** the last known value even if it has expired, or null */
    getStale(key) {
        const item = this.cache.get(key);
        return item ? item.value : null;
    }

    isExpired(key) {
        const item = this.cache.get(key);
        return !item || Date.now() > item.expiresAt;
    }

    set(key, value, ttlSeconds = 30) {
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + (ttlSeconds * 1000),
            staleUntil: Date.now() + (ttlSeconds * 1000) + (STALE_WINDOW_MS)
        });
    }

    /**
     * Read-through with single flight.
     *
     * @param {string}   key
     * @param {Function} producer   async () => value, hits the database
     * @param {object}   options
     *        ttl       seconds the value stays fresh        (default 30)
     *        staleFor  seconds an expired value may still be served
     *                 while one refresh runs in the background (default 120)
     * @returns the cached value, or whatever producer() resolves to
     */
    async wrap(key, producer, options = {}) {
        const ttl = options.ttl === undefined ? 30 : options.ttl;
        const staleFor = options.staleFor === undefined ? STALE_WINDOW_MS / 1000 : options.staleFor;

        const fresh = this.cache.get(key);
        if (fresh && Date.now() <= fresh.expiresAt) {
            return fresh.value;
        }

        // someone else is already loading this key - ride along with them
        const pending = this.inflight.get(key);
        if (pending) {
            try {
                return await pending;
            } catch (e) {
                // the shared load failed: fall through and try on our own
            }
        }

        // serve the stale copy right away and refresh behind the user's back
        if (fresh && Date.now() <= fresh.staleUntil && fresh.value !== undefined) {
            this.refreshInBackground(key, producer, ttl);
            return fresh.value;
        }

        const loader = (async () => {
            const value = await producer();
            this.set(key, value, ttl);
            return value;
        })();

        this.inflight.set(key, loader);
        try {
            return await loader;
        } finally {
            if (this.inflight.get(key) === loader) this.inflight.delete(key);
        }
    }

    refreshInBackground(key, producer, ttl) {
        if (this.inflight.has(key)) return;
        const loader = (async () => {
            const value = await producer();
            this.set(key, value, ttl);
            return value;
        })();
        this.inflight.set(key, loader);
        loader
            .catch(() => { /* the stale value stays in place until it expires */ })
            .finally(() => {
                if (this.inflight.get(key) === loader) this.inflight.delete(key);
            });
    }

    /**
     * Join an in-progress load started by another request, if there is one.
     * Lets a handler that already has its own cache read/write lines opt into
     * single flight without restructuring its body.
     */
    join(key) {
        const w = this.waiters.get(key);
        return w ? w.promise : null;
    }

    /** Register this request as the owner of the load for `key`. */
    track(key) {
        if (this.waiters.has(key)) return null;
        let resolveFn, rejectFn;
        const promise = new Promise((res, rej) => { resolveFn = res; rejectFn = rej; });
        // a joiner must never keep the process alive or hang forever
        promise.catch(() => {});
        this.waiters.set(key, { promise: promise, resolve: resolveFn, reject: rejectFn });
        return promise;
    }

    /**
     * Store the result and hand it to everyone who joined.
     *
     * إذا مُسح المفتاح أثناء التحميل (كتابة/تعديل حذفته بالتوسط) فلا نُعيد
     * إحيائه ببيانات قادمة من الاستعلام القديم — وإلا عاد المستخدم يرى
     * المنشور قبل تعديله حتى20 ثانية رغم نجاح العملية.
     */
    publish(key, value, ttlSeconds = 30) {
        const w = this.waiters.get(key);
        if (!w) {
            // التحميل بدأ قبل الإبطال: نتيجته قديمة — ن discardها بهدوء
            return;
        }
        this.waiters.delete(key);
        this.set(key, value, ttlSeconds);
        w.resolve(value);
    }

    /** Give up on the load; joiners fall through and try on their own. */
    abandon(key) {
        const w = this.waiters.get(key);
        if (w) { this.waiters.delete(key); w.reject(new Error('abandoned')); }
    }

    delete(key) {
        this.cache.delete(key);
    }

    clearByPattern(prefix) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
        // نُلغي أيضاً التحميلات الجارية لهذا النمط: وعدها سيحل ببيانات
        // مُطلوبة قبل الإبطال، ومنتظروها سيتجمدون بلا فائدة
        for (const key of this.inflight.keys()) {
            if (key.startsWith(prefix)) {
                this.inflight.delete(key);
            }
        }
        for (const key of this.waiters.keys()) {
            if (key.startsWith(prefix)) {
                const w = this.waiters.get(key);
                this.waiters.delete(key);
                if (w) w.reject(new Error('cache-cleared'));
            }
        }
    }

    /** drop the keys a prefix family so the next read rebuilds them */
    invalidate(key) {
        this.delete(key);
    }

    clear() {
        this.cache.clear();
    }
}

const STALE_WINDOW_MS = 120 * 1000;

const memoryCache = new MemoryCache();

module.exports = memoryCache;