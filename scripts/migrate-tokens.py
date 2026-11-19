#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""设计 token 迁移：硬编码 slate/blue/red/... → 语义类名（tokens.css --ui-*）。
用法：python scripts/migrate-tokens.py <文件或目录>...
注意：有序映射，长前缀优先（hover: 等变体先于基础类命中）。
"""
import io
import re
import sys
import os

# （正则 pattern, 替换）——按顺序应用；基础类用 \b 边界防误伤
RULES = [
    # ---- 品牌蓝（hover/边框/软底优先） ----
    (r'hover:bg-blue-700', 'hover:bg-brand-hover'),
    (r'hover:bg-blue-50\b', 'hover:bg-brand-soft'),
    (r'hover:text-blue-[67]00', 'hover:text-brand'),
    (r'hover:border-blue-300', 'hover:border-brand-line'),
    (r'bg-blue-700', 'bg-brand-hover'),
    (r'bg-blue-600', 'bg-brand'),
    (r'bg-blue-500', 'bg-brand'),
    (r'bg-blue-50\b', 'bg-brand-soft'),
    (r'bg-blue-100', 'bg-brand-line'),
    (r'text-blue-[4567]00', 'text-brand'),
    (r'border-blue-100', 'border-brand-line'),
    (r'border-blue-200', 'border-brand-line'),
    (r'border-blue-300', 'border-brand-line'),
    (r'border-blue-400', 'border-brand-line'),
    (r'ring-blue-400', 'ring-brand-line'),
    (r'ring-blue-500', 'ring-brand'),
    (r'focus:border-blue-400', 'focus:border-brand'),
    (r'focus:ring-blue-500', 'focus:ring-brand'),
    # ---- 中性灰 ----
    (r'hover:bg-slate-100', 'hover:bg-hover'),
    (r'hover:bg-slate-50\b', 'hover:bg-hover'),
    (r'hover:text-slate-700', 'hover:text-ink'),
    (r'hover:text-slate-600', 'hover:text-ink-dim'),
    (r'hover:border-slate-300', 'hover:border-line-strong'),
    (r'bg-slate-50\b', 'bg-soft'),
    (r'bg-slate-100', 'bg-hover'),
    (r'bg-slate-200\b', 'bg-base'),
    (r'bg-slate-900/40', 'bg-ink/40'),
    (r'bg-white\b', 'bg-panel'),
    (r'text-slate-800', 'text-ink'),
    (r'text-slate-700', 'text-ink'),
    (r'text-slate-600', 'text-ink-dim'),
    (r'text-slate-500', 'text-ink-dim'),
    (r'text-slate-400', 'text-ink-faint'),
    (r'border-slate-300', 'border-line-strong'),
    (r'border-slate-200', 'border-line'),
    (r'border-slate-100', 'border-line'),
    (r'divide-slate-200', 'divide-line'),
    (r'placeholder-slate-400', 'placeholder-ink-faint'),
    # ---- 状态色 ----
    (r'hover:bg-red-100', 'hover:bg-danger-soft'),
    (r'hover:bg-red-50\b', 'hover:bg-danger-soft'),
    (r'hover:text-red-500', 'hover:text-danger'),
    (r'hover:text-red-600', 'hover:text-danger'),
    (r'bg-red-600', 'bg-danger'),
    (r'bg-red-50\b', 'bg-danger-soft'),
    (r'text-red-[567]00', 'text-danger'),
    (r'border-red-200', 'border-danger/30'),
    (r'border-red-300', 'border-danger/40'),
    (r'bg-emerald-50\b', 'bg-ok-soft'),
    (r'text-emerald-[67]00', 'text-ok'),
    (r'bg-amber-50\b', 'bg-warn-soft'),
    (r'text-amber-[67]00', 'text-warn'),
    (r'border-amber-200', 'border-warn/30'),
    (r'border-amber-300', 'border-warn/40'),
    (r'bg-orange-50\b', 'bg-warn-soft'),
    (r'text-orange-[78]00', 'text-warn'),
    (r'text-orange-400', 'text-warn'),
    (r'hover:text-orange-600', 'hover:text-warn'),
    (r'border-orange-200', 'border-warn/30'),
    (r'border-orange-300', 'border-warn/40'),
    (r'hover:bg-orange-100', 'hover:bg-warn-soft'),
    (r'text-slate-300', 'text-ink-faint'),
    (r'text-amber-800', 'text-warn'),
    (r'border-blue-500', 'border-brand'),
    (r'hover:border-blue-500', 'hover:border-brand'),
    (r'hover:bg-blue-100', 'hover:bg-brand-line'),
]


def migrate(path: str) -> int:
    s = io.open(path, encoding='utf-8').read()
    orig = s
    for pat, rep in RULES:
        s = re.sub(pat, rep, s)
    if s != orig:
        io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
        return 1
    return 0


def main() -> None:
    targets = sys.argv[1:]
    files = []
    for t in targets:
        if os.path.isdir(t):
            for root, _, names in os.walk(t):
                files += [os.path.join(root, f) for f in names if f.endswith(('.tsx', '.ts'))]
        else:
            files.append(t)
    changed = 0
    for f in files:
        changed += migrate(f)
    print(f'migrated {changed}/{len(files)} files')


if __name__ == '__main__':
    main()
