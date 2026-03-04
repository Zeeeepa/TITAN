/**
 * TITAN — Hardware Detection Tests
 * Tests GPU detection utility for auto-tuning stall thresholds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted() so mock functions are available inside vi.mock() callbacks
const { mockExistsSync, mockExecSync } = vi.hoisted(() => ({
    mockExistsSync: vi.fn().mockReturnValue(false),
    mockExecSync: vi.fn().mockImplementation(() => { throw new Error('no lspci'); }),
}));

vi.mock('fs', () => ({
    existsSync: mockExistsSync,
}));
vi.mock('child_process', () => ({
    execSync: mockExecSync,
}));

import { detectGpu } from '../src/utils/hardware.js';

describe('Hardware Detection', () => {
    beforeEach(() => {
        mockExistsSync.mockReset().mockReturnValue(false);
        mockExecSync.mockReset().mockImplementation(() => { throw new Error('no lspci'); });
    });

    it('detectGpu returns false when no GPU devices exist', () => {
        expect(detectGpu()).toBe(false);
    });

    it('detectGpu returns true when /dev/nvidia0 exists', () => {
        mockExistsSync.mockImplementation((path: string) => path === '/dev/nvidia0');
        expect(detectGpu()).toBe(true);
    });

    it('detectGpu returns true when /dev/kfd exists (AMD ROCm)', () => {
        mockExistsSync.mockImplementation((path: string) => path === '/dev/kfd');
        expect(detectGpu()).toBe(true);
    });

    it('detectGpu returns true when lspci shows NVIDIA GPU', () => {
        mockExecSync.mockReturnValue('00:02.0 VGA compatible controller: NVIDIA Corporation GA106');
        expect(detectGpu()).toBe(true);
    });

    it('detectGpu returns false when lspci shows no GPU', () => {
        mockExecSync.mockReturnValue('00:02.0 VGA compatible controller: Intel Corporation HD Graphics');
        expect(detectGpu()).toBe(false);
    });

    it('detectGpu returns false when lspci is not available', () => {
        mockExecSync.mockImplementation(() => { throw new Error('command not found'); });
        expect(detectGpu()).toBe(false);
    });
});
