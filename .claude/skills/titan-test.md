---
name: titan-test
description: Run TITAN test suite (vitest). Supports full suite, specific files, or pattern matching. Diagnoses failures automatically.
user_invocable: true
---

# TITAN Test Runner

Run the TITAN test suite and diagnose failures.

## Usage

If user specifies a file or pattern, run that. Otherwise run the full suite.

## Steps

### 1. Run Tests
From project root `/Users/michaelelliott/Desktop/TitanBot/TITAN-main/`:

```bash
# Full suite
npx vitest run

# Specific file
npx vitest run tests/<filename>.test.ts

# Pattern match
npx vitest run --reporter=verbose tests/<pattern>*
```

### 2. Analyze Failures
For each failure:
1. Read the test to understand what it expects
2. Read the source code being tested
3. Classify: **regression** (code changed), **stale test** (test needs update), or **real bug**
4. For regressions and real bugs, fix the source code
5. For stale tests, update the test assertions

### 3. Re-run
After fixes, re-run only the previously failing tests to verify.

### 4. Report
- Total: X tests across Y files
- Passed: X
- Failed: X (with brief description of each failure and fix applied)
- Duration: Xs

## Key Facts
- Framework: vitest
- Test dir: `tests/`
- Config: `vitest.config.ts`
- Tests use heavy `vi.mock()` patterns
- Timeout: 30s per test
- Current count: ~3,591 tests across 108 files
