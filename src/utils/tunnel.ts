/**
 * TITAN — Cloudflare Tunnel Integration
 * Exposes the gateway to the internet via `cloudflared` (quick or named tunnel).
 *
 * Quick mode:  spawns `cloudflared tunnel --url http://localhost:{port}` → free trycloudflare.com URL
 * Named mode:  spawns `cloudflared tunnel run --token {token}` → custom hostname
 */
import { spawn, execSync, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import logger from './logger.js';

const COMPONENT = 'Tunnel';

export interface TunnelConfig {
    enabled: boolean;
    mode: 'quick' | 'named';
    tunnelId?: string;
    token?: string;
    hostname?: string;
}

export interface TunnelStatus {
    active: boolean;
    url: string | null;
    mode: 'quick' | 'named' | null;
    pid: number | null;
    error: string | null;
    startedAt: string | null;
}

let tunnelProcess: ChildProcess | null = null;
let tunnelUrl: string | null = null;
let tunnelMode: 'quick' | 'named' | null = null;
let tunnelError: string | null = null;
let tunnelStartedAt: string | null = null;
let intentionallyStopped = false;
let restartPort: number | null = null;
let restartConfig: TunnelConfig | null = null;

/**
 * Check if the `cloudflared` binary is available on PATH.
 */
export function isTunnelAvailable(): boolean {
    try {
        execSync('cloudflared --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Start a Cloudflare Tunnel.
 * @param port    Local port to expose (gateway port)
 * @param config  Tunnel configuration
 */
export async function startTunnel(port: number, config: TunnelConfig): Promise<void> {
    if (!config.enabled) {
        logger.info(COMPONENT, 'Tunnel is disabled');
        return;
    }

    if (tunnelProcess) {
        logger.warn(COMPONENT, 'Tunnel is already running');
        return;
    }

    if (!isTunnelAvailable()) {
        tunnelError = 'cloudflared binary not found. Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
        logger.error(COMPONENT, tunnelError);
        return;
    }

    intentionallyStopped = false;
    restartPort = port;
    restartConfig = config;
    tunnelMode = config.mode;

    const args: string[] = config.mode === 'named'
        ? ['tunnel', 'run', ...(config.token ? ['--token', config.token] : []), ...(config.tunnelId ? [config.tunnelId] : [])]
        : ['tunnel', '--url', `http://localhost:${port}`];

    logger.info(COMPONENT, `Starting ${config.mode} tunnel: cloudflared ${args.join(' ')}`);

    try {
        tunnelProcess = spawn('cloudflared', args, {
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        tunnelProcess.on('error', (err) => {
            tunnelError = `Failed to start cloudflared: ${err.message}`;
            logger.error(COMPONENT, tunnelError);
            tunnelProcess = null;
        });

        tunnelProcess.on('exit', (code) => {
            logger.info(COMPONENT, `cloudflared exited with code ${code}`);
            const wasStopped = intentionallyStopped;
            tunnelProcess = null;

            if (!wasStopped && restartPort !== null && restartConfig !== null) {
                logger.warn(COMPONENT, 'Tunnel exited unexpectedly — restarting in 5s...');
                setTimeout(() => {
                    if (!intentionallyStopped && restartPort !== null && restartConfig !== null) {
                        startTunnel(restartPort, restartConfig).catch((e) => {
                            logger.error(COMPONENT, `Restart failed: ${(e as Error).message}`);
                        });
                    }
                }, 5000);
            }
        });

        // Parse stdout/stderr for the tunnel URL
        const parseUrl = (line: string) => {
            // Quick mode: look for trycloudflare.com URL
            const quickMatch = line.match(/(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/);
            if (quickMatch) {
                tunnelUrl = quickMatch[1];
                tunnelStartedAt = new Date().toISOString();
                tunnelError = null;
                logger.info(COMPONENT, `Tunnel active: ${tunnelUrl}`);
            }
            // Named mode: look for configured hostname or any https URL
            if (config.mode === 'named' && config.hostname) {
                if (line.includes(config.hostname)) {
                    tunnelUrl = `https://${config.hostname}`;
                    tunnelStartedAt = new Date().toISOString();
                    tunnelError = null;
                    logger.info(COMPONENT, `Named tunnel active: ${tunnelUrl}`);
                }
            }
            // Named mode without hostname: detect "registered" or connection success
            if (config.mode === 'named' && !tunnelUrl && line.includes('Registered tunnel connection')) {
                tunnelUrl = config.hostname ? `https://${config.hostname}` : 'connected (check Cloudflare dashboard for URL)';
                tunnelStartedAt = new Date().toISOString();
                tunnelError = null;
                logger.info(COMPONENT, `Named tunnel connected`);
            }
        };

        if (tunnelProcess.stdout) {
            const rl = createInterface({ input: tunnelProcess.stdout });
            rl.on('line', parseUrl);
        }
        if (tunnelProcess.stderr) {
            const rl2 = createInterface({ input: tunnelProcess.stderr });
            rl2.on('line', parseUrl);
        }

        // For named mode, mark as started immediately (URL comes from config)
        if (config.mode === 'named' && config.hostname) {
            tunnelStartedAt = new Date().toISOString();
        }
    } catch (error) {
        tunnelError = `Failed to start tunnel: ${(error as Error).message}`;
        logger.error(COMPONENT, tunnelError);
    }
}

/**
 * Stop the running tunnel.
 */
export function stopTunnel(): void {
    intentionallyStopped = true;
    if (tunnelProcess) {
        logger.info(COMPONENT, 'Stopping tunnel...');
        tunnelProcess.kill('SIGTERM');
        tunnelProcess = null;
    }
    tunnelUrl = null;
    tunnelMode = null;
    tunnelStartedAt = null;
    tunnelError = null;
    restartPort = null;
    restartConfig = null;
}

/**
 * Get the current tunnel status.
 */
export function getTunnelStatus(): TunnelStatus {
    return {
        active: tunnelProcess !== null && tunnelUrl !== null,
        url: tunnelUrl,
        mode: tunnelMode,
        pid: tunnelProcess?.pid ?? null,
        error: tunnelError,
        startedAt: tunnelStartedAt,
    };
}
