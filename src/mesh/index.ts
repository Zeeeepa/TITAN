/**
 * TITAN — Mesh Networking
 * Auto-discover and connect TITAN instances across LAN and Tailscale VPN.
 */
export { getOrCreateNodeId } from './identity.js';
export {
    startDiscovery,
    stopDiscovery,
    getPeers,
    getPeer,
    registerPeer,
    addManualPeer,
    type MeshPeer,
} from './discovery.js';
export {
    connectToPeer,
    sendToPeer,
    broadcastToMesh,
    routeTaskToNode,
    handleMeshWebSocket,
    generateMeshAuth,
    verifyMeshAuth,
    getConnectedPeerCount,
    disconnectAll,
    startHeartbeat,
    stopHeartbeat,
    type MeshMessage,
} from './transport.js';
export {
    findModelOnMesh,
    getMeshModels,
    resolveModelNode,
} from './registry.js';
