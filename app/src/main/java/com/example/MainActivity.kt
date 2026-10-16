package com.example

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.webkit.*
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import com.example.ui.theme.MyApplicationTheme
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : ComponentActivity() {

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var cameraImageUri: Uri? = null
    private var pendingFileChooserParams: WebChromeClient.FileChooserParams? = null
    private var pendingPermissionRequest: PermissionRequest? = null
    private var persistentWebView: WebView? = null
    // رابط عميق (zoomdz://auth?...) بانتظار تجهيز الـ WebView عند فتح التطبيق
    @Volatile private var pendingDeepLinkUrl: String? = null
    // مُشغّل نافذة اختيار حساب Google من حسابات الجهاز (Google Play Services)
    private val googleSignInLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
    ) { result ->
        handleGoogleSignInResult(result.data)
    }
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var savedWebViewState: Bundle? = null

    companion object {
        const val PLATFORM_URL = "https://zoomdz.com/"
        const val BACKUP_URL = "https://zooooooom-mown.vercel.app"
    }

    // Permission launcher for runtime permissions (Camera, Storage, Media, Audio, Notifications)
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        // Handle pending WebRTC (Stream / Camera / Mic) permission request
        pendingPermissionRequest?.let { req ->
            val requested = req.resources
            val grantedList = mutableListOf<String>()
            for (res in requested) {
                if (res == PermissionRequest.RESOURCE_VIDEO_CAPTURE &&
                    ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    grantedList.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                }
                if (res == PermissionRequest.RESOURCE_AUDIO_CAPTURE &&
                    ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    grantedList.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                }
            }
            if (grantedList.isNotEmpty()) {
                req.grant(grantedList.toTypedArray())
            } else {
                req.deny()
            }
            pendingPermissionRequest = null
        }

        // Handle pending file chooser request
        if (filePathCallback != null) {
            launchFileChooserIntent(pendingFileChooserParams)
        }
    }

    // File chooser launcher with robust camera + gallery handling
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        var results: Array<Uri>? = null

        if (result.resultCode == RESULT_OK) {
            val clipData = result.data?.clipData
            val dataString = result.data?.dataString
            val singleUri = result.data?.data

            if (clipData != null && clipData.itemCount > 0) {
                val list = mutableListOf<Uri>()
                for (i in 0 until clipData.itemCount) {
                    val itemUri = clipData.getItemAt(i)?.uri
                    if (itemUri != null) {
                        list.add(itemUri)
                    }
                }
                if (list.isNotEmpty()) {
                    results = list.toTypedArray()
                }
            } else if (singleUri != null) {
                results = arrayOf(singleUri)
            } else if (dataString != null) {
                try {
                    results = arrayOf(Uri.parse(dataString))
                } catch (e: Exception) {
                    // Ignore parse error
                }
            } else if (cameraImageUri != null) {
                try {
                    results = arrayOf(cameraImageUri!!)
                } catch (e: Exception) {
                    // Ignore
                }
            }
        }

        try {
            filePathCallback?.onReceiveValue(results)
        } catch (e: Exception) {
            // Safeguard against webview callback failures
        } finally {
            filePathCallback = null
            cameraImageUri = null
            pendingFileChooserParams = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        savedWebViewState = savedInstanceState
        savedInstanceState?.getString("saved_camera_uri")?.let {
            cameraImageUri = Uri.parse(it)
        }

        // فتح التطبيق عبر رابط عميق (zoomdz://auth بعد تسجيل جوجل أو رابط صفحة)
        pendingDeepLinkUrl = buildDeepLinkUrl(intent)

        requestAppStartupPermissions()
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = Color.parseColor("#0B172A")
        window.navigationBarColor = Color.parseColor("#0B172A")

        setContent {
            MyApplicationTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = ComposeColor(0xFF0B172A)
                ) {
                    PlatformWebViewScreen()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val deepLink = buildDeepLinkUrl(intent) ?: return
        val wv = persistentWebView
        if (wv != null) {
            wv.post { wv.loadUrl(deepLink) }
        } else {
            pendingDeepLinkUrl = deepLink
        }
    }

    // تحويل نية فتح خارجية إلى رابط يُحمَّل داخل التطبيق:
    // zoomdz://auth?... ← صفحة المنصة الرئيسية لحفظ الجلسة، أو رابط https عادي.
    private fun buildDeepLinkUrl(intent: Intent?): String? {
        // إشعار المنصة يمرّر الرابط عبر extra وليس data
        val extraUrl = intent?.getStringExtra("target_url")
        if (!extraUrl.isNullOrBlank() && (extraUrl.startsWith("http://") || extraUrl.startsWith("https://"))) {
            return extraUrl
        }
        val data = intent?.data ?: return null
        val scheme = data.scheme?.lowercase() ?: return null
        return try {
            if (scheme == "zoomdz") {
                val query = data.encodedQuery
                if (query.isNullOrBlank()) return null
                "${currentPlatformOrigin()}/?$query"
            } else if (scheme == "http" || scheme == "https") {
                data.toString()
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun currentPlatformOrigin(): String {
        try {
            val current = persistentWebView?.url
            if (!current.isNullOrBlank() && current.startsWith("http")) {
                val match = Regex("^(https?://[^/]+)").find(current)
                if (match != null) return match.groupValues[1]
            }
        } catch (e: Exception) {}
        return PLATFORM_URL.trimEnd('/')
    }

    // ============ تسجيل الدخول عبر Google بحسابات الجهاز (اختيار مباشر) ============
    @Volatile private var pendingGoogleRole: String = "student"
    @Volatile private var pendingGoogleRef: String = ""

    // فتح قائمة اختيار حسابات جوجل المحفوظة على الجهاز نفسه (بدون متصفح)
    fun startNativeGoogleSignIn(role: String?, ref: String?): Boolean {
        return try {
            pendingGoogleRole = if (role.isNullOrBlank()) "student" else role
            pendingGoogleRef = ref ?: ""
            Thread {
                try {
                    val clientId = fetchGoogleClientId()
                    if (clientId.isBlank()) {
                        notifyGoogleNativeFailed("تعذر تهيئة تسجيل الدخول عبر Google")
                        return@Thread
                    }
                    runOnUiThread {
                        try {
                            val options = com.google.android.gms.auth.api.signin.GoogleSignInOptions.Builder(
                                com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN
                            )
                                .requestIdToken(clientId)
                                .requestEmail()
                                .build()
                            val client = com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(this@MainActivity, options)
                            // نخرج من أي جلسة سابقة ليظهر دائماً قائمة الاختيار
                            // بجميع حسابات الجهاز بدل الدخول الصامت بحساب واحد
                            client.signOut().addOnCompleteListener {
                                try {
                                    googleSignInLauncher.launch(client.signInIntent)
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                    notifyGoogleNativeFailed("تعذر فتح قائمة حسابات Google")
                                }
                            }
                        } catch (e: Exception) {
                            e.printStackTrace()
                            notifyGoogleNativeFailed("تعذر فتح قائمة حسابات Google")
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                    notifyGoogleNativeFailed("تعذر الاتصال بخدمات Google")
                }
            }.start()
            true
        } catch (e: Exception) {
            false
        }
    }

    // جلب معرّف تطبيق الويب من خادم المنصة (مطلوب لمطابقة رمز الدخول)
    private fun fetchGoogleClientId(): String {
        return try {
            val url = java.net.URL("${currentPlatformOrigin()}/api/auth/google/config")
            val conn = url.openConnection() as java.net.HttpURLConnection
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            Regex("\"client_id\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.get(1)?.trim() ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    // فشل مسار الجهاز → نُعلم الصفحة بالانتقال لمسار متصفح النظام الاحتياطي
    private fun notifyGoogleNativeFailed(message: String) {
        runOnUiThread {
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
            try {
                persistentWebView?.evaluateJavascript(
                    "(function(){ try { if (window.__zoomdzGoogleNativeFailed) window.__zoomdzGoogleNativeFailed(); } catch(e) {} })()",
                    null
                )
            } catch (e: Exception) {}
        }
    }

    // نتيجة اختيار الحساب: نستبدل الرمز بجلسة المنصة وندخل داخل التطبيق
    private fun handleGoogleSignInResult(data: Intent?) {
        Thread {
            try {
                val accountTask = com.google.android.gms.auth.api.signin.GoogleSignIn.getSignedInAccountFromIntent(data)
                val account = accountTask.getResult(com.google.android.gms.api.ApiException::class.java)
                val idToken = account?.idToken
                if (idToken.isNullOrBlank()) {
                    notifyGoogleNativeFailed("لم يتم استلام رمز الحساب، حاول مجدداً")
                    return@Thread
                }
                val origin = currentPlatformOrigin()
                val conn = java.net.URL("$origin/api/auth/google").openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.connectTimeout = 15000
                conn.readTimeout = 15000
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                val payload = org.json.JSONObject().apply {
                    put("credential", idToken)
                    put("role", pendingGoogleRole)
                    if (pendingGoogleRef.isNotBlank()) put("ref", pendingGoogleRef)
                }
                conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
                val respCode = conn.responseCode
                val body = (if (respCode in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()?.use { it.readText() } ?: ""
                conn.disconnect()
                if (respCode !in 200..299) {
                    notifyGoogleNativeFailed("رفض الخادم تسجيل الدخول، سننقلك للمتصفح")
                    return@Thread
                }
                val json = org.json.JSONObject(body)
                val sessionToken = json.optString("token", "")
                if (!json.optBoolean("success", false) || sessionToken.isBlank()) {
                    notifyGoogleNativeFailed(json.optString("error", "تعذر إتمام الدخول، سننقلك للمتصفح"))
                    return@Thread
                }
                val role = json.optString("role", pendingGoogleRole)
                val redirectTo = json.optString(
                    "redirectTo",
                    if (role == "teacher") "/teacher-dashboard.html" else "/student-dashboard.html"
                )
                val requiresCompletion = json.optBoolean("requires_profile_completion", false)
                val userValue = json.opt("user")
                val userEnc = java.net.URLEncoder.encode(
                    if (userValue != null && userValue !== org.json.JSONObject.NULL) userValue.toString() else "",
                    "UTF-8"
                )
                val sessionUrl = "$origin/?token=" + java.net.URLEncoder.encode(sessionToken, "UTF-8") +
                    "&role=" + java.net.URLEncoder.encode(role, "UTF-8") +
                    "&redirectTo=" + java.net.URLEncoder.encode(redirectTo, "UTF-8") +
                    (if (requiresCompletion) "&requires_profile_completion=true" else "") +
                    "&userData=" + userEnc
                runOnUiThread { persistentWebView?.loadUrl(sessionUrl) }
            } catch (e: com.google.android.gms.api.ApiException) {
                if (e.statusCode == 12501) {
                    // المستخدم أغلق قائمة الاختيار بنفسه — لا شيء نفعل
                    runOnUiThread { Toast.makeText(this, "تم إلغاء اختيار حساب Google", Toast.LENGTH_SHORT).show() }
                } else {
                    e.printStackTrace()
                    notifyGoogleNativeFailed("تعذر إكمال الدخول، سننقلك لمتصفح النظام")
                }
            } catch (e: Exception) {
                e.printStackTrace()
                notifyGoogleNativeFailed("تعذر إكمال الدخول، سننقلك لمتصفح النظام")
            }
        }.start()
    }

    private fun getRequiredPermissions(): Array<String> {
        val permissions = mutableListOf<String>()
        permissions.add(Manifest.permission.CAMERA)
        permissions.add(Manifest.permission.RECORD_AUDIO)
        permissions.add(Manifest.permission.MODIFY_AUDIO_SETTINGS)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // Android 14+
            permissions.add(Manifest.permission.READ_MEDIA_IMAGES)
            permissions.add(Manifest.permission.READ_MEDIA_VIDEO)
            permissions.add(Manifest.permission.READ_MEDIA_AUDIO)
            permissions.add(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // Android 13
            permissions.add(Manifest.permission.READ_MEDIA_IMAGES)
            permissions.add(Manifest.permission.READ_MEDIA_VIDEO)
            permissions.add(Manifest.permission.READ_MEDIA_AUDIO)
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        } else { // Android 12 and below
            permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
        return permissions.toTypedArray()
    }

    private fun hasAllPermissions(): Boolean {
        return getRequiredPermissions().all { perm ->
            ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun requestAppStartupPermissions() {
        val missingPermissions = getRequiredPermissions().filter { perm ->
            ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED
        }
        if (missingPermissions.isNotEmpty()) {
            permissionLauncher.launch(missingPermissions.toTypedArray())
        }
    }

    private var chunkOutputStream: java.io.FileOutputStream? = null
    private var currentChunkFile: File? = null

    @Synchronized
    fun saveBase64Chunk(chunkBase64: String, fileName: String, mimeType: String, isFirst: Boolean, isLast: Boolean) {
        try {
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            if (isFirst || currentChunkFile == null) {
                try { chunkOutputStream?.close() } catch (ignored: Throwable) {}
                val safeName = if (fileName.isBlank()) "zoomdz_stream_${System.currentTimeMillis()}.webm" else fileName
                currentChunkFile = File(downloadsDir, safeName)
                chunkOutputStream = java.io.FileOutputStream(currentChunkFile!!, false)
            }

            val cleanChunk = if (chunkBase64.contains(",")) chunkBase64.substringAfter(",") else chunkBase64
            val sanitized = cleanChunk.replace("\\s+".toRegex(), "")
            val fileBytes = Base64.decode(sanitized, Base64.NO_WRAP or Base64.DEFAULT)

            chunkOutputStream?.write(fileBytes)

            if (isLast) {
                chunkOutputStream?.flush()
                chunkOutputStream?.close()
                chunkOutputStream = null

                val savedFile = currentChunkFile
                currentChunkFile = null
                if (savedFile != null && savedFile.exists()) {
                    val cleanMime = if (mimeType.isBlank() || mimeType == "application/octet-stream") {
                        if (fileName.endsWith(".mp4")) "video/mp4" else "video/webm"
                    } else mimeType

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        try {
                            val contentValues = ContentValues().apply {
                                put(MediaStore.MediaColumns.DISPLAY_NAME, savedFile.name)
                                put(MediaStore.MediaColumns.MIME_TYPE, cleanMime)
                                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                            }
                            applicationContext.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                        } catch (e: Throwable) {
                            e.printStackTrace()
                        }
                    } else {
                        try {
                            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                            dm.addCompletedDownload(savedFile.name, "تسجيل بث ZoomDz", true, cleanMime, savedFile.absolutePath, savedFile.length(), true)
                        } catch (e: Throwable) {
                            e.printStackTrace()
                        }
                    }

                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "✅ تم حفظ تسجيل البث بنجاح في مجلد التنزيلات: ${savedFile.name}", Toast.LENGTH_LONG).show()
                    }
                }
            }
        } catch (t: Throwable) {
            t.printStackTrace()
            try { chunkOutputStream?.close() } catch (ignored: Throwable) {}
            chunkOutputStream = null
            currentChunkFile = null
            runOnUiThread {
                Toast.makeText(this@MainActivity, "❌ تعذر حفظ البث: ${t.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    fun saveBase64File(base64Data: String, fileName: String, mimeType: String) {
        try {
            val pureBase64 = if (base64Data.contains(",")) {
                base64Data.substringAfter(",")
            } else {
                base64Data
            }
            val sanitized = pureBase64.replace("\\s+".toRegex(), "")
            val fileBytes = Base64.decode(sanitized, Base64.NO_WRAP or Base64.DEFAULT)

            val cleanMime = if (mimeType.isBlank() || mimeType == "application/octet-stream") {
                if (fileName.endsWith(".mp4")) "video/mp4"
                else if (fileName.endsWith(".webm")) "video/webm"
                else if (fileName.endsWith(".pdf")) "application/pdf"
                else "video/webm"
            } else mimeType

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                    put(MediaStore.MediaColumns.MIME_TYPE, cleanMime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val resolver = applicationContext.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                if (uri != null) {
                    resolver.openOutputStream(uri)?.use { os ->
                        os.write(fileBytes)
                    }
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "✅ تم حفظ التنزيل في مجلد التنزيلات: $fileName", Toast.LENGTH_LONG).show()
                    }
                } else {
                    throw Exception("Could not create MediaStore Download entry")
                }
            } else {
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (!downloadsDir.exists()) downloadsDir.mkdirs()
                val file = File(downloadsDir, fileName)
                file.writeBytes(fileBytes)

                val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                dm.addCompletedDownload(
                    fileName,
                    "تسجيل بث ZoomDz",
                    true,
                    cleanMime,
                    file.absolutePath,
                    file.length(),
                    true
                )
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "✅ تم حفظ التنزيل في مجلد التنزيلات: $fileName", Toast.LENGTH_LONG).show()
                }
            }
        } catch (t: Throwable) {
            t.printStackTrace()
            runOnUiThread {
                Toast.makeText(this@MainActivity, "❌ تعذر حفظ الملف: ${t.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelId = "zoomdz_notifications"
            val channelName = "إشعارات منصة ZoomDz"
            val channelDesc = "تنبيهات الدروس والطلبات الجديدة والرسائل"
            val importance = android.app.NotificationManager.IMPORTANCE_HIGH
            val channel = android.app.NotificationChannel(channelId, channelName, importance).apply {
                description = channelDesc
                enableVibration(true)
                enableLights(true)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    fun showNativeNotification(title: String, body: String, targetUrl: String? = null) {
        try {
            createNotificationChannel()
            val channelId = "zoomdz_notifications"
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                if (!targetUrl.isNullOrBlank()) {
                    putExtra("target_url", targetUrl)
                }
            }
            val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            } else {
                android.app.PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pendingIntent = android.app.PendingIntent.getActivity(this, System.currentTimeMillis().toInt(), intent, pendingIntentFlags)

            val builder = androidx.core.app.NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setDefaults(androidx.core.app.NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)

            val notificationManager = androidx.core.app.NotificationManagerCompat.from(this)
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                notificationManager.notify(System.currentTimeMillis().toInt(), builder.build())
            }
        } catch (t: Throwable) {
            t.printStackTrace()
        }
    }

    fun startStandardDownload(url: String, userAgent: String?, contentDisposition: String?, mimeType: String?, fileName: String) {
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                val cleanMime = if (mimeType.isNullOrBlank() || mimeType == "application/octet-stream") {
                    if (fileName.endsWith(".mp4")) "video/mp4"
                    else if (fileName.endsWith(".webm")) "video/webm"
                    else if (fileName.endsWith(".pdf")) "application/pdf"
                    else "application/octet-stream"
                } else mimeType
                setMimeType(cleanMime)

                if (!userAgent.isNullOrBlank()) {
                    addRequestHeader("User-Agent", userAgent)
                }
                val cookies = CookieManager.getInstance().getCookie(url)
                if (!cookies.isNullOrEmpty()) {
                    addRequestHeader("Cookie", cookies)
                }
                setTitle(fileName)
                setDescription("جاري تنزيل الملف...")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                setAllowedOverMetered(true)
                setAllowedOverRoaming(true)
            }
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
            runOnUiThread {
                Toast.makeText(this@MainActivity, "📥 جاري تحميل $fileName في التنزيلات...", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            runOnUiThread {
                Toast.makeText(this@MainActivity, "❌ خطأ في التنزيل: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun createTempCameraImageUri(): Uri? {
        return try {
            val storageDir = File(cacheDir, "camera_images").apply { if (!exists()) mkdirs() }
            val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val imageFile = File(storageDir, "IMG_${timeStamp}.jpg")
            if (!imageFile.exists()) {
                imageFile.createNewFile()
            }
            FileProvider.getUriForFile(this, "${applicationContext.packageName}.fileprovider", imageFile)
        } catch (e: Exception) {
            null
        }
    }

    private fun launchFileChooserIntent(params: WebChromeClient.FileChooserParams?) {
        try {
            val intentList = mutableListOf<Intent>()

            // 1. Camera capture intent with FileProvider
            cameraImageUri = createTempCameraImageUri()
            if (cameraImageUri != null) {
                val takePictureIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                    putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                }
                if (takePictureIntent.resolveActivity(packageManager) != null) {
                    intentList.add(takePictureIntent)
                }
            }

            // 2. Primary document / gallery / file picker intent
            val mimeTypes = params?.acceptTypes?.filter { it.isNotBlank() }?.toTypedArray()
            val pickIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = if (mimeTypes != null && mimeTypes.isNotEmpty()) {
                    if (mimeTypes.size == 1) mimeTypes[0] else "*/*"
                } else {
                    "*/*"
                }
                if (mimeTypes != null && mimeTypes.size > 1) {
                    putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes)
                }
                if (params?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
            }

            val chooserIntent = Intent.createChooser(pickIntent, "اختيار ملف أو صورة").apply {
                if (intentList.isNotEmpty()) {
                    putExtra(Intent.EXTRA_INITIAL_INTENTS, intentList.toTypedArray())
                }
            }

            fileChooserLauncher.launch(chooserIntent)
        } catch (e: Exception) {
            // Fallback to simple file picker if chooser crashes
            try {
                val fallbackIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                fileChooserLauncher.launch(Intent.createChooser(fallbackIntent, "اختيار ملف"))
            } catch (fallbackEx: Exception) {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = null
            }
        }
    }

    @Composable
    private fun PlatformWebViewScreen() {
        var isLoading by remember { mutableStateOf(persistentWebView?.url == null) }
        var hasError by remember { mutableStateOf(false) }
        var progress by remember { mutableStateOf(100) }

        BackHandler { handleBack() }

        Box(modifier = Modifier.fillMaxSize()) {
            PlatformWebView(
                onProgress = { progress = it; if (it >= 90) isLoading = false },
                onPageStarted = { isLoading = true; hasError = false },
                onPageFinished = { isLoading = false; hasError = false },
                onError = { isLoading = false; hasError = true }
            )

            if (isLoading && progress in 1..99) {
                LinearProgressIndicator(
                    progress = { progress / 100f },
                    modifier = Modifier.fillMaxWidth().height(3.dp).align(Alignment.TopCenter),
                    color = ComposeColor(0xFF3B82F6),
                    trackColor = ComposeColor.Transparent
                )
            }

            AnimatedVisibility(visible = isLoading && progress < 40, enter = fadeIn(), exit = fadeOut()) {
                LoadingScreen()
            }

            AnimatedVisibility(visible = hasError, enter = fadeIn(), exit = fadeOut()) {
                ErrorScreen {
                    hasError = false
                    isLoading = true
                    val targetUrl = if (isOnline()) PLATFORM_URL else BACKUP_URL
                    persistentWebView?.loadUrl(targetUrl)
                }
            }
        }
    }

    @Composable
    private fun LoadingScreen() {
        val transition = rememberInfiniteTransition(label = "load")
        Box(
            modifier = Modifier.fillMaxSize().background(
                Brush.verticalGradient(listOf(ComposeColor(0xFF0B172A), ComposeColor(0xFF0F172A)))
            ),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(110.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(ComposeColor(0xFF1E293B)),
                    contentAlignment = Alignment.Center
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.app_logo),
                        contentDescription = "ZoomDz Logo",
                        modifier = Modifier.size(90.dp).clip(RoundedCornerShape(18.dp))
                    )
                }
                Spacer(Modifier.height(28.dp))
                CircularProgressIndicator(color = ComposeColor(0xFF3B82F6), strokeWidth = 3.5.dp, modifier = Modifier.size(36.dp))
                Spacer(Modifier.height(20.dp))
                Text("منصة ZoomDz التعليمية", color = ComposeColor.White, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                Text("جاري الاتصال بالمنصة...", color = ComposeColor(0xFF94A3B8), fontSize = 14.sp)
            }
        }
    }

    @Composable
    private fun ErrorScreen(onRetry: () -> Unit) {
        Box(
            modifier = Modifier.fillMaxSize().background(ComposeColor(0xFF0B172A)),
            contentAlignment = Alignment.Center
        ) {
            Card(
                modifier = Modifier.fillMaxWidth(0.9f).padding(16.dp),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = ComposeColor(0xFF1E293B)),
                elevation = CardDefaults.cardElevation(8.dp)
            ) {
                Column(modifier = Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        modifier = Modifier.size(72.dp).clip(CircleShape).background(ComposeColor(0x22EF4444)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.WifiOff, "No Internet", tint = ComposeColor(0xFFEF4444), modifier = Modifier.size(36.dp))
                    }
                    Spacer(Modifier.height(20.dp))
                    Text("تعذر الاتصال بالمنصة", color = ComposeColor.White, fontSize = 20.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "يرجى التحقق من اتصال هاتفك بالإنترنت والمحاولة مجدداً.",
                        color = ComposeColor(0xFF94A3B8), fontSize = 14.sp, textAlign = TextAlign.Center, lineHeight = 22.sp
                    )
                    Spacer(Modifier.height(24.dp))
                    Button(
                        onClick = onRetry,
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = ComposeColor(0xFF2563EB))
                    ) {
                        Icon(Icons.Default.Refresh, "Retry", tint = ComposeColor.White, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("إعادة المحاولة", color = ComposeColor.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun initOrGetWebView(ctx: Context): WebView {
        if (persistentWebView != null) {
            val parent = persistentWebView?.parent as? ViewGroup
            parent?.removeView(persistentWebView)
            return persistentWebView!!
        }

        val wv = WebView(ctx).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0B172A"))

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val targetUrl = request?.url?.toString() ?: return false
                    val host = request.url.host ?: ""

                    // Internal resources, data URIs, blobs stay in WebView
                    if (targetUrl.startsWith("blob:") || targetUrl.startsWith("data:") || targetUrl.startsWith("javascript:") || targetUrl.startsWith("about:")) {
                        return false
                    }

                    // العودة من متصفح النظام بعد تسجيل جوجل (zoomdz://auth?token=...)
                    // نحولها لرابط المنصة داخل التطبيق لحفظ الجلسة — تشمل حالة
                    // الرجوع لتطبيق يفتح OAuth داخل WebView نفسه عند تعذّر المتصفح الخارجي.
                    if (targetUrl.startsWith("zoomdz://")) {
                        val handoffQuery = targetUrl.substringAfter('?', "")
                        if (handoffQuery.isNotBlank()) {
                            view?.loadUrl("${currentPlatformOrigin()}/?$handoffQuery")
                        }
                        return true
                    }

                    // Keep platform URLs inside the WebView — النطاق المخصص + مضيف
                    // Render. أي تحويل إلى onrender.com كان يُفتح خارج التطبيق
                    // فيبدو كأن الروابط لا تُفتح داخله إطلاقاً.
                    val isPlatform = host.contains("zoomdz.com") || host.contains("onrender.com") ||
                        host.contains("vercel.app") || host.contains("localhost") || targetUrl.startsWith("file://")
                    // مصادقة جوجل تُكمَل في متصفح النظام: هناك تظهر حسابات المستخدم
                    // المحفوظة ليختار منها واحدة بضغطة واحدة (داخل الـ WebView لا توجد
                    // جلسة جوجل فيُطلب منه إدخال بريده وكلمه يدوياً)، ثم يعود للتطبيق
                    // تلقائياً عبر zoomdz://auth مسجّلاً بالفعل.
                    val isGoogleAuth = host.contains("google.com") || host.contains("googleapis.com")
                    if (isPlatform && !isGoogleAuth) return false
                    if (isGoogleAuth) {
                        return try {
                            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            true
                        } catch (e: Exception) {
                            false // فشل فتح المتصفح الخارجي: نُكمل داخل التطبيق
                        }
                    }

                    // Open external links in browser or respective apps — وإن تعذّر
                    // فتحه خارجياً نُحمّله داخل التطبيق بدل أن يبقى الرابط ميتاً
                    if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://") || targetUrl.contains("t.me/") || targetUrl.startsWith("tg:") || targetUrl.contains("whatsapp") || targetUrl.startsWith("wa.me")) {
                        return try {
                            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            true
                        } catch (e: Exception) {
                            false
                        }
                    }
                    if (targetUrl.startsWith("tel:") || targetUrl.startsWith("mailto:") || targetUrl.startsWith("sms:")) {
                        return try {
                            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)))
                            true
                        } catch (e: Exception) {
                            false
                        }
                    }
                    return false
                }

                override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                    super.onReceivedError(view, request, error)
                    if (request?.isForMainFrame == true) {
                        val failUrl = request.url.toString()
                        if (failUrl.contains("zoomdz.com") || failUrl.contains("onrender.com")) {
                            view?.loadUrl(BACKUP_URL)
                        }
                    }
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    val notifPollJs = """
                        (function() {
                            if (window.__zoomdz_notif_bridge_injected) return;
                            window.__zoomdz_notif_bridge_injected = true;

                            function checkAndNotifyNative() {
                                if (!window.ZoomDzNative || typeof window.ZoomDzNative.showNativeNotification !== 'function') return;
                                try {
                                    var userRole = localStorage.getItem('user_role') || (location.href.indexOf('teacher') !== -1 ? 'teacher' : 'student');
                                    var userId = localStorage.getItem('user_id') || localStorage.getItem('student_id') || localStorage.getItem('teacher_id');
                                    var token = localStorage.getItem('token');
                                    if (!userId || !token) return;

                                    fetch('/api/notifications/' + userId + '/' + userRole, {
                                        headers: { 'Authorization': 'Bearer ' + token }
                                    }).then(function(r) { return r.json(); }).then(function(notifs) {
                                        if (!Array.isArray(notifs)) return;
                                        var notified = JSON.parse(localStorage.getItem('native_notified_ids') || '[]');
                                        notifs.forEach(function(n) {
                                            if (!n.is_read && notified.indexOf(n.id) === -1) {
                                                notified.push(n.id);
                                                var targetUrl = userRole === 'teacher' ? '/teacher-dashboard.html' : '/student-dashboard.html';
                                                window.ZoomDzNative.showNativeNotification(n.title || 'ZoomDz', n.message || '', targetUrl);
                                            }
                                        });
                                        if (notified.length > 200) notified = notified.slice(-100);
                                        localStorage.setItem('native_notified_ids', JSON.stringify(notified));
                                    }).catch(function(e){});
                                } catch(e){}
                            }

                            setInterval(checkAndNotifyNative, 20000);
                            setTimeout(checkAndNotifyNative, 3000);
                        })();
                    """.trimIndent()
                    view?.evaluateJavascript(notifPollJs, null)
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(wv: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                    // Cancel any prior dangling callback to prevent WebView locking
                    filePathCallback?.onReceiveValue(null)
                    filePathCallback = callback
                    pendingFileChooserParams = params

                    // Check storage/media/camera permissions
                    val permissionsToCheck = mutableListOf<String>()
                    permissionsToCheck.add(Manifest.permission.CAMERA)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        permissionsToCheck.add(Manifest.permission.READ_MEDIA_IMAGES)
                        permissionsToCheck.add(Manifest.permission.READ_MEDIA_VIDEO)
                        permissionsToCheck.add(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        permissionsToCheck.add(Manifest.permission.READ_MEDIA_IMAGES)
                        permissionsToCheck.add(Manifest.permission.READ_MEDIA_VIDEO)
                    } else {
                        permissionsToCheck.add(Manifest.permission.READ_EXTERNAL_STORAGE)
                    }

                    val missing = permissionsToCheck.filter {
                        ContextCompat.checkSelfPermission(this@MainActivity, it) != PackageManager.PERMISSION_GRANTED
                    }

                    if (missing.isNotEmpty()) {
                        permissionLauncher.launch(missing.toTypedArray())
                        return true
                    }

                    launchFileChooserIntent(params)
                    return true
                }

                override fun onPermissionRequest(request: PermissionRequest?) {
                    if (request == null) return
                    val neededAndroidPermissions = mutableListOf<String>()

                    for (res in request.resources) {
                        if (res == PermissionRequest.RESOURCE_VIDEO_CAPTURE) {
                            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                                neededAndroidPermissions.add(Manifest.permission.CAMERA)
                            }
                        }
                        if (res == PermissionRequest.RESOURCE_AUDIO_CAPTURE) {
                            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                                neededAndroidPermissions.add(Manifest.permission.RECORD_AUDIO)
                            }
                        }
                    }

                    if (neededAndroidPermissions.isNotEmpty()) {
                        pendingPermissionRequest = request
                        permissionLauncher.launch(neededAndroidPermissions.toTypedArray())
                    } else {
                        request.grant(request.resources)
                    }
                }

                override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                    callback?.invoke(origin, true, false)
                }

                override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                    if (customView != null) { callback?.onCustomViewHidden(); return }
                    customView = view
                    customViewCallback = callback
                    (window.decorView as FrameLayout).addView(view, FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT
                    ))
                    window.decorView.systemUiVisibility = (
                        View.SYSTEM_UI_FLAG_FULLSCREEN or
                        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    )
                }

                override fun onHideCustomView() {
                    (window.decorView as? FrameLayout)?.removeView(customView)
                    customView = null
                    customViewCallback?.onCustomViewHidden()
                    customViewCallback = null
                    window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
                }

                // دعم window.open و target="_blank": بدون معالج نافذة جديدة
                // تُفتح الروابط صامتاً ويبدو كأن التطبيق لا يدعم فتح الروابط إطلاقاً
                override fun onCreateWindow(view: WebView?, isDialog: Boolean, isUserGesture: Boolean, resultMsg: android.os.Message?): Boolean {
                    val newWebView = WebView(view?.context ?: this@MainActivity)
                    newWebView.settings.javaScriptEnabled = true
                    newWebView.settings.domStorageEnabled = true
                    newWebView.webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(v: WebView?, req: WebResourceRequest?): Boolean {
                            val u = req?.url?.toString() ?: return false
                            val h = req.url.host ?: ""
                            val platform = h.contains("zoomdz.com") || h.contains("onrender.com") ||
                                h.contains("vercel.app") || h.contains("localhost")
                            val auth = h.contains("google.com")
                            if (platform || auth || u.startsWith("blob:") || u.startsWith("data:")) {
                                runOnUiThread { persistentWebView?.loadUrl(u) }
                                return true
                            }
                            return try {
                                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                                true
                            } catch (e: Exception) {
                                runOnUiThread { persistentWebView?.loadUrl(u) }
                                true
                            }
                        }
                    }
                    val transport = resultMsg?.obj as? WebView.WebViewTransport
                    transport?.webView = newWebView
                    resultMsg?.sendToTarget()
                    return true
                }
            }

            val cookieManager = CookieManager.getInstance()
            cookieManager.setAcceptCookie(true)
            cookieManager.setAcceptThirdPartyCookies(this, true)

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                loadsImagesAutomatically = true
                loadWithOverviewMode = true
                useWideViewPort = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                cacheMode = WebSettings.LOAD_DEFAULT
                javaScriptCanOpenWindowsAutomatically = true
                setSupportMultipleWindows(true)
                setSupportZoom(true)
                builtInZoomControls = true
                displayZoomControls = false
                textZoom = 100
                userAgentString = "$userAgentString ZoomDzNativeAndroid/2.2.0"
            }

            setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
                val guessedName = URLUtil.guessFileName(url, contentDisposition, mimetype)
                val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
                val safeMime = if (mimetype.isNullOrBlank() || mimetype == "application/octet-stream") {
                    if (guessedName.endsWith(".mp4") || url.contains("mp4")) "video/mp4" else "video/webm"
                } else mimetype

                val ext = if (safeMime.contains("mp4")) "mp4" else "webm"
                val finalFileName = if (guessedName.isBlank() || guessedName.endsWith(".bin")) {
                    "zoomdz_recording_${timeStamp}.$ext"
                } else {
                    guessedName
                }

                if (url.startsWith("blob:")) {
                    val js = """
                        (function() {
                            try {
                                var xhr = new XMLHttpRequest();
                                xhr.open('GET', '$url', true);
                                xhr.responseType = 'blob';
                                xhr.onload = function() {
                                    if (this.status === 200 || this.status === 0) {
                                        var blob = this.response;
                                        var chunkSize = 1024 * 1024;
                                        var totalChunks = Math.ceil(blob.size / chunkSize);
                                        var currentChunk = 0;
                                        function sendChunk() {
                                            if (currentChunk >= totalChunks) return;
                                            var start = currentChunk * chunkSize;
                                            var end = Math.min(start + chunkSize, blob.size);
                                            var slice = blob.slice(start, end);
                                            var reader = new FileReader();
                                            reader.onloadend = function() {
                                                var result = reader.result || '';
                                                var base64 = result.indexOf(',') !== -1 ? result.split(',')[1] : result;
                                                var isFirst = (currentChunk === 0);
                                                var isLast = (currentChunk === totalChunks - 1);
                                                if (window.ZoomDzNative && window.ZoomDzNative.saveBase64Chunk) {
                                                    window.ZoomDzNative.saveBase64Chunk(base64, '$finalFileName', '$safeMime', isFirst, isLast);
                                                }
                                                currentChunk++;
                                                if (!isLast) setTimeout(sendChunk, 5);
                                            };
                                            reader.readAsDataURL(slice);
                                        }
                                        sendChunk();
                                    }
                                };
                                xhr.send();
                            } catch(e) {
                                console.error('Blob download JS error:', e);
                            }
                        })();
                    """.trimIndent()
                    post {
                        evaluateJavascript(js, null)
                    }
                } else if (url.startsWith("data:")) {
                    saveBase64File(url, finalFileName, safeMime)
                } else {
                    startStandardDownload(url, userAgent, contentDisposition, safeMime, finalFileName)
                }
            }

            addJavascriptInterface(object {
                @JavascriptInterface fun isNativeApp() = true
                @JavascriptInterface fun getAppVersion() = "2.4.0"
                @JavascriptInterface fun googleSignIn(role: String?, ref: String?): Boolean {
                    return this@MainActivity.startNativeGoogleSignIn(role, ref)
                }
                @JavascriptInterface fun requestMediaPermissions() {
                    requestAppStartupPermissions()
                }
                @JavascriptInterface fun showToast(msg: String) {
                    Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show()
                }
                @JavascriptInterface fun saveBase64File(base64Data: String, fileName: String, mimeType: String) {
                    this@MainActivity.saveBase64File(base64Data, fileName, mimeType)
                }
                @JavascriptInterface fun saveBase64Chunk(chunkBase64: String, fileName: String, mimeType: String, isFirst: Boolean, isLast: Boolean) {
                    this@MainActivity.saveBase64Chunk(chunkBase64, fileName, mimeType, isFirst, isLast)
                }
                @JavascriptInterface fun showNativeNotification(title: String, message: String, targetUrl: String?) {
                    this@MainActivity.showNativeNotification(title, message, targetUrl)
                }
                @JavascriptInterface fun downloadFile(url: String, fileName: String, mimeType: String) {
                    if (url.startsWith("data:") || url.contains(";base64,")) {
                        this@MainActivity.saveBase64File(url, fileName, mimeType)
                    } else {
                        this@MainActivity.startStandardDownload(url, null, null, mimeType, fileName)
                    }
                }
                @JavascriptInterface fun shareText(title: String, text: String, url: String) {
                    val body = if (url.isNotEmpty()) "$text\n$url" else text
                    startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, title)
                        putExtra(Intent.EXTRA_TEXT, body)
                    }, "مشاركة عبر"))
                }
            }, "ZoomDzNative")

            // Restore prior state if activity was recreated, otherwise load initial URL
            var restored = false
            if (savedWebViewState != null) {
                try {
                    val restoredBundle = restoreState(savedWebViewState!!)
                    restored = (restoredBundle != null)
                } catch (e: Exception) {}
            }

            val pendingDeepLink = pendingDeepLinkUrl
            if (pendingDeepLink != null) {
                pendingDeepLinkUrl = null
                loadUrl(pendingDeepLink)
            } else if (!restored && (url.isNullOrBlank() || url == "about:blank")) {
                loadUrl(PLATFORM_URL)
            }
        }

        persistentWebView = wv
        return wv
    }

    @Composable
    private fun PlatformWebView(
        onProgress: (Int) -> Unit,
        onPageStarted: () -> Unit,
        onPageFinished: () -> Unit,
        onError: () -> Unit
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                initOrGetWebView(ctx).apply {
                    val originalClient = webViewClient
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                            return originalClient?.shouldOverrideUrlLoading(view, request) ?: false
                        }
                        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                            super.onPageStarted(view, url, favicon)
                            onPageStarted()
                        }
                        override fun onPageFinished(view: WebView?, url: String?) {
                            super.onPageFinished(view, url)
                            onPageFinished()
                        }
                        override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                            super.onReceivedError(view, request, error)
                            originalClient?.onReceivedError(view, request, error)
                            if (request?.isForMainFrame == true) {
                                onError()
                            }
                        }
                    }

                    val originalChrome = webChromeClient
                    webChromeClient = object : WebChromeClient() {
                        override fun onProgressChanged(view: WebView?, newProgress: Int) {
                            super.onProgressChanged(view, newProgress)
                            onProgress(newProgress)
                        }
                        override fun onShowFileChooser(wv: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                            return originalChrome?.onShowFileChooser(wv, callback, params) ?: false
                        }
                        override fun onPermissionRequest(request: PermissionRequest?) {
                            originalChrome?.onPermissionRequest(request)
                        }
                        override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                            originalChrome?.onGeolocationPermissionsShowPrompt(origin, callback)
                        }
                        override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                            originalChrome?.onShowCustomView(view, callback)
                        }
                        override fun onHideCustomView() {
                            originalChrome?.onHideCustomView()
                        }
                        override fun onCreateWindow(view: WebView?, isDialog: Boolean, isUserGesture: Boolean, resultMsg: android.os.Message?): Boolean {
                            return originalChrome?.onCreateWindow(view, isDialog, isUserGesture, resultMsg) ?: false
                        }
                    }
                }
            },
            update = { _ ->
                // Do not re-load URL on recompositions
            }
        )
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun handleBack() {
        if (customView != null) {
            (window.decorView as? FrameLayout)?.removeView(customView)
            customView = null
            customViewCallback?.onCustomViewHidden()
            customViewCallback = null
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
            return
        }
        val wv = persistentWebView
        if (wv != null && wv.canGoBack()) {
            wv.goBack()
        } else {
            finish()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        persistentWebView?.saveState(outState)
        cameraImageUri?.let {
            outState.putString("saved_camera_uri", it.toString())
        }
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        savedWebViewState = savedInstanceState
        persistentWebView?.restoreState(savedInstanceState)
        savedInstanceState.getString("saved_camera_uri")?.let {
            cameraImageUri = Uri.parse(it)
        }
    }

    override fun onDestroy() {
        if (isFinishing) {
            filePathCallback?.onReceiveValue(null)
            filePathCallback = null
            pendingPermissionRequest?.deny()
            pendingPermissionRequest = null
            persistentWebView?.apply {
                stopLoading()
                removeJavascriptInterface("ZoomDzNative")
                destroy()
            }
            persistentWebView = null
        }
        super.onDestroy()
    }
}
