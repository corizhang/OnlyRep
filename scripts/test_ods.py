#!/usr/bin/env python3
"""ods.py 正反例测试（标准库 unittest，无第三方依赖）：python scripts/test_ods.py"""
import json, sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ods

CFG = {"schemaVersion": 2, "product": {"name": "OnlyRep", "slug": "onlyrep", "tagline": "t", "category": "Productivity", "status": "stable"},
       "repository": {"owner": "onlytools-lab", "name": "onlyrep", "url": "https://github.com/onlytools-lab/onlyrep"},
       "release": {}, "build": {}}

GOOD_CHANGELOG = """# Changelog

## [Unreleased]

## [0.7.1] - 2026-11-27

### Added
- 背景图支持

### Fixed
- 修复丢图

[Unreleased]: https://github.com/onlytools-lab/onlyrep/compare/v0.7.1...HEAD
[0.7.1]: https://github.com/onlytools-lab/onlyrep/releases/tag/v0.7.1
"""

GOOD_NOTES = """# OnlyRep v0.7.1

## Highlights
背景图。

## Compatibility
- Windows 10/11 x64

## Downloads
- `OnlyRep-Setup-v0.7.1-x64.exe`
- `OnlyRep-Portable-v0.7.1-x64.exe`
- `SHA256SUMS.txt`

## Verification
- 测试通过
"""


class T(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        d = Path(self.dir.name)
        (d / "onlytools.config.json").write_text(json.dumps(CFG), encoding="utf-8")
        (d / "package.json").write_text(json.dumps({"version": "0.7.1"}), encoding="utf-8")
        (d / "src-tauri").mkdir()
        (d / "src-tauri" / "tauri.conf.json").write_text(json.dumps({"version": "0.7.1"}), encoding="utf-8")
        (d / "CHANGELOG.md").write_text(GOOD_CHANGELOG, encoding="utf-8")
        (d / "RN.md").write_text(GOOD_NOTES, encoding="utf-8")
        self.d = d

    def tearDown(self):
        self.dir.cleanup()

    def w(self, name, text):
        p = self.d / name
        p.write_text(text, encoding="utf-8")
        return str(p)

    # ---- changelog ----
    def test_changelog_ok(self):
        self.assertEqual(ods.changelog_check(str(self.d / "CHANGELOG.md"), "0.7.1", str(self.d / "onlytools.config.json")), 0)

    def test_changelog_fake_date_rejected(self):
        p = self.w("CHANGELOG.md", GOOD_CHANGELOG.replace("2026-11-27", "2026-99-99"))
        self.assertEqual(ods.changelog_check(p, "0.7.1", str(self.d / "onlytools.config.json")), 1)

    def test_changelog_empty_category_rejected(self):
        p = self.w("CHANGELOG.md", GOOD_CHANGELOG.replace("### Added\n- 背景图支持", "### Added\n"))
        # Fixed 仍有条目→应通过；全空才拒。再把 Fixed 掏空：
        p = self.w("CHANGELOG.md", GOOD_CHANGELOG.replace("### Added\n- 背景图支持", "### Added\n").replace("### Fixed\n- 修复丢图", "### Fixed\n"))
        self.assertEqual(ods.changelog_check(p, "0.7.1", str(self.d / "onlytools.config.json")), 1)

    def test_changelog_missing_section(self):
        p = self.w("CHANGELOG.md", GOOD_CHANGELOG.replace("## [0.7.1] - 2026-11-27", "## [0.7.0] - 2026-11-25"))
        self.assertEqual(ods.changelog_check(p, "0.7.1", str(self.d / "onlytools.config.json")), 1)

    def test_changelog_missing_link_def(self):
        p = self.w("CHANGELOG.md", GOOD_CHANGELOG.replace("[0.7.1]: https://github.com/onlytools-lab/onlyrep/releases/tag/v0.7.1\n", ""))
        self.assertEqual(ods.changelog_check(p, "0.7.1", str(self.d / "onlytools.config.json")), 1)

    def test_changelog_structure_only_no_version_needed(self):
        self.assertEqual(ods.changelog_check(str(self.d / "CHANGELOG.md"), "", str(self.d / "onlytools.config.json"), structure_only=True), 0)

    # ---- release notes ----
    def test_release_ok(self):
        self.assertEqual(ods.release(str(self.d / "RN.md"), "0.7.1", str(self.d / "onlytools.config.json")), 0)

    def test_release_wrong_title_rejected(self):
        p = self.w("RN.md", GOOD_NOTES.replace("# OnlyRep v0.7.1", "# OnlyRep v0.7.0"))
        self.assertEqual(ods.release(p, "0.7.1", str(self.d / "onlytools.config.json")), 1)

    def test_release_stale_asset_name_rejected(self):
        p = self.w("RN.md", GOOD_NOTES.replace("OnlyRep-Setup-v0.7.1-x64.exe", "OnlyRep-Setup-v0.7.0-x64.exe"))
        self.assertEqual(ods.release(p, "0.7.1", str(self.d / "onlytools.config.json")), 1)

    def test_release_todo_rejected(self):
        p = self.w("RN.md", GOOD_NOTES + "\nTODO\n")
        self.assertEqual(ods.release(p, "0.7.1", str(self.d / "onlytools.config.json")), 1)

    # ---- version ----
    def test_version_ok(self):
        self.assertEqual(ods.version_check("0.7.1", str(self.d / "package.json"), str(self.d / "src-tauri" / "tauri.conf.json")), 0)

    def test_version_mismatch_rejected(self):
        self.assertEqual(ods.version_check("0.7.2", str(self.d / "package.json"), str(self.d / "src-tauri" / "tauri.conf.json")), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
