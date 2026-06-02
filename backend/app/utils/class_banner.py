"""
Generate preset gradient banners for classes and upload to Supabase Storage.
"""
from __future__ import annotations

import logging
from typing import TypedDict

logger = logging.getLogger(__name__)

BANNER_WIDTH = 800
BANNER_HEIGHT = 240
STORAGE_BUCKET = 'class'


class BannerPreset(TypedDict):
    id: str
    background: str
    particles: tuple[str, str, str]


# Keep in sync with frontend/src/lib/classBannerGradients.ts
CLASS_BANNER_PRESETS: list[BannerPreset] = [
    {
        'id': 'teal-violet',
        'background': '#0E0E0E',
        'particles': ('#0C6168', '#0E0E0E', '#560C68'),
    },
    {
        'id': 'ocean-blue',
        'background': '#0B1220',
        'particles': ('#2771FF', '#0C6168', '#1A2A4A'),
    },
    {
        'id': 'forest-teal',
        'background': '#0A1410',
        'particles': ('#018156', '#0C6168', '#0E0E0E'),
    },
    {
        'id': 'sunset-plum',
        'background': '#140A10',
        'particles': ('#FF6B35', '#560C68', '#0E0E0E'),
    },
    {
        'id': 'royal-night',
        'background': '#0E0E14',
        'particles': ('#2771FF', '#560C68', '#0C6168'),
    },
]


def pick_class_banner_preset(class_id: str) -> BannerPreset:
    """Deterministic preset selection from a class id."""
    hash_value = 0
    for char in class_id:
        hash_value = (hash_value * 31 + ord(char)) & 0xFFFFFFFF
    index = hash_value % len(CLASS_BANNER_PRESETS)
    return CLASS_BANNER_PRESETS[index]


def generate_banner_svg(preset: BannerPreset) -> str:
    """Render a static multi-stop radial gradient SVG for a class banner."""
    c1, _, c3 = preset['particles']
    background = preset['background']
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{BANNER_WIDTH}" height="{BANNER_HEIGHT}" viewBox="0 0 {BANNER_WIDTH} {BANNER_HEIGHT}">
  <defs>
    <radialGradient id="g1" cx="15%" cy="35%" r="55%">
      <stop offset="0%" stop-color="{c1}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="{c1}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="85%" cy="65%" r="50%">
      <stop offset="0%" stop-color="{c3}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="{c3}" stop-opacity="0"/>
    </radialGradient>
    <filter id="noise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.08"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="{background}"/>
  <rect width="100%" height="100%" fill="url(#g1)"/>
  <rect width="100%" height="100%" fill="url(#g2)"/>
  <rect width="100%" height="100%" filter="url(#noise)" opacity="0.35"/>
</svg>"""


def upload_class_banner(client, class_id: str) -> str | None:
    """
    Generate a preset banner SVG, upload to the ``class`` storage bucket,
    and return the public URL. Returns None if upload fails (class creation still succeeds).
    """
    preset = pick_class_banner_preset(class_id)
    svg = generate_banner_svg(preset)
    path = f'{class_id}/banner.svg'

    try:
        storage = client.storage.from_(STORAGE_BUCKET)
        storage.upload(
            file=svg.encode('utf-8'),
            path=path,
            file_options={'content-type': 'image/svg+xml', 'upsert': 'true'},
        )
        public_url = storage.get_public_url(path)
        if isinstance(public_url, dict):
            return public_url.get('publicUrl') or public_url.get('publicURL')
        return public_url
    except Exception:
        logger.exception(
            'Failed to upload class banner | class_id=%s preset=%s',
            class_id,
            preset['id'],
        )
        return None
