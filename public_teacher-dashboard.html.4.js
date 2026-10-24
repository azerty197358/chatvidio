
        (function() {
            function handleGlobalError(errorMsg) {
                try {
                    const msg = String(errorMsg || '').toLowerCase();
                    if (
                        msg.includes('audio') || 
                        msg.includes('microphone') || 
                        msg.includes('getusermedia') || 
                        msg.includes('mediarecorder') || 
                        msg.includes('notallowederror') || 
                        msg.includes('notsupportederror') || 
                        msg.includes('aborterror') || 
                        msg.includes('notfounderror') ||
                        msg.includes('play()') ||
                        msg.includes('domexception') ||
                        msg.includes('networkerror') ||
                        msg.includes('failed to fetch')
                    ) {
                        console.warn("Ignored non-critical audio/media/network error:", errorMsg);
                        return;
                    }
                    console.warn("Platform error observed quietly:", errorMsg);
                } catch (e) {}
            }
            // لا شيء من هذا يصل إلى المستخدم أو إلى console
            window.onerror = function() { return true; };
            window.onunhandledrejection = function() { return true; };
        })();
    