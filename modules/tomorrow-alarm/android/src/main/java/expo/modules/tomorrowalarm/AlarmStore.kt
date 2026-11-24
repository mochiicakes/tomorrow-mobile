package expo.modules.tomorrowalarm

import android.content.Context
import org.json.JSONObject

data class Alarm(
  val id: String,
  val atMs: Long,
  val title: String,
  val body: String,
  val url: String,
  val weekly: Boolean,
) {
  fun toJson(): String = JSONObject()
    .put("atMs", atMs)
    .put("title", title)
    .put("body", body)
    .put("url", url)
    .put("weekly", weekly)
    .toString()

  companion object {
    fun fromJson(id: String, raw: String): Alarm? = try {
      val o = JSONObject(raw)
      Alarm(id, o.getLong("atMs"), o.getString("title"), o.getString("body"), o.getString("url"), o.optBoolean("weekly"))
    } catch (e: Exception) {
      null
    }
  }
}

data class ClipSound(val uri: String, val startMs: Long, val endMs: Long)

data class SpotifyConfig(val clientId: String, val redirectUri: String)

// persistence - alarms outlive the JS runtime, so the native side keeps its own copy
object AlarmStore {
  private const val ALARMS = "tomorrow.alarms"
  private const val CONFIG = "tomorrow.alarm.config"

  private fun alarms(c: Context) = c.getSharedPreferences(ALARMS, Context.MODE_PRIVATE)
  private fun config(c: Context) = c.getSharedPreferences(CONFIG, Context.MODE_PRIVATE)

  fun all(c: Context): List<Alarm> =
    alarms(c).all.mapNotNull { (id, raw) -> (raw as? String)?.let { Alarm.fromJson(id, it) } }

  fun get(c: Context, id: String): Alarm? =
    alarms(c).getString(id, null)?.let { Alarm.fromJson(id, it) }

  fun put(c: Context, a: Alarm) {
    alarms(c).edit().putString(a.id, a.toJson()).apply()
  }

  fun remove(c: Context, id: String) {
    alarms(c).edit().remove(id).apply()
  }

  fun sound(c: Context): ClipSound? {
    val p = config(c)
    val uri = p.getString("uri", null) ?: return null
    return ClipSound(uri, p.getLong("startMs", 0), p.getLong("endMs", 0))
  }

  fun setSound(c: Context, s: ClipSound?) {
    val e = config(c).edit()
    if (s == null) e.remove("uri").remove("startMs").remove("endMs")
    else e.putString("uri", s.uri).putLong("startMs", s.startMs).putLong("endMs", s.endMs)
    e.apply()
  }

  fun spotify(c: Context): SpotifyConfig? {
    val p = config(c)
    val id = p.getString("clientId", null) ?: return null
    return SpotifyConfig(id, p.getString("redirectUri", null) ?: return null)
  }

  fun setSpotify(c: Context, s: SpotifyConfig) {
    config(c).edit().putString("clientId", s.clientId).putString("redirectUri", s.redirectUri).apply()
  }
}
