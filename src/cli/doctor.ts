/**
 * TITAN — Doctor Diagnostic Tool
 * Checks system health, configuration, connectivity, and dependencies.
 */
import chalk from 'chalk';
import { existsSync } from 'fs';
import { loadConfig, configExists } from '../config/config.js';
import { TITAN_HOME, TITAN_CONFIG_PATH, TITAN_DB_PATH, TITAN_WORKSPACE, TITAN_VERSION } from '../utils/constants.js';
import { healthCheckAll } from '../providers/router.js';
import { auditSecurity } from '../security/sandbox.js';
import { getStallStats } from '../agent/stallDetector.js';
import logger from '../utils/logger.js';

interface CheckResult {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
}

export async function runDoctor(): Promise<void> {
    console.log(chalk.cyan(`\n🩺 TITAN Doctor v${TITAN_VERSION}\n`));
    console.log(chalk.gray('Running diagnostics...\n'));

    const checks: CheckResult[] = [];

    // 1. Node.js version
    const nodeVersion = process.versions.node;
    const [major] = nodeVersion.split('.').map(Number);
    checks.push({
        name: 'Node.js version',
        status: major >= 20 ? 'pass' : major >= 18 ? 'warn' : 'fail',
        message: `v${nodeVersion} ${major >= 20 ? '(recommended)' : major >= 18 ? '(minimum, upgrade recommended)' : '(too old, need >= 20)'}`,
    });

    // 2. TITAN home directory
    checks.push({
        name: 'TITAN home directory',
        status: existsSync(TITAN_HOME) ? 'pass' : 'warn',
        message: existsSync(TITAN_HOME) ? TITAN_HOME : `Not found: ${TITAN_HOME} (run: titan onboard)`,
    });

    // 3. Configuration file
    checks.push({
        name: 'Configuration file',
        status: configExists() ? 'pass' : 'warn',
        message: configExists() ? TITAN_CONFIG_PATH : `Not found (run: titan onboard)`,
    });

    // 4. Database
    checks.push({
        name: 'Database',
        status: existsSync(TITAN_DB_PATH) ? 'pass' : 'warn',
        message: existsSync(TITAN_DB_PATH) ? TITAN_DB_PATH : 'Not initialized (will be created on first use)',
    });

    // 5. Workspace
    checks.push({
        name: 'Workspace directory',
        status: existsSync(TITAN_WORKSPACE) ? 'pass' : 'warn',
        message: existsSync(TITAN_WORKSPACE) ? TITAN_WORKSPACE : `Not found (run: titan onboard)`,
    });

    // 6. AI Provider connectivity
    if (configExists()) {
        console.log(chalk.gray('  Checking AI providers...'));
        try {
            const providerHealth = await healthCheckAll();
            for (const [name, healthy] of Object.entries(providerHealth)) {
                checks.push({
                    name: `Provider: ${name}`,
                    status: healthy ? 'pass' : 'warn',
                    message: healthy ? 'Reachable' : 'Not configured or unreachable',
                });
            }
        } catch (error) {
            checks.push({
                name: 'AI Providers',
                status: 'warn',
                message: `Could not check: ${(error as Error).message}`,
            });
        }
    }

    // 7. Configuration validation
    if (configExists()) {
        try {
            const config = loadConfig();
            checks.push({
                name: 'Config validation',
                status: 'pass',
                message: `Model: ${config.agent.model}`,
            });

            // Check channel configuration
            for (const [channelName, channelConfig] of Object.entries(config.channels)) {
                if (channelConfig.enabled) {
                    const hasToken = !!(channelConfig.token || channelConfig.apiKey);
                    checks.push({
                        name: `Channel: ${channelName}`,
                        status: hasToken ? 'pass' : 'fail',
                        message: hasToken ? 'Configured' : 'Enabled but no token set',
                    });
                }
            }
        } catch (error) {
            checks.push({
                name: 'Config validation',
                status: 'fail',
                message: (error as Error).message,
            });
        }
    }

    // 8. Security audit
    if (configExists()) {
        const securityIssues = auditSecurity();
        for (const issue of securityIssues) {
            checks.push({
                name: 'Security',
                status: issue.level === 'error' ? 'fail' : issue.level === 'warn' ? 'warn' : 'pass',
                message: issue.message,
            });
        }
    }

    // 9. Disk space
    try {
        const { execSync } = await import('child_process');
        const dfOutput = execSync('df -h / | tail -1', { encoding: 'utf-8' });
        const parts = dfOutput.trim().split(/\s+/);
        const available = parts[3];
        const usePercent = parseInt(parts[4], 10);
        checks.push({
            name: 'Disk space',
            status: usePercent < 90 ? 'pass' : usePercent < 95 ? 'warn' : 'fail',
            message: `${available} available (${parts[4]} used)`,
        });
    } catch {
        checks.push({ name: 'Disk space', status: 'warn', message: 'Could not check' });
    }

    // 10. Memory
    const memUsage = process.memoryUsage();
    const rssGB = (memUsage.rss / 1024 / 1024).toFixed(1);
    checks.push({
        name: 'Memory usage',
        status: 'pass',
        message: `${rssGB} MB RSS`,
    });

    // 11. Stall Detector Status
    const stallStatus = getStallStats();
    let stallStatusLevel: 'pass' | 'warn' | 'fail' = 'pass';
    let stallMessage = 'Healthy (0 active stalls)';

    // getStallStats returns an array of session stats
    const activeStalls = stallStatus.length;
    if (activeStalls > 0) {
        stallStatusLevel = activeStalls > 2 ? 'fail' : 'warn';
        stallMessage = `Detected ${activeStalls} stuck sessions.`;
    }
    checks.push({
        name: 'Agent Stall Status',
        status: stallStatusLevel,
        message: stallMessage,
    });

    // Print results
    console.log('');
    const statusIcons = { pass: chalk.green('✅'), warn: chalk.yellow('⚠️ '), fail: chalk.red('❌') };
    for (const check of checks) {
        console.log(`  ${statusIcons[check.status]} ${chalk.white(check.name)}: ${chalk.gray(check.message)}`);
    }

    const passCount = checks.filter((c) => c.status === 'pass').length;
    const warnCount = checks.filter((c) => c.status === 'warn').length;
    const failCount = checks.filter((c) => c.status === 'fail').length;

    console.log(`\n  ${chalk.green(`${passCount} passed`)} | ${chalk.yellow(`${warnCount} warnings`)} | ${chalk.red(`${failCount} failed`)}`);

    if (failCount > 0) {
        console.log(chalk.red('\n  ⚠️  Some checks failed. Run `titan onboard` to fix common issues.\n'));
    } else if (warnCount > 0) {
        console.log(chalk.yellow('\n  ℹ️  Some warnings found. Review the items above.\n'));
    } else {
        console.log(chalk.green('\n  🎉 All checks passed! TITAN is healthy.\n'));
    }
}
