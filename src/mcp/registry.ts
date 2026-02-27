/**
 * TITAN — MCP Registry
 * Persists the list of configured MCP servers to ~/.titan/mcp.json
 * and bootstraps connections on startup.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TITAN_HOME } from '../utils/constants.js';
import { ensureDir } from '../utils/helpers.js';
import { connectMcpServer, disconnectMcpServer, getMcpConnections, type McpServer } from './client.js';
import logger from '../utils/logger.js';

const COMPONENT = 'MCPRegistry';
const MCP_CONFIG_PATH = join(TITAN_HOME, 'mcp.json');

// ─── Persistence ──────────────────────────────────────────────────
function loadServers(): McpServer[] {
    try {
        if (!existsSync(MCP_CONFIG_PATH)) return [];
        return JSON.parse(readFileSync(MCP_CONFIG_PATH, 'utf-8')) as McpServer[];
    } catch {
        return [];
    }
}

function saveServers(servers: McpServer[]): void {
    ensureDir(TITAN_HOME);
    writeFileSync(MCP_CONFIG_PATH, JSON.stringify(servers, null, 2), 'utf-8');
}

// ─── Public API ───────────────────────────────────────────────────

/** List all configured MCP servers */
export function listMcpServers(): McpServer[] {
    return loadServers();
}

/** Add a new MCP server */
export function addMcpServer(server: Omit<McpServer, 'timeoutMs' | 'enabled'>): McpServer {
    const servers = loadServers();
    const full: McpServer = { ...server, timeoutMs: 30000, enabled: true };

    if (servers.find((s) => s.id === full.id)) {
        throw new Error(`MCP server with ID "${full.id}" already exists.`);
    }
    servers.push(full);
    saveServers(servers);
    logger.info(COMPONENT, `Added MCP server: ${full.name}`);
    return full;
}

/** Remove an MCP server */
export function removeMcpServer(id: string): void {
    disconnectMcpServer(id);
    const servers = loadServers().filter((s) => s.id !== id);
    saveServers(servers);
    logger.info(COMPONENT, `Removed MCP server: ${id}`);
}

/** Enable or disable a server */
export function setMcpServerEnabled(id: string, enabled: boolean): void {
    const servers = loadServers();
    const server = servers.find((s) => s.id === id);
    if (!server) throw new Error(`MCP server "${id}" not found`);
    server.enabled = enabled;
    saveServers(servers);
    if (!enabled) disconnectMcpServer(id);
}

/** Boot all enabled MCP servers on startup */
export async function initMcpServers(): Promise<void> {
    const servers = loadServers().filter((s) => s.enabled);
    if (servers.length === 0) return;
    logger.info(COMPONENT, `Initialising ${servers.length} MCP server(s)...`);
    await Promise.all(servers.map((s) => connectMcpServer(s).catch((e) => {
        logger.error(COMPONENT, `Failed to start MCP server ${s.name}: ${e.message}`);
    })));
}

/** Get live status of all connections */
export function getMcpStatus(): { server: McpServer; status: string; toolCount: number }[] {
    const connections = getMcpConnections();
    return connections.map((c) => ({
        server: c.server,
        status: c.status,
        toolCount: c.tools.length,
    }));
}
