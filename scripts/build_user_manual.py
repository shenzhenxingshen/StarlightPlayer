#!/usr/bin/env python3
"""Build the offline HTML and printable PDF versions of the user manual.

The Markdown file remains the single source of truth.  Pandoc embeds the CSS
and all screenshots into one HTML file, then headless Chrome prints that exact
HTML to an A4 PDF.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = REPO_ROOT / "docs"
SOURCE = DOCS_DIR / "USER_MANUAL.md"
HTML_OUTPUT = DOCS_DIR / "USER_MANUAL.html"
PDF_OUTPUT = REPO_ROOT / "output" / "pdf" / "StarlightPlayer-User-Manual-1.0.pdf"
TEMP_DIR = REPO_ROOT / "tmp" / "pdfs"
PUBLIC_PRIVACY_URL = (
    "https://github.com/shenzhenxingshen/StarlightPlayer/blob/main/PRIVACY.md"
)

PRINT_CSS = r"""
:root {
  color-scheme: light;
  --ink: #172321;
  --muted: #5c6b68;
  --brand: #087f78;
  --brand-dark: #075f5b;
  --brand-soft: #e8f5f3;
  --line: #cbd8d5;
  --paper: #ffffff;
  --canvas: #eef4f3;
}

* {
  box-sizing: border-box;
}

html {
  background: var(--canvas);
  scroll-behavior: smooth;
}

body {
  max-width: 980px;
  margin: 28px auto;
  padding: 58px 72px 72px;
  color: var(--ink);
  background: var(--paper);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgb(25 58 53 / 12%);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  font-size: 17px;
  line-height: 1.72;
  overflow-wrap: anywhere;
}

h1,
h2,
h3,
h4 {
  color: #102f2c;
  line-height: 1.35;
  break-after: avoid-page;
  page-break-after: avoid;
}

h1 {
  margin: 0 0 22px;
  padding-bottom: 18px;
  border-bottom: 4px solid var(--brand);
  font-size: 2.35em;
  letter-spacing: 0.03em;
}

h2 {
  margin: 2.35em 0 0.9em;
  padding: 0.28em 0 0.28em 0.65em;
  border-left: 6px solid var(--brand);
  background: linear-gradient(90deg, var(--brand-soft), transparent 82%);
  font-size: 1.55em;
}

h3 {
  margin: 1.8em 0 0.7em;
  color: var(--brand-dark);
  font-size: 1.2em;
}

section.level3 > h3 + p {
  break-after: avoid-page;
  page-break-after: avoid;
}

p,
li {
  orphans: 3;
  widows: 3;
}

a {
  color: var(--brand-dark);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.16em;
}

blockquote {
  margin: 1.4em 0;
  padding: 0.85em 1.15em;
  border-left: 5px solid var(--brand);
  background: var(--brand-soft);
  color: #29423f;
}

blockquote > :first-child {
  margin-top: 0;
}

blockquote > :last-child {
  margin-bottom: 0;
}

