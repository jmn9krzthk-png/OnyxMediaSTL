package com.onyxmedia.textguard

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Minimal JSON-over-HTTPS client for the TextGuard server. Call off the main thread. */
class ApiClient(private val baseUrl: String, private val token: String = "") {

    class HttpException(val status: Int, message: String) : IOException(message)

    data class UploadResult(val confirmed: List<String>, val rejected: Int)

    fun enroll(code: String, deviceModel: String, osVersion: String, appVersion: String): JSONObject =
        post(
            "/api/v1/devices/enroll",
            JSONObject()
                .put("enrollmentCode", code)
                .put("disclosureAccepted", true)
                .put("deviceModel", deviceModel)
                .put("osVersion", osVersion)
                .put("appVersion", appVersion)
        )

    /** Returns the ids the server has archived (new or already stored). Only these may be deleted locally. */
    fun upload(items: List<Outbox.Item>): UploadResult {
        val body = JSONObject().put("messages", JSONArray().apply { items.forEach { put(it.json) } })
        val res = post("/api/v1/messages", body)
        val confirmed = mutableListOf<String>()
        for (key in listOf("accepted", "duplicates")) {
            val arr = res.optJSONArray(key) ?: continue
            for (i in 0 until arr.length()) confirmed += arr.getString(i)
        }
        return UploadResult(confirmed, res.optJSONArray("rejected")?.length() ?: 0)
    }

    fun heartbeat(status: JSONObject) {
        post("/api/v1/devices/heartbeat", status)
    }

    private fun post(path: String, body: JSONObject): JSONObject {
        val conn = URL(baseUrl + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            if (token.isNotEmpty()) conn.setRequestProperty("Authorization", "Bearer $token")
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            val json = if (text.isNotBlank()) JSONObject(text) else JSONObject()
            if (status !in 200..299) throw HttpException(status, json.optString("error", "HTTP $status"))
            return json
        } finally {
            conn.disconnect()
        }
    }
}
