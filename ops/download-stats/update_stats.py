#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# v1.1 APK + desktop v0.1.0 ZIP download requests. See README.md for semantics.
import glob
import gzip
import ipaddress
import json
import os
import re
import tempfile
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

def extract_phone_brand(user_agent):
    if not user_agent: return "未知"
    ua = user_agent.upper()
    brands = {
        'IPHONE': 'iPhone', 'IPAD': 'iPad',
        'HUAWEI': '华为', 'HONOR': '荣耀',
        'XIAOMI': '小米', 'REDMI': '红米', 'POCO': 'POCO',
        'OPPO': 'OPPO', 'REALME': 'realme', 'ONEPLUS': '一加',
        'VIVO': 'vivo', 'IQOO': 'iQOO',
        'SAMSUNG': '三星', 'MEIZU': '魅族', 'LENOVO': '联想',
        'ZTE': '中兴', 'NUBIA': '努比亚', 'SONY': '索尼',
        'GOOGLE': 'Google', 'PIXEL': 'Google Pixel',
        'NOKIA': '诺基亚', 'MOTOROLA': '摩托罗拉', 'NOTHING': 'Nothing',
        ' MI ': '小米', 'MI MAX': '小米', 'MI NOTE': '小米', 'MI PAD': '小米',
        'MIX ': '小米', 'MI 9': '小米', 'MI 10': '小米', 'MI 11': '小米', 'MI 12': '小米',
    }
    if 'HARMONYOS' in ua or 'OPENHARMONY' in ua: return '华为/荣耀'
    for kw, brand in brands.items():
        if kw in ua: return brand
    # 型号前缀匹配（从 UA 中的设备型号提取）
    model_prefixes = {
        'SM-': '三星', 'GT-': '三星',
        'CPH': 'OPPO', 'RMX': 'realme',
        'MOTO': '摩托罗拉', 'XT': '摩托罗拉',
        # OPPO 型号
        'PCNM': 'OPPO', 'PCHM': 'OPPO', 'PCAM': 'OPPO', 'PCLM': 'OPPO',
        'PERM': 'OPPO', 'PEGM': 'OPPO', 'PEXM': 'OPPO', 'PEAM': 'OPPO',
        'PDYM': 'OPPO', 'PDSM': 'OPPO', 'PDKM': 'OPPO', 'PDEM': 'OPPO',
        'PDAM': 'OPPO', 'PKM': 'OPPO',
        # vivo 型号
        'V20': 'vivo', 'V21': 'vivo', 'V22': 'vivo', 'V23': 'vivo',
        'V24': 'vivo', 'V25': 'vivo', 'V26': 'vivo',
        # 华为/荣耀型号
        'ANA-': '华为', 'ALP-': '华为', 'BLA-': '华为', 'CLT-': '华为',
        'EML-': '华为', 'HMA-': '华为', 'LYA-': '华为', 'VOG-': '华为',
        'NOH-': '华为', 'OCE-': '华为', 'TAS-': '华为', 'JAD-': '华为',
        'ELE-': '华为', 'SEA-': '华为', 'FRL-': '华为', 'JNY-': '华为',
        'FIO-': '华为', 'CDY-': '华为', 'WLZ-': '华为', 'AGS-': '华为',
        'SHR-': '华为',
        'MXW-': '荣耀', 'BRP-': '荣耀', 'ANY-': '荣耀', 'BMH-': '荣耀',
        # vivo 更多型号
        'V1981': 'vivo',
    }
    for prefix, brand in model_prefixes.items():
        if prefix in ua: return brand
    # 小米型号：M + 4位数字 或 年份型号 (2YMM开头，如 23013RK75C, 24069RA21C, 25080RABDC)
    if re.search(r'\bM\d{4}[A-Z]', ua): return '小米'
    if 'MI9' in ua or 'MI 9' in ua or 'MI8' in ua or 'MI 8' in ua: return '小米'
    # 从 Build/ 前面提取设备型号
    model_match = re.search(r';\s*([^;)]+?)\s*Build/', user_agent, re.IGNORECASE)
    model = model_match.group(1).strip().upper() if model_match else ''
    # 小米年份型号：2开头 + 数字字母混合 (如 24117RK2CC, 2505APX7BC, 21091116AC)
    if model and re.match(r'2[0-5]\d{2}', model) and len(model) >= 7: return '小米'
    # OPPO/一加新型号：P + 两个大写字母 + 数字/字母 (如 PEGT00, PHK110, PKQ110)
    if re.search(r'\bP[A-Z]{2}[A-Z0-9]\d{2}', ua): return 'OPPO'
    # 一加 OPD 型号
    if re.search(r'\bOPD\d{4}', ua): return '一加'
    if any(x in ua for x in ['WINDOWS', 'MACINTOSH', 'X11; LINUX']) and 'ANDROID' not in ua:
        return '电脑浏览器'
    if 'ANDROIDDOWNLOADMANAGER' in ua: return 'Android系统'
    return "其他"

