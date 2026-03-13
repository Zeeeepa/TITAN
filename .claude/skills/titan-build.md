---
name: titan-build
description: Full TITAN build pipeline — TypeScript backend + React UI, with error diagnosis. Run after code changes to validate everything compiles.
user_invocable: true
---

# TITAN Build Pipeline

Execute the full TITAN build pipeline and diagnose any errors.

## Steps

### 1. Backend Build
Run `npm run build` from the project root (`/Users/michaelelliott/Desktop/TitanBot/TITAN-main/`).

If build fails:
- Read the exact error messages
- Identify the failing file(s) and line number(s)
- Common issues: missing `.js` extension on imports (ESM), stale types, missing exports
- Fix the root cause, not symptoms
- Rebuild to verify

### 2. UI Build
Run `npm run build` from `ui/` directory.

If build fails:
- Check for TypeScript errors in `ui/src/`
- Common issues: wrong import paths, missing type exports from `ui/src/api/types.ts`, Tailwind class errors
- Fix and rebuild

### 3. Report
Report concise summary:
- Backend: PASS/FAIL (error count if failed)
- UI: PASS/FAIL (error count if failed)
- If both pass, note the built asset sizes from UI build output
