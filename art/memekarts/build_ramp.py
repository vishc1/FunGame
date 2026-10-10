"""Rebuild the three watertight 10 x 8.4 x 3.2 m ramp wedges only."""
import sys
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_height import build_ramp

for theme in ('stadium','neon','canyon'):
    build_ramp(theme)
