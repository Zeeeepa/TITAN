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

    it('detectGpu returns false when /dev/kfd exists but only iGPU (no rocm-smi, no discrete lspci)', () => {
        // AMD APU scenario: /dev/kfd exists but no discrete GPU
        mockExistsSync.mockImplementation((path: string) => path === '/dev/kfd');
        mockExecSync.mockImplementation(() => { throw new Error('no rocm-smi'); });
        expect(detectGpu()).toBe(false);
    });

    it('detectGpu returns true when /dev/kfd exists with rocm-smi showing VRAM', () => {
        // Discrete AMD GPU scenario: /dev/kfd + rocm-smi shows VRAM
        mockExistsSync.mockImplementation((path: string) => path === '/dev/kfd');
        mockExecSync.mockImplementation((cmd: string) => {
            if (cmd.includes('rocm-smi')) return 'VRAM Total Memory (B): 8589934592';
            throw new Error('not lspci');
        });
        expect(detectGpu()).toBe(true);
    });

    it('detectGpu returns true when /dev/kfd exists with discrete AMD GPU in lspci', () => {
        // Discrete AMD GPU: /dev/kfd + lspci shows Navi
        mockExistsSync.mockImplementation((path: string) => path === '/dev/kfd');
        mockExecSync.mockImplementation((cmd: string) => {
            if (cmd.includes('rocm-smi')) throw new Error('rocm-smi not found');
            return '03:00.0 Display controller: Advanced Micro Devices, Inc. [AMD/ATI] Navi 21 [Radeon RX 6800]';
        });
        expect(detectGpu()).toBe(true);
    });

    it('detectGpu returns true when /dev/kfd exists with Radeon RX in lspci', () => {
        mockExistsSync.mockImplementation((path: string) => path === '/dev/kfd');
        mockExecSync.mockImplementation((cmd: string) => {
            if (cmd.includes('rocm-smi')) throw new Error('rocm-smi not found');
            return '03:00.0 VGA compatible controller: AMD Radeon RX 7900 XTX';
        });
        expect(detectGpu()).toBe(true);
    });

    it('detectGpu returns true when lspci shows NVIDIA GPU (no /dev/nvidia0)', () => {
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

    it('detectGpu returns false for AMD APU with Barcelo iGPU', () => {
        // Exact scenario from GMKtec M5 PLUS (Ryzen 7 5825U)
        mockExistsSync.mockImplementation((path: string) => path === '/dev/kfd');
        mockExecSync.mockImplementation((cmd: string) => {
            if (cmd.includes('rocm-smi')) throw new Error('rocm-smi not found');
            return '05:00.0 VGA compatible controller: Advanced Micro Devices, Inc. [AMD/ATI] Barcelo (rev c1)';
        });
        expect(detectGpu()).toBe(false);
    });
});
