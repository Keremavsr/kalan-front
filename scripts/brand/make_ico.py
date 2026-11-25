"""Packs desktop/build/icons/*.png into desktop/build/icon.ico and copies the 512 px PNG to desktop/build/icon.png."""
from pathlib import Path
import shutil
from PIL import Image

build = Path(__file__).resolve().parents[2] / "desktop" / "build"
sizes = [16, 24, 32, 48, 64, 128, 256]
images = [Image.open(build / "icons" / f"{s}x{s}.png").convert("RGBA") for s in sizes]
images[-1].save(build / "icon.ico", format="ICO", sizes=[(s, s) for s in sizes], append_images=images[:-1])
shutil.copyfile(build / "icons" / "512x512.png", build / "icon.png")
print("ok")
