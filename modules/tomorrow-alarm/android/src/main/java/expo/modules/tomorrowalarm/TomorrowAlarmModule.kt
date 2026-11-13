package expo.modules.tomorrowalarm

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TomorrowAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("TomorrowAlarm")

    // spotify

    Function("isSpotifyInstalled") { SpotifyClient.isInstalled(context) }

    Function("configureSpotify") { clientId: String, redirectUri: String ->
      AlarmStore.setSpotify(context, SpotifyConfig(clientId, redirectUri))
    }

    // foreground only: may show Spotify's consent screen the first time
    AsyncFunction("spotifyConnect") { promise: Promise ->
      val cfg = AlarmStore.spotify(context)
        ?: return@AsyncFunction promise.reject("ERR_SPOTIFY_CONFIG", "Spotify isn't configured", null)
      val host = appContext.currentActivity ?: context
      SpotifyClient.connect(host, cfg, showAuth = true) { err ->
        if (err == null) promise.resolve(null)
        else promise.reject("ERR_SPOTIFY_CONNECT", err.message ?: "Couldn't connect to Spotify", err)
      }
    }

    AsyncFunction("spotifyPlay") { uri: String, fromMs: Double, promise: Promise ->
      SpotifyClient.play(uri, fromMs.toLong()) { err ->
        if (err == null) promise.resolve(null)
        else promise.reject("ERR_SPOTIFY_PLAY", err.message ?: "Couldn't play", err)
      }
    }

    Function("spotifyPause") { SpotifyClient.pause() }

    AsyncFunction("spotifyCanPlayOnDemand") { promise: Promise ->
      SpotifyClient.canPlayOnDemand { ok, err ->
        if (err == null) promise.resolve(ok == true)
        else promise.reject("ERR_SPOTIFY_CAPABILITIES", err.message ?: "Couldn't check the account", err)
      }
    }

    Function("spotifyDisconnect") { SpotifyClient.disconnect() }

    // alarms

    Function("setAlarmSound") { uri: String?, startMs: Double, endMs: Double ->
      AlarmStore.setSound(context, uri?.let { ClipSound(it, startMs.toLong(), endMs.toLong()) })
    }

    Function("scheduleAlarm") { id: String, atMs: Double, title: String, body: String, url: String, weekly: Boolean ->
      AlarmScheduler.schedule(context, Alarm(id, atMs.toLong(), title, body, url, weekly))
    }

    Function("cancelAlarm") { id: String -> AlarmScheduler.cancel(context, id) }

    Function("cancelAlarmsWithPrefix") { prefix: String -> AlarmScheduler.cancelPrefix(context, prefix) }

    Function("listAlarmIds") { AlarmStore.all(context).map { it.id } }

    Function("stopRinging") { AlarmService.stop(context) }

    Function("canScheduleExactAlarms") { AlarmScheduler.canExact(context) }

    Function("canUseFullScreenIntent") {
      Build.VERSION.SDK_INT < 34 ||
        context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
    }

    Function("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT >= 34) openSettings("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT")
    }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) openSettings(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
    }

    // lets the alarm screen show over the lock screen while it's up
    AsyncFunction("setShowWhenLocked") { on: Boolean ->
      val activity = appContext.currentActivity ?: return@AsyncFunction
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        activity.setShowWhenLocked(on)
        activity.setTurnScreenOn(on)
      }
    }.runOnQueue(Queues.MAIN)
  }

  private fun openSettings(action: String) {
    val i = Intent(action, Uri.parse("package:${context.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      context.startActivity(i)
    } catch (e: Exception) {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }
  }
}
