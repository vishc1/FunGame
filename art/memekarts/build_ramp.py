"""Rebuild only the current 10 x 8.4 x 3.2 m Stadium ramp."""
import sys
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_height import build_ramp

build_ramp('stadium')
