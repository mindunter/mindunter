#!/usr/bin/env python3
"""Build the animated SVG cards in ../assets for the profile README.

Each SVG embeds its own fonts (Poppins for headings, Inter for body text),
subset to the characters that SVG uses. GitHub shows README SVGs as images,
and images can't load web fonts, so embedding is the only way the fonts show.
Everything else is CSS keyframes: no scripts and no external resources.

Requires: pip install fonttools brotli
Run:      python3 scripts/build_assets.py
"""
import base64
import html
import io
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path(__file__).resolve().parent / "fonts"
ASSETS = ROOT / "assets"

FACES = [  # (family, weight, file)
    ("Poppins", 600, "poppins-latin-600-normal.woff2"),
    ("Poppins", 700, "poppins-latin-700-normal.woff2"),
    ("Inter", 400, "inter-latin-400-normal.woff2"),
    ("Inter", 500, "inter-latin-500-normal.woff2"),
    ("Inter", 600, "inter-latin-600-normal.woff2"),
]

E = html.escape


def font_css(chars):
    out = []
    for family, weight, fn in FACES:
        font = TTFont(FONTS / fn)
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["kern", "liga", "calt"]
        sub = subset.Subsetter(opts)
        sub.populate(text=chars)
        sub.subset(font)
        buf = io.BytesIO()
        font.flavor = "woff2"
        font.save(buf)
        b64 = base64.b64encode(buf.getvalue()).decode()
        out.append(
            f"@font-face {{ font-family: '{family}'; font-weight: {weight}; "
            f"src: url(data:font/woff2;base64,{b64}) format('woff2'); }}"
        )
    return "\n    ".join(out)


BASE_CSS = """
    :root { --bg:#ffffff; --bg2:#f8fafc; --border:#e2e8f0; --fg:#0f172a; --muted:#475569; --faint:#cbd5e1;
            --chip:#f1f5f9; --a:#2563eb; --p:#9333ea; --g:#16a34a; --pink:#db2777; }
    @media (prefers-color-scheme: dark) {
      :root { --bg:#0d1117; --bg2:#111827; --border:#30363d; --fg:#e6edf3; --muted:#9aa4b2; --faint:#2b3340;
              --chip:#161b22; --a:#60a5fa; --p:#c084fc; --g:#4ade80; --pink:#f472b6; }
    }
    .h { font-family: 'Poppins', 'Segoe UI', Helvetica, Arial, sans-serif; }
    .b { font-family: 'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }
    .sa { stop-color: var(--a); } .sp { stop-color: var(--p); } .sg { stop-color: var(--g); } .sk { stop-color: var(--pink); }
    .fade { opacity: 0; animation: fade .7s cubic-bezier(.2,.8,.2,1) forwards; }
    .grow { transform-box: fill-box; transform-origin: left; transform: scaleX(0); animation: grow 1s cubic-bezier(.2,.8,.2,1) .1s forwards; }
    .pop { opacity: 0; transform-box: fill-box; transform-origin: center; animation: pop .55s cubic-bezier(.3,1.5,.5,1) forwards; }
    .pulse { transform-box: fill-box; transform-origin: center; animation: pulse 2.4s ease-in-out infinite; }
    .ring { transform-box: fill-box; transform-origin: center; fill: none; animation: ring 2.4s ease-out infinite; }
    .dots { fill: var(--faint); }
    @keyframes fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes grow { to { transform: scaleX(1); } }
    @keyframes pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
    @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.35); } }
    @keyframes ring { from { transform: scale(1); opacity: .8; } to { transform: scale(3); opacity: 0; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes spinr { to { transform: rotate(-360deg); } }
    @keyframes drift { from { transform: translate(0,0) scale(1); } to { transform: translate(-50px,24px) scale(1.15); } }
    @keyframes rise { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: .9; } 100% { transform: translateY(-140px); opacity: 0; } }
    @keyframes sweep { 0% { transform: translateX(-200px); } 55%,100% { transform: translateX(1100px); } }
    @keyframes nudge { 0%,100% { transform: translateX(0); } 50% { transform: translateX(4px); } }
    @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
"""

DOT_PATTERN = (
    '<pattern id="dp" width="16" height="16" patternUnits="userSpaceOnUse">'
    '<circle class="dots" cx="2" cy="2" r="1.1"/></pattern>'
)


