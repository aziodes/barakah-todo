from PIL import Image, ImageDraw, ImageFont

TEAL = (14, 71, 68)
GOLD = (201, 162, 39)
SAND = (244, 237, 220)

def make_icon(size, path, rounded=True):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * 0.18) if rounded else 0
    draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=TEAL)

    # Gold crescent-ish arc as a simple mark (no copyrighted glyphs, just a moon shape)
    moon_r = int(size * 0.30)
    cx, cy = size // 2, size // 2
    draw.ellipse([cx - moon_r, cy - moon_r, cx + moon_r, cy + moon_r], fill=GOLD)
    bite_r = int(moon_r * 0.85)
    offset = int(moon_r * 0.45)
    draw.ellipse([cx - bite_r + offset, cy - bite_r, cx + bite_r + offset, cy + bite_r], fill=TEAL)

    img.save(path)

make_icon(192, "/home/claude/barakah-board-pwa/public/icons/icon-192.png")
make_icon(512, "/home/claude/barakah-board-pwa/public/icons/icon-512.png")
make_icon(180, "/home/claude/barakah-board-pwa/public/icons/apple-touch-icon.png", rounded=False)
print("icons written")
