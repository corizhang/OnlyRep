#!/usr/bin/env python3
"""finalize_release.py 模拟 API 测试（不真实触网）：python scripts/test_finalize_release.py"""
import sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from finalize_release import finalize

VER = "0.7.2"
TAG = f"v{VER}"
ALLOW = {
    f"OnlyRep-Setup-v{VER}-x64.exe",
    f"OnlyRep-Setup-v{VER}-x64.msi",
    f"OnlyRep-Portable-v{VER}-x64.exe",
    f"OnlyRep-Web-v{VER}.html",
    "SHA256SUMS.txt",
}
LEGACY = [f"OnlyRep_{VER}_x64-setup.exe", f"OnlyRep_{VER}_x64_en-US.msi"]


class FakeApi:
    """内存版 GitHub Releases API"""

    def __init__(self, release, delete_code=204, publish_fails=False):
        self.release = release
        self.delete_code = delete_code
        self.publish_fails = publish_fails
        self.deleted = []

    def get_release(self, tag):
        return self.release

    def delete_asset(self, asset_id):
        self.deleted.append(asset_id)
        if self.delete_code == 204:
            self.release["assets"] = [a for a in self.release["assets"] if a["id"] != asset_id]
        return self.delete_code

    def publish(self, release_id):
        if not self.publish_fails:
            self.release["draft"] = False


def make_release(draft=True, tag=TAG, with_legacy=True, extra=None, omit=None, zero_size=False):
    names = sorted(ALLOW)
    if omit:
        names = [n for n in names if n != omit]
    names += LEGACY if not extra else []
    names += extra or []
    if omit:
        names = [n for n in names if n != omit]
    return {
        "id": 1,
        "draft": draft,
        "tag_name": tag,
        "assets": [{"id": i + 1, "name": n, "size": 0 if (zero_size and n == "SHA256SUMS.txt") else 1024} for i, n in enumerate(names)],
    }


class T(unittest.TestCase):
    def test_happy_path_publishes(self):
        api = FakeApi(make_release())
        self.assertEqual(finalize(api, TAG), 0)
        self.assertFalse(api.release["draft"])
        self.assertEqual(len(api.deleted), 2)  # 只删了两个默认名

    def test_non_draft_rejected(self):
        api = FakeApi(make_release(draft=False))
        self.assertEqual(finalize(api, TAG), 1)
        self.assertEqual(api.deleted, [])

    def test_tag_mismatch_rejected(self):
        api = FakeApi(make_release(tag="v9.9.9"))
        self.assertEqual(finalize(api, TAG), 1)

    def test_unknown_asset_rejected_not_deleted(self):
        api = FakeApi(make_release(with_legacy=False, extra=["mystery.zip"]))
        self.assertEqual(finalize(api, TAG), 1)
        self.assertEqual(api.deleted, [])  # 未知资产绝不动

    def test_delete_failure_rejected(self):
        api = FakeApi(make_release(), delete_code=403)
        self.assertEqual(finalize(api, TAG), 1)
        self.assertTrue(api.release["draft"])

    def test_missing_standard_asset_rejected(self):
        api = FakeApi(make_release(with_legacy=False, omit="SHA256SUMS.txt"))
        self.assertEqual(finalize(api, TAG), 1)

    def test_zero_size_asset_rejected(self):
        api = FakeApi(make_release(zero_size=True))
        self.assertEqual(finalize(api, TAG), 1)

    def test_publish_failure_rejected(self):
        api = FakeApi(make_release(), publish_fails=True)
        self.assertEqual(finalize(api, TAG), 1)

    def test_other_version_legacy_name_rejected(self):
        # 别的版本的 Tauri 默认名不在本次白名单——属未知资产，拒删
        api = FakeApi(make_release(with_legacy=False, extra=["OnlyRep_0.7.1_x64-setup.exe"]))
        self.assertEqual(finalize(api, TAG), 1)
        self.assertEqual(api.deleted, [])

    def test_empty_assets_rejected(self):
        api = FakeApi({"id": 1, "draft": True, "tag_name": TAG, "assets": []})
        self.assertEqual(finalize(api, TAG), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
