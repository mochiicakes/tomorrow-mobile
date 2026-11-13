package expo.modules.tomorrowalarm

import android.content.Context
import com.spotify.android.appremote.api.ConnectionParams
import com.spotify.android.appremote.api.Connector
import com.spotify.android.appremote.api.SpotifyAppRemote

// one App Remote connection shared by the module (preview) and the alarm service
object SpotifyClient {
  private var remote: SpotifyAppRemote? = null

  fun isInstalled(c: Context) = SpotifyAppRemote.isSpotifyInstalled(c)

  // showAuth opens Spotify's consent screen; only do that from the foreground
  fun connect(c: Context, cfg: SpotifyConfig, showAuth: Boolean, done: (Throwable?) -> Unit) {
    remote?.let { if (it.isConnected) return done(null) }
    val params = ConnectionParams.Builder(cfg.clientId)
      .setRedirectUri(cfg.redirectUri)
      .showAuthView(showAuth)
      .build()
    SpotifyAppRemote.connect(c, params, object : Connector.ConnectionListener {
      override fun onConnected(r: SpotifyAppRemote) {
        remote = r
        done(null)
      }

      override fun onFailure(e: Throwable) {
        remote = null
        done(e)
      }
    })
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
