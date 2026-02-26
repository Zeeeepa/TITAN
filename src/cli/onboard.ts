/**
 * TITAN — Onboarding Wizard
 * Interactive setup for first-time users.
 */
import { select, input, confirm, password } from '@inquirer/prompts';
import chalk from 'chalk';
import { saveConfig, getDefaultConfig, loadConfig } from '../config/config.js';
import { TITAN_HOME, TITAN_WORKSPACE, TITAN_SKILLS_DIR, TITAN_CONFIG_PATH } from '../utils/constants.js';
import { ensureDir } from '../utils/helpers.js';
import { initMemory } from '../memory/memory.js';
import logger from '../utils/logger.js';

export async function runOnboard(installDaemon?: boolean): Promise<void> {
    console.log(chalk.cyan('\n🚀 Welcome to TITAN Setup!\n'));
    console.log(chalk.gray('This wizard will help you configure your personal AI assistant.\n'));

    const config = getDefaultConfig();

    // Step 1: Choose AI provider
    console.log(chalk.yellow('─── Step 1: AI Provider ───\n'));

    const provider = await select({
        message: 'Which AI provider would you like to use?',
        choices: [
            { name: 'Anthropic (Claude) — Recommended', value: 'anthropic' },
            { name: 'OpenAI (GPT-4)', value: 'openai' },
            { name: 'Google (Gemini)', value: 'google' },
            { name: 'Ollama (Local models)', value: 'ollama' },
        ],
    });

    if (provider === 'ollama') {
        const ollamaUrl = await input({
            message: 'Ollama base URL:',
            default: 'http://localhost:11434',
        });
        config.providers.ollama.baseUrl = ollamaUrl;
        config.agent.model = 'ollama/llama3.1';
    } else {
        const apiKey = await password({
            message: `Enter your ${provider} API key:`,
        });
        if (provider === 'anthropic') {
            config.providers.anthropic.apiKey = apiKey;
            config.agent.model = 'anthropic/claude-sonnet-4-20250514';
        } else if (provider === 'openai') {
            config.providers.openai.apiKey = apiKey;
            config.agent.model = 'openai/gpt-4o';
        } else if (provider === 'google') {
            config.providers.google.apiKey = apiKey;
            config.agent.model = 'google/gemini-2.5-flash';
        }
    }

    // Step 2: Model selection
    console.log(chalk.yellow('\n─── Step 2: Model ───\n'));

    const useDefault = await confirm({
        message: `Use default model (${config.agent.model})?`,
        default: true,
    });

    if (!useDefault) {
        const model = await input({
            message: 'Enter model identifier (e.g., anthropic/claude-opus-4-0):',
            default: config.agent.model,
        });
        config.agent.model = model;
    }

    // Step 3: Channels
    console.log(chalk.yellow('\n─── Step 3: Channels ───\n'));

    const enableChannels = await confirm({
        message: 'Would you like to set up messaging channels (Discord, Telegram, Slack)?',
        default: false,
    });

    if (enableChannels) {
        const selectedChannels = await select({
            message: 'Which channel to configure?',
            choices: [
                { name: 'Discord', value: 'discord' },
                { name: 'Telegram', value: 'telegram' },
                { name: 'Slack', value: 'slack' },
                { name: 'Skip for now', value: 'skip' },
            ],
        });

        if (selectedChannels !== 'skip') {
            const token = await password({
                message: `Enter your ${selectedChannels} bot token:`,
            });
            if (selectedChannels === 'discord') {
                config.channels.discord.enabled = true;
                config.channels.discord.token = token;
            } else if (selectedChannels === 'telegram') {
                config.channels.telegram.enabled = true;
                config.channels.telegram.token = token;
            } else if (selectedChannels === 'slack') {
                config.channels.slack.enabled = true;
                config.channels.slack.token = token;
            }
        }
    }

    // Step 4: Security
    console.log(chalk.yellow('\n─── Step 4: Security ───\n'));

    const sandboxMode = await select({
        message: 'Sandbox mode for non-main sessions:',
        choices: [
            { name: 'Host (full access, single-user)', value: 'host' },
            { name: 'Docker (isolated containers)', value: 'docker' },
            { name: 'None (no restrictions)', value: 'none' },
        ],
    });
    config.security.sandboxMode = sandboxMode as 'host' | 'docker' | 'none';

    // Step 5: Autonomy Mode
    console.log(chalk.yellow('\n─── Step 5: Autonomy ───\n'));
    console.log(chalk.gray('  This controls how much freedom TITAN has to act on its own.\n'));

    const autonomyMode = await select({
        message: 'How much autonomy should TITAN have?',
        choices: [
            {
                name: '🟡 Supervised (Recommended) — Safe ops run freely, dangerous ops ask you first',
                value: 'supervised',
            },
            {
                name: '🟢 Autonomous — Full auto, TITAN acts without asking. Best for power users.',
                value: 'autonomous',
            },
            {
                name: '🔴 Locked — Every action requires your approval. Maximum control.',
                value: 'locked',
            },
        ],
    });
    (config as any).autonomy = { mode: autonomyMode };

    // Step 6: Gateway
    console.log(chalk.yellow('\n─── Step 6: Gateway ───\n'));

    const gatewayPort = await input({
        message: 'Gateway port:',
        default: '18789',
    });
    config.gateway.port = parseInt(gatewayPort, 10);

    // Create directories
    console.log(chalk.yellow('\n─── Setting up workspace ───\n'));
    ensureDir(TITAN_HOME);
    ensureDir(TITAN_WORKSPACE);
    ensureDir(TITAN_SKILLS_DIR);

    // Initialize database
    initMemory();

    // Save configuration
    saveConfig(config);

    // Install daemon
    if (installDaemon) {
        console.log(chalk.yellow('\n─── Installing daemon ───\n'));
        await installDaemonService();
    }

    const modeEmoji = autonomyMode === 'autonomous' ? '🟢' : autonomyMode === 'locked' ? '🔴' : '🟡';
    console.log(chalk.green('\n✅ TITAN setup complete!\n'));
    console.log(chalk.white('  Configuration:'));
    console.log(chalk.gray(`  Model:    ${config.agent.model}`));
    console.log(chalk.gray(`  Autonomy: ${modeEmoji} ${autonomyMode}`));
    console.log(chalk.gray(`  Sandbox:  ${config.security.sandboxMode}`));
    console.log(chalk.white('\n  Quick start:'));
    console.log(chalk.gray('  $ titan gateway          # Start Mission Control'));
    console.log(chalk.gray('  $ titan agent -m "Hello" # Send a message'));
    console.log(chalk.gray('  $ titan doctor           # Check everything is OK'));
    console.log(chalk.gray(`\n  Config:    ${TITAN_CONFIG_PATH}`));
    console.log(chalk.gray(`  Dashboard: http://127.0.0.1:${config.gateway.port}\n`));
}

async function installDaemonService(): Promise<void> {
    const platform = process.platform;

    if (platform === 'linux') {
        console.log(chalk.gray('Creating systemd user service...'));
        const serviceContent = `[Unit]
Description=TITAN Gateway
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${process.argv[1]} gateway
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`;
        const { writeFileSync, mkdirSync, existsSync } = await import('fs');
        const { join } = await import('path');
        const { homedir } = await import('os');
        const serviceDir = join(homedir(), '.config', 'systemd', 'user');
        if (!existsSync(serviceDir)) mkdirSync(serviceDir, { recursive: true });
        writeFileSync(join(serviceDir, 'titan.service'), serviceContent);
        console.log(chalk.green('  Service file installed. Enable with:'));
        console.log(chalk.gray('  $ systemctl --user enable titan'));
        console.log(chalk.gray('  $ systemctl --user start titan'));
    } else if (platform === 'darwin') {
        console.log(chalk.gray('Creating launchd plist...'));
        console.log(chalk.yellow('  macOS daemon installation - create a LaunchAgent plist manually.'));
    } else {
        console.log(chalk.yellow('  Daemon installation not supported on this platform.'));
    }
}
