package expo.modules.tomorrowalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import java.util.Calendar

object AlarmScheduler {
  const val ACTION_FIRE = "expo.modules.tomorrowalarm.FIRE"

  fun schedule(c: Context, a: Alarm) {
    AlarmStore.put(c, a)
    arm(c, a)
  }

  fun cancel(c: Context, id: String) {
    c.getSystemService(AlarmManager::class.java).cancel(firePending(c, id))
    AlarmStore.remove(c, id)
  }

  fun cancelPrefix(c: Context, prefix: String) {
    AlarmStore.all(c).filter { it.id.startsWith(prefix) }.forEach { cancel(c, it.id) }
  }

  // re-arm after reboot, update or clock change; drops spent one-shots
  fun rearmAll(c: Context) {
    val now = System.currentTimeMillis()
    for (a in AlarmStore.all(c)) {
      when {
        a.atMs > now -> arm(c, a)
        a.weekly -> schedule(c, a.copy(atMs = nextWeek(a.atMs, now)))
        else -> AlarmStore.remove(c, a.id)
      }
    }
  }

  // same local wall time a week later (survives DST), past `after`
  fun nextWeek(atMs: Long, after: Long = System.currentTimeMillis()): Long {
    val cal = Calendar.getInstance().apply { timeInMillis = atMs }
    do {
      cal.add(Calendar.WEEK_OF_YEAR, 1)
    } while (cal.timeInMillis <= after)
    return cal.timeInMillis
  }

  fun canExact(c: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      c.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

  private fun arm(c: Context, a: Alarm) {
    val am = c.getSystemService(AlarmManager::class.java)
    val fire = firePending(c, a.id)
    if (canExact(c)) {
      am.setAlarmClock(AlarmManager.AlarmClockInfo(a.atMs, launchPending(c, a.url, a.id)), fire)
    } else {
      // without exact-alarm access Android may deliver this a few minutes late
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.atMs, fire)
    }
  }

  // the data uri keeps each alarm's PendingIntent distinct
  private fun firePending(c: Context, id: String): PendingIntent {
    val i = Intent(c, AlarmReceiver::class.java)
      .setAction(ACTION_FIRE)
      .setData(Uri.parse("tomorrow-alarm://fire/${Uri.encode(id)}"))
      .putExtra("id", id)
    return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  // opens the app's alarm route through its deep link
  fun launchPending(c: Context, url: String, id: String): PendingIntent {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      .setPackage(c.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
