//! Native clock adapter. The task policy runs in shared TS, never in WebView timers.
use chrono::{DateTime, Datelike, Duration, TimeZone};
use serde_json::{json, Value};

pub fn candidates<T: TimeZone>(tasks: &Value, now: DateTime<T>) -> Value {
    let zone = now.timezone();
    let mut result = Vec::new();
    for day in [now.date_naive() - Duration::days(1), now.date_naive()] {
        for task in tasks.as_array().into_iter().flatten() {
            if let Some(days) = task.get("weekdays") {
                let weekday = day.weekday().number_from_monday() as u64;
                let Some(days) = days.as_array() else {
                    continue;
                };
                if !days.iter().all(|day| matches!(day.as_u64(), Some(1..=7)))
                    || !days.iter().any(|day| day.as_u64() == Some(weekday))
                {
                    continue;
                }
            }
            let Some(local) = day.and_hms_opt(
                task["hour"].as_u64().unwrap_or(99) as u32,
                task["minute"].as_u64().unwrap_or(99) as u32,
                task["second"].as_u64().unwrap_or(99) as u32,
            ) else {
                continue;
            };
            // Nonexistent DST time is skipped, repeated time occurs once (earlier offset).
            if let Some(at) = zone.from_local_datetime(&local).earliest() {
                result.push(json!({
                    "taskId":task["id"],
                    "scheduledAt":at.timestamp_millis(),
                    "key":format!("{}@{}", task["id"].as_str().unwrap_or(""), local.format("%Y-%m-%dT%H:%M:%S"))
                }));
            }
        }
    }
    json!(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;
    #[test]
    fn includes_previous_day_and_seconds_in_local_zone() {
        let zone = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = zone.with_ymd_and_hms(2026, 11, 15, 0, 1, 0).unwrap();
        let result = candidates(&json!([{"id":"x","hour":23,"minute":59,"second":45}]), now);
        assert_eq!(result[0]["key"], "x@2026-11-14T23:59:45");
        assert_eq!(
            now.timestamp_millis() - result[0]["scheduledAt"].as_i64().unwrap(),
            75_000
        );
        assert_eq!(result[1]["key"], "x@2026-11-15T23:59:45");
    }

    #[test]
    fn selected_weekdays_use_iso_sunday_and_monday() {
        let zone = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = zone.with_ymd_and_hms(2026, 11, 16, 0, 1, 0).unwrap();
        let result = candidates(
            &json!([
                {"id":"sun","hour":23,"minute":59,"second":59,"weekdays":[7]},
                {"id":"mon","hour":0,"minute":0,"second":0,"weekdays":[1]}
            ]),
            now,
        );
        assert_eq!(result.as_array().unwrap().len(), 2);
        assert_eq!(result[0]["key"], "sun@2026-11-15T23:59:59");
        assert_eq!(result[1]["key"], "mon@2026-11-16T00:00:00");
    }

    #[test]
    fn malformed_weekdays_never_fall_back_to_daily() {
        let zone = FixedOffset::east_opt(0).unwrap();
        let now = zone.with_ymd_and_hms(2026, 11, 16, 0, 1, 0).unwrap();
        for days in [
            json!(null),
            json!([]),
            json!([0]),
            json!([8]),
            json!([1.5]),
            json!([true]),
            json!(["1"]),
        ] {
            let result = candidates(
                &json!([{"id":"x","hour":0,"minute":0,"second":0,"weekdays":days}]),
                now,
            );
            assert!(result.as_array().unwrap().is_empty());
        }
    }
}
