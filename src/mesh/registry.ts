/**
 * TITAN — Mesh Model & Agent Registry
 * Aggregates capabilities from all mesh peers for remote model routing.
 */
import { getPeers, type MeshPeer } from './discovery.js';
import logger from '../utils/logger.js';

const COMPONENT = 'MeshRegistry';

/** Check if a model is available on a remote mesh peer */
export function findModelOnMesh(model: string): MeshPeer | null {
    const peers = getPeers();
    const candidates = peers.filter(p => p.models.includes(model));
    if (candidates.length === 0) return null;
    // Pick the peer with lowest load
    candidates.sort((a, b) => a.load - b.load);
    return candidates[0];
}

/** Get all models available across the mesh (excluding local) */
export function getMeshModels(): Array<{ model: string; nodeId: string; hostname: string }> {
    const result: Array<{ model: string; nodeId: string; hostname: string }> = [];
    for (const peer of getPeers()) {
        for (const model of peer.models) {
            result.push({ model, nodeId: peer.nodeId, hostname: peer.hostname });
        }
    }
    return result;
}

/** Resolve whether a model should be served locally or routed to a mesh peer */
export function resolveModelNode(
    model: string,
    localModels: string[],
): { local: boolean; peer?: MeshPeer } {
    // Always prefer local if available
    if (localModels.includes(model)) {
        return { local: true };
    }

    // Check mesh peers
    const peer = findModelOnMesh(model);
    if (peer) {
        logger.debug(COMPONENT, `Model ${model} available on peer ${peer.hostname}`);
        return { local: false, peer };
    }

    // Fall back to local (will error normally if provider unavailable)
    return { local: true };
}