def svg(name, w, h, title, body, css="", defs=""):
    raw = f"{title}{body}"
    texts = re.findall(r"<text[^>]*>(.*?)</text>", raw, re.S)
    chars = html.unescape(re.sub(r"<[^>]+>", "", "".join(texts))) + " .,·→↗—0123456789"
    doc = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="t">
  <title id="t">{E(title)}</title>
  <style>
    {font_css(chars)}
{BASE_CSS}{css}
  </style>
  <defs>
    {DOT_PATTERN}
    <linearGradient id="brand" x1="0" x2="1"><stop offset="0" class="sa"/><stop offset=".5" class="sp"/><stop offset="1" class="sg"/></linearGradient>
    {defs}
  </defs>
{body}
</svg>
"""
    (ASSETS / name).write_text(doc)
    print(f"{name:26s} {len(doc) / 1024:6.1f} KB")


def card_frame(w, h, rx=16):
    return f"""  <defs><clipPath id="clip"><rect x=".5" y=".5" width="{w - 1}" height="{h - 1}" rx="{rx}"/></clipPath></defs>
  <rect x=".5" y=".5" width="{w - 1}" height="{h - 1}" rx="{rx}" fill="var(--bg)" stroke="var(--border)"/>"""


# --------------------------------------------------------------------------- header
def header():
    W, H = 860, 290
    css = """
    .bgA { stop-color: #eef2ff; } .bgB { stop-color: #f0fdf4; }
    @media (prefers-color-scheme: dark) { .bgA { stop-color: #0b1220; } .bgB { stop-color: #0c1712; } }
    .blob { opacity: .35; animation: drift 12s ease-in-out infinite alternate; }
    .blob2 { animation-duration: 15s; animation-delay: -5s; }
    .title { font-size: 42px; font-weight: 700; fill: var(--fg); }
    .wave { transform-box: fill-box; transform-origin: 70% 80%; animation: wave 2.6s ease-in-out 1.2s infinite; }
    @keyframes wave { 0%,60%,100% { transform: rotate(0); } 10%,30% { transform: rotate(14deg); } 20%,40% { transform: rotate(-8deg); } }
    .lead { font-size: 21px; font-weight: 500; fill: var(--muted); }
    .role { font-size: 21px; font-weight: 600; opacity: 0; animation: role 12s ease-in-out infinite; }
    .r2 { animation-delay: 3s; } .r3 { animation-delay: 6s; } .r4 { animation-delay: 9s; }
    @keyframes role { 0% { opacity: 0; transform: translateY(12px); } 3%,22% { opacity: 1; transform: none; }
                      25%,100% { opacity: 0; transform: translateY(-12px); } }
    .caret { fill: var(--p); animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    .bio { font-size: 15px; fill: var(--muted); }
    .status rect { fill: var(--bg); stroke: var(--g); stroke-opacity: .45; }
    .status text { font-size: 12.5px; font-weight: 600; fill: var(--fg); }
    .chip rect { fill: var(--bg); fill-opacity: .7; stroke: var(--border); }
    .chip text { font-size: 13px; font-weight: 500; fill: var(--fg); }
    .orbit { fill: none; stroke: var(--faint); stroke-width: 1.2; }
    .o1 { transform-origin: 730px 140px; animation: spin 14s linear infinite; }
    .o2 { transform-origin: 730px 140px; animation: spinr 22s linear infinite; }
    .o3 { transform-origin: 730px 140px; animation: spin 34s linear infinite; }
    .core { animation: bob 4s ease-in-out infinite; }
    .mono { font-size: 34px; font-weight: 700; fill: #ffffff; }
    .spark { fill: var(--p); opacity: 0; animation: rise 7s linear infinite; }
"""
    defs = """<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="bgA"/><stop offset="1" class="bgB"/></linearGradient>
    <linearGradient id="tg" x1="0" x2="1"><stop offset="0" class="sa"/><stop offset="1" class="sp"/></linearGradient>
    <linearGradient id="tg2" x1="0" x2="1"><stop offset="0" class="sp"/><stop offset="1" class="sk"/></linearGradient>
    <linearGradient id="tg3" x1="0" x2="1"><stop offset="0" class="sg"/><stop offset="1" class="sa"/></linearGradient>
    <radialGradient id="ga"><stop offset="0" class="sa"/><stop offset="1" class="sa" stop-opacity="0"/></radialGradient>
    <radialGradient id="gp"><stop offset="0" class="sp"/><stop offset="1" class="sp" stop-opacity="0"/></radialGradient>
    <radialGradient id="fadeR" cx=".85" cy=".5" r=".6"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="dm"><rect width="860" height="290" fill="url(#fadeR)"/></mask>
    <clipPath id="clip"><rect width="860" height="290" rx="18"/></clipPath>"""

    sparks = "".join(
        f'<circle class="spark" cx="{x}" cy="{y}" r="{r}" style="animation-delay:{d}s"/>'
        for x, y, r, d in [(560, 300, 2, 0), (610, 310, 1.5, 1.8), (690, 300, 2.5, 3.1), (780, 305, 1.6, 4.4),
                           (820, 300, 2, 2.4), (470, 305, 1.4, 5.3), (650, 310, 1.8, 6.1)]
    )
    chips = []
    x = 48
    for i, label in enumerate(["🖥️ Desktop apps", "🎓 EdTech", "🎙️ Voice AI", "🤖 Local-first AI"]):
        w = int(len(label) * 7.6 + 30)
        chips.append(f'<g class="chip pop" style="animation-delay:{1.0 + i * .1:.2f}s"><rect x="{x}" y="236" width="{w}" height="30" rx="15"/>'
                     f'<text class="b" x="{x + w / 2}" y="256" text-anchor="middle">{label}</text></g>')
        x += w + 8

    body = f"""  <g clip-path="url(#clip)">
    <rect width="{W}" height="{H}" fill="url(#bg)"/>
    <rect width="{W}" height="{H}" fill="url(#dp)" mask="url(#dm)"/>
    <circle class="blob" cx="760" cy="40" r="170" fill="url(#ga)"/>
    <circle class="blob blob2" cx="600" cy="280" r="150" fill="url(#gp)"/>
    {sparks}
    <g>
      <circle class="orbit o1" cx="730" cy="140" r="58" stroke-dasharray="4 6"/>
      <circle class="orbit o2" cx="730" cy="140" r="88"/>
      <circle class="orbit o3" cx="730" cy="140" r="118" stroke-dasharray="2 8"/>
      <g class="o1"><circle cx="788" cy="140" r="5" fill="var(--a)"/></g>
      <g class="o2"><circle cx="642" cy="140" r="6" fill="var(--p)"/><circle cx="730" cy="228" r="4" fill="var(--pink)"/></g>
      <g class="o3"><circle cx="730" cy="22" r="5" fill="var(--g)"/><circle cx="848" cy="140" r="3.5" fill="var(--a)"/></g>
      <g class="core">
        <circle cx="730" cy="140" r="44" fill="url(#tg)" opacity=".18"/>
        <circle cx="730" cy="140" r="34" fill="url(#tg)"/>
        <text class="h mono" x="730" y="152" text-anchor="middle">M</text>
      </g>
    </g>
  </g>
  <g class="status fade" style="animation-delay:.05s">
    <rect x="48" y="30" width="196" height="30" rx="15"/>
    <circle class="ring" cx="66" cy="45" r="4" stroke="var(--g)" stroke-width="2"/>
    <circle class="pulse" cx="66" cy="45" r="4" fill="var(--g)"/>
    <text class="b" x="80" y="49.5">Open to collaboration</text>
  </g>
  <text class="h title fade" x="46" y="114" style="animation-delay:.15s">Hi, I'm Mindhunter <tspan class="wave">👋</tspan></text>
  <text class="b lead fade" x="48" y="156" style="animation-delay:.35s">I build</text>
  <text class="h role" x="117" y="156" fill="url(#tg)">desktop tools for designers</text>
  <text class="h role r2" x="117" y="156" fill="url(#tg2)">education platforms</text>
  <text class="h role r3" x="117" y="156" fill="url(#tg3)">local-first AI</text>
  <text class="h role r4" x="117" y="156" fill="url(#tg2)">audio and voice tools</text>
  <text class="b bio fade" x="48" y="194" style="animation-delay:.55s">Designer-developer shipping desktop apps for designers,</text>
  <text class="b bio fade" x="48" y="216" style="animation-delay:.65s">learning platforms, and AI that runs on your own machine.</text>
  {''.join(chips)}"""
    svg("header.svg", W, H, "Hi, I'm Mindhunter. I build desktop tools for designers, education platforms, local-first AI, and audio and voice tools.", body, css, defs)


# --------------------------------------------------------------------------- about
def about():
    W, H = 860, 270
    css = """
    .title { font-size: 20px; font-weight: 600; fill: var(--fg); }
    .item { font-size: 14.5px; fill: var(--muted); }
    .item tspan.k { fill: var(--fg); font-weight: 600; }
    .tile rect.t { fill: var(--bg2); stroke: var(--border); }
    .num { font-size: 26px; font-weight: 700; }
    .lbl { font-size: 13px; fill: var(--muted); }
    .shine { fill: var(--a); opacity: .06; animation: sweep 6s ease-in-out 2s infinite; }
"""
    items = [
        ("🚀", "Shipping", " Asset Manager Pro and Font Manager Pro for designers"),
        ("🔭", "Building", " Redline Design School, a free product design course"),
        ("🎙️", "Exploring", " offline voice AI with Whisper, Piper TTS and Ollama"),
        ("🎓", "Designing", " learning platforms, from Moodle sites to React LMSs"),
        ("💬", "Ask me about", " product design, React and local-first AI"),
        ("📸", "Behind the scenes", " on Instagram at @mindunter.ai"),
    ]
    rows = "".join(
        f'<g class="fade" style="animation-delay:{.3 + i * .1:.2f}s"><text class="b item" x="32" y="{92 + i * 28}">{e}  '
        f'<tspan class="k">{E(k)}</tspan>{E(t)}</text></g>'
        for i, (e, k, t) in enumerate(items)
    )
    stats = [("88", "lessons across two courses", "url(#brand)"),
             ("27", "interactive design labs", "url(#g2)"),
             ("2", "Windows apps for designers", "url(#g3)")]
    tiles = "".join(
        f'<g class="tile pop" style="animation-delay:{.6 + i * .15:.2f}s"><rect class="t" x="592" y="{64 + i * 62}" width="244" height="52" rx="12"/>'
        f'<text class="h num" x="610" y="{99 + i * 62}" fill="{f}">{n}</text>'
        f'<text class="b lbl" x="{652 if len(n) == 2 else 636}" y="{94 + i * 62}">{E(l)}</text></g>'
        for i, (n, l, f) in enumerate(stats)
    )
    defs = """<linearGradient id="g2" x1="0" x2="1"><stop offset="0" class="sp"/><stop offset="1" class="sk"/></linearGradient>
    <linearGradient id="g3" x1="0" x2="1"><stop offset="0" class="sg"/><stop offset="1" class="sa"/></linearGradient>"""
    body = f"""{card_frame(W, H)}
  <g clip-path="url(#clip)">
    <rect class="grow" x="0" y="0" width="{W}" height="4" fill="url(#brand)"/>
    <rect x="560" y="0" width="300" height="{H}" fill="url(#dp)" opacity=".7"/>
    <g transform="skewX(-20)"><rect class="shine" x="0" y="0" width="120" height="{H}"/></g>
  </g>
  <text class="h title fade" x="32" y="50">👨‍💻 About me</text>
  {rows}
  {tiles}"""
    svg("about.svg", W, H, "About me: shipping Asset Manager Pro and Font Manager Pro, building Redline Design School, exploring offline voice AI. 88 lessons written, 27 interactive labs, 2 Windows apps for designers.", body, css, defs)


# --------------------------------------------------------------------------- project cards
PROJECTS = [
    dict(file="card-redline.svg", title="Redline Design School", icon="📐", c=("#dc2626", "#f87171"), c2=("#ea580c", "#fb923c"),
         cat="EdTech · Course", status="Live",
         lines=["Free self-paced product design course:", "9 modules, 27 lessons, each with its own", "interactive lab, quiz and cited sources."],
         tags=["HTML", "CSS", "JavaScript"], url="mindunter.github.io/redline-design-school", action="Open live site ↗"),
    dict(file="card-newmedia.svg", title="New Media", icon="📺", c=("#7c3aed", "#a78bfa"), c2=("#db2777", "#f472b6"),
         cat="Web · Marketing site", status="In progress",
         lines=["Site for a creator-distribution agency:", "live 3D hero, pinned horizontal scroll,", "smooth scrolling, light and dark themes."],
         tags=["React", "TypeScript", "Tailwind", "three.js"], url="github.com/mindunter/new-media", action="View repo →"),
    dict(file="card-lms.svg", title="Design Mastery LMS", icon="🎨", c=("#2563eb", "#60a5fa"), c2=("#0891b2", "#22d3ee"),
         cat="EdTech · LMS", status="Open source",
         lines=["Self-paced design learning platform:", "7 tracks and 61 illustrated lessons", "in a single-file, portable build."],
         tags=["React", "Vite", "JavaScript"], url="github.com/mindunter/design-mastery-lms", action="View repo →"),
    dict(file="card-voice.svg", title="Voice Attendance System", icon="🎙️", c=("#16a34a", "#4ade80"), c2=("#0d9488", "#2dd4bf"),
         cat="Voice AI · Offline", status="Open source",
         lines=["Offline voice assistant and attendance:", "wake word, Whisper speech-to-text,", "speaker recognition, Piper TTS, Ollama."],
         tags=["Python", "Whisper", "Ollama", "Piper"], url="github.com/mindunter/VoiceAttendanceSystem", action="View repo →"),
]


def project(p):
    W, H = 420, 262
    (la, da), (lb, db) = p["c"], p["c2"]
    css = f"""
    :root {{ --c:{la}; --c2:{lb}; }}
    @media (prefers-color-scheme: dark) {{ :root {{ --c:{da}; --c2:{db}; }} }}
    .s1 {{ stop-color: var(--c); }} .s2 {{ stop-color: var(--c2); }}
    .tile {{ fill: var(--c); fill-opacity: .12; stroke: var(--c); stroke-opacity: .35; }}
    .ico {{ font-size: 24px; }}
    .cat {{ font-size: 11px; font-weight: 600; letter-spacing: .09em; fill: var(--c); }}
    .title {{ font-size: 19px; font-weight: 600; fill: var(--fg); }}
    .st rect {{ fill: var(--chip); stroke: var(--border); }}
    .st text {{ font-size: 11.5px; font-weight: 600; fill: var(--fg); }}
    .desc {{ font-size: 14px; fill: var(--muted); }}
    .tag rect {{ fill: var(--chip); stroke: var(--c); stroke-opacity: .45; }}
    .tag text {{ font-size: 12px; font-weight: 600; fill: var(--c); }}
    .rule {{ stroke: var(--border); }}
    .url {{ font-size: 12px; fill: var(--muted); }}
    .act {{ font-size: 13px; font-weight: 600; fill: var(--c); animation: nudge 1.8s ease-in-out 1.5s infinite; }}
    .shine {{ fill: var(--c); opacity: .08; animation: sweep 5s ease-in-out 1.6s infinite; }}
    .glow {{ animation: drift 9s ease-in-out infinite alternate; }}
    .icog {{ animation: bob 3.2s ease-in-out infinite; }}
"""
    defs = """<linearGradient id="cg" x1="0" x2="1"><stop offset="0" class="s1"/><stop offset="1" class="s2"/></linearGradient>
    <radialGradient id="cr"><stop offset="0" class="s1" stop-opacity=".22"/><stop offset="1" class="s1" stop-opacity="0"/></radialGradient>
    <radialGradient id="cm" cx="1" cy="0" r="1"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="m"><rect width="420" height="262" fill="url(#cm)"/></mask>"""
    st_w = int(len(p["status"]) * 6.8 + 30)
    st_x = W - 24 - st_w
    tags, x = [], 24
    for i, t in enumerate(p["tags"]):
        w = int(len(t) * 7.6 + 22)
        tags.append(f'<g class="tag pop" style="animation-delay:{.8 + i * .1:.2f}s"><rect x="{x}" y="176" width="{w}" height="24" rx="12"/>'
                    f'<text class="b" x="{x + w / 2}" y="192" text-anchor="middle">{E(t)}</text></g>')
        x += w + 8
    desc = "".join(f'<text class="b desc fade" x="24" y="{116 + i * 21}" style="animation-delay:{.35 + i * .1:.2f}s">{E(l)}</text>'
                   for i, l in enumerate(p["lines"]))
    body = f"""{card_frame(W, H)}
  <g clip-path="url(#clip)">
    <rect width="{W}" height="{H}" fill="url(#dp)" mask="url(#m)"/>
    <circle class="glow" cx="400" cy="10" r="130" fill="url(#cr)"/>
    <rect class="grow" x="0" y="0" width="{W}" height="4" fill="url(#cg)"/>
    <g transform="skewX(-20)"><rect class="shine" x="0" y="0" width="70" height="{H}"/></g>
  </g>
  <g class="pop" style="animation-delay:.1s"><rect class="tile" x="24" y="26" width="48" height="48" rx="13"/>
    <g class="icog"><text class="ico" x="48" y="58.5" text-anchor="middle">{p["icon"]}</text></g></g>
  <text class="b cat fade" x="86" y="45" style="animation-delay:.15s">{E(p["cat"].upper())}</text>
  <text class="h title fade" x="86" y="69" style="animation-delay:.2s">{E(p["title"])}</text>
  <g class="st fade" style="animation-delay:.3s"><rect x="{st_x}" y="22" width="{st_w}" height="22" rx="11"/>
    <circle class="pulse" cx="{st_x + 12}" cy="33" r="3.5" fill="var(--c)"/>
    <text class="b" x="{st_x + 21}" y="37">{E(p["status"])}</text></g>
  {desc}
  {''.join(tags)}
  <line class="rule" x1="24" y1="218" x2="{W - 24}" y2="218"/>
  <text class="b url fade" x="24" y="243" style="animation-delay:1.1s">{E(p["url"])}</text>
  <text class="b act" x="{W - 24}" y="243" text-anchor="end">{E(p["action"])}</text>"""
    svg(p["file"], W, H, f'{p["title"]}: {" ".join(p["lines"])}', body, css, defs)


# --------------------------------------------------------------------------- flagship apps
FLAGSHIP_CSS = """
    :root { --c:%s; --c2:%s; }
    @media (prefers-color-scheme: dark) { :root { --c:%s; --c2:%s; } }
    .s1 { stop-color: var(--c); } .s2 { stop-color: var(--c2); }
    .tile { fill: url(#cg); }
    .ico { font-size: 28px; }
    .cat { font-size: 11.5px; font-weight: 600; letter-spacing: .1em; fill: var(--c); }
    .title { font-size: 27px; font-weight: 700; fill: var(--fg); }
    .pill rect { fill: var(--chip); stroke: var(--border); }
    .pill text { font-size: 12px; font-weight: 600; fill: var(--fg); }
    .tag { font-size: 15px; font-weight: 500; fill: var(--fg); }
    .feat { font-size: 13.5px; fill: var(--muted); }
    .chk { fill: var(--c); fill-opacity: .15; }
    .chkm { fill: none; stroke: var(--c); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .num { font-size: 20px; font-weight: 700; }
    .lbl { font-size: 12px; fill: var(--muted); }
    .sdiv { stroke: var(--border); }
    .win { fill: var(--bg2); stroke: var(--border); }
    .bar { fill: var(--chip); }
    .tl { font-size: 11px; font-weight: 600; fill: var(--muted); }
    .mut { fill: var(--muted); }
    .shine { fill: var(--c); opacity: .07; animation: sweep 6s ease-in-out 2s infinite; }
    .glow { animation: drift 10s ease-in-out infinite alternate; }
    .float { animation: bob 3s ease-in-out infinite; }
    .badge rect { fill: var(--bg); stroke: var(--c); stroke-opacity: .5; }
    .badge text { font-size: 11.5px; font-weight: 600; fill: var(--fg); }
"""

FLAGSHIP_DEFS = """<linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="s1"/><stop offset="1" class="s2"/></linearGradient>
    <radialGradient id="cr"><stop offset="0" class="s1" stop-opacity=".25"/><stop offset="1" class="s1" stop-opacity="0"/></radialGradient>"""


def flagship(file, title, icon, cat, colors, pills, tagline, feats, stats, mock, mock_css, alt):
    W, H = 860, 392
    (la, da), (lb, db) = colors
    css = FLAGSHIP_CSS % (la, lb, da, db) + mock_css
    px, prow = 32, []
    for i, t in enumerate(pills):
        w = int(len(t) * 7 + 24)
        prow.append(f'<g class="pill pop" style="animation-delay:{.3 + i * .08:.2f}s"><rect x="{px}" y="104" width="{w}" height="24" rx="12"/>'
                    f'<text class="b" x="{px + w / 2}" y="120" text-anchor="middle">{E(t)}</text></g>')
        px += w + 8
    frows = "".join(
        f'<g class="fade" style="animation-delay:{.55 + i * .09:.2f}s"><circle class="chk" cx="41" cy="{189 + i * 25}" r="9"/>'
        f'<path class="chkm" d="M37 {189 + i * 25}l3 3l5 -6"/>'
        f'<text class="b feat" x="58" y="{194 + i * 25}">{E(f)}</text></g>'
        for i, f in enumerate(feats)
    )
    srow = []
    for i, (n, l) in enumerate(stats):
        x = 32 + i * 166
        if i:
            srow.append(f'<line class="sdiv" x1="{x - 14}" y1="346" x2="{x - 14}" y2="374"/>')
        srow.append(f'<g class="pop" style="animation-delay:{1.2 + i * .12:.2f}s"><text class="h num" x="{x}" y="362" fill="url(#cg)">{E(n)}</text>'
                    f'<text class="b lbl" x="{x}" y="378">{E(l)}</text></g>')
    body = f"""{card_frame(W, H, 18)}
  <g clip-path="url(#clip)">
    <rect x="520" y="0" width="340" height="{H}" fill="url(#dp)" opacity=".8"/>
    <circle class="glow" cx="700" cy="60" r="220" fill="url(#cr)"/>
    <rect class="grow" x="0" y="0" width="{W}" height="5" fill="url(#cg)"/>
    <g transform="skewX(-20)"><rect class="shine" x="0" y="0" width="130" height="{H}"/></g>
  </g>
  <g class="pop" style="animation-delay:.1s"><rect class="tile" x="32" y="30" width="56" height="56" rx="15"/>
    <g class="float"><text class="ico" x="60" y="68" text-anchor="middle">{icon}</text></g></g>
  <text class="b cat fade" x="104" y="52" style="animation-delay:.15s">{E(cat)}</text>
  <text class="h title fade" x="103" y="82" style="animation-delay:.2s">{E(title)}</text>
  {''.join(prow)}
  <text class="b tag fade" x="32" y="160" style="animation-delay:.45s">{E(tagline)}</text>
  {frows}
  <line class="sdiv" x1="32" y1="334" x2="496" y2="334"/>
  {''.join(srow)}
  <g class="fade" style="animation-delay:.3s">
    <rect class="win" x="536" y="30" width="296" height="332" rx="14"/>
    <path class="bar" d="M536 44a14 14 0 0 1 14 -14h268a14 14 0 0 1 14 14v14h-296z"/>
    <circle cx="554" cy="44" r="4" fill="#ef4444"/><circle cx="568" cy="44" r="4" fill="#f59e0b"/><circle cx="582" cy="44" r="4" fill="#22c55e"/>
    <text class="b tl" x="684" y="48" text-anchor="middle">{E(title)}</text>
  </g>
{mock}"""
    svg(file, W, H, alt, body, css, FLAGSHIP_DEFS)


def asset_manager():
    tiles = []
    hues = [("#6366f1", "#22d3ee"), ("#f97316", "#facc15"), ("#0ea5e9", "#6366f1"), ("#ec4899", "#8b5cf6"),
            ("#2563eb", "#38bdf8"), ("#10b981", "#84cc16"), ("#1d4ed8", "#60a5fa"), ("#f43f5e", "#fb923c"), ("#14b8a6", "#3b82f6")]
    for i, (a, b) in enumerate(hues):
        r, c = divmod(i, 3)
        x, y = 550 + c * 92, 112 + r * 72
        shape = (f'<circle cx="{x + 42}" cy="{y + 30}" r="13" fill="#fff" fill-opacity=".85"/>' if i % 3 == 0 else
                 f'<rect x="{x + 28}" y="{y + 18}" width="28" height="24" rx="6" fill="#fff" fill-opacity=".85"/>' if i % 3 == 1 else
                 f'<path d="M{x + 26} {y + 44}l14 -24l14 24z" fill="#fff" fill-opacity=".85"/>')
        tiles.append(f'<defs><linearGradient id="t{i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs>'
                     f'<g class="pop" style="animation-delay:{.6 + i * .08:.2f}s"><rect x="{x}" y="{y}" width="84" height="62" rx="9" fill="url(#t{i})"/>{shape}</g>')
    mock = f"""  <g class="fade" style="animation-delay:.45s">
    <rect x="550" y="68" width="268" height="32" rx="9" fill="var(--bg)" stroke="var(--border)"/>
    <circle cx="566" cy="83" r="5.5" fill="none" stroke="var(--c)" stroke-width="1.8"/><path d="M570 87l4 4" stroke="var(--c)" stroke-width="1.8" stroke-linecap="round"/>
    <text class="b qry" x="580" y="88.5">blue logo mockups</text>
    <rect class="type" x="579" y="72" width="132" height="24" fill="var(--bg)"/>
    <rect class="cur" x="712" y="76" width="1.6" height="15"/>
    <rect x="752" y="74" width="58" height="20" rx="10" fill="var(--c)" fill-opacity=".14"/>
    <text class="b kind" x="781" y="88" text-anchor="middle">kind:psd</text>
  </g>
  {''.join(tiles)}
  <rect class="sel" x="639" y="181" width="90" height="68" rx="11"/>
  <rect class="scan" x="546" y="108" width="276" height="2" fill="url(#cg)"/>
  <g class="float" style="animation-delay:.6s"><g class="badge pop" style="animation-delay:1.6s">
    <rect x="676" y="252" width="146" height="26" rx="13"/>
    <text class="b" x="749" y="269" text-anchor="middle">✦ AI tags: logo, blue</text></g></g>
  <text class="b lbl fade" x="684" y="348" text-anchor="middle" style="animation-delay:1.3s">Semantic match · fully offline</text>"""
    mock_css = """
    .qry { font-size: 13px; fill: var(--fg); }
    .kind { font-size: 11px; font-weight: 600; fill: var(--c); }
    .type { transform-box: fill-box; transform-origin: right; animation: type 6s steps(17) infinite; }
    @keyframes type { 0%,8% { transform: scaleX(1); } 40%,88% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
    .cur { fill: var(--c); animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    .sel { fill: none; stroke: var(--c); stroke-width: 2.5; animation: selp 2.4s ease-in-out 1.4s infinite; }
    @keyframes selp { 0%,100% { stroke-opacity: 1; } 50% { stroke-opacity: .35; } }
    .scan { opacity: .7; animation: scan 4s ease-in-out 1s infinite; }
    @keyframes scan { 0% { transform: translateY(0); opacity: 0; } 10% { opacity: .8; } 90% { opacity: .8; } 100% { transform: translateY(210px); opacity: 0; } }
"""
    flagship(
        "flagship-asset-manager.svg", "Asset Manager Pro", "🗂️", "FLAGSHIP · WINDOWS DESKTOP APP",
        (("#4f46e5", "#818cf8"), ("#0891b2", "#22d3ee")),
        ["v2.0.0", "Windows", "Local AI", "Private build"],
        "A local AI asset catalog for designers.",
        ["Search by meaning: “blue logo mockups kind:psd”",
         "Reads PSD, AI/EPS, SVG, RAW, HEIC, video and XMP",
         "AI tag suggestions you review before anything is saved",
         "Finds duplicates and logo_v1 → logo_final version chains",
         "Batch rename with dry-run preview and one-click undo",
         "License audit, moodboards and resource-pack imports"],
        [("108k", "assets in a real catalog"), ("2.4 s", "to open, steady state"), ("100%", "offline AI")],
        mock, mock_css,
        "Asset Manager Pro, version 2.0.0: a local AI asset catalog for designers on Windows. Semantic search, "
        "PSD/AI/SVG/RAW/video indexing, reviewed AI tags, duplicate and version detection, undoable batch rename, "
        "license audit and moodboards. Tested on a 108k-asset catalog; opens in 2.4 s; fully offline AI.")


def font_manager():
    wf = [(24, "h", 700), (18, "h", 600), (14, "b", 500), (11.5, "b", 400)]
    lines = "".join(
        f'<text class="{cls} wf" x="556" y="{y}" style="font-size:{sz}px;font-weight:{wt};animation-delay:{1.0 + i * .25:.2f}s">Quick brown fox</text>'
        for i, ((sz, cls, wt), y) in enumerate(zip(wf, [250, 276, 296, 313]))
    )
    mock = f"""  <g class="fade" style="animation-delay:.45s">
    <line class="guide g1" x1="552" y1="96" x2="816" y2="96"/>
    <line class="guide g2" x1="552" y1="132" x2="816" y2="132"/>
    <line class="guide g3" x1="552" y1="180" x2="816" y2="180"/>
    <text class="b gl" x="814" y="128" text-anchor="end">x-height</text>
    <text class="b gl" x="814" y="194" text-anchor="end">baseline</text>
  </g>
  <text class="h spec" x="556" y="180">Ag</text>
  <rect x="552" y="222" width="264" height="1" fill="var(--border)"/>
  {lines}
  <g class="fade" style="animation-delay:1.4s">
    <line x1="556" y1="338" x2="760" y2="338" stroke="var(--border)" stroke-width="4" stroke-linecap="round"/>
    <line class="fill" x1="556" y1="338" x2="760" y2="338" stroke="url(#cg)" stroke-width="4" stroke-linecap="round"/>
    <circle class="knob" cx="556" cy="338" r="7" fill="var(--bg)" stroke="var(--c)" stroke-width="2.5"/>
    <text class="b gl" x="814" y="342" text-anchor="end">10–200 px</text>
  </g>
  <g class="float"><g class="badge pop" style="animation-delay:1.8s">
    <rect x="682" y="66" width="140" height="26" rx="13"/>
    <text class="b" x="752" y="83" text-anchor="middle">🛡️ Never deletes fonts</text></g></g>"""
    mock_css = """
    .guide { stroke: var(--c); stroke-opacity: .45; stroke-dasharray: 4 4; }
    .gl { font-size: 10.5px; fill: var(--muted); }
    .spec { font-size: 104px; font-weight: 700; fill: url(#cg); transform-box: fill-box; transform-origin: left bottom; animation: breathe 5s ease-in-out infinite; }
    @keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
    .wf { fill: var(--fg); opacity: 0; animation: fade .6s ease-out forwards; }
    .knob { animation: knob 5s ease-in-out 1.6s infinite; }
    @keyframes knob { 0%,100% { transform: translateX(0); } 50% { transform: translateX(204px); } }
    .fill { transform-box: fill-box; transform-origin: left; transform: scaleX(0); animation: fillx 5s ease-in-out 1.6s infinite; }
    @keyframes fillx { 0%,100% { transform: scaleX(0); } 50% { transform: scaleX(1); } }
"""
    flagship(
        "flagship-font-manager.svg", "Font Manager Pro", "🔤", "FLAGSHIP · WINDOWS DESKTOP APP",
        (("#db2777", "#f472b6"), ("#ea580c", "#fb923c")),
        ["v3.6.0", "Windows", "Single .exe", "Private build"],
        "Preview, install and inspect fonts, safely.",
        ["Never deletes a font: uninstall only deregisters, with backup",
         "Sample, waterfall and glyph previews from 10 to 200 px",
         "Previews fonts you haven't installed, straight from the file",
         "Duplicate and missing-file checks, per-font health score",
         "OpenType comparison, similar fonts and pairing ideas",
         "Exports font packs, @font-face CSS and WOFF2 subsets"],
        [("0", "font files ever deleted"), ("1 file", "single .exe, no installer"), ("No admin", "for everyday use")],
        mock, mock_css,
        "Font Manager Pro, version 3.6.0: a Windows font manager that never deletes a font file. Sample, waterfall and "
        "glyph previews, previews of uninstalled fonts, duplicate and health checks, OpenType comparison and pairing, "
        "and export to font packs, @font-face CSS and WOFF2. Single .exe, no admin rights for normal use.")


# --------------------------------------------------------------------------- tech stack
def tech():
    groups = [
        ("Languages", [("Python", "#3776AB", "#5a9fd4"), ("JavaScript", "#c9a400", "#F7DF1E"), ("TypeScript", "#3178C6", "#60a5fa"),
                       ("PHP", "#777BB4", "#a5a8e0"), ("HTML/CSS", "#E34F26", "#fb7a52")]),
        ("Frontend", [("React", "#0e9fbf", "#61DAFB"), ("Vite", "#646CFF", "#9499ff"), ("Tailwind CSS", "#0ea5e9", "#38bdf8"),
                      ("three.js", "#475569", "#cbd5e1")]),
        ("Desktop", [("PySide6", "#41CD52", "#6ee07a"), ("fontTools", "#be123c", "#fb7185"), ("ONNX Runtime", "#005CED", "#60a5fa"),
                     ("SQLite", "#0f80cc", "#38bdf8"), ("PyInstaller", "#ca8a04", "#facc15")]),
        ("AI & Audio", [("MobileCLIP", "#7c3aed", "#a78bfa"), ("Whisper", "#10a37f", "#34d399"), ("Ollama", "#334155", "#e2e8f0"), ("Piper TTS", "#9333ea", "#c084fc")]),
        ("Platforms", [("Docker", "#2496ED", "#5cb4f5"), ("Moodle", "#F98012", "#ffa04d"), ("GitHub Pages", "#24292f", "#e6edf3"),
                       ("Framer", "#0055FF", "#60a5fa")]),
    ]
    W = 860
    css, rows, i, y = [], [], 0, 96
    for gi, (g, items) in enumerate(groups):
        rows.append(f'<text class="b label fade" x="32" y="{y + 20}" style="animation-delay:{.15 + gi * .12:.2f}s">{E(g.upper())}</text>')
        x = 170
        for name, lc, dc in items:
            w = int(len(name) * 8.2 + 50)
            d = .3 + i * .06
            css.append(f".c{i} {{ --c:{lc}; }} @media (prefers-color-scheme: dark) {{ .c{i} {{ --c:{dc}; }} }}")
            rows.append(f'<g class="pill pop c{i}" style="animation-delay:{d:.2f}s"><rect x="{x}" y="{y}" width="{w}" height="32" rx="16"/>'
                        f'<circle class="dot" cx="{x + 18}" cy="{y + 16}" r="5" style="animation-delay:{d + 1.2:.2f}s"/>'
                        f'<text class="b" x="{x + 31}" y="{y + 21}">{E(name)}</text></g>')
            x += w + 10
            i += 1
        y += 48
    H = y + 22
    style = """
    .title { font-size: 20px; font-weight: 600; fill: var(--fg); }
    .sub { font-size: 13.5px; fill: var(--muted); }
    .label { font-size: 12px; font-weight: 600; letter-spacing: .09em; fill: var(--muted); }
    .pill rect { fill: var(--chip); stroke: var(--c); stroke-opacity: .5; }
    .pill text { font-size: 14px; font-weight: 500; fill: var(--fg); }
    .dot { fill: var(--c); transform-box: fill-box; transform-origin: center; animation: pulse 3s ease-in-out infinite; }
    .shine { fill: var(--p); opacity: .06; animation: sweep 6s ease-in-out 2s infinite; }
    """ + "\n    ".join(css)
    body = f"""{card_frame(W, H)}
  <g clip-path="url(#clip)">
    <rect x="600" y="0" width="260" height="{H}" fill="url(#dp)" opacity=".6"/>
    <rect class="grow" x="0" y="0" width="{W}" height="4" fill="url(#brand)"/>
    <g transform="skewX(-20)"><rect class="shine" x="0" y="0" width="120" height="{H}"/></g>
  </g>
  <text class="h title fade" x="32" y="50">🛠️ Tech stack</text>
  <text class="b sub fade" x="32" y="72" style="animation-delay:.1s">What I reach for to design, build and ship</text>
  {''.join(rows)}"""
    names = ", ".join(n for _, it in groups for n, *_ in it)
    svg("tech-stack.svg", W, H, f"Tech stack: {names}", body, style)


# --------------------------------------------------------------------------- connect buttons
ICONS = {
    "globe": '<circle r="10"/><ellipse rx="4.5" ry="10"/><path d="M-10 0H10M-8.5 -5H8.5M-8.5 5H8.5"/>',
    "camera": '<rect x="-10" y="-10" width="20" height="20" rx="6"/><circle r="4.6"/><circle class="fillc" cx="5.6" cy="-5.6" r="1.2"/>',
    "play": '<circle r="10"/><path class="fillc" d="M-3 -5L5 0L-3 5Z"/>',
}


def button(fn, label, sub, icon, a, b, title):
    (la, da), (lb, db) = a, b
    css = f"""
    :root {{ --x:{la}; --y:{lb}; }}
    @media (prefers-color-scheme: dark) {{ :root {{ --x:{da}; --y:{db}; }} }}
    .s1 {{ stop-color: var(--x); }} .s2 {{ stop-color: var(--y); }}
    .wrap {{ opacity: 0; animation: fade .6s ease-out .1s forwards; }}
    .glow {{ opacity: .12; animation: breathe 3.2s ease-in-out infinite; }}
    @keyframes breathe {{ 0%,100% {{ opacity: .08; }} 50% {{ opacity: .2; }} }}
    .spin {{ transform-origin: 140px 34px; animation: spin 6s linear infinite; }}
    .ic {{ fill: none; stroke: var(--x); stroke-width: 2; animation: bob 3s ease-in-out 1s infinite; }}
    .ic .fillc {{ fill: var(--x); stroke: none; }}
    .label {{ font-size: 16px; font-weight: 600; fill: var(--fg); }}
    .sub {{ font-size: 12.5px; fill: var(--muted); }}
    .arrow {{ fill: none; stroke: var(--x); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; animation: nudge 1.6s ease-in-out 1s infinite; }}
"""
    defs = """<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="s1"/><stop offset="1" class="s2"/></linearGradient>
    <clipPath id="c"><rect width="280" height="68" rx="34"/></clipPath>"""
    body = f"""  <g class="wrap">
    <g clip-path="url(#c)">
      <rect width="280" height="68" fill="url(#g)"/>
      <rect class="spin" x="-80" y="30" width="440" height="8" fill="#ffffff" opacity=".45"/>
      <rect x="2" y="2" width="276" height="64" rx="32" fill="var(--bg)"/>
      <rect class="glow" x="2" y="2" width="276" height="64" rx="32" fill="url(#g)"/>
    </g>
    <circle cx="38" cy="34" r="20" fill="url(#g)" opacity=".14"/>
    <g transform="translate(38 34)"><g class="ic">{ICONS[icon]}</g></g>
    <text class="h label" x="70" y="30">{E(label)}</text>
    <text class="b sub" x="70" y="49">{E(sub)}</text>
    <path class="arrow" d="M244 27L251 34L244 41"/>
  </g>"""
    svg(fn, 280, 68, title, body, css, defs)


# --------------------------------------------------------------------------- footer
def footer():
    W, H = 860, 150
    css = """
    .w1 { animation: slide 9s linear infinite; } .w2 { animation: slide 14s linear infinite reverse; }
    @keyframes slide { to { transform: translateX(-430px); } }
    .t { font-size: 20px; font-weight: 600; fill: var(--fg); }
    .s { font-size: 13.5px; fill: var(--muted); }
"""
    def wave(y, amp):
        d = f"M0 {y}"
        for k in range(0, 1720 + 215, 215):
            d += f" q 53.75 {-amp} 107.5 0 t 107.5 0"
        return d + f" V {H} H 0 Z"
    body = f"""{card_frame(W, H, 18)}
  <g clip-path="url(#clip)">
    <rect width="{W}" height="{H}" fill="url(#dp)" opacity=".5"/>
    <path class="w2" d="{wave(112, 16)}" fill="url(#brand)" opacity=".18"/>
    <path class="w1" d="{wave(124, 12)}" fill="url(#brand)" opacity=".3"/>
  </g>
  <text class="h t fade" x="430" y="58" text-anchor="middle">Always building. Open to collaboration.</text>
  <text class="b s fade" x="430" y="84" text-anchor="middle" style="animation-delay:.2s">Thanks for stopping by ✨  Say hi on Instagram @mindunter.ai</text>"""
    svg("footer.svg", W, H, "Always building. Open to collaboration. Thanks for stopping by.", body, css)


if __name__ == "__main__":
    header()
    about()
    asset_manager()
    font_manager()
    for p in PROJECTS:
        project(p)
    tech()
    button("connect-portfolio.svg", "Portfolio", "mindunter.framer.website", "globe",
           ("#0055ff", "#60a5fa"), ("#9333ea", "#c084fc"), "Portfolio: mindunter.framer.website")
    button("connect-instagram.svg", "Instagram", "@mindunter.ai", "camera",
           ("#e1306c", "#f472b6"), ("#f59e0b", "#fbbf24"), "Instagram: @mindunter.ai")
    button("connect-redline.svg", "Live course", "Redline Design School", "play",
           ("#dc2626", "#f87171"), ("#f97316", "#fb923c"), "Live course: Redline Design School")
    footer()
