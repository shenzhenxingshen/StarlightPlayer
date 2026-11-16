import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "stats", Path(__file__).resolve().parents[1] / "update_stats.py"
)
stats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stats)
WINDOWS = next(path for path, platform in stats.ARTIFACTS.items() if platform == "windows-x64")
MAC = next(path for path, platform in stats.ARTIFACTS.items() if platform == "macos-arm64")


def log(path=WINDOWS, method="GET", status=200, size=424764413,
        stamp="15/Nov/2026:08:00:00 +0800", ip="192.0.2.1", ua="Windows"):
    return f'{ip} - - [{stamp}] "{method} {path} HTTP/1.1" {status} {size} "-" "{ua}"\n'


def summarize(lines, lookup=lambda ip: ("中国–广东", "")):
    return stats.aggregate(lines, lookup, now=1794700800)


class StatsTests(unittest.TestCase):
    def test_platforms_and_combined_totals(self):
        data = summarize([log(), log(MAC), log(stats.APK_PATTERN)])
        self.assertEqual((data["total_downloads"], data["android_downloads"],
                          data["desktop_downloads"], data["unique_ips"]), (3, 1, 2, 1))
        self.assertEqual(data["desktop_platforms"]["windows-x64"]["downloads"], 1)
        self.assertEqual(data["desktop_platforms"]["linux-x64"]["downloads"], 0)
        self.assertEqual(data["countries"], {"中国": 3})
        self.assertEqual(data["provinces"], {"广东省": 3})
        self.assertEqual(data["brands"], {"电脑浏览器": 1})

    def test_non_downloads_and_probe_filters(self):
        rows = [log(method="HEAD"), log(method="POST"), log(status=404),
                log(status=304), log(status=500), log(ua="Starlight-Stats-Probe/1.0"),
                log(size=1024, status=206), log(size=0), log(size=1023)]
        self.assertEqual(summarize(rows)["total_downloads"], 0)
        self.assertEqual(summarize([log(size=1025, status=206)])["total_downloads"], 1)

    def test_status_is_parsed_not_found_anywhere_in_line(self):
        self.assertEqual(summarize([log(status=404, ua="test 200 test")])["total_downloads"], 0)

    def test_query_string_but_not_other_artifacts(self):
        rows = [log(WINDOWS + "?download=1"), log(WINDOWS + ".bak"),
                log(WINDOWS.replace("v0.1.0/", "v0.2.0/")), log("/random.zip"),
                log(stats.APK_PATTERN.replace("v1.1/", "v1.0/"))]
        self.assertEqual(summarize(rows)["total_downloads"], 1)

    def test_desktop_idle_window_edges_and_out_of_order(self):
        rows = [log(stamp="15/Nov/2026:08:59:58 +0800"),
                log(stamp="15/Nov/2026:08:00:00 +0800"),
                log(stamp="15/Nov/2026:08:29:59 +0800"),
                log(stamp="15/Nov/2026:09:29:58 +0800")]
        self.assertEqual(summarize(rows)["desktop_downloads"], 2)

    def test_desktop_midnight_and_timezone(self):
        rows = [log(stamp="14/Nov/2026:23:59:59 +0800"),
                log(stamp="15/Nov/2026:00:00:01 +0800"),
                log(stamp="14/Nov/2026:16:00:02 +0000")]
        self.assertEqual(summarize(rows)["desktop_downloads"], 1)

    def test_multiple_ips_and_ipv6(self):
        self.assertEqual(summarize([log(), log(ip="192.0.2.2"),
                                   log(ip="2001:db8::1")])["desktop_downloads"], 3)

    def test_android_preserves_5_minute_bucket_and_tiny_range(self):
        rows = [log(stats.APK_PATTERN, size=1, status=206),
                log(stats.APK_PATTERN, stamp="15/Nov/2026:08:04:59 +0800"),
                log(stats.APK_PATTERN, stamp="15/Nov/2026:08:05:00 +0800"),
                log(stats.APK_PATTERN, stamp="16/Nov/2026:08:05:00 +0800")]
        self.assertEqual(summarize(rows)["android_downloads"], 3)

    def test_invalid_records_are_diagnosed(self):
        data = summarize([WINDOWS, log(ip="bad-ip"), log(stamp="bad-date")])
        self.assertEqual(data["total_downloads"], 0)
        self.assertEqual(data["diagnostics"]["unparseable_matching_lines"], 1)
        self.assertEqual(data["diagnostics"]["invalid_ip_or_timestamp"], 2)

    def test_output_has_no_identifying_logs(self):
        text = json.dumps(summarize([log(ua="private-device-identifier")]))
        self.assertNotIn("192.0.2.1", text)
        self.assertNotIn("private-device-identifier", text)

    def test_country_and_region_mapping(self):
        for value, region in [("中国–广西", "广西壮族自治区"), ("中国–北京", "北京市"),
                              ("中国–贵州", "贵州省")]:
            with self.subTest(value=value):
                self.assertEqual(summarize([log()], lambda ip: (value, ""))["provinces"],
                                 {region: 1})
        self.assertEqual(summarize([log()], lambda ip: None)["countries"], {"未知": 1})
        self.assertEqual(summarize([log()], lambda ip: ("法国", ""))["countries"], {"法国": 1})

    def test_empty_input_has_zero_for_all_platforms(self):
        data = summarize([])
        self.assertEqual(data["total_downloads"], 0)
        self.assertEqual(len(data["desktop_platforms"]), 4)
        self.assertEqual(data["last_updated"], 1794700800)

    def test_compressed_logs_and_duplicate_rotation_data(self):
        with tempfile.TemporaryDirectory() as folder:
            plain = Path(folder) / "access.log"
            compressed = Path(folder) / "access.log.2.gz"
            plain.write_text(log(), encoding="utf-8")
            with gzip.open(compressed, "wt") as file:
                file.write(log())
            self.assertEqual(summarize(stats.read_logs([str(plain), str(compressed)]))
                             ["desktop_downloads"], 1)

    def test_missing_and_corrupt_logs_fail_closed(self):
        with self.assertRaises(ValueError):
            list(stats.read_logs([]))
        with tempfile.TemporaryDirectory() as folder:
            missing = Path(folder) / "access.log"
            with self.assertRaises(FileNotFoundError):
                list(stats.read_logs([str(missing)]))
            compressed = Path(folder) / "access.log.gz"
            compressed.write_bytes(b"invalid gzip")
            with self.assertRaises(OSError):
                list(stats.read_logs([str(compressed)]))

    def test_atomic_output_and_permissions(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "stats.json"
            stats.atomic_write(target, summarize([log()]))
            self.assertEqual(json.loads(target.read_text())["desktop_downloads"], 1)
            self.assertEqual(target.stat().st_mode & 0o777, 0o644)
            self.assertEqual(list(Path(folder).iterdir()), [target])

    def test_failed_publish_preserves_previous_data_and_cleans_temp(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "stats.json"
            target.write_text('{"old": true}')
            with patch.object(stats.os, "replace", side_effect=OSError("test failure")):
                with self.assertRaises(OSError):
                    stats.atomic_write(target, summarize([log()]))
            self.assertEqual(json.loads(target.read_text()), {"old": True})
            self.assertEqual(list(Path(folder).iterdir()), [target])


if __name__ == "__main__":
    unittest.main()
