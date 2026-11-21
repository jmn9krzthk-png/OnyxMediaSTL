package com.onyxmedia.textguard

import android.Manifest
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.provider.CallLog
import android.provider.Telephony
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.time.Duration
import java.util.concurrent.TimeUnit

/**
 * Background scheduling. Three pieces keep capture running without a
 * long-lived service:
 *  1. [CaptureWorker] runs whenever the SMS, MMS or call-log database changes
 *     (a WorkManager content-URI trigger) and queues the new rows.
 *  2. [UploadWorker] sends the queue when there is a network, retrying with backoff.
 *  3. [SweepWorker] runs every 15 minutes as a safety net and sends a
 *     heartbeat, so supervisors see a phone that has stopped reporting.
 */
object Scheduler {
    private const val CAPTURE = "capture"
    private const val UPLOAD = "upload"
    private const val SWEEP = "sweep"

    fun start(context: Context) {
        val wm = WorkManager.getInstance(context)
        wm.enqueueUniqueWork(CAPTURE, ExistingWorkPolicy.KEEP, captureRequest())
        wm.enqueueUniquePeriodicWork(
            SWEEP,
            ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<SweepWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
        )
        Notifier.showRecording(context)
    }

    fun stop(context: Context) {
        WorkManager.getInstance(context).cancelAllWork()
        Notifier.clear(context)
    }

    /** Re-arms the content trigger. Called by CaptureWorker as it finishes. */
    fun rearmCapture(context: Context) {
        // APPEND_OR_REPLACE queues the next trigger behind the running one
        // instead of cancelling it.
        WorkManager.getInstance(context).enqueueUniqueWork(CAPTURE, ExistingWorkPolicy.APPEND_OR_REPLACE, captureRequest())
    }

    fun uploadSoon(context: Context) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            UPLOAD,
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
        )
    }

    /** Collect now and upload, e.g. when a text arrives or the user taps Sync. */
    fun kick(context: Context) {
        WorkManager.getInstance(context).enqueue(OneTimeWorkRequestBuilder<SweepWorker>().build())
    }

    private fun captureRequest() = OneTimeWorkRequestBuilder<CaptureWorker>()
        .setConstraints(
            Constraints.Builder()
                .addContentUriTrigger(Telephony.Sms.CONTENT_URI, true)
                .addContentUriTrigger(Telephony.Mms.CONTENT_URI, true)
                .addContentUriTrigger(Telephony.MmsSms.CONTENT_URI, true)
                .addContentUriTrigger(CallLog.Calls.CONTENT_URI, true)
                .setTriggerContentUpdateDelay(Duration.ofSeconds(2))
                .setTriggerContentMaxDelay(Duration.ofSeconds(10))
                .build()
        )
        .build()
}

class CaptureWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        try {
            if (Collector.collect(applicationContext) > 0) Scheduler.uploadSoon(applicationContext)
        } finally {
            if (Prefs(applicationContext).isEnrolled) Scheduler.rearmCapture(applicationContext)
        }
        return Result.success()
    }
}

class UploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = if (Uploader.run(applicationContext)) Result.success() else Result.retry()
}

class SweepWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (!Prefs(ctx).isEnrolled) return Result.success()
        Collector.collect(ctx)
        val uploaded = Uploader.run(ctx)
        Uploader.heartbeat(ctx)
        return if (uploaded) Result.success() else Result.retry()
    }
}

object Uploader {
    private const val TAG = "TextGuard"
    private const val BATCH = 200

    /** Drains the outbox. Returns false if anything is left to retry. */
    fun run(context: Context): Boolean {
        val prefs = Prefs(context)
        if (!prefs.isEnrolled) return true
        val outbox = Outbox(context)
        try {
            val api = ApiClient(prefs.serverUrl, prefs.deviceToken)
            while (true) {
                val batch = outbox.next(BATCH)
                if (batch.isEmpty()) break
                val result = api.upload(batch)
                outbox.remove(result.confirmed)
                prefs.lastUploadAt = System.currentTimeMillis()
                prefs.lastError = if (result.rejected > 0) "${result.rejected} records rejected by server" else ""
                if (result.confirmed.isEmpty()) return false // server refused everything; retry later
            }
            return true
        } catch (e: ApiClient.HttpException) {
            prefs.lastError = e.message ?: "upload failed"
            if (e.status == 401 || e.status == 403) {
                // Device was revoked by compliance: stop capturing.
                Log.w(TAG, "device revoked, stopping capture")
                prefs.clearEnrollment()
                Scheduler.stop(context)
                return true
            }
            return false
        } catch (e: Exception) {
            prefs.lastError = e.message ?: e.javaClass.simpleName
            Log.w(TAG, "upload failed", e)
            return false
        } finally {
            outbox.close()
        }
    }

    fun heartbeat(context: Context) {
        val prefs = Prefs(context)
        if (!prefs.isEnrolled) return
        try {
            ApiClient(prefs.serverUrl, prefs.deviceToken).heartbeat(DeviceStatus.collect(context))
        } catch (e: Exception) {
            Log.w(TAG, "heartbeat failed", e)
        }
    }
}

object DeviceStatus {
    val PERMISSIONS = mapOf(
        "READ_SMS" to Manifest.permission.READ_SMS,
        "RECEIVE_SMS" to Manifest.permission.RECEIVE_SMS,
        "RECEIVE_MMS" to Manifest.permission.RECEIVE_MMS,
        "READ_CALL_LOG" to Manifest.permission.READ_CALL_LOG,
    )

    fun missingPermissions(context: Context): List<String> {
        val needed = PERMISSIONS.values.toMutableList()
        if (Build.VERSION.SDK_INT >= 33) needed += Manifest.permission.POST_NOTIFICATIONS
        return needed.filterNot { Collector.hasPermission(context, it) }
    }

    fun collect(context: Context): JSONObject {
        val perms = JSONObject()
        for ((name, perm) in PERMISSIONS) perms.put(name, Collector.hasPermission(context, perm))
        val pm = context.getSystemService(PowerManager::class.java)
        val outbox = Outbox(context)
        val pending = try { outbox.count() } finally { outbox.close() }
        return JSONObject()
            .put("permissions", perms)
            .put("defaultSmsPackage", Telephony.Sms.getDefaultSmsPackage(context) ?: "")
            // The server can't know whether MDM disabled RCS; the firm's MDM
            // integration should set this. The prototype reports false.
            .put("rcsDisabledByPolicy", false)
            .put("pendingUploads", pending)
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("batteryOptimizationExempt", pm?.isIgnoringBatteryOptimizations(context.packageName) == true)
    }
}
