/**
 * TITAN — Cloudflare Tunnel Tests
 * Tests the tunnel module: start, stop, status, availability checks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockKill = vi.fn();
let mockStdout: any = null;
let mockStderr: any = null;
let mockExitCb: ((code: number) => void) | null = null;
let mockErrorCb: ((err: Error) => void) | null = null;
let spawnCalls: any[] = [];
let execSyncCalls: any[] = [];
let execSyncShouldThrow = false;

vi.mock('child_process', () => ({
    spawn: vi.fn((...args: any[]) => {
        spawnCalls.push(args);
        const proc: any = {
            pid: 12345,
            stdout: mockStdout,
            stderr: mockStderr,
            kill: mockKill,
            on: vi.fn((event: string, cb: any) => {
                if (event === 'exit') mockExitCb = cb;
                if (event === 'error') mockErrorCb = cb;
            }),
        };
        return proc;
    }),
    execSync: vi.fn((...args: any[]) => {
        execSyncCalls.push(args);
        if (execSyncShouldThrow) throw new Error('command not found');
        return 'cloudflared version 2024.1.0';
    }),
}));

vi.mock('readline', () => ({
    createInterface: vi.fn(() => ({
        on: vi.fn(),
    })),
}));

// ── Test suite ───────────────────────────────────────────────────────

describe('Tunnel Module', () => {
    let tunnel: typeof import('../src/utils/tunnel.js');

    beforeEach(async () => {
        vi.resetModules();
        spawnCalls = [];
        execSyncCalls = [];
        execSyncShouldThrow = false;
        mockKill.mockClear();
        mockStdout = { on: vi.fn() };
        mockStderr = { on: vi.fn() };
        mockExitCb = null;
        mockErrorCb = null;
        tunnel = await import('../src/utils/tunnel.js');
    });

    afterEach(() => {
        try { tunnel.stopTunnel(); } catch {}
    });

    // ── isTunnelAvailable ──────────────────────────────────────────

    describe('isTunnelAvailable', () => {
        it('should return true when cloudflared is installed', () => {
            expect(tunnel.isTunnelAvailable()).toBe(true);
        });

        it('should return false when cloudflared is not installed', () => {
            execSyncShouldThrow = true;
            expect(tunnel.isTunnelAvailable()).toBe(false);
        });

        it('should call execSync with cloudflared --version', () => {
            tunnel.isTunnelAvailable();
            expect(execSyncCalls.length).toBeGreaterThan(0);
            expect(execSyncCalls[0][0]).toBe('cloudflared --version');
        });
    });

    // ── getTunnelStatus ────────────────────────────────────────────

    describe('getTunnelStatus', () => {
        it('should return inactive status by default', () => {
            const status = tunnel.getTunnelStatus();
            expect(status.active).toBe(false);
            expect(status.url).toBeNull();
            expect(status.mode).toBeNull();
            expect(status.pid).toBeNull();
            expect(status.error).toBeNull();
            expect(status.startedAt).toBeNull();
        });

        it('should have correct shape', () => {
            const status = tunnel.getTunnelStatus();
            expect(status).toHaveProperty('active');
            expect(status).toHaveProperty('url');
            expect(status).toHaveProperty('mode');
            expect(status).toHaveProperty('pid');
            expect(status).toHaveProperty('error');
            expect(status).toHaveProperty('startedAt');
        });
    });

    // ── startTunnel ────────────────────────────────────────────────

    describe('startTunnel', () => {
        it('should not start when disabled', async () => {
            await tunnel.startTunnel(8080, { enabled: false, mode: 'quick' });
            expect(spawnCalls).toHaveLength(0);
        });

        it('should spawn cloudflared for quick mode', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            expect(spawnCalls).toHaveLength(1);
            expect(spawnCalls[0][0]).toBe('cloudflared');
            expect(spawnCalls[0][1]).toContain('tunnel');
            expect(spawnCalls[0][1]).toContain('--url');
            expect(spawnCalls[0][1]).toContain('http://localhost:8080');
        });

        it('should spawn cloudflared for named mode with token', async () => {
            await tunnel.startTunnel(8080, {
                enabled: true,
                mode: 'named',
                token: 'my-token-123',
                tunnelId: 'my-tunnel',
            });
            expect(spawnCalls).toHaveLength(1);
            expect(spawnCalls[0][1]).toContain('run');
            expect(spawnCalls[0][1]).toContain('--token');
            expect(spawnCalls[0][1]).toContain('my-token-123');
        });

        it('should spawn cloudflared for named mode with tunnelId', async () => {
            await tunnel.startTunnel(8080, {
                enabled: true,
                mode: 'named',
                tunnelId: 'test-tunnel',
            });
            expect(spawnCalls).toHaveLength(1);
            expect(spawnCalls[0][1]).toContain('test-tunnel');
        });

        it('should not start if cloudflared is not available', async () => {
            execSyncShouldThrow = true;
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            expect(spawnCalls).toHaveLength(0);
            const status = tunnel.getTunnelStatus();
            expect(status.error).toContain('cloudflared binary not found');
        });

        it('should not start a second tunnel if one is already running', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            await tunnel.startTunnel(9090, { enabled: true, mode: 'quick' });
            expect(spawnCalls).toHaveLength(1);
        });

        it('should use different ports in quick mode URL', async () => {
            await tunnel.startTunnel(3000, { enabled: true, mode: 'quick' });
            expect(spawnCalls[0][1]).toContain('http://localhost:3000');
        });

        it('should set up readline on stdout and stderr', async () => {
            const { createInterface } = await import('readline');
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            expect(createInterface).toHaveBeenCalled();
        });

        it('should set startedAt for named mode with hostname', async () => {
            await tunnel.startTunnel(8080, {
                enabled: true,
                mode: 'named',
                hostname: 'titan.example.com',
                token: 'tok',
            });
            // Named mode with hostname sets startedAt immediately
            const status = tunnel.getTunnelStatus();
            expect(status.startedAt).not.toBeNull();
        });

        it('should handle spawn error', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            // Simulate error callback
            if (mockErrorCb) {
                mockErrorCb(new Error('spawn failed'));
            }
            const status = tunnel.getTunnelStatus();
            expect(status.error).toContain('Failed to start cloudflared');
        });

        it('should set mode correctly for quick tunnel', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            // Mode should be set even before URL is parsed
            const status = tunnel.getTunnelStatus();
            // active might be false since no URL parsed yet, but mode should be set
            expect(status.mode).toBe('quick');
        });

        it('should set mode correctly for named tunnel', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'named', token: 'tok' });
            const status = tunnel.getTunnelStatus();
            expect(status.mode).toBe('named');
        });
    });

    // ── stopTunnel ─────────────────────────────────────────────────

    describe('stopTunnel', () => {
        it('should be safe to call when no tunnel is running', () => {
            expect(() => tunnel.stopTunnel()).not.toThrow();
        });

        it('should kill the tunnel process', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            tunnel.stopTunnel();
            expect(mockKill).toHaveBeenCalledWith('SIGTERM');
        });

        it('should reset all state after stopping', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            tunnel.stopTunnel();
            const status = tunnel.getTunnelStatus();
            expect(status.active).toBe(false);
            expect(status.url).toBeNull();
            expect(status.mode).toBeNull();
            expect(status.pid).toBeNull();
            expect(status.error).toBeNull();
            expect(status.startedAt).toBeNull();
        });

        it('should be idempotent', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            tunnel.stopTunnel();
            tunnel.stopTunnel();
            expect(mockKill).toHaveBeenCalledTimes(1);
        });
    });

    // ── Config edge cases ──────────────────────────────────────────

    describe('config edge cases', () => {
        it('should handle named mode without token', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'named' });
            expect(spawnCalls).toHaveLength(1);
            expect(spawnCalls[0][1]).not.toContain('--token');
        });

        it('should handle named mode without tunnelId', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'named', token: 'tok' });
            expect(spawnCalls).toHaveLength(1);
        });

        it('should pass hostname in named mode', async () => {
            await tunnel.startTunnel(8080, {
                enabled: true,
                mode: 'named',
                token: 'tok',
                hostname: 'app.example.com',
            });
            expect(spawnCalls).toHaveLength(1);
        });

        it('should use port 0 without error', async () => {
            await tunnel.startTunnel(0, { enabled: true, mode: 'quick' });
            expect(spawnCalls[0][1]).toContain('http://localhost:0');
        });

        it('should use high port numbers', async () => {
            await tunnel.startTunnel(65535, { enabled: true, mode: 'quick' });
            expect(spawnCalls[0][1]).toContain('http://localhost:65535');
        });
    });

    // ── TunnelStatus type ──────────────────────────────────────────

    describe('TunnelStatus type checks', () => {
        it('should have all required fields', () => {
            const status = tunnel.getTunnelStatus();
            const keys = Object.keys(status);
            expect(keys).toContain('active');
            expect(keys).toContain('url');
            expect(keys).toContain('mode');
            expect(keys).toContain('pid');
            expect(keys).toContain('error');
            expect(keys).toContain('startedAt');
        });

        it('active should be boolean', () => {
            expect(typeof tunnel.getTunnelStatus().active).toBe('boolean');
        });

        it('url should be null when inactive', () => {
            expect(tunnel.getTunnelStatus().url).toBeNull();
        });

        it('pid should be null when no process', () => {
            expect(tunnel.getTunnelStatus().pid).toBeNull();
        });
    });

    // ── Quick mode URL variations ──────────────────────────────────

    describe('quick mode port variations', () => {
        const ports = [80, 443, 3000, 8080, 8443, 48420];
        for (const port of ports) {
            it(`should generate correct URL for port ${port}`, async () => {
                vi.resetModules();
                spawnCalls = [];
                execSyncShouldThrow = false;
                const t = await import('../src/utils/tunnel.js');
                await t.startTunnel(port, { enabled: true, mode: 'quick' });
                expect(spawnCalls[0][1]).toContain(`http://localhost:${port}`);
                t.stopTunnel();
            });
        }
    });

    // ── Named mode argument combinations ───────────────────────────

    describe('named mode argument combinations', () => {
        it('should include both token and tunnelId when provided', async () => {
            await tunnel.startTunnel(8080, {
                enabled: true,
                mode: 'named',
                token: 'eyJ...',
                tunnelId: 'abc123',
            });
            const args = spawnCalls[0][1];
            expect(args).toContain('--token');
            expect(args).toContain('eyJ...');
            expect(args).toContain('abc123');
        });

        it('should not include --url flag in named mode', async () => {
            await tunnel.startTunnel(8080, {
                enabled: true,
                mode: 'named',
                token: 'tok',
            });
            expect(spawnCalls[0][1]).not.toContain('--url');
        });

        it('quick mode should not include --token', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            expect(spawnCalls[0][1]).not.toContain('--token');
        });

        it('quick mode should not include run subcommand', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            expect(spawnCalls[0][1]).not.toContain('run');
        });
    });

    // ── Multiple lifecycle operations ──────────────────────────────

    describe('lifecycle', () => {
        it('should allow start after stop', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            tunnel.stopTunnel();
            vi.resetModules();
            spawnCalls = [];
            const t2 = await import('../src/utils/tunnel.js');
            await t2.startTunnel(9090, { enabled: true, mode: 'quick' });
            expect(spawnCalls).toHaveLength(1);
            t2.stopTunnel();
        });

        it('should return correct PID when running', async () => {
            await tunnel.startTunnel(8080, { enabled: true, mode: 'quick' });
            const status = tunnel.getTunnelStatus();
            expect(status.pid).toBe(12345);
        });
    });
});
