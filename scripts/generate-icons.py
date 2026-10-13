"""Generate committed, antialiased basketball icons using only Python's standard library."""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent / 'public' / 'icons'
BACKGROUND = (20, 22, 25)
ORANGE = (255, 166, 91)


def sample(x, y):
    radius = .291
    x -= .5
    y -= .5
    if math.hypot(x, y) > radius:
        return BACKGROUND
    stroke = .008
    curve = .16 * radius * (1 - (x / radius) ** 2)
    seam = min(abs(x), abs(y), abs(y - x - curve) / 1.414, abs(y + x + curve) / 1.414)
    return BACKGROUND if seam < stroke else ORANGE


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def generate(size, filename):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            colors = [sample((x + (sx + .5) / 3) / size, (y + (sy + .5) / 3) / size)
                      for sy in range(3) for sx in range(3)]
            rows.extend(round(sum(color[channel] for color in colors) / 9) for channel in range(3))
    header = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    (ROOT / filename).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    ROOT.mkdir(parents=True, exist_ok=True)
    for size, filename in ((192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')):
        generate(size, filename)
        print(f'Generated {filename}: {size}x{size}')