code {
  padding: 0.12em 0.35em;
  border-radius: 4px;
  background: #eef2f1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}

pre {
  padding: 1em;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f6f8f8;
  break-inside: avoid-page;
  page-break-inside: avoid;
}

pre code {
  padding: 0;
  background: transparent;
}

table {
  width: 100%;
  margin: 1.25em 0 1.6em;
  border-collapse: collapse;
  break-inside: avoid-page;
  page-break-inside: avoid;
  font-size: 0.94em;
}

thead {
  display: table-header-group;
}

th,
td {
  padding: 0.62em 0.75em;
  border: 1px solid var(--line);
  vertical-align: top;
}

th {
  background: var(--brand-soft);
  color: #173b37;
  font-weight: 700;
}

tbody tr:nth-child(even) {
  background: #f8fbfa;
}

figure {
  margin: 1.25em auto 1.8em;
  padding: 0.55em;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fbfdfd;
  text-align: center;
  break-inside: avoid-page;
  page-break-inside: avoid;
}

figure img,
p > img {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: 680px;
  margin: 0 auto;
  border-radius: 6px;
}

figcaption {
  margin-top: 0.55em;
  color: var(--muted);
  font-size: 0.84em;
  line-height: 1.45;
}

hr {
  margin: 2.2em 0;
  border: 0;
  border-top: 1px solid var(--line);
}

@media (max-width: 720px) {
  body {
    margin: 0;
    padding: 28px 20px 48px;
    border-radius: 0;
    box-shadow: none;
    font-size: 16px;
  }

  h1 {
    font-size: 1.85em;
  }

  table {
    display: block;
    overflow-x: auto;
  }
}

@page {
  size: A4 portrait;
  margin: 18mm 16mm 19mm;

  @top-left {
    content: "星光播放器用户手册";
    color: #5c6b68;
    font-family: "Arial Unicode MS", "PingFang SC", "Hiragino Sans GB", sans-serif;
    font-size: 8.5pt;
  }

  @top-right {
    content: "1.0";
    color: #5c6b68;
    font-family: "Arial Unicode MS", "PingFang SC", "Hiragino Sans GB", sans-serif;
    font-size: 8.5pt;
  }

  @bottom-center {
    content: "第 " counter(page) " 页";
    color: #5c6b68;
    font-family: "Arial Unicode MS", "PingFang SC", "Hiragino Sans GB", sans-serif;
    font-size: 8.5pt;
  }
}

@page :first {
  @top-left {
    content: "";
  }

  @top-right {
    content: "";
  }
}

@media print {
  html,
  body {
    background: #ffffff !important;
  }

  body {
    max-width: none;
    margin: 0;
    padding: 0;
    border-radius: 0;
    box-shadow: none;
    color: #111b1a;
    font-family: "Arial Unicode MS", "PingFang SC", "Hiragino Sans GB",
      "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    font-size: 10.2pt;
    line-height: 1.58;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  h1 {
    margin-top: 25mm;
    font-size: 25pt;
  }

  h2 {
    margin-top: 0;
    break-before: page;
    page-break-before: always;
    font-size: 17pt;
  }

  h3 {
    font-size: 13pt;
  }

  a {
    color: #075f5b;
    text-decoration: none;
  }

  figure {
    margin: 3.5mm auto 5mm;
    padding: 2.5mm;
  }

  figure img,
  p > img {
    max-width: 100%;
    max-height: 162mm;
  }

  figcaption {
    font-size: 8.2pt;
  }

  table {
    font-size: 8.7pt;
  }

  th,
  td {
    padding: 1.8mm 2.2mm;
  }
}
"""


def command_path(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"找不到 {name}，请先安装后重试。")
    return path


def browser_path() -> str:
    configured = os.environ.get("CHROME_BIN")
    candidates = [
        configured,
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(candidate)
    raise RuntimeError(
        "找不到 Google Chrome 或 Chromium。可通过 CHROME_BIN 指定浏览器可执行文件。"
    )


def run(command: list[str], *, quiet: bool = False) -> None:
    completed = subprocess.run(
        command,
        cwd=REPO_ROOT,
        check=False,
        capture_output=quiet,
        text=quiet,
    )
    if completed.returncode == 0:
        return
    details = (completed.stderr or completed.stdout or "").strip() if quiet else ""
    suffix = f"\n{details}" if details else ""
    raise RuntimeError(f"命令执行失败（退出码 {completed.returncode}）：{command[0]}{suffix}")


def build_html(css_path: Path) -> None:
    pandoc = command_path("pandoc")
    run(
        [
            pandoc,
            str(SOURCE),
            "--from=gfm+implicit_figures",
            "--to=html5",
            "--standalone",
            "--section-divs",
            "--embed-resources",
            f"--resource-path={DOCS_DIR}",
            "--variable=lang:zh-CN",
            "--metadata=pagetitle:星光播放器用户手册",
            f"--css={css_path}",
            f"--output={HTML_OUTPUT}",
        ]
    )

    html = HTML_OUTPUT.read_text(encoding="utf-8")
    # A relative Markdown link would become a private local file:// path inside
    # the printed PDF.  Keep the generated artifacts portable instead.
    html = html.replace('href="../PRIVACY.md"', f'href="{PUBLIC_PRIVACY_URL}"')
    marker = (
        "  <!-- 由 scripts/build_user_manual.py 从 USER_MANUAL.md 自动生成；"
        "请勿直接编辑。 -->\n"
    )
    html = html.replace("<head>\n", "<head>\n" + marker, 1)
    HTML_OUTPUT.write_text(html, encoding="utf-8")


def validate_html() -> None:
    html = HTML_OUTPUT.read_text(encoding="utf-8")
    image_sources = re.findall(r'<img\b[^>]*\bsrc="([^"]+)"', html, flags=re.I)
    if not image_sources:
        raise RuntimeError("生成的 HTML 中没有图片。")

    expected_images = len(re.findall(r"!\[[^]]*]\([^)]+\)", SOURCE.read_text(encoding="utf-8")))
    if len(image_sources) != expected_images:
        raise RuntimeError(
            f"图片数量不一致：Markdown {expected_images} 张，HTML {len(image_sources)} 张。"
        )

    if html.count("<figcaption") != expected_images:
        raise RuntimeError("不是每张图片都生成了可见图注。")

    external_images = [src for src in image_sources if not src.startswith("data:image/")]
    if external_images:
        raise RuntimeError(f"HTML 仍引用外部图片：{external_images[:3]}")

    linked_styles = re.findall(
        r'<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"', html, flags=re.I
    )
    external_styles = [href for href in linked_styles if not href.startswith("data:text/css")]
    if external_styles:
        raise RuntimeError(f"HTML 仍引用外部样式：{external_styles[:3]}")

    remote_resources = re.findall(
        r'<(?:img|script|link)\b[^>]*(?:src|href)="https?://[^"]+"', html, flags=re.I
    )
    if remote_resources:
        raise RuntimeError("HTML 仍包含网络资源依赖。")


def build_pdf() -> None:
    chrome = browser_path()
    PDF_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if PDF_OUTPUT.exists():
        PDF_OUTPUT.unlink()

    run(
        [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-background-networking",
            "--allow-file-access-from-files",
            "--no-pdf-header-footer",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=3000",
            f"--print-to-pdf={PDF_OUTPUT}",
            HTML_OUTPUT.resolve().as_uri(),
        ],
        quiet=True,
    )

    if not PDF_OUTPUT.is_file() or PDF_OUTPUT.stat().st_size < 10_000:
        raise RuntimeError("PDF 未生成或文件大小异常。")


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--html-only",
        action="store_true",
        help="只生成自包含 HTML，不调用浏览器生成 PDF。",
    )
    args = parser.parse_args()

    if not SOURCE.is_file():
        raise RuntimeError(f"找不到源文件：{SOURCE}")

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    css_path = TEMP_DIR / "user-manual.css"
    css_path.write_text(PRINT_CSS.strip() + "\n", encoding="utf-8")

    build_html(css_path)
    validate_html()
    print(
        f"HTML: {HTML_OUTPUT.relative_to(REPO_ROOT)} "
        f"({HTML_OUTPUT.stat().st_size:,} bytes, SHA-256 {digest(HTML_OUTPUT)})"
    )

    if not args.html_only:
        build_pdf()
        print(
            f"PDF:  {PDF_OUTPUT.relative_to(REPO_ROOT)} "
            f"({PDF_OUTPUT.stat().st_size:,} bytes, SHA-256 {digest(PDF_OUTPUT)})"
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"生成失败：{error}", file=sys.stderr)
        raise SystemExit(1)
