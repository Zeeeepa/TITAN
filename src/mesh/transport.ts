/**
 * TITAN — Mesh Transport Layer
 * WebSocket peer-to-peer connections between TITAN nodes.
 * Reuses the existing gateway WS server — no new protocol needed.
 */
import { WebSocket } from 'ws';
import { createHmac } from 'crypto';
import logger from '../utils/logger.js';
import { getPeer, registerPeer, type MeshPeer } from './discovery.js';

const COMPONENT = 'MeshTransport';

// ── Active WebSocket connections to peers ──────────────────────
const peerConnections = new Map<string, WebSocket>();
const pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }>();

/** Mesh message format */
export interface MeshMessage {
    type: 'mesh';
    action: 'heartbeat' | 'task_request' | 'task_response' | 'model_query' | 'model_list';
    fromNodeId: string;
    toNodeId?: string;
    requestId?: string;
    payload: any;
    timestamp: string;
}

/** Generate HMAC auth token for mesh handshake */
export function generateMeshAuth(nodeId: string, meshSecret: string): string {
    const ts = Math.floor(Date.now() / 30000).toString(); // 30-second window
    return createHmac('sha256', meshSecret).update(ts + nodeId).digest('hex');
}

/** Verify HMAC auth token */
export function verifyMeshAuth(token: string, nodeId: string, meshSecret: string): boolean {
    const now = Math.floor(Date.now() / 30000);
    // Check current and previous window to handle clock skew
    for (const ts of [now.toString(), (now - 1).toString()]) {
        const expected = createHmac('sha256', meshSecret).update(ts + nodeId).digest('hex');
        if (token === expected) return true;
    }
    return false;
}

/** Connect to a peer via WebSocket */
export async function connectToPeer(
    address: string,
    port: number,
    localNodeId: string,
    meshSecret: string,
): Promise<boolean> {
    return new Promise((resolve) => {
        const auth = generateMeshAuth(localNodeId, meshSecret);
        const url = `ws://${address}:${port}?mesh=true&nodeId=${localNodeId}&auth=${auth}`;

        const ws = new WebSocket(url, { handshakeTimeout: 5000 });
        let remoteNodeId: string | null = null;

        ws.on('open', () => {
            logger.info(COMPONENT, `Connected to peer at ${address}:${port}`);
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString()) as MeshMessage;
                if (msg.type !== 'mesh') return;

                if (msg.action === 'heartbeat' && msg.fromNodeId) {
                    remoteNodeId = msg.fromNodeId;
                    peerConnections.set(remoteNodeId, ws);
                    registerPeer({
                        nodeId: remoteNodeId,
                        hostname: msg.payload?.hostname || address,
                        address,
                        port,
                        version: msg.payload?.version || 'unknown',
                        models: msg.payload?.models || [],
                        agentCount: msg.payload?.agentCount || 0,
                        load: msg.payload?.load || 0,
                        discoveredVia: 'manual',
                        lastSeen: Date.now(),
                    });
                    resolve(true);
                }

                if (msg.action === 'task_response' && msg.requestId) {
                    const pending = pendingRequests.get(msg.requestId);
                    if (pending) {
                        clearTimeout(pending.timeout);
                        pendingRequests.delete(msg.requestId);
                        pending.resolve(msg.payload);
                    }
                }
            } catch {
                // Ignore malformed messages
            }
        });

        ws.on('error', () => resolve(false));
        ws.on('close', () => {
            if (remoteNodeId) {
                peerConnections.delete(remoteNodeId);
                logger.debug(COMPONENT, `Peer disconnected: ${remoteNodeId}`);
            }
            resolve(false);
        });

        // Timeout
        setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                ws.close();
                resolve(false);
            }
        }, 5000);
    });
}

/** Send a message to a specific peer */
export function sendToPeer(nodeId: string, message: MeshMessage): boolean {
    const ws = peerConnections.get(nodeId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
}

/** Broadcast a message to all connected peers */
export function broadcastToMesh(message: MeshMessage): void {
    const data = JSON.stringify(message);
    for (const [nodeId, ws] of peerConnections) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        } else {
            peerConnections.delete(nodeId);
        }
    }
}

/** Route a task to a remote node and await the response */
export function routeTaskToNode(
    nodeId: string,
    requestId: string,
    message: string,
    model: string,
    timeoutMs = 60_000,
): Promise<any> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingRequests.delete(requestId);
            reject(new Error(`Mesh task timed out (peer: ${nodeId})`));
        }, timeoutMs);

        pendingRequests.set(requestId, { resolve, reject, timeout });

        const sent = sendToPeer(nodeId, {
            type: 'mesh',
            action: 'task_request',
            fromNodeId: '', // Will be set by caller
            toNodeId: nodeId,
            requestId,
            payload: { message, model },
            timestamp: new Date().toISOString(),
        });

        if (!sent) {
            clearTimeout(timeout);
            pendingRequests.delete(requestId);
            reject(new Error(`Cannot reach peer: ${nodeId}`));
        }
    });
}

/** Handle an incoming mesh WebSocket connection (called from gateway) */
export function handleMeshWebSocket(
    ws: WebSocket,
    nodeId: string,
    localNodeId: string,
    onTaskRequest?: (msg: MeshMessage, reply: (payload: any) => void) => void,
): void {
    peerConnections.set(nodeId, ws);
    logger.info(COMPONENT, `Mesh peer connected: ${nodeId}`);

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString()) as MeshMessage;
            if (msg.type !== 'mesh') return;

            if (msg.action === 'heartbeat') {
                registerPeer({
                    nodeId: msg.fromNodeId,
                    hostname: msg.payload?.hostname || 'unknown',
                    address: '', // Already connected
                    port: 0,
                    version: msg.payload?.version || 'unknown',
                    models: msg.payload?.models || [],
                    agentCount: msg.payload?.agentCount || 0,
                    load: msg.payload?.load || 0,
                    discoveredVia: 'manual',
                    lastSeen: Date.now(),
                });
            }

            if (msg.action === 'task_request' && onTaskRequest && msg.requestId) {
                onTaskRequest(msg, (payload) => {
                    const reply: MeshMessage = {
                        type: 'mesh',
                        action: 'task_response',
                        fromNodeId: localNodeId,
                        toNodeId: msg.fromNodeId,
                        requestId: msg.requestId,
                        payload,
                        timestamp: new Date().toISOString(),
                    };
                    ws.send(JSON.stringify(reply));
                });
            }

            if (msg.action === 'task_response' && msg.requestId) {
                const pending = pendingRequests.get(msg.requestId);
                if (pending) {
                    clearTimeout(pending.timeout);
                    pendingRequests.delete(msg.requestId);
                    pending.resolve(msg.payload);
                }
            }
        } catch {
            // Ignore
        }
    });

    ws.on('close', () => {
        peerConnections.delete(nodeId);
        logger.info(COMPONENT, `Mesh peer disconnected: ${nodeId}`);
    });
}

/** Get connected peer count */
export function getConnectedPeerCount(): number {
    let count = 0;
    for (const [, ws] of peerConnections) {
        if (ws.readyState === WebSocket.OPEN) count++;
    }
    return count;
}

/** Disconnect all peers */
export function disconnectAll(): void {
    for (const [nodeId, ws] of peerConnections) {
        ws.close();
        peerConnections.delete(nodeId);
    }
    for (const [id, req] of pendingRequests) {
        clearTimeout(req.timeout);
        req.reject(new Error('Mesh shutting down'));
        pendingRequests.delete(id);
    }
}
