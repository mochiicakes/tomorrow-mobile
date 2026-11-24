package expo.modules.tomorrowalarm

import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.spotify.android.appremote.api.ConnectionParams
import com.spotify.android.appremote.api.Connector
import com.spotify.android.appremote.api.SpotifyAppRemote
import com.spotify.android.appremote.api.error.AuthenticationFailedException
import com.spotify.android.appremote.api.error.NotLoggedInException
import com.spotify.android.appremote.api.error.OfflineModeException
import com.spotify.android.appremote.api.error.UnsupportedFeatureVersionException
import com.spotify.android.appremote.api.error.UserNotAuthorizedException
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean

// Since Android 14 a visible app has to let the service it binds open activities.
// App Remote 0.8.0 doesn't, so Spotify's consent screen is silently blocked. The
// SDK binds through getApplicationContext(), which is where the flag gets added.
private class ConsentContext(app: Context) : ContextWrapper(app) {
  override fun getApplicationContext(): Context = this

  override fun bindService(service: Intent, conn: ServiceConnection, flags: Int): Boolean {
    val extra = if (Build.VERSION.SDK_INT >= 34) Context.BIND_ALLOW_ACTIVITY_STARTS else 0
    return super.bindService(service, conn, flags or extra)
  }
}

// one App Remote connection shared by the module (preview) and the alarm service
object SpotifyClient {
  // the SDK itself waits up to an hour for an answer
  private const val AUTH_TIMEOUT_MS = 90_000L

  @Volatile private var remote: SpotifyAppRemote? = null
  private val handler = Handler(Looper.getMainLooper())

  fun isInstalled(c: Context) = SpotifyAppRemote.isSpotifyInstalled(c)

  // showAuth opens Spotify's consent screen; only do that from the foreground
  fun connect(c: Context, cfg: SpotifyConfig, showAuth: Boolean, done: (Throwable?) -> Unit) {
    remote?.let { if (it.isConnected) return done(null) }
    val params = ConnectionParams.Builder(cfg.clientId)
      .setRedirectUri(cfg.redirectUri)
      .showAuthView(showAuth)
      .build()

    // the listener fires again on every login change or dropped connection, so
    // only the first outcome is reported; later ones just update `remote`
    val reported = AtomicBoolean(false)
    fun report(e: Throwable?) {
      if (reported.compareAndSet(false, true)) done(e)
    }
    val timeout = Runnable { report(TimeoutException("Spotify didn't respond")) }
    if (showAuth) handler.postDelayed(timeout, AUTH_TIMEOUT_MS)

    val app = c.applicationContext
    val host = if (showAuth) ConsentContext(app) else app
    SpotifyAppRemote.connect(host, params, object : Connector.ConnectionListener {
      private var mine: SpotifyAppRemote? = null

      override fun onConnected(r: SpotifyAppRemote) {
        handler.removeCallbacks(timeout)
        mine = r
        remote = r
        report(null)
      }

      override fun onFailure(e: Throwable) {
        handler.removeCallbacks(timeout)
        // an older connection dropping must not clear a newer one
        if (remote === mine) remote = null
        report(e)
      }
    })
  }

  // why connecting failed, for the app to explain
  fun errorCode(e: Throwable): String = when (e) {
    is AuthenticationFailedException -> "ERR_SPOTIFY_APP_NOT_REGISTERED"
    is UserNotAuthorizedException -> "ERR_SPOTIFY_NOT_AUTHORIZED"
    is NotLoggedInException -> "ERR_SPOTIFY_LOGGED_OUT"
    is OfflineModeException -> "ERR_SPOTIFY_OFFLINE"
    is UnsupportedFeatureVersionException -> "ERR_SPOTIFY_OUTDATED"
    is TimeoutException -> "ERR_SPOTIFY_TIMEOUT"
    else -> "ERR_SPOTIFY_CONNECT"
  }

  // play a track from a position
  fun play(uri: String, fromMs: Long, done: (Throwable?) -> Unit) {
    val r = remote ?: return done(IllegalStateException("Spotify isn't connected"))
    val call = r.playerApi.play(uri)
    call.setResultCallback { seek(fromMs, done) }
    call.setErrorCallback { done(it) }
  }

  fun seek(ms: Long, done: (Throwable?) -> Unit) {
    val r = remote ?: return done(IllegalStateException("Spotify isn't connected"))
    val call = r.playerApi.seekTo(ms)
    call.setResultCallback { done(null) }
    call.setErrorCallback { done(it) }
  }

  fun pause() {
    remote?.playerApi?.pause()
  }

  fun canPlayOnDemand(done: (Boolean?, Throwable?) -> Unit) {
    val r = remote ?: return done(null, IllegalStateException("Spotify isn't connected"))
    val call = r.userApi.capabilities
    call.setResultCallback { done(it.canPlayOnDemand, null) }
    call.setErrorCallback { done(null, it) }
  }

  fun disconnect() {
    remote?.let { SpotifyAppRemote.disconnect(it) }
    remote = null
  }
}
