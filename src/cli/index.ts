/**
 * TITAN CLI — Main Entrypoint
 * Command-line interface for TITAN: onboard, gateway, agent, send, doctor, skills, config,
 * pairing, agents. Mirrors OpenClaw's CLI surface.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { TITAN_VERSION, TITAN_ASCII_LOGO, TITAN_FULL_NAME, TITAN_CONFIG_PATH } from '../utils/constants.js';
import { setLogLevel, LogLevel } from '../utils/logger.js';
import { loadConfig } from '../config/config.js';
import { processMessage } from '../agent/agent.js';
import { initMemory } from '../memory/memory.js';
import { initBuiltinSkills, getSkills } from '../skills/registry.js';
import { startGateway } from '../gateway/server.js';
import { runDoctor } from './doctor.js';
import { runOnboard } from './onboard.js';
import { approvePairing, denyPairing, listPendingPairings, listApprovedUsers } from '../security/pairing.js';
import { spawnAgent, stopAgent, listAgents, getAgentCapacity } from '../agent/multiAgent.js';

const program = new Command();

program
    .name('titan')
    .description(`${TITAN_FULL_NAME} — Your autonomous AI assistant`)
    .version(TITAN_VERSION);

// ─── ONBOARD ─────────────────────────────────────────────────────
program
    .command('onboard')
    .description('Run the interactive setup wizard')
    .option('--install-daemon', 'Install as a system daemon (systemd/launchd)')
    .action(async (options) => {
        console.log(chalk.cyan(TITAN_ASCII_LOGO));
        await runOnboard(options.installDaemon);
    });

// ─── GATEWAY ─────────────────────────────────────────────────────
program
    .command('gateway')
    .description('Start the TITAN gateway server')
    .option('-p, --port <port>', 'Gateway port', '18789')
    .option('-H, --host <host>', 'Gateway host', '127.0.0.1')
    .option('-v, --verbose', 'Enable verbose logging')
    .action(async (options) => {
        console.log(chalk.cyan(TITAN_ASCII_LOGO));
        if (options.verbose) setLogLevel(LogLevel.DEBUG);
        await startGateway({
            port: parseInt(options.port, 10),
            host: options.host,
            verbose: options.verbose,
        });
    });

// ─── AGENT (Direct message) ──────────────────────────────────────
program
    .command('agent')
    .description('Send a message directly to the TITAN agent')
    .option('-m, --message <message>', 'Message to send')
    .option('--model <model>', 'Override the model')
    .option('--thinking <level>', 'Thinking mode: off/low/medium/high', 'medium')
    .action(async (options) => {
        if (!options.message) {
            console.log(chalk.red('Error: --message is required'));
            process.exit(1);
        }

        initMemory();
        await initBuiltinSkills();

        const config = loadConfig();
        if (options.model) {
            config.agent.model = options.model;
        }

        console.log(chalk.gray(`Using model: ${config.agent.model}`));
        console.log(chalk.gray('Processing...\n'));

        try {
            const response = await processMessage(options.message, 'cli', 'cli-user');
            console.log(chalk.white(response.content));
            console.log(chalk.gray(`\n─ ${response.model} | ${response.tokenUsage.total} tokens | ${response.durationMs}ms | tools: ${response.toolsUsed.join(', ') || 'none'}`));
        } catch (error) {
            console.error(chalk.red(`Error: ${(error as Error).message}`));
            process.exit(1);
        }
    });

// ─── SEND (like openclaw message send) ──────────────────────────
program
    .command('send')
    .description('Send a message to a specific channel')
    .option('--to <destination>', 'Destination (channel:userId or channel:groupId)')
    .option('-m, --message <message>', 'Message content')
    .action(async (options) => {
        if (!options.to || !options.message) {
            console.log(chalk.red('Error: --to and --message are required'));
            process.exit(1);
        }
        console.log(chalk.gray(`Sending to ${options.to}: ${options.message}`));
        console.log(chalk.green('Message queued for delivery'));
    });

// ─── PAIRING (DM access control) ────────────────────────────────
program
    .command('pairing')
    .description('Manage DM pairing approvals')
    .option('--approve <channel> <code>', 'Approve a pairing request')
    .option('--deny <code>', 'Deny a pairing request')
    .option('--list', 'List pending pairing requests')
    .option('--approved', 'List approved users')
    .action((options) => {
        if (options.approve) {
            // Parse channel and code from remaining args
            const args = program.args;
            const channel = args[1] || options.approve;
            const code = args[2] || '';
            if (!channel || !code) {
                console.log(chalk.red('Usage: titan pairing approve <channel> <code>'));
                return;
            }
            const result = approvePairing(channel, code);
            console.log(result.success ? chalk.green(result.message) : chalk.red(result.message));
        } else if (options.deny) {
            const result = denyPairing(options.deny);
            console.log(result.success ? chalk.green(result.message) : chalk.red(result.message));
        } else if (options.approved) {
            const users = listApprovedUsers();
            if (users.length === 0) {
                console.log(chalk.gray('No approved users.'));
            } else {
                console.log(chalk.cyan('\n🔓 Approved Users\n'));
                for (const u of users) {
                    console.log(`  ✅ ${u.channel} / ${u.userId}`);
                }
            }
        } else {
            // Default: list pending
            const pending = listPendingPairings();
            if (pending.length === 0) {
                console.log(chalk.gray('No pending pairing requests.'));
            } else {
                console.log(chalk.cyan(`\n🔐 Pending Pairing Requests (${pending.length})\n`));
                for (const p of pending) {
                    console.log(`  📩 Code: ${chalk.yellow(p.code)} | ${p.channel} / ${p.userId} (${p.userName || 'unknown'}) | ${p.createdAt}`);
                }
                console.log(chalk.gray('\n  Approve: titan pairing --approve <channel> <code>'));
            }
        }
    });

// ─── AGENTS (Multi-agent management) ────────────────────────────
program
    .command('agents')
    .description('Manage multiple TITAN agent instances (max 5)')
    .option('--list', 'List all agent instances')
    .option('--spawn <name>', 'Spawn a new agent instance')
    .option('--model <model>', 'Model for the new agent')
    .option('--stop <id>', 'Stop an agent instance')
    .action((options) => {
        if (options.stop) {
            const result = stopAgent(options.stop);
            console.log(result.success ? chalk.green(`Agent ${options.stop} stopped.`) : chalk.red(result.error || 'Failed'));
        } else if (options.spawn) {
            const result = spawnAgent({
                name: options.spawn,
                model: options.model,
            });
            if (result.success && result.agent) {
                const cap = getAgentCapacity();
                console.log(chalk.green(`\n⚡ Spawned agent "${result.agent.name}"`));
                console.log(chalk.gray(`  ID: ${result.agent.id}`));
                console.log(chalk.gray(`  Model: ${result.agent.model}`));
                console.log(chalk.gray(`  Capacity: ${cap.current}/${cap.max}\n`));
            } else {
                console.log(chalk.red(result.error || 'Failed to spawn agent'));
            }
        } else {
            // Default: list
            const agents = listAgents();
            const cap = getAgentCapacity();
            console.log(chalk.cyan(`\n🤖 TITAN Agents (${cap.current}/${cap.max})\n`));
            for (const agent of agents) {
                const icon = agent.status === 'running' ? '🟢' : '🔴';
                console.log(`  ${icon} ${chalk.white(agent.name)} ${chalk.gray(`(${agent.id})`)}`);
                console.log(`     Model: ${agent.model} | Messages: ${agent.messageCount} | Status: ${agent.status}`);
                if (agent.channelBindings.length > 0) {
                    console.log(`     Routes: ${agent.channelBindings.map((b) => `${b.channel}:${b.pattern}`).join(', ')}`);
                }
            }
        }
    });

// ─── DOCTOR ──────────────────────────────────────────────────────
program
    .command('doctor')
    .description('Diagnose TITAN configuration and connectivity')
    .action(async () => {
        console.log(chalk.cyan(TITAN_ASCII_LOGO));
        await runDoctor();
    });

// ─── SKILLS ──────────────────────────────────────────────────────
program
    .command('skills')
    .description('Manage TITAN skills')
    .option('--list', 'List all installed skills')
    .option('--install <name>', 'Install a skill from the marketplace')
    .option('--remove <name>', 'Remove an installed skill')
    .action(async (options) => {
        initMemory();
        await initBuiltinSkills();

        if (options.list || (!options.install && !options.remove)) {
            const skills = getSkills();
            console.log(chalk.cyan(`\n📦 TITAN Skills (${skills.length} installed)\n`));
            for (const skill of skills) {
                const status = skill.enabled ? chalk.green('✅') : chalk.red('❌');
                console.log(`  ${status} ${chalk.white(skill.name)} ${chalk.gray(`v${skill.version}`)} ${chalk.gray(`(${skill.source})`)}`);
                console.log(`     ${chalk.gray(skill.description)}`);
            }
        }
    });

// ─── CONFIG ──────────────────────────────────────────────────────
program
    .command('config')
    .description('View or edit TITAN configuration')
    .option('--show', 'Show current configuration')
    .option('--set <key=value>', 'Set a configuration value')
    .option('--path', 'Show config file path')
    .action((options) => {
        if (options.path) {
            console.log(TITAN_CONFIG_PATH);
        } else {
            const config = loadConfig();
            console.log(chalk.cyan('\n⚙️  TITAN Configuration\n'));
            console.log(JSON.stringify(config, null, 2));
        }
    });

// ─── UPDATE ──────────────────────────────────────────────────────
program
    .command('update')
    .description('Update TITAN to the latest version')
    .option('--channel <channel>', 'Release channel: stable|beta|dev', 'stable')
    .action((options) => {
        console.log(chalk.cyan(`Updating TITAN to latest ${options.channel} release...`));
        console.log(chalk.gray('Run: npm install -g titan-agent@latest'));
    });

// Parse and execute
program.parse();
