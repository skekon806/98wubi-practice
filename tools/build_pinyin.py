#!/usr/bin/env python3
"""生成拼音反查索引 data/pinyin.js。

数据来源（均为 MIT License）：
- 3500 常用字：mapull/chinese-dictionary character/common/char_common.json
- 拼音（含多音字）：mozillazg/pinyin-data kTGHZ2013.txt

用法：
    ~/.venv/bin/python tools/build_pinyin.py
    ~/.venv/bin/python tools/build_pinyin.py --char-json /path/to/char_common.json \
        --pinyin-txt /path/to/kTGHZ2013.txt -o data/pinyin.js
"""

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.request import urlopen

CHAR_URL = (
    "https://raw.githubusercontent.com/mapull/chinese-dictionary/main/"
    "character/common/char_common.json"
)
PINYIN_URL = (
    "https://raw.githubusercontent.com/mozillazg/pinyin-data/master/"
    "kTGHZ2013.txt"
)

TONE_MARKS = (
    ("āēīōūǖ", 1),
    ("áéíóúǘ", 2),
    ("ǎěǐǒǔǚ", 3),
    ("àèìòùǜ", 4),
)


def read_source(path, url):
    if path:
        return Path(path).read_text(encoding="utf-8")
    with urlopen(url, timeout=30) as response:
        return response.read().decode("utf-8")


def pinyin_key(text):
    """带声调拼音 → 无声调输入键；ü 统一为 v，兼容 ɡ/字体变体。"""
    s = (
        text.strip()
        .lower()
        .replace("ɡ", "g")
        .replace("ü", "v")
        .replace("ǖ", "v")
        .replace("ǘ", "v")
        .replace("ǚ", "v")
        .replace("ǜ", "v")
    )
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return "".join(ch for ch in s if "a" <= ch <= "z")


def tone_of(text):
    for marks, tone in TONE_MARKS:
        if any(mark in text for mark in marks):
            return tone
    return 5


def numeric_pinyin(key, tone):
    """显示用：声调跟在拼音后，1-4 标调，轻声不加数字。"""
    return key if tone == 5 else f"{key}{tone}"


def parse_chars(text):
    data = json.loads(text)
    chars = [(item["char"], item.get("frequency", 9), item.get("index", 9999)) for item in data]
    if len(chars) != 3500 or len({c[0] for c in chars}) != 3500:
        raise ValueError(f"字表数量异常：{len(chars)}")
    return chars


def parse_pinyin(text):
    result = {}
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line.startswith("U+"):
            continue
        code, pinyins = line.split(":", 1)
        char = chr(int(code[2:], 16))
        readings = [p.strip() for p in pinyins.split(",") if p.strip()]
        if readings:
            result[char] = readings
    return result


def build(chars, readings):
    # key -> (tone, pinyin) -> [(排序值, 汉字)]
    groups = defaultdict(lambda: defaultdict(set))
    missing = []
    for char, freq, index in chars:
        pys = readings.get(char)
        if not pys:
            missing.append(char)
            continue
        rank = (freq, index)
        for py in pys:
            key = pinyin_key(py)
            if key:
                groups[key][(tone_of(py), py)].add((rank, char))
    if missing:
        raise ValueError(f"拼音数据缺少 {len(missing)} 字：{''.join(missing[:30])}")

    output = {}
    for key in sorted(groups):
        by_tone = sorted(groups[key].items())
        output[key] = [
            [numeric_pinyin(key, tone), tone, "".join(char for _, char in sorted(items))]
            for (tone, _py), items in by_tone
        ]
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--char-json", help="本地 char_common.json 路径")
    parser.add_argument("--pinyin-txt", help="本地 kTGHZ2013.txt 路径")
    parser.add_argument("-o", "--output", default="data/pinyin.js")
    args = parser.parse_args()

    chars = parse_chars(read_source(args.char_json, CHAR_URL))
    readings = parse_pinyin(read_source(args.pinyin_txt, PINYIN_URL))
    index = build(chars, readings)

    pairs = sum(len(groups) for groups in index.values())
    header = (
        "// 由 tools/build_pinyin.py 生成，请勿手工编辑。\n"
        "// 3500 常用字：mapull/chinese-dictionary (MIT)\n"
        "// 拼音数据：mozillazg/pinyin-data kTGHZ2013 (MIT)\n"
        f"// {len(chars)} 字 / {pairs} 个读音 / {len(index)} 个无调拼音\n"
    )
    lines = [header, "window.WUBI_DATA['pinyin'] = {"]
    for key, groups in index.items():
        encoded_key = json.dumps(key, ensure_ascii=False)
        encoded_groups = json.dumps(groups, ensure_ascii=False, separators=(",", ":"))
        lines.append(f"{encoded_key}:{encoded_groups},")
    lines.append("};")
    lines.append("")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines), encoding="utf-8")
    print(f"写入 {output}: {len(chars)} 字 / {pairs} 读音 / {len(index)} 拼音", file=sys.stderr)


if __name__ == "__main__":
    main()
