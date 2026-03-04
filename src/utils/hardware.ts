/**
 * TITAN — Hardware Detection Utilities
 * Detects GPU availability to auto-tune performance settings.
 */
import { existsSync } from 'fs';
import { execSync } from 'child_process';

/**
 * Detect whether a discrete GPU usable for LLM inference is available.
 * Integrated GPUs (AMD APUs with /dev/kfd) are excluded since Ollama
 * uses CPU-only on those — validated on Ryzen 7 5825U (Barcelo).
 */
export function detectGpu(): boolean {
    // NVIDIA discrete GPU — always usable for inference
    if (existsSync('/dev/nvidia0')) return true;

    // AMD ROCm: /dev/kfd exists for both discrete and integrated GPUs.
    // Check if it's actually a discrete GPU by looking for dedicated VRAM.
    if (existsSync('/dev/kfd')) {
        try {
            // rocm-smi reports discrete AMD GPUs; exits non-zero if only iGPU
            const out = execSync('rocm-smi --showmeminfo vram 2>/dev/null', { timeout: 3000 }).toString();
            if (/vram total/i.test(out)) return true;
        } catch { /* rocm-smi not available or no discrete GPU */ }

        // Fallback: check lspci for discrete AMD GPU (Navi, RDNA, etc.)
        try {
            const out = execSync('lspci 2>/dev/null', { timeout: 3000 }).toString();
            if (/display.*amd.*navi/i.test(out) || /vga.*amd.*radeon\s+rx/i.test(out)) return true;
        } catch { /* no lspci */ }

        // /dev/kfd exists but no discrete GPU found — likely integrated (APU)
        return false;
    }

    // Fallback: check lspci for NVIDIA without /dev/nvidia0
    try {
        const out = execSync('lspci 2>/dev/null', { timeout: 3000 }).toString();
        if (/vga.*nvidia/i.test(out)) return true;
    } catch { /* no lspci or not available */ }

    return false;
}
