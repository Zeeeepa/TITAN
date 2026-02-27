/**
 * TITAN — Skill Security Scanner
 * Scans skills downloaded from ClaWHub or any external source BEFORE installation.
 * Protects against: prompt injection payloads, malicious system calls,
 * data exfiltration, crypto miners, reverse shells, and supply-chain attacks.
 * 
 * Nothing gets installed unless it passes all checks.
 */

export interface ScanResult {
    safe: boolean;
    score: number;         // 0–100, higher = safer
    findings: ScanFinding[];
    recommendation: 'approve' | 'warn' | 'block';
}

export interface ScanFinding {
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    rule: string;
    description: string;
    line?: number;
    snippet?: string;
}

// ─── Detection Rules ──────────────────────────────────────────────

const CRITICAL_PATTERNS: { rule: string; pattern: RegExp; description: string }[] = [
    // Reverse shells
    { rule: 'REVERSE_SHELL', pattern: /bash\s+-i\s+>&\s*\/dev\/tcp/i, description: 'Reverse shell detected (bash TCP redirect)' },
    { rule: 'REVERSE_SHELL', pattern: /nc\s+-e\s+\S+\s+\d{1,5}/i, description: 'Reverse shell detected (netcat -e)' },
    { rule: 'REVERSE_SHELL', pattern: /python.*socket.*connect.*subprocess/is, description: 'Python reverse shell pattern' },
    // Crypto miners
    { rule: 'CRYPTO_MINER', pattern: /stratum\+tcp:\/\//i, description: 'Crypto mining pool connection' },
    { rule: 'CRYPTO_MINER', pattern: /xmrig|cpuminer|minerd/i, description: 'Known crypto miner binary reference' },
    // Credential theft
    { rule: 'CREDENTIAL_THEFT', pattern: /\.ssh\/id_rsa|\.ssh\/authorized_keys/i, description: 'SSH key access attempt' },
    { rule: 'CREDENTIAL_THEFT', pattern: /\/etc\/shadow|\/etc\/passwd/i, description: 'System credential file access' },
    { rule: 'CREDENTIAL_THEFT', pattern: /process\.env\.[A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS)[A-Z_]*/i, description: 'Bulk environment variable harvesting' },
    // Filesystem destruction
    { rule: 'DESTRUCTIVE_OP', pattern: /rm\s+-rf\s+\//i, description: 'Recursive root filesystem deletion' },
    { rule: 'DESTRUCTIVE_OP', pattern: /mkfs\.|dd\s+if=\/dev\/zero/i, description: 'Disk wipe operation' },
    // Exfiltration
    { rule: 'EXFILTRATION', pattern: /curl\s+.*-d\s+.*process\.env/i, description: 'Environment variable exfiltration via curl' },
    { rule: 'EXFILTRATION', pattern: /fetch\([^)]+\)\s*\{[^}]*env\b/i, description: 'Possible environment variable exfiltration' },
];

const HIGH_PATTERNS: { rule: string; pattern: RegExp; description: string }[] = [
    // Obfuscation
    { rule: 'OBFUSCATION', pattern: /eval\s*\(\s*(?:Buffer\.from|atob|decodeURIComponent)\s*\(/i, description: 'Encoded eval() — obfuscated code execution' },
    { rule: 'OBFUSCATION', pattern: /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){8,}/i, description: 'Heavy hex encoding — possible obfuscation' },
    // Dangerous child_process usage
    { rule: 'DANGEROUS_EXEC', pattern: /child_process.*exec\(.*\$\{/i, description: 'Unsanitized interpolation in exec() call' },
    { rule: 'DANGEROUS_EXEC', pattern: /execSync\([`'"]\s*\$\{/i, description: 'Template literal injection risk in execSync' },
    // Network pivoting
    { rule: 'NETWORK_PIVOT', pattern: /new\s+WebSocket\(['"`](?!wss?:\/\/localhost)/i, description: 'WebSocket to non-local host — possible C2' },
    { rule: 'NETWORK_PIVOT', pattern: /http:\/\/(?!\d{1,3}\.\d{1,3}\.)\S+\/payload/i, description: 'Remote payload download detected' },
    // Privilege escalation
    { rule: 'PRIVESC', pattern: /sudo\s+-S\s+\w/i, description: 'Piped sudo password escalation' },
    { rule: 'PRIVESC', pattern: /chmod\s+(?:[0-7]*7[0-7]{2}|a\+s)/i, description: 'Suspicious chmod / setuid operation' },
];

const MEDIUM_PATTERNS: { rule: string; pattern: RegExp; description: string }[] = [
    // Prompt injection attempts in skill description/prompts
    { rule: 'PROMPT_INJECTION', pattern: /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i, description: 'Prompt injection phrase: ignore previous instructions' },
    { rule: 'PROMPT_INJECTION', pattern: /disregard\s+(?:your\s+)?(?:system|prior)\s+(?:prompt|instructions)/i, description: 'Prompt injection phrase: disregard system prompt' },
    { rule: 'PROMPT_INJECTION', pattern: /you\s+are\s+now\s+(?:DAN|jailbroken|unrestricted)/i, description: 'Jailbreak persona injection' },
    { rule: 'PROMPT_INJECTION', pattern: /\[SYSTEM\]|\[INST\]|\[\/INST\]/i, description: 'LLM instruction tag injection' },
    // Suspicious data collection
    { rule: 'DATA_COLLECTION', pattern: /localStorage|sessionStorage/i, description: 'Browser storage access (unusual in a CLI skill)' },
    { rule: 'DATA_COLLECTION', pattern: /\.history\b|\.bash_history/i, description: 'Shell history file access' },
    // Dynamic imports from untrusted URLs
    { rule: 'DYNAMIC_IMPORT', pattern: /import\([`'"](https?:\/\/)/i, description: 'Dynamic import from remote URL' },
    { rule: 'DYNAMIC_IMPORT', pattern: /require\([`'"](https?:\/\/)/i, description: 'Remote require() call' },
];

const LOW_PATTERNS: { rule: string; pattern: RegExp; description: string }[] = [
    { rule: 'HARDCODED_IP', pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b(?!(?:\/\d+)?)/, description: 'Hardcoded IP address' },
    { rule: 'SPAWN_SHELL', pattern: /spawnSync?\s*\(\s*['"`](?:sh|bash|cmd|powershell)/i, description: 'Shell spawning — review manually' },
    { rule: 'NETWORK_REQUEST', pattern: /https?:\/\/(?!clawhub\.ai|npmjs\.com|github\.com)/i, description: 'Network request to unlisted domain' },
];

// ─── Scanner ──────────────────────────────────────────────────────

export function scanSkillCode(code: string, filename = 'skill.ts'): ScanResult {
    const findings: ScanFinding[] = [];
    const lines = code.split('\n');

    function check(
        patterns: { rule: string; pattern: RegExp; description: string }[],
        severity: ScanFinding['severity'],
    ) {
        for (const { rule, pattern, description } of patterns) {
            for (let i = 0; i < lines.length; i++) {
                if (pattern.test(lines[i])) {
                    findings.push({
                        severity,
                        rule,
                        description,
                        line: i + 1,
                        snippet: lines[i].trim().slice(0, 100),
                    });
                    break; // one finding per rule
                }
            }
        }
    }

    check(CRITICAL_PATTERNS, 'critical');
    check(HIGH_PATTERNS, 'high');
    check(MEDIUM_PATTERNS, 'medium');
    check(LOW_PATTERNS, 'low');

    // Additional check: code length (minified/obfuscated code often has very long lines)
    const maxLineLength = Math.max(...lines.map((l) => l.length));
    if (maxLineLength > 2000) {
        findings.push({
            severity: 'high',
            rule: 'MINIFIED_CODE',
            description: `Very long lines detected (max ${maxLineLength} chars) — possible obfuscated/minified code`,
        });
    }

    // Score: start at 100, deduct per severity
    const deductions = { critical: 100, high: 30, medium: 10, low: 3, info: 0 };
    const score = Math.max(0, 100 - findings.reduce((acc, f) => acc + deductions[f.severity], 0));

    const hasCritical = findings.some((f) => f.severity === 'critical');
    const hasHigh = findings.some((f) => f.severity === 'high');

    return {
        safe: !hasCritical && !hasHigh,
        score,
        findings,
        recommendation: hasCritical ? 'block' : hasHigh ? 'warn' : 'approve',
    };
}

/** Format a scan result for CLI display */
export function formatScanResult(result: ScanResult, name: string): string {
    const icon = result.recommendation === 'block' ? '🚫' : result.recommendation === 'warn' ? '⚠️' : '✅';
    const lines: string[] = [
        `\n${icon}  Security Scan: ${name}  (Score: ${result.score}/100)`,
        '─'.repeat(50),
    ];
    if (result.findings.length === 0) {
        lines.push('  No issues found. Skill is safe to install.');
    } else {
        for (const f of result.findings) {
            const sev = f.severity.toUpperCase().padEnd(8);
            lines.push(`  [${sev}] ${f.rule}: ${f.description}`);
            if (f.line) lines.push(`           Line ${f.line}: ${f.snippet}`);
        }
    }
    lines.push('─'.repeat(50));
    lines.push(
        result.recommendation === 'block'
            ? '  ❌ BLOCKED — This skill contains critical security risks and cannot be installed.'
            : result.recommendation === 'warn'
                ? '  ⚠️  WARNING — Review the findings above before deciding to install.'
                : '  ✅ APPROVED — Skill passed security scan and is safe to install.',
    );
    return lines.join('\n');
}
