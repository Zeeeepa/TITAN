/**
 * TITAN — MCP Client
 * Connects to Model Context Protocol (MCP) servers via stdio or HTTP,
 * discovers their tools, and registers them with TITAN's tool runner.
 * 
 * MCP is the universal tool integration standard adopted by OpenAI, Google,
 * Microsoft, and Anthropic in 2026. TITAN supports all MCP servers.
 */
import { spawn, type ChildProcess } from 'child_process';
import { registerTool, unregisterTool } from '../agent/toolRunner.js';
import logger from '../utils/logger.js';
import { TITAN_VERSION } from '../utils/constants.js';

const COMPONENT = 'MCP';

// ─── Types ────────────────────────────────────────────────────────
export interface McpTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface McpServer {
    id: string;
    name: string;
    description: string;
    type: 'stdio' | 'http';
    command?: string;        // for stdio
    args?: string[];         // for stdio
    url?: string;            // for http
    env?: Record<string, string>;
    timeoutMs: number;
    enabled: boolean;
}

export interface McpConnection {
    server: McpServer;
    process?: ChildProcess;
    tools: McpTool[];
    status: 'connected' | 'disconnected' | 'error';
    error?: string;
}

// ─── Active connections ───────────────────────────────────────────
const activeConnections: Map<string, McpConnection> = new Map();
let messageId = 1;

// ─── JSON-RPC helpers ─────────────────────────────────────────────
function makeRequest(method: string, params?: unknown): string {
    return JSON.stringify({
        jsonrpc: '2.0',
        id: messageId++,
        method,
        params,
    }) + '\n';
}

// ─── Connect to stdio MCP server ──────────────────────────────────
async function connectStdio(server: McpServer): Promise<McpConnection> {
    return new Promise((resolve) => {
        if (!server.command) {
            resolve({ server, tools: [], status: 'error', error: 'No command specified' });
            return;
        }

        const parts = server.command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
        const [cmd, ...args] = parts;
        if (!cmd) {
            resolve({ server, tools: [], status: 'error', error: 'Empty command string' });
            return;
        }
        const allArgs = [...args, ...(server.args || [])];

        const proc = spawn(cmd, allArgs, {
            env: { ...process.env, ...(server.env || {}) },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const connection: McpConnection = {
            server,
            process: proc,
            tools: [],
            status: 'disconnected',
        };

        let buffer = '';
        let initialized = false;

        proc.stdout?.on('data', (data: Buffer) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    if (!initialized && msg.result?.capabilities !== undefined) {
                        // Server initialized — now list tools
                        initialized = true;
                        proc.stdin?.write(makeRequest('tools/list'));
                    } else if (msg.result?.tools) {
                        connection.tools = msg.result.tools as McpTool[];
                        connection.status = 'connected';
                        resolve(connection);
                    }
                } catch {
                    // not JSON, ignore
                }
            }
        });

        proc.on('error', (err) => {
            connection.status = 'error';
            connection.error = err.message;
            if (!initialized) resolve(connection);
        });

        proc.on('exit', (code) => {
            if (connection.status === 'connected') {
                connection.status = 'disconnected';
            }
            if (!initialized) {
                connection.error = `Process exited with code ${code}`;
                resolve(connection);
            }
        });

        // Send initialize request
        const initRequest = makeRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'TITAN', version: TITAN_VERSION },
        });
        proc.stdin?.write(initRequest);

        // Timeout after server.timeoutMs — also kill the lingering process
        setTimeout(() => {
            if (!initialized) {
                connection.error = `Connection timed out after ${server.timeoutMs}ms`;
                connection.status = 'error';
                proc.kill();
                resolve(connection);
            }
        }, server.timeoutMs);
    });
}

