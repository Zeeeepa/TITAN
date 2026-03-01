/**
 * TITAN — Pairing Manager
 * DM pairing for secure inbound messaging (like OpenClaw's dmPolicy).
 */
import { getDb } from '../memory/memory.js';
import logger from '../utils/logger.js';
import { v4 as uuid } from 'uuid';
import { randomBytes } from 'crypto';

const COMPONENT = 'Pairing';

interface PairingRequest {
    code: string;
    channel: string;
    userId: string;
    userName?: string;
    createdAt: string;
    status: 'pending' | 'approved' | 'denied';
}

/** In-memory pairing state (persisted via memory store on approval) */
const pairingRequests: Map<string, PairingRequest> = new Map();
const approvedUsers: Map<string, Set<string>> = new Map(); // channel -> Set<userId>

/** Generate a short pairing code */
function generatePairingCode(): string {
    return randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
}

/** Check if a user is approved on a channel */
export function isUserApproved(channel: string, userId: string): boolean {
    const channelUsers = approvedUsers.get(channel);
    return channelUsers?.has(userId) || false;
}

/** Create a pairing request for a new DM sender */
export function createPairingRequest(channel: string, userId: string, userName?: string): string {
    const code = generatePairingCode();
    const request: PairingRequest = {
        code,
        channel,
        userId,
        userName,
        createdAt: new Date().toISOString(),
        status: 'pending',
    };
    pairingRequests.set(code, request);
    logger.info(COMPONENT, `Pairing request created: ${code} for ${channel}/${userId} (${userName || 'unknown'})`);
    return code;
}

/** Approve a pairing request */
export function approvePairing(channel: string, code: string): { success: boolean; message: string } {
    const request = pairingRequests.get(code);
    if (!request) {
        return { success: false, message: `Pairing code "${code}" not found.` };
    }
    if (request.channel !== channel) {
        return { success: false, message: `Pairing code "${code}" is for channel "${request.channel}", not "${channel}".` };
    }
    if (request.status === 'approved') {
        return { success: false, message: `Pairing code "${code}" already approved.` };
    }

    request.status = 'approved';

    // Add to approved users
    if (!approvedUsers.has(channel)) {
        approvedUsers.set(channel, new Set());
    }
    approvedUsers.get(channel)!.add(request.userId);

    logger.info(COMPONENT, `Approved pairing: ${channel}/${request.userId} (${request.userName})`);
    return { success: true, message: `Approved ${request.userName || request.userId} on ${channel}.` };
}

/** Deny a pairing request */
export function denyPairing(code: string): { success: boolean; message: string } {
    const request = pairingRequests.get(code);
    if (!request) {
        return { success: false, message: `Pairing code "${code}" not found.` };
    }
    request.status = 'denied';
    logger.info(COMPONENT, `Denied pairing: ${request.channel}/${request.userId}`);
    return { success: true, message: `Denied pairing for ${request.userName || request.userId}.` };
}

/** List pending pairing requests */
export function listPendingPairings(): PairingRequest[] {
    return Array.from(pairingRequests.values()).filter((r) => r.status === 'pending');
}

/** List all approved users */
export function listApprovedUsers(): Array<{ channel: string; userId: string }> {
    const result: Array<{ channel: string; userId: string }> = [];
    for (const [channel, users] of approvedUsers) {
        for (const userId of users) {
            result.push({ channel, userId });
        }
    }
    return result;
}
