package com.onyxmedia.textguard

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CallLog
import android.provider.Telephony
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Reads new rows from the phone's SMS, MMS and call-log providers and queues
 * them in the [Outbox]. Every texting app on Android stores SMS/MMS in these
 * shared providers, so this captures texts no matter which app sent them.
 * (RCS "chat" messages are the exception: see README, "Known gaps".)
 *
 * Progress is tracked as the highest provider row id captured per source, so
 * a run only reads what is new, and a crash mid-run simply re-reads rows that
 * the outbox and server both de-duplicate.
 */
object Collector {
    private const val TAG = "TextGuard"
    /** A message stuck in the outbox longer than this is captured as failed. */
    private const val STUCK_SEND_MS = 10 * 60 * 1000L

    // MMS address types from the MMS spec (PduHeaders.FROM / TO / CC).
    private const val MMS_ADDR_FROM = 137
    private const val MMS_ADDR_TO = 151
    private const val MMS_ADDR_CC = 130

    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private fun iso(ms: Long): String = synchronized(isoFormat) { isoFormat.format(Date(ms)) }

    fun hasPermission(context: Context, perm: String) =
        context.checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED

    /**
     * Sets every cursor to the newest existing row, so only messages created
     * after enrollment are captured. Called once, right after enrolling.
     */
    fun startFromNow(context: Context) {
        val prefs = Prefs(context)
        prefs.setCursor("sms", maxId(context, Telephony.Sms.CONTENT_URI, Telephony.Sms._ID, Manifest.permission.READ_SMS))
        prefs.setCursor("mms", maxId(context, Telephony.Mms.CONTENT_URI, Telephony.Mms._ID, Manifest.permission.READ_SMS))
        prefs.setCursor("call", maxId(context, CallLog.Calls.CONTENT_URI, CallLog.Calls._ID, Manifest.permission.READ_CALL_LOG))
    }

    private fun maxId(context: Context, uri: Uri, idCol: String, perm: String): Long {
        if (!hasPermission(context, perm)) return 0L
        return context.contentResolver.query(uri, arrayOf(idCol), null, null, "$idCol DESC")?.use { c ->
            if (c.moveToFirst()) c.getLong(0) else 0L
        } ?: 0L
    }

    /** Returns the number of records queued. Safe to call from several workers at once. */
    @Synchronized
    fun collect(context: Context): Int {
        val prefs = Prefs(context)
        if (!prefs.isEnrolled) return 0
        val outbox = Outbox(context)
        var queued = 0
        try {
            if (hasPermission(context, Manifest.permission.READ_SMS)) {
                queued += collectSms(context, prefs, outbox)
                queued += collectMms(context, prefs, outbox)
            }
            if (hasPermission(context, Manifest.permission.READ_CALL_LOG)) {
                queued += collectCalls(context, prefs, outbox)
            }
        } finally {
            outbox.close()
        }
        if (queued > 0) Log.i(TAG, "queued $queued new records")
        return queued
    }

