"""Generate a 128x128 Marketplace icon for Call Site Navigator.

Design: a rounded-square with a blue→purple gradient, a bold white "return"
hook arrow (jump back), and an accent dot marking the exact call site.
Rendered at 4x and downscaled with LANCZOS for crisp anti-aliased edges.
"""
import math
from PIL import Image, ImageDraw

S = 512          # supersample canvas
R = 96           # corner radius
OUT = 128

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

# --- gradient background (vertical: top blue -> bottom purple) ---
top = (74, 108, 247)     # #4A6CF7
bot = (124, 77, 226)     # #7C4DE2
grad = Image.new("RGBA", (S, S), (0, 0, 0, 255))
gd = grad.load()
for y in range(S):
    t = y / (S - 1)
    r = int(top[0] + (bot[0] - top[0]) * t)
    g = int(top[1] + (bot[1] - top[1]) * t)
    b = int(top[2] + (bot[2] - top[2]) * t)
    for x in range(S):
        gd[x, y] = (r, g, b, 255)

# rounded-rect mask
mask = Image.new("L", (S, S), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, S - 1, S - 1], radius=R, fill=255)
img.paste(grad, (0, 0), mask)

d = ImageDraw.Draw(img)

cx, cy = S // 2, int(S * 0.46)
radius = int(S * 0.24)
lw = int(S * 0.075)            # stroke width

# --- return hook arc (open on the lower-left, like a U-turn) ---
# arc sweeps from -30deg around the top to ~210deg
bbox = [cx - radius, cy - radius, cx + radius, cy + radius]
d.arc(bbox, start=-35, end=210, fill=(255, 255, 255, 255), width=lw)

# round the arc cap at the top-right start
sx = cx + radius * math.cos(math.radians(-35))
sy = cy + radius * math.sin(math.radians(-35))
d.ellipse([sx - lw/2, sy - lw/2, sx + lw/2, sy + lw/2], fill=(255, 255, 255, 255))

# --- arrowhead at the arc's end (pointing down/left, back to the call site) ---
end_ang = math.radians(210)
ex = cx + radius * math.cos(end_ang)
ey = cy + radius * math.sin(end_ang)
# tangent direction at end (continuing the sweep, ccw)
tang = end_ang + math.radians(90)
ah = int(S * 0.11)             # arrowhead size
# direction the arrow points (along tangent)
dx, dy = math.cos(tang), math.sin(tang)
# perpendicular
px, py = -dy, dx
tip = (ex + dx * ah, ey + dy * ah)
b1 = (ex + px * ah * 0.75, ey + py * ah * 0.75)
b2 = (ex - px * ah * 0.75, ey - py * ah * 0.75)
d.polygon([tip, b1, b2], fill=(255, 255, 255, 255))

# --- accent target dot (the exact call site) ---
dot_r = int(S * 0.055)
dot_y = int(S * 0.78)
d.ellipse([cx - dot_r, dot_y - dot_r, cx + dot_r, dot_y + dot_r],
          fill=(45, 226, 168, 255))   # teal accent
# small ring around the dot
ring = int(S * 0.09)
d.ellipse([cx - ring, dot_y - ring, cx + ring, dot_y + ring],
          outline=(255, 255, 255, 230), width=int(S * 0.016))

out = img.resize((OUT, OUT), Image.LANCZOS)
out.save("/home/agira/Extensions/call-site-navigator/images/icon.png")
print("wrote images/icon.png")
