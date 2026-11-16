package com.starlightplayer;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;
import java.util.TimeZone;

/** Pure calendar policy (also executable in JVM tests; no Android or new API requirement). */
public final class TaskCalendar {
  private TaskCalendar() {}

  public static boolean matches(long at, TimeZone zone, int hour, int minute, int second,
                                Set<Integer> weekdays) {
    Calendar date = Calendar.getInstance(zone);
    date.setTimeInMillis(at);
    int weekday = (date.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1;
    return weekdays.contains(weekday) && date.get(Calendar.HOUR_OF_DAY) == hour &&
      date.get(Calendar.MINUTE) == minute && date.get(Calendar.SECOND) == second;
  }

  /** Strictly after now. Missing DST wall times are skipped; repeated times use the first instant. */
  public static Long next(long now, TimeZone zone, int hour, int minute, int second,
                          Set<Integer> weekdays) {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59 ||
        weekdays.isEmpty()) return null;
    Calendar local = Calendar.getInstance(zone);
    local.setTimeInMillis(now);
    // Advance dates in UTC, not instants by 24h in the user's timezone.
    Calendar day = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
    day.clear();
    day.set(local.get(Calendar.YEAR), local.get(Calendar.MONTH), local.get(Calendar.DAY_OF_MONTH),
      hour, minute, second);
    for (int index = 0; index < 15; index++, day.add(Calendar.DATE, 1)) {
      int weekday = (day.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1;
      if (!weekdays.contains(weekday)) continue;
      long wallTime = day.getTimeInMillis();
      Set<Integer> offsets = new HashSet<>();
      // Enumerate offsets on both sides of a timezone transition, including half-hour DST.
      for (int hours = -36; hours <= 36; hours += 6) {
        offsets.add(zone.getOffset(wallTime + hours * 3_600_000L));
      }
      Long earliest = null;
      for (int offset : offsets) {
        long at = wallTime - offset;
        if (at + zone.getOffset(at) == wallTime && (earliest == null || at < earliest)) earliest = at;
      }
      if (earliest != null && earliest > now) return earliest;
    }
    return null;
  }
}