// ─── Connect to HTTP MCP server ───────────────────────────────────
async function connectHttp(server: McpServer): Promise<McpConnection> {
    const connection: McpConnection = { server, tools: [], status: 'disconnected' };
    try {
        const res = await fetch(`${server.url}/tools/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: messageId++, method: 'tools/list' }),
            signal: AbortSignal.timeout(server.timeoutMs),
        });
        const data = await res.json() as { result?: { tools: McpTool[] } };
        connection.tools = data.result?.tools || [];
        connection.status = 'connected';
    } catch (e: any) {
        connection.status = 'error';
        connection.error = e.message;
    }
    return connection;
}

// ─── Call a tool on an MCP server ────────────────────────────────
async function callMcpTool(connection: McpConnection, toolName: string, args: Record<string, unknown>): Promise<string> {
    if (connection.server.type === 'http') {
        const res = await fetch(`${connection.server.url}/tools/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: messageId++,
                method: 'tools/call',
                params: { name: toolName, arguments: args },
            }),
            signal: AbortSignal.timeout(connection.server.timeoutMs),
        });
        const data = await res.json() as { result?: { content?: { text?: string }[] } };
        return data.result?.content?.map((c) => c.text || '').join('\n') || 'No output';
    }

    // stdio call
    return new Promise((resolve, reject) => {
        if (!connection.process?.stdin) {
            reject(new Error('MCP process not running'));
            return;
        }

        const reqId = messageId;
        const request = makeRequest('tools/call', { name: toolName, arguments: args });
        let buffer = '';

        const onData = (data: Buffer) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    if (msg.id === reqId) {
                        connection.process!.stdout!.off('data', onData);
                        const content = msg.result?.content as { text?: string }[] | undefined;
                        resolve(content?.map((c) => c.text || '').join('\n') || msg.error?.message || 'No output');
                    }
                } catch { /* ignore */ }
            }
        };

        connection.process.stdout!.on('data', onData);
        connection.process.stdin.write(request);

        setTimeout(() => {
            connection.process!.stdout!.off('data', onData);
            reject(new Error(`MCP tool call timed out`));
        }, connection.server.timeoutMs);
    });
}

// ─── Public API ───────────────────────────────────────────────────

/** Connect to an MCP server and register its tools */
export async function connectMcpServer(server: McpServer): Promise<McpConnection> {
    logger.info(COMPONENT, `Connecting to MCP server: ${server.name} (${server.type})`);

    const connection = server.type === 'http'
        ? await connectHttp(server)
        : await connectStdio(server);

    activeConnections.set(server.id, connection);

    if (connection.status === 'connected') {
        logger.info(COMPONENT, `Connected to ${server.name} — ${connection.tools.length} tools available`);

        // Register each MCP tool with TITAN's tool runner
        for (const tool of connection.tools) {
            const prefixedName = `mcp_${server.id}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
            registerTool({
                name: prefixedName,
                description: `[${server.name}] ${tool.description}`,
                parameters: tool.inputSchema || { type: 'object', properties: {} },
                execute: async (args) => callMcpTool(connection, tool.name, args),
            });
        }
    } else {
        logger.error(COMPONENT, `Failed to connect to ${server.name}: ${connection.error}`);
    }

    return connection;
}

/** Disconnect from an MCP server and unregister its tools */
export function disconnectMcpServer(serverId: string): void {
    const connection = activeConnections.get(serverId);
    if (!connection) return;

    for (const tool of connection.tools) {
        const prefixedName = `mcp_${serverId}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
        unregisterTool(prefixedName);
    }

    connection.process?.kill();
    activeConnections.delete(serverId);
    logger.info(COMPONENT, `Disconnected MCP server: ${serverId}`);
}

/** Get all active connections */
export function getMcpConnections(): McpConnection[] {
    return Array.from(activeConnections.values());
}

/** Test connectivity to an MCP server without registering tools */
export async function testMcpServer(server: McpServer): Promise<{ ok: boolean; tools: number; error?: string }> {
    const conn = server.type === 'http' ? await connectHttp(server) : await connectStdio(server);
    conn.process?.kill();
    return { ok: conn.status === 'connected', tools: conn.tools.length, error: conn.error };
}