LOG_GLOB = "/var/log/nginx/access.log*"
OUTPUT = Path("/var/www/app-download/starlight/v1.1/api/stats.json")
QQWRY_FILE = "/var/www/app-download/qqwry.dat"
APK_PATTERN = "/starlight/v1.1/xingguang-v1.1.apk"
DESKTOP_PREFIX = "/starlight/desktop/v0.1.0/"
DESKTOP_PACKAGES = {
    "macos-arm64": "Mac · Apple 芯片",
    "macos-x64": "Mac · Intel",
    "windows-x64": "Windows · x64",
    "linux-x64": "Linux · x64",
}
ARTIFACTS = {APK_PATTERN: "android"}
ARTIFACTS.update({
    DESKTOP_PREFIX + "Starlight_Desktop_0.1.0_" + platform + ".zip": platform
    for platform in DESKTOP_PACKAGES
})
DESKTOP_SESSION_SECONDS = 30 * 60
PROBE_USER_AGENT = "Starlight-Stats-Probe/"
LOG_LINE = re.compile(
    r'^(?P<ip>\S+) \S+ \S+ \[(?P<stamp>[^\]]+)\] '
    r'"(?P<method>\S+) (?P<url>\S+) HTTP/[^"]+" '
    r'(?P<status>\d{3}) (?P<bytes>\d+) "[^"]*" "(?P<ua>[^"]*)"'
)

def read_logs(paths):
    """Fail closed on unreadable/truncated archives; never publish partial totals."""
    if not paths:
        raise ValueError("No access logs found; preserving existing stats")
    for path in sorted(paths, reverse=True):
        opener = gzip.open if str(path).endswith(".gz") else open
        with opener(path, "rt", encoding="utf-8", errors="replace") as source:
            yield from source


def geography(ip_counts, lookup):
    provinces, countries = Counter(), Counter()
    for ip, count in ip_counts.items():
        result = lookup(ip)
        if not result or not result[0]:
            countries["未知"] += count
            continue
        location = result[0]
        if "中国" not in location:
            countries[location.split("–")[0].strip()] += count
            continue
        countries["中国"] += count
        parts = location.split("–")
        if len(parts) < 2 or not parts[1].strip():
            continue
        name = parts[1].strip()
        regions = {
            "广西": "广西壮族自治区", "内蒙古": "内蒙古自治区",
            "新疆": "新疆维吾尔自治区", "宁夏": "宁夏回族自治区",
            "西藏": "西藏自治区", "香港": "香港特别行政区", "澳门": "澳门特别行政区",
        }
        if name in regions:
            name = regions[name]
        elif name in ["北京", "天津", "上海", "重庆"]:
            name += "市"
        elif not name.endswith(("省", "市")):
            name += "省"
        provinces[name] += count
    return sorted_counts(provinces), sorted_counts(countries)


def sorted_counts(values):
    return dict(sorted(values.items(), key=lambda item: (-item[1], item[0])))


