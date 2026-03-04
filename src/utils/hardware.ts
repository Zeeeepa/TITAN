/**
 * TITAN — Hardware Detection Utilities
 * Detects GPU availability to auto-tune performance settings.
 */
import { existsSync } from 'fs';
import { execSync } from 'child_process';

/** Detect whether a GPU (NVIDIA or AMD ROCm) is available */
export function detectGpu(): boolean {
    // NVIDIA
    if (existsSync('/dev/nvidia0')) return true;
    // AMD ROCm
    if (existsSync('/dev/kfd')) return true;
    // Fallback: check lspci
    try {
        const out = execSync('lspci 2>/dev/null', { timeout: 3000 }).toString();
        if (/vga.*nvidia/i.test(out) || /display.*amd.*navi/i.test(out)) return true;
    } catch { /* no lspci or not available */ }
    return false;
}
