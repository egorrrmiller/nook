#!/usr/bin/env python3
"""Generates the built-in cover gallery (src/Nook.Api/wwwroot/covers/*.svg + covers.json). Deterministic; re-run to regenerate."""
import json, math, os, random

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "Nook.Api", "wwwroot", "covers")
W, H = 1200, 400
items = []


def svg(body, defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" preserveAspectRatio="xMidYMid slice">'
            f'{"<defs>" + defs + "</defs>" if defs else ""}{body}</svg>')


def add(id_, name, group, content):
    with open(os.path.join(OUT, f"{id_}.svg"), "w") as f:
        f.write(content)
    items.append({"id": id_, "name": name, "group": group, "file": f"{id_}.svg"})


# --- Gradients ----------------------------------------------------------------------------------------------------
gradients = [
    ("sunset", "Sunset", ["#ff7e5f", "#feb47b"], 20),
    ("ocean", "Ocean", ["#2193b0", "#6dd5ed"], 0),
    ("aurora", "Aurora", ["#00c9ff", "#92fe9d"], 35),
    ("lavender", "Lavender", ["#8e9eab", "#eef2f3"], 90),
    ("peach", "Peach", ["#ffecd2", "#fcb69f"], 45),
    ("midnight", "Midnight", ["#0f2027", "#203a43", "#2c5364"], 10),
    ("berry", "Berry", ["#5f2c82", "#49a09d"], 60),
    ("ember", "Ember", ["#c31432", "#240b36"], 30),
    ("mint", "Mint", ["#d4fc79", "#96e6a1"], 0),
    ("dusk", "Dusk", ["#141e30", "#243b55"], 80),
]
for id_, name, stops, angle in gradients:
    a = math.radians(angle)
    x2, y2 = 50 + 50 * math.cos(a), 50 + 50 * math.sin(a)
    x1, y1 = 100 - x2, 100 - y2
    stop_svg = "".join(f'<stop offset="{i / (len(stops) - 1) * 100:.0f}%" stop-color="{c}"/>' for i, c in enumerate(stops))
    defs = f'<linearGradient id="g" x1="{x1:.0f}%" y1="{y1:.0f}%" x2="{x2:.0f}%" y2="{y2:.0f}%">{stop_svg}</linearGradient>'
    add(f"gradient-{id_}", name, "Gradients", svg(f'<rect width="{W}" height="{H}" fill="url(#g)"/>', defs))

# --- Solid ----------------------------------------------------------------------------------------------------------
solids = [("red", "Red", "#d64545"), ("orange", "Orange", "#e0823a"), ("yellow", "Yellow", "#e6c049"), ("green", "Green", "#4f9d69"),
          ("blue", "Blue", "#3d7bd9"), ("purple", "Purple", "#7c5cc4"), ("gray", "Gray", "#6b7280"), ("black", "Black", "#1f2328")]
for id_, name, color in solids:
    add(f"solid-{id_}", name, "Solid", svg(f'<rect width="{W}" height="{H}" fill="{color}"/>'))

# --- Nature (abstract scenes) ---------------------------------------------------------------------------------------
rng = random.Random(42)


def hills(colors, sky):
    body = f'<rect width="{W}" height="{H}" fill="{sky}"/>'
    for i, c in enumerate(colors):
        base = 180 + i * 55
        pts = [(0, H)]
        for x in range(0, W + 1, 100):
            pts.append((x, base + 40 * math.sin(x / 180 + i * 1.3) + 20 * math.sin(x / 61 + i)))
        pts.append((W, H))
        body += f'<polygon points="{" ".join(f"{x:.0f},{y:.0f}" for x, y in pts)}" fill="{c}"/>'
    return body


add("nature-hills", "Green hills", "Nature", svg(hills(["#7fb069", "#5c8d4a", "#3f6b33", "#2c4d24"], "#dff3ff")))
add("nature-dunes", "Dunes", "Nature", svg(hills(["#f2d29b", "#e2b979", "#c9985a", "#a97a40"], "#fbe9d0")))

stars = "".join(f'<circle cx="{rng.randint(0, W)}" cy="{rng.randint(0, 260)}" r="{rng.choice([1, 1, 1.5, 2])}" fill="#fff" opacity="{rng.uniform(0.4, 1):.2f}"/>' for _ in range(140))
mountains = ""
for i, c in enumerate(["#2f3e5c", "#22304a", "#161f33"]):
    pts = [(0, H)]
    for x in range(0, W + 1, 80):
        pts.append((x, 220 + i * 45 + 70 * abs(math.sin(x / 140 + i)) - 30 * math.cos(x / 53)))
    pts.append((W, H))
    mountains += f'<polygon points="{" ".join(f"{x:.0f},{y:.0f}" for x, y in pts)}" fill="{c}"/>'
