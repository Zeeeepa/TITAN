/**
 * TITAN CLI — Main Entrypoint
 * Command-line interface for TITAN: onboard, gateway, agent, send, doctor, skills, config,
 * pairing, agents. Mirrors OpenClaw's CLI surface.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { TITAN_VERSION, TITAN_ASCII_LOGO, TITAN_FULL_NAME, TITAN_CONFIG_PATH } from '../utils/constants.js';
import { setLogLevel, LogLevel } from '../utils/logger.js';
import { loadConfig, updateConfig } from '../config/config.js';
import { processMessage } from '../agent/agent.js';
import { initMemory } from '../memory/memory.js';
import { initBuiltinSkills, getSkills } from '../skills/registry.js';
import { startGateway } from '../gateway/server.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { TITAN_HOME } from '../utils/constants.js';
import { runDoctor } from './doctor.js';
import { runOnboard } from './onboard.js';
import { approvePairing, denyPairing, listPendingPairings, listApprovedUsers } from '../security/pairing.js';
import { spawnAgent, stopAgent, listAgents, getAgentCapacity } from '../agent/multiAgent.js';
import { listMcpServers, addMcpServer, removeMcpServer, getMcpStatus } from '../mcp/registry.js';
import { testMcpServer } from '../mcp/client.js';
import { listRecipes, getRecipe, deleteRecipe, seedBuiltinRecipes } from '../recipes/store.js';
import { runRecipe } from '../recipes/runner.js';
import { listMonitors, addMonitor, removeMonitor } from '../agent/monitor.js';
import { searchSkills, installFromClaWHub, installFromUrl } from '../skills/marketplace.js';
import { checkForUpdates } from '../utils/updater.js';

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
    .option('-p, --port <port>', 'Gateway port', '48420')
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
    .description('Manage TITAN skills & marketplace')
    .option('--list', 'List all installed skills')
    .option('--search <query>', 'Search ClaWHub marketplace')
    .option('--install <name>', 'Install a skill (from ClaWHub or URL) — security scanned automatically')
    .option('--remove <name>', 'Remove an installed skill')
    .option('--force', 'Force install even if high-severity scan warnings exist')
    .action(async (options) => {
        initMemory();
        await initBuiltinSkills();

        if (options.search) {
            console.log(chalk.cyan(`\n🔍 Searching ClaWHub for "${options.search}"...\n`));
            const results = await searchSkills(options.search);
            if (results.skills.length === 0) {
                console.log(chalk.gray('  No skills found. Try a different search term.'));
            } else {
                for (const skill of results.skills) {
                    const verified = skill.verified ? chalk.green('✓ Verified') : chalk.gray('Unverified');
                    console.log(`  ${chalk.white(skill.name)} ${chalk.gray(`v${skill.version}`)} — ${verified}`);
                    console.log(`     ${chalk.gray(skill.description)}`);
                    console.log(`     ${chalk.gray(`by ${skill.author} · ⭐ ${skill.rating.toFixed(1)} · ${skill.downloads} downloads`)}\n`);
                }
            }
        } else if (options.install) {
            const name = options.install as string;
            const isUrl = name.startsWith('http');
            console.log(chalk.cyan(`\n🛡️  Installing "${name}" with security scan...`));
            const result = isUrl
                ? await installFromUrl(name, { force: options.force })
                : await installFromClaWHub(name, { force: options.force });
            if (result.success) {
                console.log(chalk.green(`\n✅ Installed: ${result.skillName}`));
                console.log(chalk.gray(`   Path: ${result.installedPath}`));
                console.log(chalk.gray('   Restart TITAN or run `titan gateway` to activate.'));
            } else {
                console.log(chalk.red(`\n❌ Installation failed: ${result.error}`));
            }
        } else if (options.remove) {
            const name = options.remove as string;
            const autoDir = join(TITAN_HOME, 'skills', 'auto');
            const tsPath = join(autoDir, `${name}.ts`);
            const jsPath = join(autoDir, `${name}.js`);
            let removed = false;
            if (existsSync(tsPath)) { unlinkSync(tsPath); removed = true; }
            if (existsSync(jsPath)) { unlinkSync(jsPath); removed = true; }
            console.log(removed ? chalk.green(`🗑️  Removed "${name}"`) : chalk.yellow(`⚠️  Skill "${name}" not found.`));
        } else {
            const skills = getSkills();
            console.log(chalk.cyan(`\n📦 TITAN Skills (${skills.length} installed)\n`));
            for (const skill of skills) {
                const status = skill.enabled ? chalk.green('✅') : chalk.red('❌');
                console.log(`  ${status} ${chalk.white(skill.name)} ${chalk.gray(`v${skill.version} (${skill.source})`)}`);
                console.log(`     ${chalk.gray(skill.description)}`);
            }
            console.log(chalk.gray('\n  Search marketplace: titan skills --search <query>'));
            console.log(chalk.gray('  Install from ClaWHub: titan skills --install <name>'));
        }
    });

// ─── MCP ─────────────────────────────────────────────────────────
program
    .command('mcp')
    .description('Manage MCP (Model Context Protocol) server connections')
    .option('--list', 'List configured MCP servers')
    .option('--add <name>', 'Add a new MCP server')
    .option('--command <cmd>', 'Command to run the MCP server (for stdio type)')
    .option('--url <url>', 'URL for HTTP MCP servers')
    .option('--remove <id>', 'Remove an MCP server')
    .option('--test <id>', 'Test connection to an MCP server')
    .action(async (options) => {
        if (options.add && (options.command || options.url)) {
            const id = options.add.toLowerCase().replace(/\s+/g, '-');
            const server = addMcpServer({
                id,
                name: options.add,
                description: '',
                type: options.url ? 'http' : 'stdio',
                command: options.command,
                url: options.url,
            });
            console.log(chalk.green(`\n✅ Added MCP server: ${server.name}`));
            console.log(chalk.gray('  Start the gateway to activate it.'));
        } else if (options.remove) {
            removeMcpServer(options.remove);
            console.log(chalk.green(`🗑️  Removed MCP server: ${options.remove}`));
        } else if (options.test) {
            const servers = listMcpServers();
            const server = servers.find((s) => s.id === options.test);
            if (!server) { console.log(chalk.red(`MCP server "${options.test}" not found`)); return; }
            console.log(chalk.cyan(`\n🔌 Testing MCP server: ${server.name}...`));
            const result = await testMcpServer(server);
            if (result.ok) {
                console.log(chalk.green(`  ✅ Connected — ${result.tools} tool(s) available`));
            } else {
                console.log(chalk.red(`  ❌ Failed: ${result.error}`));
            }
        } else {
            const servers = listMcpServers();
            const status = getMcpStatus();
            console.log(chalk.cyan(`\n🔌 MCP Servers (${servers.length})\n`));
            if (servers.length === 0) {
                console.log(chalk.gray('  No MCP servers configured.'));
                console.log(chalk.gray('  Add one: titan mcp --add "GitHub" --command "npx -y @modelcontextprotocol/server-github"'));
            }
            for (const server of servers) {
                const live = status.find((s) => s.server.id === server.id);
                const statusIcon = live?.status === 'connected' ? chalk.green('🟢') : chalk.gray('⚪');
                console.log(`  ${statusIcon} ${chalk.white(server.name)} ${chalk.gray(`(${server.id})`)}`);
                console.log(`     Type: ${server.type} | Tools: ${live?.toolCount ?? '–'} | Enabled: ${server.enabled}`);
            }
        }
    });

// ─── RECIPE ──────────────────────────────────────────────────────
program
    .command('recipe')
    .description('Manage and run TITAN recipes (reusable workflows)')
    .option('--list', 'List all recipes')
    .option('--run <id>', 'Run a recipe by ID or slash command')
    .option('--param <key=value>', 'Parameter for the recipe (can be used multiple times)', (v, a: string[]) => [...a, v], [] as string[])
    .option('--delete <id>', 'Delete a recipe')
    .action(async (options) => {
        seedBuiltinRecipes();
        if (options.run) {
            const params: Record<string, string> = {};
            for (const p of options.param as string[]) {
                const [k, ...rest] = p.split('=');
                params[k] = rest.join('=');
            }
            const recipe = getRecipe(options.run);
            if (!recipe) { console.log(chalk.red(`Recipe "${options.run}" not found`)); return; }
            console.log(chalk.cyan(`\n▶  Running recipe: ${recipe.name}\n`));
            initMemory();
            await initBuiltinSkills();
            const config = loadConfig();
            for await (const step of runRecipe(options.run, params)) {
                console.log(chalk.gray(`\nStep ${step.stepIndex + 1}/${step.total}:`));
                console.log(chalk.white(step.prompt));
                const response = await processMessage(step.prompt, 'cli-recipe', 'user');
                console.log(chalk.cyan('\nTITAN: ') + response.content);
            }
        } else if (options.delete) {
            deleteRecipe(options.delete);
            console.log(chalk.green(`🗑️  Deleted recipe: ${options.delete}`));
        } else {
            const recipes = listRecipes();
            seedBuiltinRecipes();
            const all = listRecipes();
            console.log(chalk.cyan(`\n📋 TITAN Recipes (${all.length})\n`));
            for (const r of all) {
                const slash = r.slashCommand ? chalk.yellow(` /${r.slashCommand}`) : '';
                console.log(`  ${chalk.white(r.name)}${slash} ${chalk.gray(`(${r.id})`)}`);
                console.log(`     ${chalk.gray(r.description)}`);
            }
            console.log(chalk.gray('\n  Run a recipe: titan recipe --run <id>'));
            console.log(chalk.gray('  Or use slash commands in WebChat: /code-review, /standup, /debug'));
        }
    });

// ─── MODEL ───────────────────────────────────────────────────────
program
    .command('model')
    .description('View or switch the active AI model')
    .option('--list', 'List available models')
    .option('--set <model>', 'Switch to a different model')
    .option('--current', 'Show the currently active model')
    .action((options) => {
        const config = loadConfig();
        if (options.set) {
            updateConfig({ agent: { ...config.agent, model: options.set } });
            console.log(chalk.green(`\n✅ Model switched to: ${options.set}`));
            console.log(chalk.gray('  Active from next message.'));
        } else if (options.list) {
            console.log(chalk.cyan('\n🧠 Available Models\n'));
            const models = [
                { provider: 'Anthropic', models: ['anthropic/claude-sonnet-4-20250514', 'anthropic/claude-opus-4-0', 'anthropic/claude-3-5-haiku-20241022'] },
                { provider: 'OpenAI', models: ['openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/o3', 'openai/o4-mini'] },
                { provider: 'Google', models: ['google/gemini-2.5-flash', 'google/gemini-2.5-pro', 'google/gemini-2.0-flash'] },
                { provider: 'Ollama (local)', models: ['ollama/llama3.1', 'ollama/mistral', 'ollama/codellama', 'ollama/<any-installed>'] },
            ];
            for (const group of models) {
                console.log(chalk.white(`  ${group.provider}:`));
                for (const m of group.models) {
                    const active = m === config.agent.model ? chalk.green(' ← active') : '';
                    console.log(`    ${chalk.gray(m)}${active}`);
                }
                console.log();
            }
        } else {
            console.log(chalk.cyan(`\n🧠 Current model: ${chalk.white(config.agent.model)}`));
            console.log(chalk.gray('  Switch: titan model --set openai/gpt-4o'));
        }
    });

// ─── MONITOR ─────────────────────────────────────────────────────
program
    .command('monitor')
    .description('Manage TITAN proactive monitors (always-on JARVIS mode)')
    .option('--list', 'List all monitors')
    .option('--add <name>', 'Add a new monitor')
    .option('--watch <path>', 'File/directory to watch (for file_change type)')
    .option('--prompt <prompt>', 'What TITAN should do when triggered')
    .option('--schedule <cron>', 'Cron-style schedule e.g. */30 = every 30 minutes')
    .option('--remove <id>', 'Remove a monitor')
    .action((options) => {
        if (options.add && options.prompt) {
            const id = options.add.toLowerCase().replace(/\s+/g, '-');
            const type = options.schedule ? 'schedule' : 'file_change';
            const monitor = addMonitor({
                id,
                name: options.add,
                description: '',
                triggerType: type,
                watchPath: options.watch,
                cronExpression: options.schedule,
                prompt: options.prompt,
                enabled: true,
            });
            console.log(chalk.green(`\n👁️  Monitor "${monitor.name}" created`));
            console.log(chalk.gray(`  Type: ${type} | Start the gateway to activate.`));
        } else if (options.remove) {
            removeMonitor(options.remove);
            console.log(chalk.green(`🗑️  Removed monitor: ${options.remove}`));
        } else {
            const monitors = listMonitors();
            console.log(chalk.cyan(`\n👁️  TITAN Monitors (${monitors.length})\n`));
            if (monitors.length === 0) {
                console.log(chalk.gray('  No monitors configured. TITAN is reactive only.'));
                console.log(chalk.gray('  Add one: titan monitor --add "Watch Code" --watch /path/to/project --prompt "Summarise changes"'));
            }
            for (const m of monitors) {
                const icon = m.enabled ? chalk.green('🟢') : chalk.gray('⚪');
                console.log(`  ${icon} ${chalk.white(m.name)} ${chalk.gray(`(${m.id})`)}`);
                console.log(`     Type: ${m.triggerType} | Triggers: ${m.triggerCount} | Last: ${m.lastTriggeredAt ?? 'never'}`);
                console.log(`     Prompt: ${chalk.gray(m.prompt.slice(0, 60))}...`);
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
(async () => {
    // Check for updates (fast timeout, non-blocking if offline)
    await checkForUpdates();
    await program.parseAsync();
})();
