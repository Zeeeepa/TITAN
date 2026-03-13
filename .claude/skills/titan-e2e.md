---
name: titan-e2e
description: End-to-end feature verification for TITAN. Tests a feature from UI through API to backend and back, ensuring the full pipeline works.
user_invocable: true
---

# TITAN End-to-End Feature Verification

Verify a feature works through the entire stack.

## Process

### 1. Identify Test Scope
Determine what needs testing based on the feature. Common flows:
- **Chat**: UI input -> API POST -> agent -> LLM -> SSE stream -> UI display
- **Settings**: UI form -> API POST config -> backend apply -> UI reflect
- **Voice**: LiveKit token -> WebRTC connect -> STT -> agent -> TTS -> audio
- **Memory Graph**: API graphiti -> canvas render -> interaction
- **Mesh**: mDNS discovery -> peer approval -> routing

### 2. API Layer Test
Test the backend API directly via curl:
```bash
# Replace with the specific endpoint
curl -s http://192.168.1.11:48420/api/<endpoint> | python3 -m json.tool
```

Verify:
- Response status (200, 400, 404, 500)
- Response shape matches `ui/src/api/types.ts`
- Required fields present

### 3. UI Client Test
Check that `ui/src/api/client.ts` correctly:
- Sends the right request body field names
- Transforms the response if needed
- Handles errors

### 4. Component Test
Verify the React component:
- Fetches data via the client function
- Renders the data correctly
- Handles loading/error/empty states
- Interactive elements work (buttons, forms, etc.)

### 5. Integration Test
Use the dev server or deployed instance:
- Perform the user action in the UI
- Verify the expected outcome
- Check browser console for errors
- Check network tab for failed requests

### 6. Report
```
Feature: <name>
API: PASS/FAIL (endpoint, status, response shape)
Client: PASS/FAIL (field mapping, transforms)
Component: PASS/FAIL (rendering, interaction)
E2E: PASS/FAIL (user flow works end-to-end)
Issues Found: <list or "none">
```
