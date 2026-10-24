
        (function() {
            const APP_VERSION = '4.3.0'; 
            try {
                const savedVersion = localStorage.getItem('app_version');
                if (savedVersion !== APP_VERSION) {
                    localStorage.setItem('app_version', APP_VERSION);
                    if ('caches' in window) {
                        caches.keys().then(function(names) {
                            for (let name of names) caches.delete(name);
                        });
                    }
                }
            } catch (e) {}
        })();
    