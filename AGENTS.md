# ONLYTOOLS AI Engineering Instructions

This is the canonical instruction file. Read it and `onlytools.config.json` before making changes.

## Before work
1. Inspect README, CHANGELOG, config, source, build scripts, tests, current version and latest tag.
2. Establish what is implemented, experimental, planned, or unknown.
3. Give a concise plan before broad changes.
4. Ask before destructive changes, data migration, security-sensitive changes, or public release.

## Truth and evidence
- Describe only behavior supported by code or verified documentation.
- Never invent features, Windows compatibility, architectures, performance figures, privacy claims, downloads, test results, sizes, or hashes.
- Mark unknown facts `TODO` / `待确认`.
- Report commands actually run and their real outcomes. Never claim skipped tests passed.
- Do not silently change licenses, data formats, network behavior, update mechanisms, or security posture.

## Engineering
Inspect the existing architecture, make scoped changes, add/update tests, run relevant tests/lint/type checks/builds, and update user documentation when behavior changes. Avoid unrelated refactors and unnecessary dependencies.

## README
Normally include: product identity, overview, verified features, real screenshots, verified Windows requirements, installation, quick start, data/privacy/network behavior, downloads, FAQ, support, license, and legacy-name history where applicable.

## CHANGELOG
Follow Keep a Changelog categories: Added, Changed, Deprecated, Removed, Fixed, Security. Keep newest first and include Unreleased.

## Release
- Use SemVer; stable tag `vMAJOR.MINOR.PATCH`.
- Release title: `<ProductName> vX.Y.Z`.
- Explain user-visible changes, compatibility, breaking changes/migration, known issues, exact assets, and verification.
- Build assets must be real outputs. Calculate SHA-256 from actual files.
- Preserve old tags and historical Release assets.
- Verify Windows versions, architectures, runtime dependencies, installer/portable behavior, elevation, upgrade, and uninstall rather than assuming.

## Authorization
AI may prepare code, docs, builds, and draft notes. Do not publish a public Release, push a release tag, overwrite assets, or deploy production without explicit user approval.

## Completion report
Report completed work, changed files, exact commands/results, skipped checks, risks, and (for release tasks) proposed version/tag/title/assets/hashes/remaining approvals.
