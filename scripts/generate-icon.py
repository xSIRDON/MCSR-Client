"""Regenerate the app icon (resources/icon.png + build/icon.ico) from the clock
logo asset (src/renderer/assets/clock.png) — the single source for logo + icon."""

from PIL import Image

im = Image.open("src/renderer/assets/clock.png").convert("RGBA")
if im.size != (256, 256):
    im = im.resize((256, 256), Image.NEAREST)

im.save("resources/icon.png")
im.save("build/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("wrote resources/icon.png and build/icon.ico")
