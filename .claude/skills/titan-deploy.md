---
name: titan-deploy
description: Build and deploy TITAN UI to Titan PC. Builds the React SPA, syncs to the remote server, and verifies the deployment.
user_invocable: true
---

# TITAN Deploy to Titan PC

Build and deploy the Mission Control v2 UI to Titan PC.

## Steps

### 1. Build UI
```bash
cd /Users/michaelelliott/Desktop/TitanBot/TITAN-main/ui && npm run build
```

If build fails, diagnose and fix before proceeding.

### 2. Deploy via rsync
```bash
rsync -az --delete /Users/michaelelliott/Desktop/TitanBot/TITAN-main/ui/dist/ titan:/opt/TITAN/ui/dist/
```

### 3. Verify deployment
```bash
curl -s http://192.168.1.11:48420/api/health | head -1
```

Confirm the health endpoint responds. If the gateway needs restart:
```bash
ssh titan "cd /opt/TITAN && node dist/cli/index.js gateway > /tmp/titan-gateway.log 2>&1 &"
```

### 4. Report
- Build: PASS/FAIL
- Deploy: synced X files
- Health: OK/ERROR
- Dashboard URL: http://192.168.1.11:48420
