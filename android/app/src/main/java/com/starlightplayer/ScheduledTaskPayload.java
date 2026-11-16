package com.starlightplayer;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** RN's toHashMap() -> persisted alarm JSON projection, independent of Android for regression tests. */
public final class ScheduledTaskPayload {
  private ScheduledTaskPayload() {}

  public static Map<String, Object> fromMap(Map<String, Object> task) {
    Map<String, Object> payload = new LinkedHashMap<>();
    for (String key : new String[] {"id", "name", "hour", "minute", "second", "enabled"}) {
      payload.put(key, task.get(key));
    }
    // Only an absent field means legacy daily. Null/malformed/empty must never become daily.
    if (task.containsKey("weekdays")) {
      Object value = task.get("weekdays");
      payload.put("weekdays", value instanceof List
        ? new ArrayList<>((List<?>) value) : Collections.emptyList());
    }
    return payload;
  }
}
