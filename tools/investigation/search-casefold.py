"""Emit the standard library's Unicode full casefold mapping; no SQLite or source IO."""
import json,sys,unicodedata
mapping={}
for code in range(0x110000):
    char=chr(code)
    folded=char.casefold()
    if folded!=char:
        mapping[char]=folded
print(json.dumps({'python':sys.version,'unicodeVersion':unicodedata.unidata_version,'mapping':mapping},ensure_ascii=True))
