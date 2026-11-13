package expo.modules.tomorrowalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(c: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    val a = AlarmStore.get(c, id) ?: return
    if (a.weekly) AlarmScheduler.schedule(c, a.copy(atMs = AlarmScheduler.nextWeek(a.atMs)))
    else AlarmStore.remove(c, id)
    // exact alarms may start a foreground service from the background
    AlarmService.start(c, a)
  }
}
