#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Renders docs/03-research/02-ir-exchanges-usdt-rails.md from scripts/research/02_doc_template.md.

  * <!--TABLE:name-->   -> output of `02_conversion_cost.py --section name`
  * [@key1,key2]        -> [S3, S7] (numbered by first appearance; keys come from the registry in 02_build_data.py)
  * <!--SOURCES-->      -> numbered source list
  * <!--FA-->...<!--/FA--> -> ASCII digits converted to Persian digits (outside `code` and Latin tokens)

Run after 02_build_data.py and 02_conversion_cost.py --write:
    python3 scripts/research/02_render_doc.py
"""
import importlib.util
import pathlib
import re
import subprocess
import sys

sys.dont_write_bytecode = True  # do not leave __pycache__ files in scripts/research

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
TEMPLATE = HERE / "02_doc_template.md"
OUT = ROOT / "docs" / "03-research" / "02-ir-exchanges-usdt-rails.md"

spec = importlib.util.spec_from_file_location("build02", HERE / "02_build_data.py")
build02 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build02)
REG = build02._S

FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def fa_convert_segment(seg: str) -> str:
    # leave digits glued to Latin letters (TRC20, BEP20, SDN2...) alone
    def repl_num(m):
        s = m.group(0)
        s = re.sub(r"(?<=\d),(?=\d)", "٬", s)
        s = re.sub(r"(?<=\d)\.(?=\d)", "٫", s)
        return s.translate(FA_DIGITS)

    out = []
    pos = 0
    for m in re.finditer(r"(?<![A-Za-z0-9])\d[\d,\.]*\d|(?<![A-Za-z0-9])\d(?![A-Za-z])", seg):
        # skip if directly followed by a Latin letter (e.g. 2026-06-02T..., 3.5x)
        end = m.end()
        if end < len(seg) and re.match(r"[A-Za-z]", seg[end]):
            continue
        out.append(seg[pos:m.start()])
        out.append(repl_num(m))
        pos = end
    out.append(seg[pos:])
    return "".join(out)


def fa_convert(block: str) -> str:
    parts = block.split("`")
    for i in range(0, len(parts), 2):
        parts[i] = fa_convert_segment(parts[i])
    return "`".join(parts)


def run_section(name: str) -> str:
    r = subprocess.run([sys.executable, str(HERE / "02_conversion_cost.py"), "--section", name], capture_output=True, text=True, check=True)
    return r.stdout.rstrip("\n")


def main():
    text = TEMPLATE.read_text(encoding="utf-8")

    # tables
    for name in re.findall(r"<!--TABLE:(\w+)-->", text):
        text = text.replace(f"<!--TABLE:{name}-->", run_section(name))

    # Persian block
    def fa_block(m):
        return fa_convert(m.group(1))

    text = re.sub(r"<!--FA-->(.*?)<!--/FA-->", fa_block, text, flags=re.S)

    # source markers
    order = []

    def num(key):
        if key not in REG:
            raise SystemExit(f"unknown source key: {key}")
        if key not in order:
            order.append(key)
        return order.index(key) + 1

    def repl(m):
        keys = [k.strip() for k in m.group(1).split(",")]
        return "[" + ", ".join(f"S{num(k)}" for k in keys) + "]"

    text = re.sub(r"\[@([A-Za-z0-9_,\s]+)\]", repl, text)

    lines = []
    for i, key in enumerate(order, 1):
        s = REG[key]
        lines.append(f"- [S{i}] {s['url']} - {s['title']} - {s['note']}")
    text = text.replace("<!--SOURCES-->", "Notes: 'per search summary' = the page itself was not seen; 'read directly' = fetched or downloaded and read; 'internal' = another specialist's file in this repository, cited for cross-checking and not re-verified.\n\n" + "\n".join(lines))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    words = len(re.findall(r"\S+", text))
    print(f"wrote {OUT} ({words} whitespace-words, {len(order)} sources)")


if __name__ == "__main__":
    main()
