/**
 * TITAN — Mesh Networking
 * Auto-discover and connect TITAN instances across LAN and Tailscale VPN.
 * Supports up to 5 peers with user-approval-based trust model.
 */
export { getOrCreateNodeId } from './identity.js';
export {
    startDiscovery,
    stopDiscovery,
    getPeers,
    getPeer,
    registerPeer,
    removePeer,
    addManualPeer,
    getPendingPeers,
    approvePeer,
    rejectPeer,
    revokePeer,
    isPeerApproved,
    getApprovedPeerCount,
    setMaxPeers,
    setOnPeerDiscovered,
    setConnectApprovedPeer,
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
    getActiveRemoteTaskCount,
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