def aggregate(lines, lookup, now=None):
    android_ips, android_agents = Counter(), {}
    android_windows = set()
    desktop_events = []
    diagnostics = Counter()
    for line in lines:
        if APK_PATTERN not in line and DESKTOP_PREFIX not in line:
            continue
        match = LOG_LINE.match(line)
        if not match:
            diagnostics["unparseable_matching_lines"] += 1
            continue
        row = match.groupdict()
        platform = ARTIFACTS.get(row["url"].split("?", 1)[0])
        if platform is None:
            continue
        if row["method"] != "GET" or row["status"] not in ("200", "206"):
            diagnostics["excluded_method_or_status"] += 1
            continue
        if PROBE_USER_AGENT in row["ua"]:
            diagnostics["excluded_marked_probes"] += 1
            continue
        if platform != "android" and int(row["bytes"]) <= 1024:
            diagnostics["excluded_desktop_tiny_responses"] += 1
            continue
        try:
            ip = str(ipaddress.ip_address(row["ip"]))
            stamp = datetime.strptime(row["stamp"], "%d/%b/%Y:%H:%M:%S %z")
        except ValueError:
            diagnostics["invalid_ip_or_timestamp"] += 1
            continue
        if platform == "android":
            # Preserve the existing APK IP + local-calendar fixed 5-minute bucket.
            key = (ip, stamp.date(), stamp.hour * 12 + stamp.minute // 5)
            if key not in android_windows:
                android_windows.add(key)
                android_ips[ip] += 1
                android_agents[ip] = row["ua"]
        else:
            desktop_events.append((stamp.timestamp(), ip, platform))

    desktop_ips, platforms, last_seen = Counter(), Counter(), {}
    for timestamp, ip, platform in sorted(desktop_events):
        key = (ip, platform)
        previous = last_seen.get(key)
        if previous is None or timestamp - previous >= DESKTOP_SESSION_SECONDS:
            desktop_ips[ip] += 1
            platforms[platform] += 1
        # Sliding idle timeout also merges long, ongoing parallel/Range downloads.
        last_seen[key] = timestamp

    combined_ips = android_ips + desktop_ips
    provinces, countries = geography(combined_ips, lookup)
    brands = Counter()
    for ip, count in android_ips.items():
        brands[extract_phone_brand(android_agents[ip])] += count
    android_total = sum(android_ips.values())
    desktop_total = sum(platforms.values())
    return {
        "schema_version": 2,
        "scope": {"android": "1.1", "desktop": "0.1.0", "ios": "not_observed"},
        "total_downloads": android_total + desktop_total,
        "android_downloads": android_total,
        "desktop_downloads": desktop_total,
        "unique_ips": len(combined_ips),
        "desktop_platforms": {
            key: {"label": label, "downloads": platforms[key]}
            for key, label in DESKTOP_PACKAGES.items()
        },
        "provinces": provinces,
        "countries": countries,
        "brands": sorted_counts(brands),
        "brands_scope": "android",
        "diagnostics": dict(diagnostics),
        "last_updated": int(time.time() if now is None else now),
    }


def atomic_write(output, data):
    """Readers always see a complete old/new JSON, including during cron refresh."""
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    pending = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=output.parent, prefix=".stats-", delete=False
        ) as target:
            pending = target.name
            json.dump(data, target, ensure_ascii=False, indent=2)
            target.write("\n")
            target.flush()
            os.fsync(target.fileno())
        os.chmod(pending, 0o644)
        os.replace(pending, output)
    finally:
        if pending and os.path.exists(pending):
            os.unlink(pending)


def main():
    # Existing server dependency, not needed for pure unit tests.
    from qqwry import QQwry
    q = QQwry()
    if not q.load_file(QQWRY_FILE):
        raise RuntimeError("Cannot load IP database; preserving existing stats")
    paths = glob.glob(LOG_GLOB)
    data = aggregate(read_logs(paths), q.lookup)
    data["log_files_scanned"] = len(paths)
    data["log_last_modified"] = int(max(Path(path).stat().st_mtime for path in paths))
    if os.environ.get("STARLIGHT_STATS_DRY_RUN") != "1":
        atomic_write(OUTPUT, data)
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
