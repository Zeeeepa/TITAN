/**
 * TITAN — Mesh Peer Discovery
 * Auto-discovers TITAN instances on the local network (mDNS/Bonjour)
 * and across Tailscale VPN networks.
 */
import { execFileSync } from 'child_process';
import { hostname } from 'os';
import logger from '../utils/logger.js';
import { TITAN_VERSION } from '../utils/constants.js';

const COMPONENT = 'MeshDiscovery';
const PROBE_TIMEOUT = 2000;

export interface MeshPeer {
    nodeId: string;
    hostname: string;
    address: string;
    port: number;
    version: string;
    models: string[];
    agentCount: number;
    load: number;
    discoveredVia: 'mdns' | 'tailscale' | 'manual';
    lastSeen: number;
}

// ── Bonjour structural types (dynamic import) ────────────────
interface BonjourInstance {
    publish(opts: Record<string, unknown>): unknown;
    find(opts: Record<string, unknown>): BonjourBrowser;
    destroy(): void;
}
interface BonjourBrowser {
    on(event: string, cb: (service: BonjourService) => void): void;
    stop(): void;
}
interface BonjourService {
    name: string;
    port: number;
    txt?: Record<string, string>;
    referer?: { address: string };
    addresses?: string[];
}

// ── Peer store ─────────────────────────────────────────────────
const peers = new Map<string, MeshPeer>();
let bonjourInstance: BonjourInstance | null = null;
let bonjourBrowser: BonjourBrowser | null = null;
let tailscaleInterval: ReturnType<typeof setInterval> | null = null;
let peerPruneInterval: ReturnType<typeof setInterval> | null = null;

export function getPeers(): MeshPeer[] {
    return Array.from(peers.values());
}

export function getPeer(nodeId: string): MeshPeer | undefined {
    return peers.get(nodeId);
}

export function removePeer(nodeId: string): void {
    peers.delete(nodeId);
}

/** Register a peer (from any discovery source) */
export function registerPeer(peer: MeshPeer): void {
    const existing = peers.get(peer.nodeId);
    if (existing) {
        // Merge — update mutable fields
        existing.models = peer.models;
        existing.agentCount = peer.agentCount;
        existing.load = peer.load;
        existing.lastSeen = Date.now();
        existing.version = peer.version;
    } else {
        peer.lastSeen = Date.now();
        peers.set(peer.nodeId, peer);
        logger.info(COMPONENT, `New peer: ${peer.hostname} (${peer.address}:${peer.port}) via ${peer.discoveredVia}`);
    }
}

// ── mDNS / Bonjour ─────────────────────────────────────────────

async function startMdns(nodeId: string, port: number): Promise<void> {
    try {
        const { Bonjour } = await import('bonjour-service');
        bonjourInstance = new Bonjour() as unknown as BonjourInstance;

        // Publish this node
        bonjourInstance.publish({
            name: `titan-${nodeId.slice(0, 8)}`,
            type: 'titan-mesh',
            port,
            txt: {
                nodeId,
                version: TITAN_VERSION,
                hostname: hostname(),
            },
        });

        // Browse for peers
        bonjourBrowser = bonjourInstance.find({ type: 'titan-mesh' });
        bonjourBrowser.on('up', async (service: BonjourService) => {
            const peerNodeId = service.txt?.nodeId;
            if (!peerNodeId || peerNodeId === nodeId) return;

            const address = service.referer?.address || service.addresses?.[0];
            if (!address) return;

            // Probe the peer to get its capabilities
            const info = await probePeer(address, service.port);
            if (info) {
                registerPeer({
                    nodeId: peerNodeId,
                    hostname: service.txt?.hostname || service.name,
                    address,
                    port: service.port,
                    version: info.version || service.txt?.version || 'unknown',
                    models: info.models || [],
                    agentCount: info.agentCount || 0,
                    load: info.load || 0,
                    discoveredVia: 'mdns',
                    lastSeen: Date.now(),
                });
            }
        });

        bonjourBrowser.on('down', (service: BonjourService) => {
            const peerNodeId = service.txt?.nodeId;
            if (peerNodeId) removePeer(peerNodeId);
        });

        logger.info(COMPONENT, 'mDNS discovery active');
    } catch (err) {
        logger.warn(COMPONENT, `mDNS unavailable (install bonjour-service for LAN discovery): ${(err as Error).message}`);
    }
}

