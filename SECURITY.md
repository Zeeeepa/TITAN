# Security Policy

## Supported Versions

| Version    | Supported |
| ---------- | --------- |
| 2026.5.x   | Yes       |
| < 2026.5.0 | No        |

## Reporting a Vulnerability

If you discover a security vulnerability in TITAN, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, email **security@titanagent.dev** or use [GitHub's private vulnerability reporting](https://github.com/Djtony707/TITAN/security/advisories/new).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact

### What to expect

- Acknowledgment within 48 hours
- Status update within 7 days
- Fix timeline based on severity:
  - **Critical**: Patch within 72 hours
  - **High**: Patch within 1 week
  - **Medium**: Patch in next release
  - **Low**: Tracked for future release

## Security Architecture

TITAN uses a defense-in-depth approach:

- **Sandbox Mode**: Restricts tool execution (host, docker, or none)
- **Shield**: Prompt injection detection (standard and strict modes)
- **Network Allowlist**: Controls outbound connections
- **Vault**: Encrypted secrets storage (AES-256-GCM)
- **Audit Log**: Tamper-evident logging of all tool invocations
- **Auth**: Token or password authentication for the gateway

## Responsible Disclosure

We follow coordinated disclosure. We will credit reporters in the changelog unless anonymity is requested.
