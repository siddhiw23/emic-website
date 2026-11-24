#!/usr/bin/env python3
"""Shrink roster headshots so the members page loads quickly.

Every `photo: 'assets/...'` in members-data.js that is not already a thumbnail
is resized to SHORT_SIDE px on its short side (enough for the ~140-250px tiles
on high-DPI screens), saved as WebP under assets/members/, and the data file is
updated to point at the new copy. Originals are left untouched.

Run from the repo root after adding a new local photo:
    python3 scripts/make-member-thumbs.py
Requires Pillow (pip install Pillow).
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

SHORT_SIDE = 512
QUALITY = 80
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "members-data.js"
OUT_DIR = ROOT / "assets" / "members"

PHOTO_RE = re.compile(r"photo: '(assets/(?!members/)[^']+)'")


def make_thumb(src: Path, dst: Path) -> None:
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)  # honour phone camera rotation
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        w, h = im.size
        scale = SHORT_SIDE / min(w, h)
        if scale < 1:
            im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        im.save(dst, "WEBP", quality=QUALITY, method=6)


def main() -> int:
    text = DATA.read_text(encoding="utf-8")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    mapping, total_before, total_after = {}, 0, 0

    for rel in sorted(set(PHOTO_RE.findall(text))):
        src = ROOT / rel
        if not src.exists():
            print(f"skip (missing): {rel}", file=sys.stderr)
            continue
        dst_rel = f"assets/members/{Path(rel).stem}.webp"
        if dst_rel in mapping.values():
            print(f"error: two photos would both become {dst_rel}", file=sys.stderr)
            return 1
        make_thumb(src, ROOT / dst_rel)
        mapping[rel] = dst_rel
        before, after = src.stat().st_size, (ROOT / dst_rel).stat().st_size
        total_before += before
        total_after += after
        print(f"{rel}: {before / 1e6:.1f} MB -> {after / 1e3:.0f} KB")

    for rel, dst_rel in mapping.items():
        text = text.replace(f"photo: '{rel}'", f"photo: '{dst_rel}'")
    DATA.write_text(text, encoding="utf-8")

    if mapping:
        print(f"\n{len(mapping)} photos: {total_before / 1e6:.1f} MB -> {total_after / 1e6:.2f} MB")
    else:
        print("No new local photos to shrink.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