// ── Tailscale Discovery ─────────────────────────────────────────

interface TailscalePeer {
    TailscaleIPs: string[];
    HostName: string;
    Online: boolean;
}

function getTailscalePeers(): TailscalePeer[] {
    try {
        const raw = execFileSync('tailscale', ['status', '--json'], {
            timeout: 5000,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const status = JSON.parse(raw) as { Peer?: Record<string, TailscalePeer> };
        return Object.values(status.Peer || {}).filter(p => p.Online);
    } catch {
        return [];
    }
}

async function scanTailscalePeers(nodeId: string, port: number): Promise<void> {
    const tsPeers = getTailscalePeers();
    if (tsPeers.length === 0) return;

    logger.debug(COMPONENT, `Scanning ${tsPeers.length} Tailscale peers`);

    for (const tsPeer of tsPeers) {
        const ip = tsPeer.TailscaleIPs[0];
        if (!ip) continue;

        const info = await probePeer(ip, port);
        if (info && info.nodeId && info.nodeId !== nodeId) {
            registerPeer({
                nodeId: info.nodeId,
                hostname: tsPeer.HostName,
                address: ip,
                port,
                version: info.version || 'unknown',
                models: info.models || [],
                agentCount: info.agentCount || 0,
                load: info.load || 0,
                discoveredVia: 'tailscale',
                lastSeen: Date.now(),
            });
        }
    }
}

// ── Peer Probing ───────────────────────────────────────────────

interface ProbeResult {
    titan: boolean;
    nodeId: string;
    version: string;
    models: string[];
    agentCount: number;
    load: number;
}

async function probePeer(address: string, port: number): Promise<ProbeResult | null> {
    try {
        const res = await fetch(`http://${address}:${port}/api/mesh/hello`, {
            signal: AbortSignal.timeout(PROBE_TIMEOUT),
        });
        if (!res.ok) return null;
        const data = await res.json() as ProbeResult;
        return data.titan ? data : null;
    } catch {
        return null;
    }
}

// ── Manual Peer ──────────────────────────────────────────────

export async function addManualPeer(address: string, port: number, _nodeId: string): Promise<boolean> {
    const info = await probePeer(address, port);
    if (!info) return false;
    registerPeer({
        nodeId: info.nodeId,
        hostname: address,
        address,
        port,
        version: info.version,
        models: info.models,
        agentCount: info.agentCount,
        load: info.load,
        discoveredVia: 'manual',
        lastSeen: Date.now(),
    });
    return true;
}

// ── Lifecycle ──────────────────────────────────────────────────

export async function startDiscovery(
    nodeId: string,
    port: number,
    options: { mdns?: boolean; tailscale?: boolean },
): Promise<void> {
    if (options.mdns !== false) {
        await startMdns(nodeId, port);
    }

    if (options.tailscale !== false) {
        // Initial scan
        await scanTailscalePeers(nodeId, port);
        // Re-scan every 60 seconds
        tailscaleInterval = setInterval(() => {
            scanTailscalePeers(nodeId, port).catch(() => {});
        }, 60_000);
    }

    // Prune stale peers every 2 minutes (remove if not seen for 5 minutes)
    peerPruneInterval = setInterval(() => {
        const cutoff = Date.now() - 300_000;
        for (const [id, peer] of peers) {
            if (peer.lastSeen < cutoff) {
                peers.delete(id);
                logger.debug(COMPONENT, `Pruned stale peer: ${peer.hostname}`);
            }
        }
    }, 120_000);
}

export function stopDiscovery(): void {
    if (bonjourBrowser) { bonjourBrowser.stop(); bonjourBrowser = null; }
    if (bonjourInstance) { bonjourInstance.destroy(); bonjourInstance = null; }
    if (tailscaleInterval) { clearInterval(tailscaleInterval); tailscaleInterval = null; }
    if (peerPruneInterval) { clearInterval(peerPruneInterval); peerPruneInterval = null; }
    peers.clear();
    logger.info(COMPONENT, 'Discovery stopped');
}
