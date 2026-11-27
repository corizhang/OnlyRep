#!/usr/bin/env python3
"""Release 收尾（release.yml 调用，环境变量 GH_TOKEN/REPO/TAG）：
安全边界（PR #1 审查要求）：
- 只操作「本次 Tag 的 Draft Release」；已公开或非本 Tag 的一律拒绝
- 只删除已知的 Tauri 默认命名重复安装包；未知资产报错不删
- 最终清单核验：五个资产名称、数量、非零大小
- PATCH 发布后重新 GET 确认 draft=false
任何失败非零退出，Release 保持 Draft 不公开。
"""
import json, os, sys, urllib.request, urllib.error

PRODUCT = "OnlyRep"
# 已知的 Tauri 默认命名重复资产（精确匹配本版本，防误删其他版本的安装包）
def legacy_tauri_assets(ver: str, product: str = PRODUCT) -> set:
    return {f"{product}_{ver}_x64-setup.exe", f"{product}_{ver}_x64_en-US.msi"}


class GitHubApi:
    """可注入的 API 层（测试用 FakeApi 替换）"""

    def __init__(self, token: str, repo: str):
        self.token = token
        self.repo = repo

    def _req(self, url: str, method: str = "GET", data=None):
        hdrs = {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json"}
        r = urllib.request.Request(url, method=method, headers=hdrs,
                                   data=json.dumps(data).encode() if data is not None else None)
        if data is not None:
            r.add_header("Content-Type", "application/json")
        return urllib.request.urlopen(r)

    def get_release(self, tag: str):
        return json.load(self._req(f"https://api.github.com/repos/{self.repo}/releases/tags/{tag}"))

    def delete_asset(self, asset_id: int) -> int:
        try:
            return self._req(f"https://api.github.com/repos/{self.repo}/releases/assets/{asset_id}", method="DELETE").status
        except urllib.error.HTTPError as e:
            return e.code

    def publish(self, release_id: int) -> None:
        self._req(f"https://api.github.com/repos/{self.repo}/releases/{release_id}", method="PATCH", data={"draft": False})


def finalize(api: GitHubApi, tag: str, product: str = PRODUCT) -> int:
    ver = tag.lstrip("v")
    allow = {
        f"{product}-Setup-v{ver}-x64.exe",
        f"{product}-Setup-v{ver}-x64.msi",
        f"{product}-Portable-v{ver}-x64.exe",
        f"{product}-Web-v{ver}.html",
        "SHA256SUMS.txt",
    }

    rel = api.get_release(tag)

    # 边界 1：只操作 Draft（已公开的 Release 绝不动）
    if not rel.get("draft"):
        print("::error::目标 Release 不是 Draft（已公开或不存在于本次构建）——拒绝操作")
        return 1
    # 边界 2：Tag 必须一致
    if rel.get("tag_name") != tag:
        print(f"::error::Release Tag {rel.get('tag_name')} 与本次 {tag} 不一致——拒绝操作")
        return 1

    assets = rel.get("assets", [])

    # 边界 2.5：资产非空（空清单说明上传失败）
    if not assets:
        print("::error::Release 没有任何资产（上传可能失败）——保持 Draft")
        return 1

    # ③ 删重复：只删已知的 Tauri 默认名；未知资产报错不删
    for a in assets:
        name = a["name"]
        if name in allow:
            continue
        if name not in legacy_tauri_assets(ver, product):
            print(f"::error::发现未知资产 {name}（不在白名单也不是已知 Tauri 默认名）——不自动删除，保持 Draft")
            return 1
        code = api.delete_asset(a["id"])
        if code != 204:
            print(f"::error::删除重复资产 {name} 失败（HTTP {code}）——保持 Draft")
            return 1
        print(f"deleted legacy asset: {name}")

    # ④ 最终清单核验：名称、数量、非零大小
    rel = api.get_release(tag)
    final = rel.get("assets", [])
    names = {a["name"] for a in final}
    missing, extra = allow - names, names - allow
    if missing or extra:
        print(f"::error::最终资产清单不符：缺 {sorted(missing)} 多 {sorted(extra)}——保持 Draft")
        return 1
    empty = [a["name"] for a in final if a.get("size", 0) <= 0]
    if empty:
        print(f"::error::资产大小为零：{empty}——保持 Draft")
        return 1
    print("最终资产清单核验通过：", ", ".join(sorted(names)))

    # ⑤ 转正式 + 回读确认
    # 注意：PATCH 发出后的异常（如回读网络失败）不代表未公开——工作流失败时请人工核对 Release 实际状态
    try:
        api.publish(rel["id"])
    except Exception as e:
        print(f"::error::发布请求失败：{e}——Release 可能仍为 Draft，也可能已公开，请人工核对")
        return 1
    try:
        after = api.get_release(tag)
    except Exception as e:
        print(f"::warning::发布后回读失败（{e}）——PATCH 已发出，Release 状态需人工核对")
        return 1
    if after.get("draft"):
        print("::error::PATCH 后 Release 仍为 Draft——发布失败")
        return 1
    print("Draft 已转为正式发布（回读确认 draft=false）")
    return 0


def main() -> int:
    tok = os.environ.get("GH_TOKEN", "")
    repo = os.environ.get("REPO", "")
    tag = os.environ.get("TAG", "")
    if not tok or not repo or not tag:
        print("ERROR: GH_TOKEN/REPO/TAG env required")
        return 1
    return finalize(GitHubApi(tok, repo), tag)


if __name__ == "__main__":
    sys.exit(main())
