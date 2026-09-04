package expo.modules.timelineimport

import android.net.Uri
import android.util.JsonReader
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.InputStreamReader

/**
 * A Google Timeline export, streamed.
 *
 * The file is 47 MB and `JSON.parse` on it takes the phone down, so it is walked here
 * with a pull parser in constant memory and **never crosses into JavaScript**. What
 * leaves this file is four numbers per visit — about 4,000 of them out of 11,570
 * segments.
 *
 * The file is read once through the `content://` URI the user picked and is never
 * copied. Same rule as the call log: the phone already holds it, and a second copy is
 * a second thing to secure.
 *
 * The rejected alternative was a hand-rolled brace-matching scanner in JavaScript over
 * chunked reads — no build required, and a parser written under time pressure against
 * a format Google keeps changing, which is how you get a silent wrong answer.
 */
class TimelineImportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TimelineImport")

    /**
     * Walk the export and return the visits.
     *
     * `segments` comes back beside them on purpose: **an empty visit list and a parser
     * that gave up look identical from JavaScript**, and that confusion is the most
     * expensive habit this project has. 11,570 segments with 0 visits is Google
     * changing the format; 0 segments is a file this code could not read at all.
     */
    AsyncFunction("parse") { uri: String ->
      val ctx = appContext.reactContext ?: throw IllegalStateException("no context")
      var segments = 0
      val visits = mutableListOf<Map<String, Any?>>()

      ctx.contentResolver.openInputStream(Uri.parse(uri)).use { stream ->
        JsonReader(InputStreamReader(requireNotNull(stream), "UTF-8")).use { r ->
          r.beginObject()
          while (r.hasNext()) {
            if (r.nextName() == "semanticSegments") {
              r.beginArray()
              while (r.hasNext()) {
                segments += 1
                readSegment(r)?.let { visits.add(it) }
              }
              r.endArray()
            } else {
              // every name this parser does not want must still be consumed, or the
              // reader throws on the next token. That is the one mistake this file
              // can make and it is not a recoverable one
              r.skipValue()
            }
          }
          r.endObject()
        }
      }

      mapOf("segments" to segments, "visits" to visits)
    }
  }

  /**
   * One segment, kept only if it is a visit with a place.
   *
   * A segment carries `startTime` and `endTime` at the top level and the place inside
   * `visit.topCandidate.placeLocation.latLng`, which arrives as the string
   * `"22.8151500°, 88.3719100°"`. Activities and paths are skipped — 4,406 and 3,163
   * of them, describing movement between places rather than being at one, and nothing
   * in the app asks that question yet.
   */
  private fun readSegment(r: JsonReader): Map<String, Any?>? {
    var start = 0L
    var end = 0L
    var lat: Double? = null
    var lon: Double? = null
    var hint: String? = null

    r.beginObject()
    while (r.hasNext()) {
      when (r.nextName()) {
        "startTime" -> start = millis(r.nextString())
        "endTime" -> end = millis(r.nextString())
        "visit" -> {
          r.beginObject()
          while (r.hasNext()) {
            when (r.nextName()) {
              "topCandidate" -> {
                r.beginObject()
                while (r.hasNext()) {
                  when (r.nextName()) {
                    "placeLocation" -> {
                      r.beginObject()
                      while (r.hasNext()) {
                        if (r.nextName() == "latLng") {
                          val parts = r.nextString().split(",")
                          lat = parts.getOrNull(0)?.trim()?.trimEnd('\u00B0')?.toDoubleOrNull()
                          lon = parts.getOrNull(1)?.trim()?.trimEnd('\u00B0')?.toDoubleOrNull()
                        } else {
                          r.skipValue()
                        }
                      }
                      r.endObject()
                    }
                    /**
                     * Google's own guess, which arrives for nothing.
                     *
                     * `INFERRED_HOME` and `INFERRED_WORK` are already in the file — no
                     * key, no lookup, no network. Everything else is dropped: a hint
                     * decorates a question on the naming screen and never becomes a
                     * label, because a place is named by a person.
                     */
                    "semanticType" -> hint = when (r.nextString()) {
                      "INFERRED_HOME" -> "home"
                      "INFERRED_WORK" -> "work"
                      else -> null
                    }
                    else -> r.skipValue()
                  }
                }
                r.endObject()
              }
              else -> r.skipValue()
            }
          }
          r.endObject()
        }
        else -> r.skipValue()
      }
    }
    r.endObject()

    // a visit with no place is not a sighting, and one with no times is not one either
    if (lat == null || lon == null || start == 0L || end == 0L) return null
    return mapOf(
      "lat" to lat,
      "lon" to lon,
      // Double on the way out: Expo's bridge carries it cleanly, and a Long past 2^53
      // arrives mangled. Not a risk at these values, and not a thing to leave to chance
      "start" to start.toDouble(),
      "end" to end.toDouble(),
      "hint" to hint
    )
  }

  /**
   * An ISO timestamp to millis.
   *
   * The export writes `2026-09-03T09:49:00.000+05:30`. `SimpleDateFormat` is not
   * thread-safe and `Instant.parse` rejects an offset in that form, so this uses
   * `OffsetDateTime`, which handles both the `Z` and the offset shapes the file
   * actually contains. A timestamp that will not parse makes the segment unusable
   * rather than fatal — `readSegment` drops it.
   */
  private fun millis(iso: String): Long =
    try {
      java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()
    } catch (_: Exception) {
      0L
    }
}