add("nature-night", "Night sky", "Nature", svg(f'<rect width="{W}" height="{H}" fill="url(#g)"/>{stars}<circle cx="980" cy="90" r="34" fill="#f5f1d6"/>{mountains}',
                                               '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1026"/><stop offset="1" stop-color="#2a3a6e"/></linearGradient>'))

waves = ""
for i, (c, o) in enumerate([("#8fd3f4", 0.9), ("#5fb8e6", 0.9), ("#2f8fd0", 0.95), ("#1f6fae", 1)]):
    d = f"M0,{230 + i * 40}"
    for x in range(0, W + 1, 150):
        d += f" q75,-{25 - i * 4} 150,0"
    d += f" L{W},{H} L0,{H} Z"
    waves += f'<path d="{d}" fill="{c}" opacity="{o}"/>'
add("nature-waves", "Waves", "Nature", svg(f'<rect width="{W}" height="{H}" fill="#e8f6ff"/><circle cx="220" cy="120" r="60" fill="#ffd166"/>{waves}'))

sunrays = "".join(f'<polygon points="600,300 {600 + 900 * math.cos(math.radians(a)):.0f},{300 - 900 * math.sin(math.radians(a)):.0f} {600 + 900 * math.cos(math.radians(a + 6)):.0f},{300 - 900 * math.sin(math.radians(a + 6)):.0f}" fill="#fff" opacity="0.18"/>' for a in range(0, 180, 12))
add("nature-sunrise", "Sunrise", "Nature", svg(f'<rect width="{W}" height="{H}" fill="url(#g)"/>{sunrays}<circle cx="600" cy="300" r="90" fill="#ffe08a"/><rect y="300" width="{W}" height="100" fill="#3b2f5a"/>',
                                                 '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a8b"/><stop offset="1" stop-color="#ffd27f"/></linearGradient>'))

trees = ""
for x in range(30, W, 70):
    h = rng.randint(120, 220)
    trees += f'<polygon points="{x},{H} {x + 25},{H - h} {x + 50},{H}" fill="#1e4d2b" opacity="{rng.uniform(0.6, 1):.2f}"/>'
add("nature-forest", "Forest", "Nature", svg(f'<rect width="{W}" height="{H}" fill="#cfe8cf"/><rect y="0" width="{W}" height="{H}" fill="url(#g)"/>{trees}',
                                              '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf6ea" stop-opacity="0"/><stop offset="1" stop-color="#9fcf9f"/></linearGradient>'))

# --- Patterns -------------------------------------------------------------------------------------------------------
def pattern(id_, name, bg, tile, size):
    add(f"pattern-{id_}", name, "Patterns", svg(f'<rect width="{W}" height="{H}" fill="{bg}"/><rect width="{W}" height="{H}" fill="url(#p)"/>',
                                                 f'<pattern id="p" width="{size}" height="{size}" patternUnits="userSpaceOnUse">{tile}</pattern>'))


pattern("dots", "Dots", "#f4f4f5", '<circle cx="12" cy="12" r="2.5" fill="#a1a1aa"/>', 24)
pattern("grid", "Grid", "#fafafa", '<path d="M40 0H0V40" fill="none" stroke="#d4d4d8" stroke-width="1"/>', 40)
pattern("diagonal", "Diagonal", "#fff7ed", '<path d="M-4,4 l8,-8 M0,16 l16,-16 M12,20 l8,-8" stroke="#fdba74" stroke-width="2"/>', 16)
pattern("checker", "Checker", "#e0f2fe", '<rect width="20" height="20" fill="#bae6fd"/><rect x="20" y="20" width="20" height="20" fill="#bae6fd"/>', 40)
pattern("hex", "Hexagons", "#ecfdf5", '<polygon points="26,2 50,15 50,41 26,54 2,41 2,15" fill="none" stroke="#6ee7b7" stroke-width="2"/>', 52)
pattern("triangles", "Triangles", "#fdf2f8", '<polygon points="0,30 15,0 30,30" fill="#fbcfe8"/>', 30)
pattern("cross", "Crosses", "#f5f3ff", '<path d="M14 8v12M8 14h12" stroke="#c4b5fd" stroke-width="2" stroke-linecap="round"/>', 28)
pattern("waves", "Ripples", "#fefce8", '<path d="M0 10 q10 -10 20 0 t20 0" fill="none" stroke="#fde047" stroke-width="2"/>', 40)

with open(os.path.join(OUT, "covers.json"), "w") as f:
    json.dump(items, f, indent=2)
print(f"wrote {len(items)} covers to {os.path.abspath(OUT)}")
