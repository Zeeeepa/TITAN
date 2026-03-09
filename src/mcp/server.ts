/**
 * TITAN — MCP Server
 * Exposes TITAN's registered tools via the Model Context Protocol (MCP).
 * Other agents (Claude Code, Cursor, Windsurf, etc.) can connect to TITAN
 * as an MCP server and use any of its ~112 tools.
 *
 * Supports two transport modes:
 * - **HTTP/SSE**: Runs on a configurable port (default 48421), compatible with
 *   MCP clients that use HTTP transport (e.g. Claude Code remote MCP).
 * - **Stdio**: When launched as a subprocess, communicates via stdin/stdout
 *   JSON-RPC (standard MCP stdio transport).
 *
 * Protocol: JSON-RPC 2.0 per MCP specification (2025-03-26)
 */
import type { Express } from 'express';
import { getRegisteredTools } from '../agent/toolRunner.js';
import { isToolSkillEnabled } from '../skills/registry.js';
import { loadConfig } from '../config/config.js';
import { TITAN_VERSION, TITAN_NAME } from '../utils/constants.js';
import logger from '../utils/logger.js';

const COMPONENT = 'MCPServer';

// ─── JSON-RPC Types ──────────────────────────────────────────────

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: string | number;
    method: string;
    params?: Record<string, unknown>;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

// ─── MCP Server State ────────────────────────────────────────────

let initialized = false;
let clientCapabilities: Record<string, unknown> = {};

// ─── MCP Protocol Handlers ───────────────────────────────────────

function handleInitialize(params: Record<string, unknown>): unknown {
    clientCapabilities = (params.capabilities as Record<string, unknown>) || {};
    initialized = true;
    logger.info(COMPONENT, `Client initialized: ${JSON.stringify(params.clientInfo || 'unknown')}`);
    return {
        protocolVersion: '2025-03-26',
        capabilities: {
            tools: { listChanged: false },
        },
        serverInfo: {
            name: TITAN_NAME,
            version: TITAN_VERSION,
        },
    };
}

function handleToolsList(): unknown {
    const config = loadConfig();
    const denied = new Set(config.security.deniedTools);
    const allowed = new Set(config.security.allowedTools);

    const tools = getRegisteredTools()
        .filter((tool) => {
            if (denied.has(tool.name)) return false;
            if (allowed.size > 0 && !allowed.has(tool.name)) return false;
            if (!isToolSkillEnabled(tool.name)) return false;
            return true;
        })
        .map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.parameters,
        }));

    logger.debug(COMPONENT, `Listed ${tools.length} tools`);
    return { tools };
}

