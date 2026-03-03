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

// ─── Pending stdio requests (B2-1: single persistent handler) ────
interface PendingRequest {
    resolve: (value: string) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}
const pendingRequests: Map<number, PendingRequest> = new Map();
const STDIO_TIMEOUT_MS = 30_000;

// Per-process buffers so the single persistent handler can parse across chunks
const processBuffers: Map<ChildProcess, string> = new Map();

/** Attach a single persistent stdout handler to an MCP stdio process */
function setupStdoutHandler(proc: ChildProcess): void {
    if (!proc.stdout) return;
    proc.stdout.on('data', (data: Buffer) => {
        let buffer = (processBuffers.get(proc) || '') + data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        processBuffers.set(proc, buffer);

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                if (msg.id != null && pendingRequests.has(msg.id)) {
                    const pending = pendingRequests.get(msg.id)!;
                    clearTimeout(pending.timer);
                    pendingRequests.delete(msg.id);
                    if (msg.error) {
                        pending.resolve(msg.error.message || 'MCP error');
                    } else {
                        const content = msg.result?.content as { text?: string }[] | undefined;
                        pending.resolve(content?.map((c) => c.text || '').join('\n') || 'No output');
                    }
                }
            } catch { /* not JSON, ignore */ }
        }
    });
}

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

        const onInitData = (data: Buffer) => {
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
                        // Remove init handler and install persistent handler for tool calls (B2-1)
                        proc.stdout!.off('data', onInitData);
                        setupStdoutHandler(proc);
                        resolve(connection);
                    }
                } catch {
                    // not JSON, ignore
                }
            }
        };

        proc.stdout?.on('data', onInitData);

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
    } catch (e: unknown) {
        connection.status = 'error';
        connection.error = e instanceof Error ? e.message : String(e);
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

    // stdio call — uses single persistent handler + pending request map (B2-1)
    if (!connection.process?.stdin) {
        throw new Error('MCP process not running');
    }

    const reqId = messageId; // capture before makeRequest increments
    const request = makeRequest('tools/call', { name: toolName, arguments: args });

    const promise = new Promise<string>((resolve, reject) => {
        const timeoutMs = Math.min(connection.server.timeoutMs, STDIO_TIMEOUT_MS) || STDIO_TIMEOUT_MS;
        const timer = setTimeout(() => {
            pendingRequests.delete(reqId);
            reject(new Error(`MCP tool call timed out after ${timeoutMs}ms (request #${reqId})`));
        }, timeoutMs);

        pendingRequests.set(reqId, { resolve, reject, timer });
    });

    connection.process.stdin.write(request);
    return promise;
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

    // Clean up process buffer for this connection (B2-1)
    if (connection.process) {
        processBuffers.delete(connection.process);
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
