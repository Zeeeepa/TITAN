/**
 * TITAN — Mesh Node Identity
 * Generates and persists a stable Node ID per installation.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { TITAN_HOME } from '../utils/constants.js';

const NODE_ID_PATH = join(TITAN_HOME, 'node-id');

/** Get or create the stable node ID for this TITAN installation */
export function getOrCreateNodeId(): string {
    mkdirSync(TITAN_HOME, { recursive: true });
    if (existsSync(NODE_ID_PATH)) {
        const id = readFileSync(NODE_ID_PATH, 'utf-8').trim();
        if (id.length > 0) return id;
    }
    const nodeId = randomBytes(8).toString('hex');
    writeFileSync(NODE_ID_PATH, nodeId, 'utf-8');
    return nodeId;
}
