#!/usr/bin/env python3
"""Release 收尾（release.yml 调用，环境变量 GH_TOKEN/REPO/TAG）：
白名单删多余资产（HTTP 状态断言）→ 最终清单核验 → Draft 转正式发布。
任何一步失败都以非零退出，Release 保持 Draft 不公开。
"""
import json, os, sys, urllib.request

def main() -> int:
    tok = os.environ.get("GH_TOKEN", "")
    repo = os.environ.get("REPO", "")
    tag = os.environ.get("TAG", "")
    if not tok or not repo or not tag:
        print("ERROR: GH_TOKEN/REPO/TAG env required")
        return 1
    ver = tag.lstrip("v")
    product = "OnlyRep"
    allow = {
        f"{product}-Setup-v{ver}-x64.exe",
        f"{product}-Setup-v{ver}-x64.msi",
        f"{product}-Portable-v{ver}-x64.exe",
        f"{product}-Web-v{ver}.html",
        "SHA256SUMS.txt",
    }
    hdrs = {"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"}

    def req(url, method="GET", data=None):
        r = urllib.request.Request(url, method=method, headers=hdrs,
                                   data=json.dumps(data).encode() if data is not None else None)
        if data is not None:
            r.add_header("Content-Type", "application/json")
        return urllib.request.urlopen(r)

    rel = json.load(req(f"https://api.github.com/repos/{repo}/releases/tags/{tag}"))
    assets = rel.get("assets", [])

    # ① 删白名单外资产（逐个断言 204）
    for a in assets:
        if a["name"] not in allow:
            try:
                resp = req(f"https://api.github.com/repos/{repo}/releases/assets/{a['id']}", method="DELETE")
                code = resp.status
            except urllib.error.HTTPError as e:
                code = e.code
            if code != 204:
                print(f"::error::删除白名单外资产 {a['name']} 失败（HTTP {code}）——Release 保持 Draft 未公开")
                return 1
            print(f"deleted extra asset: {a['name']}")

    # ② 最终清单核验
    rel = json.load(req(f"https://api.github.com/repos/{repo}/releases/tags/{tag}"))
    names = {a["name"] for a in rel.get("assets", [])}
    missing, extra = allow - names, names - allow
    if missing or extra:
        print(f"::error::最终资产清单不符：缺 {sorted(missing)} 多 {sorted(extra)}——Release 保持 Draft 未公开")
        return 1
    print("最终资产清单核验通过：", ", ".join(sorted(names)))

    # ③ Draft → 正式发布
    req(f"https://api.github.com/repos/{repo}/releases/{rel['id']}", method="PATCH", data={"draft": False})
    print("Draft 已转为正式发布")
    return 0

if __name__ == "__main__":
    sys.exit(main())
