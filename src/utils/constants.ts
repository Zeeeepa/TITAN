/**
 * TITAN Constants
 */
import { homedir } from 'os';
import { join } from 'path';

export const TITAN_VERSION = '2026.4.13';
export const TITAN_NAME = 'TITAN';
export const TITAN_FULL_NAME = 'The Intelligent Task Automation Network';
export const TITAN_ASCII_LOGO = `
╔══════════════════════════════════════════════════════╗
║                                                      ║
║  ████████╗██╗████████╗ █████╗ ███╗   ██╗            ║
║     ██║   ██║   ██║   ██╔══██╗████╗  ██║            ║
║     ██║   ██║   ██║   ███████║██╔██╗ ██║            ║
║     ██║   ██║   ██║   ██╔══██║██║╚██╗██║            ║
║     ██║   ██║   ██║   ██║  ██║██║ ╚████║            ║
║     ╚═╝   ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝           ║
║                                                      ║
║  The Intelligent Task Automation Network             ║
║  v${TITAN_VERSION}  •  by Tony Elliott                          ║
╚══════════════════════════════════════════════════════╝`;

// Paths
export const TITAN_HOME = join(homedir(), '.titan');
export const TITAN_CONFIG_PATH = join(TITAN_HOME, 'titan.json');
export const TITAN_DB_PATH = join(TITAN_HOME, 'titan.db');
export const TITAN_WORKSPACE = join(TITAN_HOME, 'workspace');
export const TITAN_SKILLS_DIR = join(TITAN_WORKSPACE, 'skills');
export const TITAN_LOGS_DIR = join(TITAN_HOME, 'logs');
export const TITAN_MEMORY_DIR = join(TITAN_HOME, 'memory');

// Workspace prompt files (injected into agent context)
export const AGENTS_MD = join(TITAN_WORKSPACE, 'AGENTS.md');
export const SOUL_MD = join(TITAN_WORKSPACE, 'SOUL.md');
export const TOOLS_MD = join(TITAN_WORKSPACE, 'TOOLS.md');

// Gateway defaults
export const DEFAULT_GATEWAY_HOST = '127.0.0.1';
export const DEFAULT_GATEWAY_PORT = 48420;
export const DEFAULT_WEB_PORT = 48421;

// Agent defaults
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-20250514';
export const DEFAULT_MAX_TOKENS = 8192;
export const DEFAULT_TEMPERATURE = 0.7;
export const MAX_CONTEXT_MESSAGES = 50;
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Security
export const DEFAULT_SANDBOX_MODE = 'host';
export const ALLOWED_TOOLS_DEFAULT = [
    'shell', 'read_file', 'write_file', 'edit_file', 'list_dir',
    'web_search', 'browser', 'cron', 'webhook', 'email', 'memory',
];
export const DENIED_TOOLS_DEFAULT: string[] = [];
