import com.starlightplayer.ScheduledTaskPayload;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Executes the actual bridge projection; not a mock of ScheduledTaskManager.syncTasks. */
public final class ScheduledTaskPayloadTest {
  private static int assertions;
  private static void check(boolean ok, String label) {
    assertions++;
    if (!ok) throw new AssertionError(label);
  }
  public static void main(String[] args) {
    Map<String, Object> task = new HashMap<>();
    task.put("id", "weekday-test");
    task.put("name", "Weekdays");
    task.put("hour", 5.0); // RN numbers arrive as doubles.
    task.put("minute", 30.0);
    task.put("second", 0.0);
    task.put("enabled", true);
    task.put("repeatCount", 49.0); // Not part of the native alarm projection.
    Map<String, Object> legacy = ScheduledTaskPayload.fromMap(task);
    check(!legacy.containsKey("weekdays"), "legacy absence remains daily");
    check(legacy.size() == 6, "only scheduling fields are persisted");
    for (String key : new String[] {"id", "name", "hour", "minute", "second", "enabled"}) {
      check(task.get(key).equals(legacy.get(key)), "preserve " + key);
    }
    List<Double> selected = new ArrayList<>(Arrays.asList(1.0, 3.0, 7.0));
    task.put("weekdays", selected);
    Map<String, Object> payload = ScheduledTaskPayload.fromMap(task);
    check(selected.equals(payload.get("weekdays")), "selected weekdays reach alarm JSON");
    selected.clear();
    check(((List<?>) payload.get("weekdays")).size() == 3, "snapshot does not alias RN data");
    check(((List<?>) ScheduledTaskPayload.fromMap(task).get("weekdays")).isEmpty(), "empty stays empty");
    task.put("weekdays", null);
    check(((List<?>) ScheduledTaskPayload.fromMap(task).get("weekdays")).isEmpty(), "null never becomes daily");
    task.put("weekdays", "Monday");
    check(((List<?>) ScheduledTaskPayload.fromMap(task).get("weekdays")).isEmpty(), "malformed never becomes daily");
    task.put("enabled", false);
    check(Boolean.FALSE.equals(ScheduledTaskPayload.fromMap(task).get("enabled")), "disabled preserved");
    System.out.println("ScheduledTaskPayload Java: " + assertions + " assertions passed");
  }
}
