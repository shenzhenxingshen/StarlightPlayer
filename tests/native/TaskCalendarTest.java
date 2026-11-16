import com.starlightplayer.TaskCalendar;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.TimeZone;

/** Dependency-free policy tests, not a substitute for Android AlarmManager instrumentation. */
public final class TaskCalendarTest {
  private static int assertions;
  private static long at(String iso) { return Instant.parse(iso).toEpochMilli(); }
  private static Set<Integer> days(Integer... days) { return new HashSet<>(Arrays.asList(days)); }
  private static void check(boolean ok, String label) {
    assertions++;
    if (!ok) throw new AssertionError(label);
  }
  private static void next(String zone, String now, int h, int m, int s, Set<Integer> days, String expected) {
    Long actual = TaskCalendar.next(at(now), TimeZone.getTimeZone(zone), h, m, s, days);
    check(actual != null && actual == at(expected), zone + " expected " + expected + " actual " + actual);
  }
  public static void main(String[] args) {
    Set<Integer> all = days(1,2,3,4,5,6,7);
    next("Asia/Shanghai", "2026-11-15T15:59:58Z", 23,59,59, days(7), "2026-11-15T15:59:59Z");
    next("Asia/Shanghai", "2026-11-15T15:59:59Z", 23,59,59, days(7), "2026-11-22T15:59:59Z");
    next("Asia/Shanghai", "2026-11-15T15:59:59Z", 0,0,0, days(1), "2026-11-15T16:00:00Z");
    next("Asia/Shanghai", "2026-12-31T16:00:00Z", 0,0,0, all, "2027-01-01T16:00:00Z");
    // Spring-forward: 02:30 doesn't exist on March 8; don't silently shift to 03:30.
    next("America/New_York", "2026-03-08T05:00:00Z", 2,30,0, all, "2026-03-09T06:30:00Z");
    next("America/New_York", "2026-03-08T05:00:00Z", 2,30,0, days(7), "2026-03-15T06:30:00Z");
    // Fall-back: fire the earlier 01:30 only; after it, don't fire the repeated 01:30.
    next("America/New_York", "2026-11-01T04:00:00Z", 1,30,0, all, "2026-11-01T05:30:00Z");
    next("America/New_York", "2026-11-01T05:45:00Z", 1,30,0, days(7), "2026-11-08T06:30:00Z");
    next("Australia/Lord_Howe", "2026-10-03T14:00:00Z", 2,15,0, all, "2026-10-04T15:15:00Z");
    next("Asia/Kathmandu", "2026-11-15T18:14:59Z", 0,0,0, days(1), "2026-11-15T18:15:00Z");
    check(TaskCalendar.next(0, TimeZone.getTimeZone("UTC"), 24,0,0,all) == null, "invalid hour");
    check(TaskCalendar.next(0, TimeZone.getTimeZone("UTC"), 0,60,0,all) == null, "invalid minute");
    check(TaskCalendar.next(0, TimeZone.getTimeZone("UTC"), 0,0,-1,all) == null, "invalid second");
    check(TaskCalendar.next(0, TimeZone.getTimeZone("UTC"), 0,0,0,days()) == null, "empty days");
    check(TaskCalendar.matches(at("2026-11-15T15:59:59Z"), TimeZone.getTimeZone("Asia/Shanghai"),23,59,59,days(7)), "Sunday");
    check(!TaskCalendar.matches(at("2026-11-15T16:00:00Z"), TimeZone.getTimeZone("Asia/Shanghai"),0,0,0,days(7)), "Monday not Sunday");
    System.out.println("TaskCalendar Java: " + assertions + " assertions passed");
  }
}
