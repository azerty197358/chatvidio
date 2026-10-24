
// الشبكة - حالة الاتصال بالانترنت
window.addEventListener("online", function() {
    if (typeof showToast === "function") {
        showToast("✅ تم الاتصال بالإنترنت", "success");
        setTimeout(() => window.location.reload(), 1500);
    } else {
        const msg = document.createElement("div");
        msg.innerHTML = "✅ تم الاتصال بالإنترنت";
        msg.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#10b981; color:white; padding:12px 24px; border-radius:8px; font-weight:bold; z-index:999999; box-shadow:0 4px 12px rgba(0,0,0,0.2); font-family:Cairo,sans-serif;";
        document.body.appendChild(msg);
        setTimeout(() => window.location.reload(), 1500);
    }
});

window.addEventListener("offline", function() {
    if (typeof showToast === "function") {
        showToast("❌ فقد الاتصال بالإنترنت", "error");
    } else {
        const msg = document.createElement("div");
        msg.id = "offline-toast-msg";
        msg.innerHTML = "❌ فقد الاتصال بالإنترنت";
        msg.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#ef4444; color:white; padding:12px 24px; border-radius:8px; font-weight:bold; z-index:999999; box-shadow:0 4px 12px rgba(0,0,0,0.2); font-family:Cairo,sans-serif;";
        document.body.appendChild(msg);
        setTimeout(() => {
            if (document.getElementById("offline-toast-msg")) {
                document.getElementById("offline-toast-msg").remove();
            }
        }, 3000);
    }
});
    