package com.onyxmedia.textguard

import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class TextGuardApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (Prefs(this).isEnrolled) Scheduler.start(this)
    }
}

/** A text just arrived: capture right away rather than waiting for the content trigger. */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Prefs(context).isEnrolled) Scheduler.kick(context)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Prefs(context).isEnrolled) {
            Scheduler.start(context)
            Scheduler.kick(context)
        }
    }
}

/**
 * The always-visible notice that recording is on. Capture is never hidden
 * from the person whose phone it is.
 */
object Notifier {
    private const val CHANNEL = "recording"
    private const val ID = 1

    fun showRecording(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, context.getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW)
        )
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val notification = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(context.getString(R.string.notification_title))
            .setContentText(context.getString(R.string.notification_text))
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        try {
            nm.notify(ID, notification)
        } catch (_: SecurityException) {
            // Notification permission not granted yet; MainActivity asks for it.
        }
    }

    fun clear(context: Context) {
        context.getSystemService(NotificationManager::class.java)?.cancel(ID)
    }
}
