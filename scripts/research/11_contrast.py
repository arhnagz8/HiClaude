#!/usr/bin/env python3
"""WCAG 2.x contrast checker for docs/05-architecture/design-tokens.json (light + dark).
Formula: L = 0.2126 R + 0.7152 G + 0.0722 B (linearised sRGB); ratio = (L1+0.05)/(L2+0.05).
Rules checked: text pairs >= 4.5, large-text/UI-boundary pairs >= 3.0.  Exit code 1 on any failure.
Usage: python3 scripts/research/11_contrast.py [--write-md]"""
import json, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
tok = json.loads((ROOT / 'docs/05-architecture/design-tokens.json').read_text())

def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
def lum(h):
    h = h.lstrip('#'); r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
def ratio(a, b):
    la, lb = lum(a), lum(b)
    if la < lb: la, lb = lb, la
    return (la + 0.05) / (lb + 0.05)

# (foreground, background, minimum, note)
PAIRS = [
    ('fg', 'bg', 4.5, 'body text on page'), ('fg', 'surface', 4.5, 'body text on card'),
    ('muted', 'bg', 4.5, 'secondary text'), ('muted', 'surface', 4.5, 'secondary text on card'),
    ('subtle', 'surface', 4.5, 'hint/placeholder text on card'), ('subtle', 'bg', 4.5, 'hint text on page'),
    ('subtle', 'surface-2', 4.5, 'hint on sunken surface'),
    ('primary', 'bg', 4.5, 'link / primary text on page'), ('primary', 'surface', 4.5, 'link on card'),
    ('on-primary', 'primary', 4.5, 'text on primary button'),
    ('on-primary', 'primary-hover', 4.5, 'text on hovered primary button'),
    ('primary', 'primary-soft', 4.5, 'text on soft primary chip'),
    ('success', 'success-soft', 4.5, 'success badge'), ('success', 'surface', 4.5, 'success text on card'),
    ('warning', 'warning-soft', 4.5, 'warning badge'), ('warning', 'surface', 4.5, 'warning text on card'),
    ('danger', 'danger-soft', 4.5, 'danger badge'), ('danger', 'surface', 4.5, 'danger text on card'),
    ('info', 'info-soft', 4.5, 'info badge'), ('info', 'surface', 4.5, 'info text on card'),
    ('accent', 'accent-soft', 4.5, 'rush/express badge'), ('accent', 'surface', 4.5, 'rush text on card'),
    ('line-strong', 'bg', 3.0, 'input border vs page (WCAG 1.4.11)'),
    ('line-strong', 'surface', 3.0, 'input border vs card (WCAG 1.4.11)'),
    ('primary', 'surface', 3.0, 'focus ring vs card (WCAG 2.4.11/1.4.11)'),
]
fails = 0; rows = []
for theme in ('light', 'dark'):
    col = tok['color'][theme]
    for fg, bg, mn, note in PAIRS:
        r = ratio(col[fg], col[bg]); ok = r >= mn
        fails += (not ok)
        rows.append((theme, fg, bg, col[fg], col[bg], r, mn, ok, note))
for t, fg, bg, f, b, r, mn, ok, note in rows:
    print(f"{'OK  ' if ok else 'FAIL'} {t:5} {fg:12} on {bg:13} {f} / {b}  {r:5.2f} (min {mn})  {note}")
print(f"\n{len(rows)} pairs, {fails} failures")
if '--write-md' in sys.argv:
    print('\n| theme | foreground | background | ratio | min | pass |\n|---|---|---|---|---|---|')
    for t, fg, bg, f, b, r, mn, ok, note in rows:
        print(f"| {t} | {fg} {f} | {bg} {b} | {r:.2f} | {mn} | {'yes' if ok else 'NO'} |")
sys.exit(1 if fails else 0)
