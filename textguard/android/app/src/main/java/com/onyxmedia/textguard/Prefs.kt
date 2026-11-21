package com.onyxmedia.textguard

import android.content.Context

/**
 * Enrollment details and capture cursors. Stored in app-private storage that is
 * excluded from backup (see data_extraction_rules.xml). A production build
 * should wrap the device token with an Android Keystore key.
 */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("textguard", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString("serverUrl", "") ?: ""
        set(v) = sp.edit().putString("serverUrl", v.trimEnd('/')).apply()

    var deviceId: String
        get() = sp.getString("deviceId", "") ?: ""
        set(v) = sp.edit().putString("deviceId", v).apply()

    var deviceToken: String
        get() = sp.getString("deviceToken", "") ?: ""
        set(v) = sp.edit().putString("deviceToken", v).apply()

    var advisorName: String
        get() = sp.getString("advisorName", "") ?: ""
        set(v) = sp.edit().putString("advisorName", v).apply()

    val isEnrolled: Boolean get() = deviceToken.isNotEmpty()

    /** Highest provider row id already captured, per source ("sms", "mms", "call"). */
    fun cursor(source: String): Long = sp.getLong("cursor.$source", -1L)
    fun setCursor(source: String, id: Long) { sp.edit().putLong("cursor.$source", id).commit() }

    var lastUploadAt: Long
        get() = sp.getLong("lastUploadAt", 0L)
        set(v) = sp.edit().putLong("lastUploadAt", v).apply()

    var lastError: String
        get() = sp.getString("lastError", "") ?: ""
        set(v) = sp.edit().putString("lastError", v).apply()

    /** Called when the server says this device was revoked. */
    fun clearEnrollment() {
        sp.edit().remove("deviceId").remove("deviceToken").remove("advisorName").apply()
    }
}