    private fun collectSms(context: Context, prefs: Prefs, outbox: Outbox): Int {
        val cursorStart = prefs.cursor("sms")
        if (cursorStart < 0) return 0
        var cursor = cursorStart
        var count = 0
        val cols = arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE)
        context.contentResolver.query(
            Telephony.Sms.CONTENT_URI, cols, "${Telephony.Sms._ID} > ?", arrayOf(cursor.toString()), "${Telephony.Sms._ID} ASC"
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                val date = c.getLong(3)
                val type = c.getInt(4)
                val direction = when (type) {
                    Telephony.Sms.MESSAGE_TYPE_INBOX -> "inbound"
                    Telephony.Sms.MESSAGE_TYPE_SENT -> "outbound"
                    Telephony.Sms.MESSAGE_TYPE_FAILED -> "failed"
                    Telephony.Sms.MESSAGE_TYPE_OUTBOX, Telephony.Sms.MESSAGE_TYPE_QUEUED ->
                        // Still sending: wait for it to become SENT or FAILED,
                        // and don't move the cursor past it.
                        if (System.currentTimeMillis() - date < STUCK_SEND_MS) break else "failed"
                    else -> null // drafts
                }
                if (direction != null) {
                    outbox.add(
                        Outbox.Item(
                            "sms:$id:$date",
                            JSONObject()
                                .put("clientMsgId", "sms:$id:$date")
                                .put("channel", "sms")
                                .put("direction", direction)
                                .put("counterparty", c.getString(1) ?: "unknown")
                                .put("body", c.getString(2) ?: "")
                                .put("sentAt", iso(date))
                        )
                    )
                    count++
                }
                cursor = id
            }
        }
        if (cursor != cursorStart) prefs.setCursor("sms", cursor)
        return count
    }

    private fun collectMms(context: Context, prefs: Prefs, outbox: Outbox): Int {
        val cursorStart = prefs.cursor("mms")
        if (cursorStart < 0) return 0
        var cursor = cursorStart
        var count = 0
        val cols = arrayOf(Telephony.Mms._ID, Telephony.Mms.DATE, Telephony.Mms.MESSAGE_BOX)
        context.contentResolver.query(
            Telephony.Mms.CONTENT_URI, cols, "${Telephony.Mms._ID} > ?", arrayOf(cursor.toString()), "${Telephony.Mms._ID} ASC"
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                val dateMs = c.getLong(1) * 1000L // MMS dates are in seconds
                val direction = when (c.getInt(2)) {
                    Telephony.Mms.MESSAGE_BOX_INBOX -> "inbound"
                    Telephony.Mms.MESSAGE_BOX_SENT -> "outbound"
                    Telephony.Mms.MESSAGE_BOX_FAILED -> "failed"
                    Telephony.Mms.MESSAGE_BOX_OUTBOX ->
                        if (System.currentTimeMillis() - dateMs < STUCK_SEND_MS) break else "failed"
                    else -> null
                }
                if (direction != null) {
                    val (text, attachments) = readMmsParts(context, id)
                    val counterparties = readMmsAddresses(context, id, direction == "inbound")
                    outbox.add(
                        Outbox.Item(
                            "mms:$id:$dateMs",
                            JSONObject()
                                .put("clientMsgId", "mms:$id:$dateMs")
                                .put("channel", "mms")
                                .put("direction", direction)
                                .put("counterparties", JSONArray(counterparties.ifEmpty { listOf("unknown") }))
                                .put("body", text)
                                .put("attachments", attachments)
                                .put("sentAt", iso(dateMs))
                        )
                    )
                    count++
                }
                cursor = id
            }
        }
        if (cursor != cursorStart) prefs.setCursor("mms", cursor)
        return count
    }

    private fun readMmsAddresses(context: Context, mmsId: Long, inbound: Boolean): List<String> {
        val own = setOf("insert-address-token")
        val out = linkedSetOf<String>()
        context.contentResolver.query(
            Uri.parse("content://mms/$mmsId/addr"), arrayOf("address", "type"), null, null, null
        )?.use { c ->
            while (c.moveToNext()) {
                val address = c.getString(0) ?: continue
                val type = c.getInt(1)
                if (address in own) continue
                // Inbound: the sender plus other group members. Outbound: the recipients.
                val keep = if (inbound) type == MMS_ADDR_FROM || type == MMS_ADDR_CC || type == MMS_ADDR_TO
                           else type == MMS_ADDR_TO || type == MMS_ADDR_CC
                if (keep) out += address
            }
        }
        return out.toList()
    }

    /**
     * Returns the text of an MMS and a description (type, size, SHA-256) of each
     * attachment. The prototype archives attachment fingerprints; uploading the
     * files themselves is listed under "Next steps" in the README.
     */
    private fun readMmsParts(context: Context, mmsId: Long): Pair<String, JSONArray> {
        val text = StringBuilder()
        val attachments = JSONArray()
        context.contentResolver.query(
            Uri.parse("content://mms/part"), arrayOf("_id", "ct", "text", "cl"), "mid = ?", arrayOf(mmsId.toString()), null
        )?.use { c ->
            while (c.moveToNext()) {
                val partId = c.getLong(0)
                val contentType = c.getString(1) ?: "application/octet-stream"
                when {
                    contentType == "application/smil" -> Unit // layout only
                    contentType == "text/plain" -> {
                        if (text.isNotEmpty()) text.append('\n')
                        text.append(c.getString(2) ?: "")
                    }
                    else -> {
                        val (size, sha) = fingerprint(context, Uri.parse("content://mms/part/$partId"))
                        attachments.put(
                            JSONObject().put("contentType", contentType).put("size", size)
                                .put("sha256", sha).put("name", c.getString(3) ?: "")
                        )
                    }
                }
            }
        }
        return text.toString() to attachments
    }

    private fun fingerprint(context: Context, uri: Uri): Pair<Long, String> {
        val digest = MessageDigest.getInstance("SHA-256")
        var size = 0L
        try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                val buf = ByteArray(16 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    digest.update(buf, 0, n)
                    size += n
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "could not read MMS part $uri", e)
        }
        return size to digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun collectCalls(context: Context, prefs: Prefs, outbox: Outbox): Int {
        val cursorStart = prefs.cursor("call")
        if (cursorStart < 0) return 0
        var cursor = cursorStart
        var count = 0
        val cols = arrayOf(CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION)
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI, cols, "${CallLog.Calls._ID} > ?", arrayOf(cursor.toString()), "${CallLog.Calls._ID} ASC"
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                val date = c.getLong(3)
                val direction = when (c.getInt(2)) {
                    CallLog.Calls.INCOMING_TYPE, CallLog.Calls.ANSWERED_EXTERNALLY_TYPE -> "inbound"
                    CallLog.Calls.OUTGOING_TYPE -> "outbound"
                    CallLog.Calls.MISSED_TYPE -> "missed"
                    CallLog.Calls.VOICEMAIL_TYPE -> "voicemail"
                    CallLog.Calls.REJECTED_TYPE, CallLog.Calls.BLOCKED_TYPE -> "rejected"
                    else -> "inbound"
                }
                outbox.add(
                    Outbox.Item(
                        "call:$id:$date",
                        JSONObject()
                            .put("clientMsgId", "call:$id:$date")
                            .put("channel", "call")
                            .put("direction", direction)
                            .put("counterparty", c.getString(1)?.ifEmpty { null } ?: "private number")
                            .put("body", "")
                            .put("durationSec", c.getLong(4))
                            .put("sentAt", iso(date))
                    )
                )
                count++
                cursor = id
            }
        }
        if (cursor != cursorStart) prefs.setCursor("call", cursor)
        return count
    }
}
