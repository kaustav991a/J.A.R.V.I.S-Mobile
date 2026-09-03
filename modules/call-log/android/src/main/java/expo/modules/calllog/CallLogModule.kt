package expo.modules.calllog

import android.Manifest
import android.content.pm.PackageManager
import android.provider.CallLog
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest

/**
 * A translation of Android's call log, and deliberately less than one.
 *
 * **The phone number never crosses into JavaScript.** It is hashed here, in Kotlin,
 * and what leaves this file is a stable id plus the name Android had already cached
 * against the call. That is not a convenience — it is the whole privacy design of the
 * feature, and putting it here rather than in JS means the promise holds even if the
 * layer above is rewritten by somebody who has not read it.
 *
 * `CACHED_NAME` is why `READ_CONTACTS` is not requested. Android stores the contact
 * name against the call at the moment it happened, so a caller who was in the address
 * book gets a name and a caller who was not stays a number that is never named.
 *
 * Nothing here collects. The call log is written by the dialler whether anything reads
 * it or not; this only reads what is already on the device.
 */
class CallLogModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallLog")

    /**
     * Loaded, and readable.
     *
     * Two different answers on purpose: a module that is missing and a permission that
     * was refused want different sentences on screen, and "no calls" must never be the
     * app's way of saying either.
     */
    Function("permission") {
      val ctx = appContext.reactContext ?: return@Function "unavailable"
      val granted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALL_LOG)
      if (granted == PackageManager.PERMISSION_GRANTED) "granted" else "denied"
    }

    /**
     * The most recent calls, newest first, with the numbers already gone.
     *
     * `since` rather than a page: the layer above keeps what it has read, so the
     * ordinary read is "anything since last time" and the first read is everything the
     * device still holds.
     */
    AsyncFunction("recent") { since: Double, limit: Int ->
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALL_LOG) !=
        PackageManager.PERMISSION_GRANTED
      ) {
        return@AsyncFunction emptyList<Map<String, Any?>>()
      }

      val out = mutableListOf<Map<String, Any?>>()
      val columns = arrayOf(
        CallLog.Calls.NUMBER,
        CallLog.Calls.CACHED_NAME,
        CallLog.Calls.TYPE,
        CallLog.Calls.DATE,
        CallLog.Calls.DURATION
      )

      /**
       * No LIMIT in the sort order.
       *
       * It read as `DATE DESC LIMIT 500` to begin with, which is the old SQLite trick
       * every Android answer still recommends — and since Android 11 the provider
       * rejects it. The query threw, the promise rejected, JavaScript turned that into
       * an empty list, and the Journal card read **Readable · 0 calls · 0 people** on a
       * phone that takes calls all day. Measured 2026-09-03.
       *
       * The cap is applied while walking the cursor instead, which is where it always
       * belonged.
       */
      ctx.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        columns,
        "${CallLog.Calls.DATE} > ?",
        arrayOf(since.toLong().toString()),
        "${CallLog.Calls.DATE} DESC"
      )?.use { rows ->
        val number = rows.getColumnIndex(CallLog.Calls.NUMBER)
        val cached = rows.getColumnIndex(CallLog.Calls.CACHED_NAME)
        val type = rows.getColumnIndex(CallLog.Calls.TYPE)
        val date = rows.getColumnIndex(CallLog.Calls.DATE)
        val duration = rows.getColumnIndex(CallLog.Calls.DURATION)

        while (rows.moveToNext() && out.size < limit) {
          val raw = if (number >= 0) rows.getString(number) ?: "" else ""
          val name = if (cached >= 0) rows.getString(cached) else null
          val kind = when (if (type >= 0) rows.getInt(type) else 0) {
            CallLog.Calls.INCOMING_TYPE -> "in"
            CallLog.Calls.OUTGOING_TYPE -> "out"
            CallLog.Calls.MISSED_TYPE -> "missed"
            CallLog.Calls.REJECTED_TYPE -> "missed"
            else -> "other"
          }

          out.add(
            mapOf(
              // the id, never the number: see the note at the top of this file
              "who" to anonymise(raw),
              "name" to if (name.isNullOrBlank()) null else name,
              "kind" to kind,
              "at" to (if (date >= 0) rows.getLong(date) else 0L).toDouble(),
              "seconds" to (if (duration >= 0) rows.getLong(duration) else 0L).toDouble()
            )
          )
        }
      }

      out
    }
  }

  /**
   * A stable id for a caller that cannot be turned back into a number.
   *
   * SHA-256 truncated to sixteen characters: enough that two callers will not collide
   * on one phone, and one-way, so a leak of this store leaks who called how often and
   * never who they are. The digits are normalised first, since the same person arrives
   * as `+91 98…`, `098…` and `98…` depending on who dialled.
   */
  private fun anonymise(number: String): String {
    val digits = number.filter { it.isDigit() }.takeLast(10)
    if (digits.isEmpty()) return "unknown"
    val hash = MessageDigest.getInstance("SHA-256").digest(digits.toByteArray())
    return hash.joinToString("") { "%02x".format(it) }.take(16)
  }
}
