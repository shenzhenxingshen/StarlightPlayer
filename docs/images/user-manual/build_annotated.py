#!/usr/bin/env python3
"""Build the annotated screenshots used by docs/USER_MANUAL.md.

The files under raw/ are unmodified Simulator/Emulator captures.  This script
builds both overview boards and readable close-ups under annotated/.  Close-ups
put Chinese explanations, highlights and arrows directly into the image so a
screenshot remains understandable when viewed outside the Markdown manual.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import atan2, cos, sin
from pathlib import Path
from typing import Sequence

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
OUT = ROOT / "annotated"
DETAIL_OUT = OUT / "detail"
FONT_CANDIDATES = (
    Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
    Path("/System/Library/Fonts/PingFang.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
    Path("C:/Windows/Fonts/msyh.ttc"),
)
FONT_PATH = next((candidate for candidate in FONT_CANDIDATES if candidate.is_file()), None)

if FONT_PATH is None:
    searched = "\n".join(f"- {candidate}" for candidate in FONT_CANDIDATES)
    raise FileNotFoundError(f"No Chinese font was found. Searched:\n{searched}")

BG = (242, 247, 247)
CARD = (255, 255, 255)
TEXT = (31, 52, 52)
MUTED = (91, 111, 111)
TEAL = (0, 166, 148)
TEAL_SOFT = (0, 166, 148, 46)
WHITE = (255, 255, 255)
BORDER = (205, 221, 219)


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), size=size)


TITLE_FONT = font(52)
PANEL_FONT = font(35)
BADGE_FONT = font(40)
GUIDE_FONT = font(38)


@dataclass(frozen=True)
class Mark:
    label: str
    target: tuple[int, int]
    badge: tuple[int, int] | None = None
    box: tuple[int, int, int, int] | None = None


@dataclass(frozen=True)
class PanelSpec:
    source: str
    title: str
    marks: Sequence[Mark] = field(default_factory=tuple)
    crop: tuple[int, int, int, int] | None = None
    dashed_lines: Sequence[tuple[int, int, int, int]] = field(default_factory=tuple)


@dataclass(frozen=True)
class GuideCallout:
    text: str
    target: tuple[int, int]
    label_y: int
    box: tuple[int, int, int, int] | None = None


def _text_center(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str, used_font: ImageFont.FreeTypeFont) -> None:
    box = draw.textbbox((0, 0), value, font=used_font)
    width = box[2] - box[0]
    height = box[3] - box[1]
    draw.text((xy[0] - width / 2, xy[1] - height / 2 - box[1]), value, font=used_font, fill=WHITE)


def _arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int]) -> None:
    draw.line((start, end), fill=TEAL, width=8)
    angle = atan2(end[1] - start[1], end[0] - start[0])
    length = 28
    spread = 0.62
    p1 = (end[0] - length * cos(angle - spread), end[1] - length * sin(angle - spread))
    p2 = (end[0] - length * cos(angle + spread), end[1] - length * sin(angle + spread))
    draw.polygon((end, p1, p2), fill=TEAL)


def _dashed_line(draw: ImageDraw.ImageDraw, line: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = line
    length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    if not length:
        return
    unit_x = (x2 - x1) / length
    unit_y = (y2 - y1) / length
    cursor = 0.0
    while cursor < length:
        segment_end = min(cursor + 34, length)
        draw.line(
            (
                x1 + unit_x * cursor,
                y1 + unit_y * cursor,
                x1 + unit_x * segment_end,
                y1 + unit_y * segment_end,
            ),
            fill=(0, 166, 148, 185),
            width=7,
        )
        cursor += 54


def annotate(image: Image.Image, marks: Sequence[Mark], dashed_lines: Sequence[tuple[int, int, int, int]]) -> Image.Image:
    result = image.convert("RGBA")
    overlay = Image.new("RGBA", result.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)

    for line in dashed_lines:
        _dashed_line(overlay_draw, line)

    for mark in marks:
        if mark.box:
            overlay_draw.rounded_rectangle(mark.box, radius=24, fill=TEAL_SOFT, outline=TEAL, width=8)

    result = Image.alpha_composite(result, overlay)
    draw = ImageDraw.Draw(result)

    for mark in marks:
        target = mark.target
        badge = mark.badge or (target[0], max(58, target[1] - 125))
        radius = 43 if len(mark.label) == 1 else 51
        vector_x = target[0] - badge[0]
        vector_y = target[1] - badge[1]
        vector_len = max((vector_x**2 + vector_y**2) ** 0.5, 1)
        start = (
            int(badge[0] + vector_x / vector_len * radius),
            int(badge[1] + vector_y / vector_len * radius),
        )
        _arrow(draw, start, target)
        draw.ellipse(
            (badge[0] - radius, badge[1] - radius, badge[0] + radius, badge[1] + radius),
            fill=TEAL,
            outline=WHITE,
            width=6,
        )
        _text_center(draw, badge, mark.label, BADGE_FONT)

    return result.convert("RGB")


def render_panel(spec: PanelSpec, cell_width: int, max_image_height: int) -> Image.Image:
    image = Image.open(RAW / spec.source).convert("RGB")
    if spec.crop:
        image = image.crop(spec.crop)
    image = annotate(image, spec.marks, spec.dashed_lines)

    max_image_width = cell_width - 34
    scale = min(max_image_width / image.width, max_image_height / image.height)
    new_size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    image = image.resize(new_size, Image.Resampling.LANCZOS)

    title_height = 66
    panel = Image.new("RGB", (cell_width, title_height + image.height + 18), CARD)
    draw = ImageDraw.Draw(panel)
    draw.rounded_rectangle((1, 1, panel.width - 2, panel.height - 2), radius=18, outline=BORDER, width=3)
    draw.text((20, 13), spec.title, font=PANEL_FONT, fill=TEXT)
    panel.paste(image, ((cell_width - image.width) // 2, title_height))
    return panel


def board(
    filename: str,
    title: str,
    specs: Sequence[PanelSpec],
    *,
    columns: int,
    cell_width: int = 540,
    max_image_height: int = 900,
) -> None:
    panels = [render_panel(spec, cell_width, max_image_height) for spec in specs]
    rows = (len(panels) + columns - 1) // columns
    gap = 28
    margin = 42
    header = 100
    row_heights: list[int] = []
    for row in range(rows):
        row_panels = panels[row * columns : (row + 1) * columns]
        row_heights.append(max(panel.height for panel in row_panels))

    canvas_width = margin * 2 + columns * cell_width + (columns - 1) * gap
    canvas_height = header + margin + sum(row_heights) + (rows - 1) * gap + margin
    canvas = Image.new("RGB", (canvas_width, canvas_height), BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((margin, 25), title, font=TITLE_FONT, fill=TEXT)

    y = header + margin
    for row in range(rows):
        row_panels = panels[row * columns : (row + 1) * columns]
        for column, panel in enumerate(row_panels):
            x = margin + column * (cell_width + gap)
            canvas.paste(panel, (x, y))
        y += row_heights[row] + gap

    OUT.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT / filename, optimize=True, compress_level=9)


def _wrap_text(draw: ImageDraw.ImageDraw, value: str, used_font: ImageFont.FreeTypeFont, max_width: int) -> str:
    lines: list[str] = []
    for paragraph in value.split("\n"):
        current = ""
        for character in paragraph:
            candidate = current + character
            if current and draw.textbbox((0, 0), candidate, font=used_font)[2] > max_width:
                lines.append(current)
                current = character
            else:
                current = candidate
        lines.append(current)
    return "\n".join(lines)


def guide(
    filename: str,
    title: str,
    source: str,
    callouts: Sequence[GuideCallout],
    *,
    crop: tuple[int, int, int, int] | None = None,
    max_output_width: int = 1900,
) -> None:
    """Create one readable close-up with Chinese labels inside the image."""

    image = Image.open(RAW / source).convert("RGB")
    if crop:
        image = image.crop(crop)

    margin = 34
    header = 104
    label_width = 520
    label_gap = 36
    label_padding = 22
    measure_draw = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    prepared_callouts = []
    for callout in callouts:
        wrapped = _wrap_text(measure_draw, callout.text, GUIDE_FONT, label_width - 2 * label_padding)
        text_box = measure_draw.multiline_textbbox((0, 0), wrapped, font=GUIDE_FONT, spacing=10)
        label_height = max(96, text_box[3] - text_box[1] + 2 * label_padding)
        prepared_callouts.append((callout, wrapped, text_box, label_height))

    min_content_height = max(
        (callout.label_y + label_height for callout, _, _, label_height in prepared_callouts),
        default=0,
    )
    content_height = max(image.height, min_content_height)
    canvas_width = margin * 2 + image.width + label_gap + label_width
    canvas_height = header + margin + content_height + margin
    canvas = Image.new("RGB", (canvas_width, canvas_height), BG)
    canvas.paste(image, (margin, header + margin))

    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    draw = ImageDraw.Draw(canvas)
    draw.text((margin, 24), title, font=TITLE_FONT, fill=TEXT)

    screenshot_x = margin
    screenshot_y = header + margin
    label_x = screenshot_x + image.width + label_gap

    for callout in callouts:
        if callout.box:
            x1, y1, x2, y2 = callout.box
            overlay_draw.rounded_rectangle(
                (screenshot_x + x1, screenshot_y + y1, screenshot_x + x2, screenshot_y + y2),
                radius=22,
                fill=TEAL_SOFT,
                outline=TEAL,
                width=8,
            )

    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(canvas)

    for callout, wrapped, text_box, label_height in prepared_callouts:
        label_top = screenshot_y + callout.label_y
        label_bottom = label_top + label_height
        draw.rounded_rectangle(
            (label_x, label_top, label_x + label_width, label_bottom),
            radius=22,
            fill=TEAL,
        )
        draw.multiline_text(
            (label_x + label_padding, label_top + label_padding - text_box[1]),
            wrapped,
            font=GUIDE_FONT,
            fill=WHITE,
            spacing=10,
        )
        target = (screenshot_x + callout.target[0], screenshot_y + callout.target[1])
        _arrow(draw, (label_x, (label_top + label_bottom) // 2), target)

    if canvas.width > max_output_width:
        scale = max_output_width / canvas.width
        canvas = canvas.resize((max_output_width, round(canvas.height * scale)), Image.Resampling.LANCZOS)

    DETAIL_OUT.mkdir(parents=True, exist_ok=True)
    canvas.save(DETAIL_OUT / filename, optimize=True, compress_level=9)


def m(label: str, target: tuple[int, int], badge: tuple[int, int] | None = None, box=None) -> Mark:
    return Mark(label=label, target=target, badge=badge, box=box)


def g(text: str, target: tuple[int, int], label_y: int, box=None) -> GuideCallout:
    return GuideCallout(text=text, target=target, label_y=label_y, box=box)


def build_all() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    board(
        "01-default-settings.png",
        "首次安装的默认状态",
        [
            PanelSpec(
                "android-player-sync-on.png",
                "播放页",
                [m("1", (105, 1980), (105, 1840)), m("2", (970, 1980), (955, 1840))],
            ),
            PanelSpec(
                "android-settings-normal.png",
                "“我的”页",
                [m("3", (135, 855), (125, 710)), m("4", (540, 505), (880, 505))],
            ),
        ],
        columns=2,
    )

    board(
        "02-main-pages.png",
        "三个主要页面与完整曲目分类",
        [
            PanelSpec("android-player-sync-on.png", "播放", [m("1", (180, 2240), (180, 2100))]),
            PanelSpec(
                "android-track-list-upper.png",
                "列表（上半部）",
                [m("2", (540, 2240), (540, 2100)), m("4", (540, 365), (930, 365))],
            ),
            PanelSpec("android-track-list-lower.png", "列表（下半部）", [m("5", (220, 1130), (650, 1060))]),
            PanelSpec("android-settings-normal.png", "我的", [m("3", (900, 2240), (900, 2100))]),
        ],
        columns=2,
    )

    board(
        "03-personal-playback.png",
        "普通个人播放：按顺序操作",
        [
            PanelSpec("android-player-sync-on.png", "步骤 1 · 打开播放页", [m("1", (180, 2240), (180, 2100))]),
            PanelSpec("android-sync-off.png", "步骤 2 · 关闭同步", [m("2", (970, 1980), (955, 1840))]),
            PanelSpec("android-track-a04-selected.png", "步骤 3 · 选择曲目", [m("3", (540, 835), (920, 835))]),
            PanelSpec("android-repeat-108-selected.png", "步骤 4 · 设置重复遍数", [m("4", (285, 855), (285, 690))]),
            PanelSpec(
                "android-mode-play-one-sync-off.png",
                "步骤 5 · 选择播放模式",
                [m("5", (105, 1980), (105, 1840), (410, 120, 675, 235))],
            ),
        ],
        columns=3,
        cell_width=500,
        max_image_height=840,
    )

    board(
        "04-synchronized-playback.png",
        "多台设备同步播放：每台设备都这样设置",
        [
            PanelSpec(
                "android-date-time-settings.png",
                "步骤 1 · 自动时间与时区",
                [m("1a", (970, 685), (780, 685)), m("1b", (970, 1380), (780, 1380))],
            ),
            PanelSpec("android-sync-on.png", "步骤 2 · 开启同步", [m("2", (970, 1980), (955, 1840))]),
            PanelSpec("android-track-list-upper.png", "步骤 3 · 选择同一曲目", [m("3", (540, 365), (920, 365))]),
            PanelSpec("android-mode-repeat-one.png", "步骤 4a · 暂停设备可播放", [m("4a", (540, 1980), (540, 1815))]),
            PanelSpec("android-sync-on.png", "步骤 4b · 已在播放：不要再点", [m("4b", (540, 1980), (540, 1815))]),
        ],
        columns=3,
        cell_width=500,
        max_image_height=840,
    )

    board(
        "05-player-controls.png",
        "播放页的五个按钮",
        [
            PanelSpec(
                "android-player-sync-on.png",
                "从左到右",
                [
                    m("1", (105, 1980), (105, 1825)),
                    m("2", (320, 1980), (320, 1825)),
                    m("3", (540, 1980), (540, 1785)),
                    m("4", (755, 1980), (755, 1825)),
                    m("5", (970, 1980), (970, 1825)),
                ],
            )
        ],
        columns=1,
        cell_width=650,
        max_image_height=1300,
    )

    mode_specs = [
        ("android-mode-repeat-one.png", "1 · 单曲循环"),
        ("android-mode-play-one.png", "2 · 单曲播放"),
        ("android-mode-repeat-list.png", "3 · 列表循环"),
        ("android-mode-play-list.png", "4 · 列表播放"),
    ]
    board(
        "06-play-modes.png",
        "连续点击最左按钮时的四种播放模式",
        [
            PanelSpec(source, title, [m(str(index), (105, 1980), (105, 1840), (260, 120, 820, 235))])
            for index, (source, title) in enumerate(mode_specs, start=1)
        ],
        columns=2,
    )

    board(
        "07-seek-states.png",
        "进度条是否可以拖动",
        [
            PanelSpec("android-count-midtrack.png", "1 · 普通模式且同步关闭", [m("1", (430, 1710), (430, 1550))]),
            PanelSpec("android-sync-on.png", "2 · 同步播放：锁定", [m("2", (540, 1710), (540, 1545))]),
            PanelSpec("android-care-player.png", "3 · 关怀模式：锁定", [m("3", (540, 1545), (540, 1385))]),
        ],
        columns=3,
        cell_width=500,
    )

    board(
        "08-repeat-setting.png",
        "设置重复遍数与输入校验",
        [
            PanelSpec(
                "android-repeat-quick-values.png",
                "步骤 1 · 快捷值或自定义",
                [m("1", (540, 855), (540, 690), (70, 790, 1010, 925))],
            ),
            PanelSpec(
                "android-repeat-custom-input.png",
                "步骤 2 · 输入整数并确定",
                [m("2a", (400, 985), (260, 1120)), m("2b", (920, 985), (920, 1120))],
            ),
            PanelSpec("android-repeat-saved.png", "步骤 3 · 自动显示千分位", [m("3", (300, 765), (300, 625))]),
            PanelSpec("android-repeat-invalid-zero.png", "校验 · 0 会被拒绝", [m("4", (430, 1210), (860, 1210), (95, 1010, 990, 1430))]),
        ],
        columns=2,
    )

    board(
        "09-valid-cycle.png",
        "有效完整周期的界面状态示意",
        [
            PanelSpec("android-count-after-reselect.png", "1 · 从开头附近开始", [m("1", (150, 1715), (150, 1560))]),
            PanelSpec("android-count-midtrack.png", "2 · 手动跳到中段", [m("2", (430, 1710), (430, 1550))]),
            PanelSpec("android-sync-on.png", "3 · 同步从中段加入", [m("3a", (140, 1715), (140, 1550)), m("3b", (540, 1660), (700, 1520))]),
        ],
        columns=3,
        cell_width=500,
    )

    board(
        "10-repeat-display.png",
        "当前遍数与每首重复遍数的显示规则",
        [
            PanelSpec(
                "android-player-large-repeat.png",
                "1 · N > 1：两项都显示",
                [m("1a", (540, 1660), (700, 1530)), m("1b", (540, 1785), (700, 1840))],
            ),
            PanelSpec("android-display-n1-repeat-one.png", "2 · N = 1 且单曲循环", [m("2", (540, 1660), (700, 1530))]),
            PanelSpec(
                "android-display-n1-play-one.png",
                "3 · N = 1 且其他模式",
                [m("3", (540, 1715), (760, 1560), (280, 1580, 800, 1835))],
            ),
            PanelSpec(
                "android-care-player.png",
                "4 · 关怀模式",
                [m("4", (540, 1600), (760, 1450), (260, 1470, 820, 1660))],
            ),
        ],
        columns=2,
    )

    board(
        "11-count-persistence.png",
        "关闭重开保留计数，重新选曲创建新任务",
        [
            PanelSpec("android-count-before-reopen.png", "步骤 1 · 关闭前为 4", [m("1", (540, 1640), (700, 1510))]),
            PanelSpec("android-count-after-reopen.png", "步骤 2 · 重开后仍为 4", [m("2", (540, 1640), (700, 1510))]),
            PanelSpec("android-track-a04-selected.png", "步骤 3 · 再次选择 A04", [m("3", (540, 835), (920, 835))]),
            PanelSpec("android-count-after-reselect.png", "步骤 4 · 新任务从第 1 遍开始", [m("4", (540, 1640), (700, 1510))]),
        ],
        columns=2,
    )

    board(
        "12-sync-zero.png",
        "同步开关与从中段加入时的第 0 遍",
        [
            PanelSpec("android-sync-off.png", "1 · 灰色单人：同步关闭", [m("1", (970, 1980), (955, 1840))]),
            PanelSpec(
                "android-sync-on.png",
                "2 · 绿色双人：同步开启",
                [m("2a", (970, 1980), (955, 1840)), m("2b", (540, 1660), (700, 1520)), m("2c", (150, 1715), (150, 1550))],
            ),
        ],
        columns=2,
    )

    board(
        "13-care-mode.png",
        "开启、使用和退出关怀模式",
        [
            PanelSpec("android-settings-normal.png", "步骤 1 · 切换到关怀模式", [m("1", (540, 505), (870, 505))]),
            PanelSpec("android-care-settings-enabled.png", "步骤 2 · 设置页被简化", [m("2", (540, 560), (850, 560))]),
            PanelSpec("android-care-player.png", "步骤 3 · 只保留大播放按钮", [m("3", (540, 1880), (760, 1740))]),
            PanelSpec("android-care-settings-disabled.png", "步骤 4 · 切换回普通模式", [m("4", (540, 560), (850, 560))]),
        ],
        columns=2,
    )

    board(
        "14a-layout-portrait.png",
        "竖屏：手机与 iPad 使用相同的信息顺序",
        [
            PanelSpec(
                "iphone-player-portrait.png",
                "iPhone 竖屏",
                [m("1", (603, 1746), (760, 1620)), m("2", (603, 1885), (760, 1960)), m("3", (603, 2118), (830, 2118))],
            ),
            PanelSpec(
                "ipad-player-portrait.png",
                "iPad 13 英寸竖屏",
                [
                    m("1", (1032, 2155), (1370, 2050)),
                    m("2", (1032, 2247), (1370, 2310)),
                    m("3", (1032, 2425), (1750, 2425), (430, 2340, 1630, 2515)),
                ],
            ),
        ],
        columns=2,
        cell_width=700,
        max_image_height=1050,
    )

    board(
        "14b-layout-phone-landscape.png",
        "宽横屏三栏布局",
        [
            PanelSpec(
                "iphone-player-landscape.png",
                "iPhone 横屏",
                [
                    m("1", (388, 505), (520, 505), (250, 70, 530, 965)),
                    m("2", (1311, 505), (1311, 285)),
                    m("3", (2162, 501), (2050, 290)),
                    m("4", (2366, 505), (2460, 300)),
                    m("5", (1311, 1078), (1500, 985)),
                ],
                dashed_lines=[(520, 505, 2240, 505)],
            )
        ],
        columns=1,
        cell_width=1900,
        max_image_height=900,
    )

    board(
        "14c-layout-ipad-landscape.png",
        "方屏 / iPad 横屏三栏布局",
        [
            PanelSpec(
                "ipad-player-landscape.png",
                "iPad Pro 13 英寸横屏",
                [
                    m("1", (468, 953), (650, 953), (300, 110, 650, 1780)),
                    m("2", (1376, 955), (1376, 650)),
                    m("3", (2234, 958), (2100, 650)),
                    m("4", (2406, 958), (2560, 650)),
                    m("5", (1376, 1947), (1580, 1810)),
                ],
                dashed_lines=[(650, 955, 2310, 955)],
            )
        ],
        columns=1,
        cell_width=1900,
        max_image_height=1300,
    )

    board(
        "15-android-system-controls.png",
        "Android 通知权限、播放通知与锁屏控制",
        [
            PanelSpec(
                "android-notification-permission.png",
                "1 · 首次允许通知",
                [m("1", (500, 620), (820, 620))],
                crop=(40, 700, 1040, 1580),
            ),
            PanelSpec(
                "android-notification-normal.png",
                "2 · 普通模式媒体卡",
                [m("2", (930, 315), (930, 100), (30, 0, 1050, 550))],
                crop=(0, 420, 1080, 1000),
            ),
            PanelSpec(
                "android-lockscreen-normal.png",
                "3 · 普通模式锁屏",
                [m("3", (930, 380), (950, 150), (35, 80, 1045, 590))],
                crop=(0, 450, 1080, 1080),
            ),
            PanelSpec(
                "android-lockscreen-care.png",
                "4 · 关怀模式仅播放/暂停",
                [m("4", (930, 380), (950, 150), (35, 80, 1045, 590))],
                crop=(0, 450, 1080, 1080),
            ),
        ],
        columns=2,
        cell_width=730,
        max_image_height=620,
    )

    board(
        "16-diagnostics-export.png",
        "导出诊断文件：四个步骤",
        [
            PanelSpec("android-settings-normal.png", "步骤 1 · 进入“我的”", [m("1", (900, 2240), (900, 2100))]),
            PanelSpec("android-diagnostics-expanded.png", "步骤 2 · 展开诊断信息", [m("2", (965, 1160), (830, 1040))]),
            PanelSpec("android-diagnostics-export.png", "步骤 3 · 点导出诊断文件", [m("3", (825, 1880), (700, 1730))]),
            PanelSpec("android-diagnostics-share.png", "步骤 4 · 选择保存或分享", [m("4a", (540, 1605), (750, 1470)), m("4b", (540, 2110), (750, 1980))]),
        ],
        columns=2,
    )

    # Close-up illustrations.  Unlike the overview boards above, every image
    # contains its own Chinese explanation so it remains understandable when
    # viewed by itself or in a Markdown renderer that scales images down.
    guide(
        "sync-off.png",
        "关闭同步播放",
        "android-sync-off.png",
        [g("同步播放：关闭\n灰色单人图标", (970, 530), 360, (900, 450, 1045, 610))],
        crop=(0, 1450, 1080, 2100),
    )
    guide(
        "sync-on.png",
        "开启同步播放",
        "android-sync-on.png",
        [g("同步播放：开启\n绿色双人图标", (970, 530), 360, (900, 450, 1045, 610))],
        crop=(0, 1450, 1080, 2100),
    )
    guide(
        "player-controls.png",
        "播放页五个按钮",
        "android-player-sync-on.png",
        [g("从左到右\n播放模式、上一首\n播放 / 暂停、下一首\n同步播放", (540, 230), 115, (35, 120, 1045, 340))],
        crop=(0, 1750, 1080, 2100),
    )
    guide(
        "bottom-navigation.png",
        "普通模式的三个主要页面",
        "android-player-sync-on.png",
        [g("三个页面入口\n播放 / 列表 / 我的", (540, 190), 95, (30, 105, 1050, 275))],
        crop=(0, 2050, 1080, 2400),
    )
    guide(
        "mode-repeat-one.png",
        "单曲循环",
        "android-mode-repeat-one.png",
        [g("完成设定的 N 遍后\n继续播放当前曲目", (105, 230), 145, (45, 160, 165, 310))],
        crop=(0, 1750, 1080, 2100),
    )
    guide(
        "mode-play-one.png",
        "单曲播放",
        "android-mode-play-one.png",
        [g("完成设定的 N 遍后\n停止播放", (105, 230), 145, (45, 160, 165, 310))],
        crop=(0, 1750, 1080, 2100),
    )
    guide(
        "mode-repeat-list.png",
        "列表循环",
        "android-mode-repeat-list.png",
        [g("每首完成 N 遍后进入下一首\n末曲结束后回到第一首", (105, 230), 125, (45, 160, 165, 310))],
        crop=(0, 1750, 1080, 2100),
    )
    guide(
        "mode-play-list.png",
        "列表播放",
        "android-mode-play-list.png",
        [g("每首完成 N 遍后进入下一首\n末曲结束后停止", (105, 230), 125, (45, 160, 165, 310))],
        crop=(0, 1750, 1080, 2100),
    )
    guide(
        "track-selection.png",
        "在列表中选择曲目",
        "android-track-a04-selected.png",
        [g("青绿色高亮：当前已选择 A04\n行末图标：正在播放", (540, 685), 540, (15, 610, 1065, 760))],
        crop=(0, 150, 1080, 1100),
    )
    guide(
        "auto-date-time.png",
        "同步播放前检查系统时间",
        "android-date-time-settings.png",
        [
            g("开启“自动设置日期与时间”", (970, 265), 140, (900, 195, 1040, 330)),
            g("开启“自动设置时区”", (970, 960), 870, (900, 890, 1040, 1025)),
        ],
        crop=(0, 420, 1080, 1700),
    )
    guide(
        "paused-device.png",
        "判断设备是否仍暂停",
        "android-mode-repeat-one.png",
        [g("显示播放三角\n当前设备仍处于暂停状态", (540, 230), 170, (440, 120, 640, 340))],
        crop=(0, 1750, 1080, 2100),
    )
    guide(
        "playing-device.png",
        "判断设备是否已经播放",
        "android-sync-on.png",
        [g("显示暂停符号\n设备已经播放，不要再次点击", (540, 230), 170, (440, 120, 640, 340))],
        crop=(0, 1750, 1080, 2100),
    )
    guide(
        "seek-allowed.png",
        "普通模式可以拖动进度",
        "android-count-midtrack.png",
        [g("同步关闭时\n拖动圆点可调整播放位置", (430, 260), 190, (40, 190, 1040, 330))],
        crop=(0, 1450, 1080, 1900),
    )
    guide(
        "seek-locked.png",
        "同步模式锁定进度",
        "android-sync-on.png",
        [
            g("同步开启：进度条不可拖动", (540, 260), 150, (40, 190, 1040, 330)),
            g("绿色双人图标", (970, 530), 360, (900, 450, 1045, 610)),
        ],
        crop=(0, 1450, 1080, 2100),
    )
    guide(
        "repeat-quick-values.png",
        "选择每首重复遍数",
        "android-repeat-quick-values.png",
        [g("四个快捷值\n也可以选择“自定义”", (540, 305), 210, (70, 240, 1010, 375))],
        crop=(0, 550, 1080, 1050),
    )
    guide(
        "repeat-custom-input.png",
        "输入自定义重复遍数",
        "android-repeat-custom-input.png",
        [
            g("输入大于 0 的整数", (400, 335), 120, (70, 270, 830, 405)),
            g("检查数字后点击“确定”", (920, 335), 330, (850, 270, 1020, 405)),
        ],
        crop=(0, 650, 1080, 1150),
    )
    guide(
        "repeat-saved.png",
        "确认重复遍数已保存",
        "android-repeat-saved.png",
        [g("保存后显示千分位\n这里是 5,000,000 遍", (300, 215), 150, (140, 135, 610, 280))],
        crop=(0, 550, 1080, 1000),
    )
    guide(
        "repeat-invalid.png",
        "无效重复遍数",
        "android-repeat-invalid-zero.png",
        [g("0 不会被保存\n请输入大于 0 的整数", (520, 310), 220, (80, 110, 1000, 530))],
        crop=(0, 900, 1080, 1500),
    )
    guide(
        "cycle-start.png",
        "有效周期从开头附近开始",
        "android-count-after-reselect.png",
        [g("从 0～1.5 秒内开始\n并自然播放到结尾，才可计数", (150, 265), 170, (40, 190, 1040, 330))],
        crop=(0, 1450, 1080, 1900),
    )
    guide(
        "cycle-mid-seek.png",
        "从中段开始的尾声不计数",
        "android-count-midtrack.png",
        [g("如果手动跳到中段\n当前尾声播放完也不计数", (430, 260), 170, (40, 190, 1040, 330))],
        crop=(0, 1450, 1080, 1900),
    )
    guide(
        "sync-zero-count.png",
        "同步从中段加入时显示第 0 遍",
        "android-sync-on.png",
        [
            g("当前遍数为 0\n表示尚未完成有效完整周期", (540, 210), 80, (450, 135, 630, 260)),
            g("按本地时间对齐到曲目中段", (150, 265), 240, (40, 190, 1040, 330)),
            g("同步播放已开启", (970, 530), 450, (900, 450, 1045, 610)),
        ],
        crop=(0, 1450, 1080, 2100),
    )
    guide(
        "count-current-and-total.png",
        "两个遍数数字分别表示什么",
        "android-player-large-repeat.png",
        [
            g("较大数字：当前遍数", (540, 210), 90, (430, 140, 650, 270)),
            g("较小数字：每首重复遍数", (540, 335), 280, (360, 285, 720, 390)),
        ],
        crop=(0, 1450, 1080, 1900),
    )
    guide(
        "count-current-only.png",
        "重复遍数为 1 且单曲循环",
        "android-display-n1-repeat-one.png",
        [g("只显示当前遍数\n每首重复遍数隐藏", (540, 210), 130, (400, 135, 680, 285))],
        crop=(0, 1450, 1080, 1900),
    )
    guide(
        "count-hidden.png",
        "重复遍数为 1 且不是单曲循环",
        "android-display-n1-play-one.png",
        [g("当前遍数和每首重复遍数\n都不显示", (540, 260), 180, (250, 120, 830, 390))],
        crop=(0, 1450, 1080, 1900),
    )
    guide(
        "count-before-close.png",
        "关闭 App 之前",
        "android-count-before-reopen.png",
        [g("当前正在第 4 遍", (540, 190), 130, (430, 125, 650, 255))],
        crop=(0, 1450, 1080, 1900),
    )
    guide(
        "count-after-reopen.png",
        "重新打开 App 之后",
        "android-count-after-reopen.png",
        [g("仍然显示第 4 遍\n已完成遍数得到保留", (540, 190), 130, (430, 125, 650, 255))],
        crop=(0, 1450, 1080, 1900),
    )
    guide(
        "count-new-task.png",
        "重新选择曲目后创建新任务",
        "android-count-after-reselect.png",
        [g("显示 1：正在新的第 1 遍\n已完成遍数已经清零", (540, 190), 130, (430, 125, 650, 255))],
        crop=(0, 1450, 1080, 1900),
    )
    guide(
        "care-enable.png",
        "开启关怀模式",
        "android-settings-normal.png",
        [g("点击这里切换到关怀模式", (540, 255), 160, (70, 110, 1010, 350))],
        crop=(0, 250, 1080, 750),
    )
    guide(
        "care-player.png",
        "关怀模式播放页",
        "android-care-player.png",
        [
            g("进度条锁定，避免误触", (540, 245), 130, (40, 180, 1040, 320)),
            g("只保留放大的播放 / 暂停按钮", (540, 580), 500, (350, 450, 730, 730)),
        ],
        crop=(0, 1300, 1080, 2100),
    )
    guide(
        "care-disable.png",
        "退出关怀模式",
        "android-care-settings-enabled.png",
        [g("点击这里恢复普通模式", (540, 310), 220, (70, 165, 1010, 420))],
        crop=(0, 250, 1080, 800),
    )
    guide(
        "iphone-portrait-controls.png",
        "iPhone 竖屏的遍数与控制区",
        "iphone-player-portrait.png",
        [
            g("当前遍数：进度条上方", (533, 96), 20, (420, 35, 650, 145)),
            g("每首重复遍数：进度条下方", (533, 235), 180, (330, 180, 735, 285)),
            g("五个播放按钮横向排列", (533, 468), 410, (20, 390, 1046, 560)),
        ],
        crop=(70, 1650, 1136, 2250),
    )
    guide(
        "ipad-portrait-controls.png",
        "iPad 竖屏的遍数与控制区",
        "ipad-player-portrait.png",
        [
            g("当前遍数：进度条上方", (862, 114), 20, (730, 55, 995, 160)),
            g("每首重复遍数：进度条下方", (862, 206), 170, (650, 165, 1075, 250)),
            g("五个播放按钮横向排列", (862, 379), 330, (250, 290, 1475, 470)),
        ],
        crop=(170, 2050, 1894, 2550),
        max_output_width=2200,
    )
    guide(
        "iphone-landscape-layout.png",
        "iPhone 宽横屏布局",
        "iphone-player-landscape.png",
        [
            g("五个播放按钮竖向排列", (388, 505), 40, (250, 70, 530, 965)),
            g("曲名与唱片位于中间", (1311, 505), 225),
            g("当前遍数位于右侧", (2162, 503), 410),
            g("最右侧是竖向进度条", (2366, 503), 595),
            g("底部仍是播放 / 列表 / 我的", (1311, 1078), 790),
            g("黑色竖条是灵动岛\n不是 App 按钮", (130, 600), 980, (65, 430, 200, 760)),
        ],
        max_output_width=2400,
    )
    guide(
        "ipad-landscape-layout.png",
        "iPad 方屏 / 横屏布局",
        "ipad-player-landscape.png",
        [
            g("五个播放按钮竖向排列", (468, 953), 120, (300, 110, 650, 1780)),
            g("曲名与唱片位于中间", (1376, 955), 430),
            g("当前遍数与重复遍数位于右侧", (2234, 958), 740),
            g("最右侧是竖向进度条", (2406, 958), 1050),
            g("底部仍是播放 / 列表 / 我的", (1376, 1946), 1500),
        ],
        max_output_width=2400,
    )
    guide(
        "notification-permission.png",
        "Android 13 及以上通知权限",
        "android-notification-permission.png",
        [g("选择“Allow / 允许”\n才能显示播放通知", (500, 620), 500, (80, 470, 920, 700))],
        crop=(40, 700, 1040, 1580),
    )
    guide(
        "notification-player.png",
        "Android 播放通知",
        "android-notification-normal.png",
        [g("媒体卡可显示播放、暂停、\n上一首、下一首和停止", (930, 315), 240, (30, 0, 1050, 550))],
        crop=(0, 420, 1080, 1000),
    )
    guide(
        "notification-sync.png",
        "Android 同步模式播放通知",
        "android-notification-sync.png",
        [g("仍可播放、暂停和切歌\n但不提供远程进度调整", (500, 360), 250, (30, 0, 1050, 550))],
        crop=(0, 420, 1080, 1000),
    )
    guide(
        "lockscreen-normal.png",
        "普通模式锁屏控制",
        "android-lockscreen-normal.png",
        [g("普通模式提供完整媒体控制\n实际按钮由系统决定", (930, 380), 250, (35, 80, 1045, 590))],
        crop=(0, 450, 1080, 1080),
    )
    guide(
        "lockscreen-care.png",
        "关怀模式锁屏控制",
        "android-lockscreen-care.png",
        [g("关怀模式只保留播放 / 暂停", (930, 380), 250, (35, 80, 1045, 590))],
        crop=(0, 450, 1080, 1080),
    )
    guide(
        "diagnostics-entry.png",
        "诊断信息入口",
        "android-settings-normal.png",
        [g("点击“诊断信息”展开", (540, 260), 170, (60, 150, 1020, 370))],
        crop=(0, 900, 1080, 1350),
    )
    guide(
        "diagnostics-expanded.png",
        "查看诊断信息",
        "android-diagnostics-expanded.png",
        [g("这里显示设备信息和最近日志", (540, 750), 600, (70, 340, 1010, 1240))],
        crop=(0, 900, 1080, 2200),
    )
    guide(
        "diagnostics-export.png",
        "导出诊断文件",
        "android-diagnostics-export.png",
        [g("点击“导出诊断文件”", (825, 380), 310, (620, 285, 1030, 470))],
        crop=(0, 1500, 1080, 2100),
    )
    guide(
        "diagnostics-share.png",
        "保存或分享诊断文件",
        "android-diagnostics-share.png",
        [
            g("系统生成的诊断文件", (540, 235), 140, (80, 160, 1000, 330)),
            g("选择保存位置或发送方式", (540, 740), 690, (30, 620, 1050, 900)),
        ],
        crop=(0, 1370, 1080, 2340),
    )


if __name__ == "__main__":
    build_all()
