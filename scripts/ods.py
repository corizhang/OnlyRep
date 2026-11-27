#!/usr/bin/env python3
"""ONLYTOOLS Standard utilities; Python standard library only."""
import argparse, hashlib, json, re, sys
from pathlib import Path

SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.(0|[1-9]\d*))?$")
PH = re.compile(r"\{\{[^}]+\}\}")

def read_json(path):
    try: return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e: raise ValueError(f"Cannot read JSON {path}: {e}")

def config(path):
    c=read_json(path); errors=[]
    if c.get("schemaVersion") != 2: errors.append("schemaVersion must equal 2")
    p=c.get("product",{}); r=c.get("repository",{}); rel=c.get("release",{}); b=c.get("build",{})
    for k in ("name","slug","tagline","category","status"):
        if not p.get(k): errors.append(f"product.{k} is required")
    if p.get("slug") and not re.fullmatch(r"[a-z0-9-]+",p["slug"]): errors.append("product.slug must be lowercase slug")
    if r.get("owner") != "onlytools-lab": errors.append("repository.owner must be onlytools-lab")
    for k in ("name","url"):
        if not r.get(k): errors.append(f"repository.{k} is required")
    if rel.get("tagPrefix") != "v": errors.append("release.tagPrefix must be v")
    if not isinstance(rel.get("requireSha256"),bool): errors.append("release.requireSha256 must be boolean")
    if not isinstance(b.get("commands"),dict): errors.append("build.commands must be an object")
    if errors:
        print("\\n".join("ERROR: "+e for e in errors)); return 1
    print(f"Config structure OK: {p['name']} ({p['slug']})")
    if "TODO" in json.dumps(c): print("WARNING: TODO values remain; verify before release.")
    return 0

def readme(path):
    p=Path(path)
    if not p.exists(): print("ERROR: README missing"); return 1
    body=p.read_text(encoding="utf-8")
    required=["# ","## 功能特性","## 系统要求","## 下载与安装","## 快速开始","## 数据与隐私","## 问题反馈","## 许可证"]
    missing=[x for x in required if x not in body]
    placeholders=PH.findall(body)
    if missing or placeholders:
        if missing: print("ERROR: missing headings: "+", ".join(missing))
        if placeholders: print("ERROR: unresolved placeholders: "+", ".join(placeholders))
        return 1
    print("README structure OK; factual accuracy still requires review.")
    return 0

def release(notes,version):
    errors=[]
    if not SEMVER.fullmatch(version): errors.append("invalid SemVer version")
    p=Path(notes)
    if not p.exists(): errors.append("Release Notes file missing")
    else:
        body=p.read_text(encoding="utf-8")
        for h in ("## Highlights","## Compatibility","## Downloads","## Verification"):
            if h not in body: errors.append("missing heading "+h)
        if PH.findall(body): errors.append("unresolved template placeholders")
        if "TODO" in body or "待补充" in body: errors.append("TODO remains")
    if errors:
        print("\\n".join("ERROR: "+e for e in errors)); return 1
    print(f"Release Notes structure OK for v{version}")
    return 0

def hashes(paths):
    failed=False
    for item in paths:
        p=Path(item)
        if not p.is_file(): print("ERROR: missing file "+str(p)); failed=True; continue
        h=hashlib.sha256()
        with p.open("rb") as f:
            for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
        print(f"{h.hexdigest()}  {p}")
    return int(failed)

def draft(cfgpath,changelog,version,out):
    c=read_json(cfgpath); name=c.get("product",{}).get("name","TODO")
    text=Path(changelog).read_text(encoding="utf-8")
    m=re.search(rf"(?ms)^## \[{re.escape(version)}\](?: - .*?)?\s*(.*?)(?=^## \[|\Z)",text)
    if not m: print(f"ERROR: CHANGELOG section [{version}] not found"); return 1
    body=f"""# {name} v{version}

## Highlights
TODO: Summarize user value from verified changes.

{m.group(1).strip()}

## Compatibility
- Windows: TODO
- Architecture: TODO
- Runtime: TODO
- Breaking changes / migration: TODO

## Known Issues
TODO: Record verified issues or state none within the tested scope.

## Downloads
TODO: Add actual assets and SHA-256.

## Verification
- Build: TODO
- Tests: TODO
- Package smoke test: TODO
"""
    Path(out).write_text(body,encoding="utf-8")
    print(f"Draft created: {out}. Complete all TODOs before release.")
    return 0

def main():
    p=argparse.ArgumentParser(prog="ods"); s=p.add_subparsers(dest="cmd",required=True)
    x=s.add_parser("validate-config"); x.add_argument("--config",required=True)
    x=s.add_parser("validate-readme"); x.add_argument("--readme",default="README.md")
    x=s.add_parser("validate-release"); x.add_argument("--notes",required=True); x.add_argument("--version",required=True)
    x=s.add_parser("hash-artifacts"); x.add_argument("artifacts",nargs="+")
    x=s.add_parser("release-notes"); x.add_argument("--config",default="onlytools.config.json"); x.add_argument("--changelog",default="CHANGELOG.md"); x.add_argument("--version",required=True); x.add_argument("--output",default="RELEASE_NOTES.md")
    a=p.parse_args()
    try:
        if a.cmd=="validate-config": return config(a.config)
        if a.cmd=="validate-readme": return readme(a.readme)
        if a.cmd=="validate-release": return release(a.notes,a.version)
        if a.cmd=="hash-artifacts": return hashes(a.artifacts)
        if a.cmd=="release-notes": return draft(a.config,a.changelog,a.version,a.output)
    except Exception as e: print("ERROR:",e); return 1
    return 2
if __name__=="__main__": sys.exit(main())
