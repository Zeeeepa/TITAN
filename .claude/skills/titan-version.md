---
name: titan-version
description: TITAN version bump workflow. Updates version in all required files, creates changelog entry, builds, tests, and prepares for publish.
user_invocable: true
---

# TITAN Version Bump

Safely bump TITAN's version across all required files.

## Required Updates

When bumping the version, ALL of these must be updated:
1. `package.json` -> `"version"` field
2. `src/utils/constants.ts` -> `TITAN_VERSION` constant
3. `tests/core.test.ts` -> version assertion string
4. `tests/mission-control.test.ts` -> version references (4 occurrences)
5. `CHANGELOG.md` -> new entry at top

## Process

### 1. Determine Version
- **Patch** (x.y.Z): Bug fixes, minor UI tweaks
- **Minor** (x.Y.0): New features, new endpoints, new tools
- **Breaking** (X.0.0): Changed APIs, removed features, config schema changes

Use date-based format: `v2026.MM.P` (year.month.patch)

### 2. Update Files
Use Edit tool to update all 5 locations. Search for current version first:
```bash
grep -r "2026\." package.json src/utils/constants.ts tests/core.test.ts tests/mission-control.test.ts | head -10
```

### 3. Changelog Entry
Add to top of CHANGELOG.md:
```markdown
## vYYYY.MM.P — YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...
```

### 4. Build & Test
```bash
npm run build && npm run build:ui && npx vitest run
```

### 5. Publish (after user confirms)
```bash
npm publish
```

## Current Version
Check: `grep '"version"' package.json`
