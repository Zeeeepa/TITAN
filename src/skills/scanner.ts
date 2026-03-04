/**
 * TITAN — Skill Security Scanner
 * Scans skills downloaded from ClaWHub or any external source BEFORE installation.
 * Protects against: prompt injection payloads, malicious system calls,
 * data exfiltration, crypto miners, reverse shells, and supply-chain attacks.
 *
 * Nothing gets installed unless it passes all checks.
 *
 * Quarantine & auto-scan system inspired by openclaw-skill-scanner
 * by Jason Allen O'Neal (https://github.com/jason-allen-oneal/openclaw-skill-scanner)
 * Used with permission. Credit where credit is due.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'fs';
import { join, basename } from 'path';
import { TITAN_HOME } from '../utils/constants.js';
import logger from '../utils/logger.js';

const SCANNER_COMPONENT = 'SkillScanner';

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
    { rule: 'HARDCODED_IP', pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b(?!\/\d)/, description: 'Hardcoded IP address' },
    { rule: 'SPAWN_SHELL', pattern: /spawnSync?\s*\(\s*['"`](?:sh|bash|cmd|powershell)/i, description: 'Shell spawning — review manually' },
    { rule: 'NETWORK_REQUEST', pattern: /https?:\/\/(?!clawhub\.ai|npmjs\.com|github\.com)/i, description: 'Network request to unlisted domain' },
];

// ─── Scanner ──────────────────────────────────────────────────────

export function scanSkillCode(code: string, _filename = 'skill.ts'): ScanResult {
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
    const maxLineLength = lines.length > 0 ? Math.max(...lines.map((l) => l.length)) : 0;
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

// ─── Quarantine System ────────────────────────────────────────────
// Inspired by openclaw-skill-scanner by Jason Allen O'Neal
// https://github.com/jason-allen-oneal/openclaw-skill-scanner

const SKILLS_DIR = join(TITAN_HOME, 'skills');
const QUARANTINE_DIR = join(TITAN_HOME, 'skills-quarantine');

/**
 * Quarantine a skill by moving it from the skills directory to the quarantine directory.
 * The skill is renamed with a timestamp suffix to prevent conflicts.
 */
export function quarantineSkill(skillPath: string, reason: string): { quarantinedTo: string } {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const name = basename(skillPath);
    const dest = join(QUARANTINE_DIR, `${name}-${ts}`);

    if (!existsSync(QUARANTINE_DIR)) {
        mkdirSync(QUARANTINE_DIR, { recursive: true });
    }

    renameSync(skillPath, dest);
    logger.warn(SCANNER_COMPONENT, `Quarantined skill "${name}" → ${dest} (reason: ${reason})`);

    return { quarantinedTo: dest };
}

/**
 * Scan all user skills in the skills directory.
 * Returns a summary of findings per skill.
 * Optionally auto-quarantine skills with critical/high findings.
 *
 * @param autoQuarantine If true, automatically quarantine dangerous skills
 */
export function scanAllUserSkills(autoQuarantine = false): {
    scanned: number;
    safe: number;
    warned: number;
    blocked: number;
    quarantined: string[];
    results: Map<string, ScanResult>;
} {
    const results = new Map<string, ScanResult>();
    const quarantined: string[] = [];
    let safe = 0;
    let warned = 0;
    let blocked = 0;

    if (!existsSync(SKILLS_DIR)) {
        return { scanned: 0, safe: 0, warned: 0, blocked: 0, quarantined: [], results };
    }

    const entries = readdirSync(SKILLS_DIR);

    for (const entry of entries) {
        const entryPath = join(SKILLS_DIR, entry);
        const stat = statSync(entryPath);

        // Scan individual .js/.ts/.yaml/.yml files
        if (stat.isFile() && /\.(js|ts|yaml|yml)$/.test(entry)) {
            const code = readFileSync(entryPath, 'utf-8');
            const result = scanSkillCode(code, entry);
            results.set(entry, result);

            if (result.recommendation === 'block') {
                blocked++;
                if (autoQuarantine) {
                    try {
                        quarantineSkill(entryPath, 'Critical/High findings detected');
                        quarantined.push(entry);
                    } catch (e) {
                        logger.warn(SCANNER_COMPONENT, `Failed to quarantine "${entry}": ${(e as Error).message}`);
                    }
                }
            } else if (result.recommendation === 'warn') {
                warned++;
                if (autoQuarantine) {
                    try {
                        quarantineSkill(entryPath, 'High severity findings detected');
                        quarantined.push(entry);
                    } catch (e) {
                        logger.warn(SCANNER_COMPONENT, `Failed to quarantine "${entry}": ${(e as Error).message}`);
                    }
                }
            } else {
                safe++;
            }
        }

        // Scan skill directories (look for main entry files)
        if (stat.isDirectory()) {
            const mainFiles = ['index.ts', 'index.js', 'skill.ts', 'skill.js', 'main.ts', 'main.js'];
            for (const mf of mainFiles) {
                const mainPath = join(entryPath, mf);
                if (existsSync(mainPath)) {
                    const code = readFileSync(mainPath, 'utf-8');
                    const result = scanSkillCode(code, `${entry}/${mf}`);
                    results.set(entry, result);

                    if (result.recommendation === 'block') {
                        blocked++;
                        if (autoQuarantine) {
                            try {
                                quarantineSkill(entryPath, 'Critical/High findings in directory skill');
                                quarantined.push(entry);
                            } catch (e) {
                                logger.warn(SCANNER_COMPONENT, `Failed to quarantine "${entry}": ${(e as Error).message}`);
                            }
                        }
                    } else if (result.recommendation === 'warn') {
                        warned++;
                    } else {
                        safe++;
                    }
                    break;
                }
            }
        }
    }

    logger.info(SCANNER_COMPONENT,
        `Scan complete: ${results.size} skills scanned — ${safe} safe, ${warned} warned, ${blocked} blocked, ${quarantined.length} quarantined`);

    return { scanned: results.size, safe, warned, blocked, quarantined, results };
}

/**
 * Generate a markdown scan report for all user skills.
 */
export function generateScanReport(results: Map<string, ScanResult>): string {
    const lines: string[] = [
        '# TITAN Skill Security Scan Report',
        `**Date:** ${new Date().toISOString()}`,
        `**Skills Scanned:** ${results.size}`,
        '',
    ];

    for (const [name, result] of results) {
        const icon = result.recommendation === 'block' ? '🚫' : result.recommendation === 'warn' ? '⚠️' : '✅';
        lines.push(`## ${icon} ${name} (Score: ${result.score}/100)`);
        lines.push(`**Recommendation:** ${result.recommendation.toUpperCase()}`);

        if (result.findings.length > 0) {
            lines.push('');
            lines.push('| Severity | Rule | Description | Line |');
            lines.push('|----------|------|-------------|------|');
            for (const f of result.findings) {
                lines.push(`| ${f.severity.toUpperCase()} | ${f.rule} | ${f.description} | ${f.line || '-'} |`);
            }
        } else {
            lines.push('No findings — skill is clean.');
        }
        lines.push('');
    }

    return lines.join('\n');
}
