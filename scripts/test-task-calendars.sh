#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_build_dir=$(mktemp -d "${TMPDIR:-/tmp}/starlight-task-calendar.XXXXXX")
# Keep artifacts in this unique directory for inspection; don't touch app builds or user data.
echo "Native calendar test artifacts: $test_build_dir"
"${JAVA_HOME:+$JAVA_HOME/bin/}javac" -d "$test_build_dir" \
  android/app/src/main/java/com/starlightplayer/TaskCalendar.java \
  android/app/src/main/java/com/starlightplayer/ScheduledTaskPayload.java \
  tests/native/TaskCalendarTest.java tests/native/ScheduledTaskPayloadTest.java
"${JAVA_HOME:+$JAVA_HOME/bin/}java" -cp "$test_build_dir" TaskCalendarTest
"${JAVA_HOME:+$JAVA_HOME/bin/}java" -cp "$test_build_dir" ScheduledTaskPayloadTest
if [[ "$(uname -s)" == Darwin ]]; then
  xcrun clang -fobjc-arc -Wall -Wextra -Werror -framework Foundation \
    tests/native/ScheduledTaskCalendarTest.m -o "$test_build_dir/calendar-ios"
  "$test_build_dir/calendar-ios"
else
  echo "Foundation calendar tests require macOS; skipped on this host."
fi
