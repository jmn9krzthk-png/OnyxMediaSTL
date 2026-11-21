package com.onyxmedia.textguard

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.format.DateUtils
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var message: TextView
    private var enrollAfterPermissions = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)
        message = findViewById(R.id.message)

        findViewById<EditText>(R.id.serverUrl).setText(prefs.serverUrl.ifEmpty { BuildConfig.DEFAULT_SERVER_URL })
        findViewById<Button>(R.id.enrollButton).setOnClickListener { onEnrollClicked() }
        findViewById<Button>(R.id.permissionsButton).setOnClickListener { requestMissingPermissions() }
        findViewById<Button>(R.id.syncButton).setOnClickListener {
            Scheduler.kick(this)
            message.text = ""
            findViewById<TextView>(R.id.statusDetail).postDelayed({ render() }, 3000)
        }
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    private fun render() {
        val enrolled = prefs.isEnrolled
        findViewById<LinearLayout>(R.id.enrollSection).visibility = if (enrolled) View.GONE else View.VISIBLE
        findViewById<LinearLayout>(R.id.statusSection).visibility = if (enrolled) View.VISIBLE else View.GONE
        if (!enrolled) return

        val missing = DeviceStatus.missingPermissions(this)
        val outbox = Outbox(this)
        val pending = try { outbox.count() } finally { outbox.close() }
        val lastUpload = prefs.lastUploadAt
        findViewById<TextView>(R.id.statusHeadline).text =
            if (missing.isEmpty()) "Recording is on" else "Recording is incomplete"
        findViewById<TextView>(R.id.statusDetail).text = buildString {
            append("Enrolled to ${prefs.advisorName}.\n")
            append("Last upload: ")
            append(if (lastUpload == 0L) "not yet" else DateUtils.getRelativeTimeSpanString(lastUpload))
            append(".\nWaiting to upload: $pending.")
            if (missing.isNotEmpty()) {
                append("\n\nMissing permissions: ${missing.joinToString { it.substringAfterLast('.') }}. ")
                append("Your firm is notified when capture is incomplete.")
            }
            if (prefs.lastError.isNotEmpty()) append("\n\nLast problem: ${prefs.lastError}")
        }
        findViewById<Button>(R.id.permissionsButton).visibility = if (missing.isEmpty()) View.GONE else View.VISIBLE
    }

    private fun onEnrollClicked() {
        message.text = ""
        if (!findViewById<CheckBox>(R.id.acceptDisclosure).isChecked) {
            message.text = "Read the notice above and tick the box to continue."
            return
        }
        if (DeviceStatus.missingPermissions(this).isNotEmpty()) {
            enrollAfterPermissions = true
            requestMissingPermissions()
            return
        }
        enroll()
    }

    private fun requestMissingPermissions() {
        val missing = DeviceStatus.missingPermissions(this)
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), 1)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (prefs.isEnrolled) {
            Scheduler.start(this)
            Scheduler.kick(this)
            render()
            return
        }
        if (enrollAfterPermissions) {
            enrollAfterPermissions = false
            if (!Collector.hasPermission(this, Manifest.permission.READ_SMS)) {
                message.text = "TextGuard needs SMS access to record texts. Enrollment can't continue without it."
            } else {
                enroll()
            }
        }
    }

    private fun enroll() {
        val url = findViewById<EditText>(R.id.serverUrl).text.toString().trim().trimEnd('/')
        val code = findViewById<EditText>(R.id.enrollmentCode).text.toString().trim()
        if (code.isEmpty()) {
            message.text = "Enter the enrollment code from your compliance team."
            return
        }
        val button = findViewById<Button>(R.id.enrollButton)
        button.isEnabled = false
        message.text = "Enrolling…"
        Thread {
            try {
                val res = ApiClient(url).enroll(code, "${Build.MANUFACTURER} ${Build.MODEL}", Build.VERSION.RELEASE, BuildConfig.VERSION_NAME)
                prefs.serverUrl = url
                prefs.deviceId = res.getString("deviceId")
                prefs.advisorName = res.optString("advisorName")
                Collector.startFromNow(this) // capture only what happens after enrollment
                prefs.deviceToken = res.getString("deviceToken")
                Scheduler.start(this)
                Uploader.heartbeat(this)
                runOnUiThread {
                    message.text = ""
                    render()
                    askBatteryExemption()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    message.text = "Enrollment failed: ${e.message}"
                    button.isEnabled = true
                }
            }
        }.start()
    }

    /** Background limits can delay capture; ask once to be exempt. MDM can grant this silently. */
    private fun askBatteryExemption() {
        val pm = getSystemService(PowerManager::class.java) ?: return
        if (pm.isIgnoringBatteryOptimizations(packageName)) return
        try {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
            )
        } catch (_: Exception) {
        }
    }
}
