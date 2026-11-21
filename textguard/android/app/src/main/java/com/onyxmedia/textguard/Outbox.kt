package com.onyxmedia.textguard

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

/**
 * Captured records waiting to upload. A row is deleted only after the server
 * confirms it was archived, so nothing is lost if the phone is offline or the
 * app is killed mid-upload. Production builds should encrypt this database
 * (e.g. SQLCipher with a Keystore-held key).
 */
class Outbox(context: Context) : SQLiteOpenHelper(context, "outbox.db", null, 1) {

    data class Item(val clientMsgId: String, val json: JSONObject)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE outbox (client_msg_id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL)"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    /** Adds a record; a second insert of the same id is ignored. */
    fun add(item: Item) {
        val values = ContentValues().apply {
            put("client_msg_id", item.clientMsgId)
            put("payload", item.json.toString())
            put("created_at", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("outbox", null, values, SQLiteDatabase.CONFLICT_IGNORE)
    }

    fun next(limit: Int): List<Item> {
        val out = mutableListOf<Item>()
        readableDatabase.rawQuery(
            "SELECT client_msg_id, payload FROM outbox ORDER BY created_at, client_msg_id LIMIT ?",
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) out += Item(c.getString(0), JSONObject(c.getString(1)))
        }
        return out
    }

    fun remove(ids: Collection<String>) {
        if (ids.isEmpty()) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (id in ids) db.delete("outbox", "client_msg_id = ?", arrayOf(id))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun count(): Int =
        readableDatabase.rawQuery("SELECT COUNT(*) FROM outbox", null).use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }
}