async function handleToolsCall(params: Record<string, unknown>): Promise<unknown> {
    const toolName = params.name as string;
    const args = (params.arguments as Record<string, unknown>) || {};

    if (!toolName) {
        return {
            content: [{ type: 'text', text: 'Error: tool name is required' }],
            isError: true,
        };
    }

    const tools = getRegisteredTools();
    const handler = tools.find((t) => t.name === toolName);

    if (!handler) {
        return {
            content: [{ type: 'text', text: `Error: unknown tool "${toolName}"` }],
            isError: true,
        };
    }

    if (!isToolSkillEnabled(handler.name)) {
        return {
            content: [{ type: 'text', text: `Error: tool "${toolName}" is disabled` }],
            isError: true,
        };
    }

    const config = loadConfig();
    if (config.security.deniedTools.includes(handler.name)) {
        return {
            content: [{ type: 'text', text: `Error: tool "${toolName}" is denied by security policy` }],
            isError: true,
        };
    }

    try {
        const timeout = config.security.commandTimeout || 30000;
        const startTime = Date.now();

        const result = await Promise.race([
            handler.execute(args),
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after ${timeout}ms`)), timeout)
            ),
        ]);

        const durationMs = Date.now() - startTime;
        logger.info(COMPONENT, `Tool ${toolName} executed in ${durationMs}ms via MCP`);

        const content = result.length > 50000
            ? result.slice(0, 50000) + '\n\n[Output truncated at 50KB]'
            : result;

        return {
            content: [{ type: 'text', text: content }],
            isError: false,
        };
    } catch (err) {
        logger.error(COMPONENT, `Tool ${toolName} failed: ${(err as Error).message}`);
        return {
            content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
            isError: true,
        };
    }
}

// ─── JSON-RPC Dispatcher ─────────────────────────────────────────

export async function handleJsonRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const { method, params, id } = request;

    // Notifications (no id) — don't send a response
    if (method === 'notifications/initialized') {
        logger.debug(COMPONENT, 'Client confirmed initialization');
        return null;
    }
    if (method === 'notifications/cancelled') {
        logger.debug(COMPONENT, `Request cancelled: ${JSON.stringify(params)}`);
        return null;
    }

    // Methods that require a response
    try {
        switch (method) {
            case 'initialize':
                return { jsonrpc: '2.0', id: id ?? null, result: handleInitialize(params || {}) };

            case 'ping':
                return { jsonrpc: '2.0', id: id ?? null, result: {} };

            case 'tools/list':
                if (!initialized) {
                    return { jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Server not initialized' } };
                }
                return { jsonrpc: '2.0', id: id ?? null, result: handleToolsList() };

            case 'tools/call':
                if (!initialized) {
                    return { jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Server not initialized' } };
                }
                return { jsonrpc: '2.0', id: id ?? null, result: await handleToolsCall(params || {}) };

            default:
                return { jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: `Method not found: ${method}` } };
        }
    } catch (err) {
        logger.error(COMPONENT, `Handler error for ${method}: ${(err as Error).message}`);
        return { jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message: (err as Error).message } };
    }
}

// ─── Stdio Transport ─────────────────────────────────────────────

let stdioBuf = '';

function handleStdioData(chunk: string): void {
    stdioBuf += chunk;
    // Process complete lines (JSON-RPC messages are newline-delimited)
    const lines = stdioBuf.split('\n');
    stdioBuf = lines.pop() || ''; // Keep incomplete last line in buffer

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            const request = JSON.parse(trimmed) as JsonRpcRequest;
            handleJsonRpcRequest(request).then((response) => {
                if (response) {
                    process.stdout.write(JSON.stringify(response) + '\n');
                }
            }).catch((err) => {
                const errorResponse: JsonRpcResponse = {
                    jsonrpc: '2.0',
                    id: request.id ?? null,
                    error: { code: -32603, message: (err as Error).message },
                };
                process.stdout.write(JSON.stringify(errorResponse) + '\n');
            });
        } catch {
            // Invalid JSON — ignore malformed input
            logger.warn(COMPONENT, `Invalid JSON-RPC input: ${trimmed.slice(0, 100)}`);
        }
    }
}

/**
 * Start MCP server in stdio mode.
 * Used when TITAN is launched as a subprocess by an MCP client.
 */
export function startStdioServer(): void {
    logger.info(COMPONENT, 'Starting MCP server (stdio transport)');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', handleStdioData);
    process.stdin.on('end', () => {
        logger.info(COMPONENT, 'Stdio transport closed');
        process.exit(0);
    });
}

// ─── HTTP/SSE Transport ──────────────────────────────────────────

/**
 * Mount MCP HTTP endpoints on an Express app.
 * Implements the MCP Streamable HTTP transport (2025-03-26 spec).
 *
 * Endpoints:
 * - POST /mcp — JSON-RPC request/response
 * - GET  /mcp — SSE stream for server-initiated notifications (future)
 * - DELETE /mcp — Terminate session (future)
 */
export function mountMcpHttpEndpoints(app: Express): void {
    const config = loadConfig();
    if (!config.mcp?.server?.enabled) {
        logger.debug(COMPONENT, 'MCP server mode disabled in config');
        return;
    }

    // POST /mcp — main JSON-RPC endpoint
    app.post('/mcp', async (req, res) => {
        try {
            const request = req.body as JsonRpcRequest;

            if (!request.jsonrpc || request.jsonrpc !== '2.0' || !request.method) {
                res.status(400).json({
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32600, message: 'Invalid JSON-RPC request' },
                });
                return;
            }

            const response = await handleJsonRpcRequest(request);
            if (response) {
                res.json(response);
            } else {
                // Notification — no response body
                res.status(204).end();
            }
        } catch (err) {
            res.status(500).json({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32603, message: (err as Error).message },
            });
        }
    });

    // GET /mcp — SSE stream (placeholder for future server-initiated notifications)
    app.get('/mcp', (_req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write('event: endpoint\ndata: /mcp\n\n');
        // Keep connection open for future notifications
        // Client can close when done
    });

    logger.info(COMPONENT, 'MCP HTTP endpoints mounted at /mcp');
}

/**
 * Get MCP server status for the dashboard/API.
 */
export function getMcpServerStatus(): { enabled: boolean; initialized: boolean; toolCount: number; clientInfo: unknown } {
    const config = loadConfig();
    const tools = getRegisteredTools().filter((t) => isToolSkillEnabled(t.name));
    return {
        enabled: config.mcp?.server?.enabled ?? false,
        initialized,
        toolCount: tools.length,
        clientInfo: clientCapabilities,
    };
}
