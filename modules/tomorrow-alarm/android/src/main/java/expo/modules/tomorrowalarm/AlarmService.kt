package expo.modules.tomorrowalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

// ringing - plays the user's Spotify clip on a loop (or the purr if Spotify
// can't be reached) until dismissed or MAX_RING_MS passes
class AlarmService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var wake: PowerManager.WakeLock? = null
  private var usingSpotify = false
  private var current: Alarm? = null
  // bumped on every start/stop so late callbacks from an older ring are ignored
  private var ring = 0

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopRinging(timedOut = false)
      return START_NOT_STICKY
    }
    val a = intent?.let { readAlarm(it) }
    if (a == null) {
      stopSelf()
      return START_NOT_STICKY
    }

    ensureChannel(this)
    val n = buildRinging(a)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(RINGING_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(RINGING_ID, n)
    }

    // a new alarm while one is ringing replaces it
    stopPlayback()
    current = a
    val token = ++ring
    acquireWake()
    handler.postDelayed({ if (token == ring) stopRinging(timedOut = true) }, MAX_RING_MS)

    val sound = AlarmStore.sound(this)
    val cfg = AlarmStore.spotify(this)
    if (sound == null || cfg == null || !SpotifyClient.isInstalled(this)) {
      playPurr()
      return START_NOT_STICKY
    }

    handler.postDelayed({ if (token == ring && !usingSpotify) playPurr() }, CONNECT_TIMEOUT_MS)
    SpotifyClient.connect(applicationContext, cfg, showAuth = false) { err ->
      handler.post {
        if (token != ring || player != null) return@post
        if (err != null) playPurr() else loopClip(sound, token, first = true)
      }
    }
    return START_NOT_STICKY
  }

  private fun loopClip(s: ClipSound, token: Int, first: Boolean) {
    if (token != ring) return
    val next: (Throwable?) -> Unit = { err ->
      handler.post {
        if (token != ring) return@post
        // the fallback purr won the race; don't play both
        if (player != null) {
          if (err == null) SpotifyClient.pause()
          return@post
        }
        if (err != null) {
          usingSpotify = false
          playPurr()
          return@post
        }
        usingSpotify = true
        handler.postDelayed({ loopClip(s, token, first = false) }, s.endMs - s.startMs)
      }
    }
    if (first) SpotifyClient.play(s.uri, s.startMs, next) else SpotifyClient.seek(s.startMs, next)
  }

  private fun playPurr() {
    if (player != null) return
    // bundled into res/raw by the expo-notifications `sounds` plugin option
    val res = resources.getIdentifier("purr", "raw", packageName)
    if (res == 0) return
    player = try {
      MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        setDataSource(this@AlarmService, Uri.parse("android.resource://$packageName/$res"))
        isLooping = true
        prepare()
        start()
      }
    } catch (e: Exception) {
      null
    }
  }

  private fun stopPlayback() {
    handler.removeCallbacksAndMessages(null)
    if (usingSpotify) SpotifyClient.pause()
    usingSpotify = false
    player?.run {
      try { stop() } catch (_: Exception) {}
      release()
    }
    player = null
  }

  private fun stopRinging(timedOut: Boolean) {
    ring++
    val a = current
    stopPlayback()
    current = null
    releaseWake()
    stopForeground(STOP_FOREGROUND_REMOVE)
    // left unanswered: keep a quiet notification so it isn't lost
    if (timedOut && a != null) {
      getSystemService(NotificationManager::class.java).notify(a.id.hashCode(), buildMissed(a))
    }
    stopSelf()
  }

  override fun onDestroy() {
    ring++
    stopPlayback()
    releaseWake()
    super.onDestroy()
  }

  private fun acquireWake() {
    if (wake?.isHeld == true) return
    wake = getSystemService(PowerManager::class.java)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tomorrow:alarm")
      .apply { acquire(MAX_RING_MS + 5_000) }
  }

  private fun releaseWake() {
    wake?.takeIf { it.isHeld }?.release()
    wake = null
  }

  private fun builder(): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
    else @Suppress("DEPRECATION") Notification.Builder(this)

  private fun icon(): Int {
    // expo-notifications' plugin ships the monochrome icon under this name
    val res = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (res != 0) res else applicationInfo.icon
  }

  private fun buildRinging(a: Alarm): Notification {
    val open = AlarmScheduler.launchPending(this, a.url, a.id)
    val stop = PendingIntent.getService(
      this, 1, Intent(this, AlarmService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return builder()
      .setSmallIcon(icon())
      .setContentTitle(a.title)
      .setContentText(a.body)
      .setCategory(Notification.CATEGORY_ALARM)
      .setOngoing(true)
      .setContentIntent(open)
      .setFullScreenIntent(open, true)
      .addAction(Notification.Action.Builder(null, "Dismiss", stop).build())
      .build()
  }

  private fun buildMissed(a: Alarm): Notification =
    builder()
      .setSmallIcon(icon())
      .setContentTitle(a.title)
      .setContentText(a.body)
      .setAutoCancel(true)
      .setContentIntent(AlarmScheduler.launchPending(this, a.url, a.id))
      .build()

  companion object {
    const val ACTION_STOP = "expo.modules.tomorrowalarm.STOP"
    private const val CHANNEL_ID = "tomorrow-alarm"
    private const val RINGING_ID = 0x7a1a
    private const val MAX_RING_MS = 60_000L
    private const val CONNECT_TIMEOUT_MS = 6_000L

    fun start(c: Context, a: Alarm) {
      val i = Intent(c, AlarmService::class.java)
        .putExtra("id", a.id)
        .putExtra("title", a.title)
        .putExtra("body", a.body)
        .putExtra("url", a.url)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i) else c.startService(i)
    }

    // only reaches a running service; never starts one just to stop it
    fun stop(c: Context) {
      c.stopService(Intent(c, AlarmService::class.java))
    }

    private fun readAlarm(i: Intent): Alarm? {
      val id = i.getStringExtra("id") ?: return null
      return Alarm(
        id, System.currentTimeMillis(),
        i.getStringExtra("title") ?: "", i.getStringExtra("body") ?: "",
        i.getStringExtra("url") ?: "tomorrow://", weekly = false,
      )
    }

    // silent - the service plays the sound itself
    fun ensureChannel(c: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val ch = NotificationChannel(CHANNEL_ID, "Alarms", NotificationManager.IMPORTANCE_HIGH).apply {
        setSound(null, null)
        enableVibration(true)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
      c.getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }
  }
}
