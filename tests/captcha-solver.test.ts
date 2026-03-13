/**
 * Tests for src/browsing/captchaSolver.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock config
const mockConfig = {
    capsolver: {
        enabled: true,
        apiKey: 'test-api-key-123',
        timeoutMs: 10_000,
        minScore: 0.7,
    },
};

vi.mock('../src/config/config.js', () => ({
    loadConfig: vi.fn(() => mockConfig),
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock page
function createMockPage(evaluateResult: unknown = null) {
    return {
        url: vi.fn().mockReturnValue('https://example.com/form'),
        evaluate: vi.fn().mockResolvedValue(evaluateResult),
    } as any;
}

describe('CaptchaSolver', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('detectCaptchaInfo', () => {
        it('should return null when no CAPTCHA detected', async () => {
            const { detectCaptchaInfo } = await import('../src/browsing/captchaSolver.js');
            const page = createMockPage(null);
            const result = await detectCaptchaInfo(page);
            expect(result).toBeNull();
        });

        it('should detect reCAPTCHA v2 from div', async () => {
            const { detectCaptchaInfo } = await import('../src/browsing/captchaSolver.js');
            const page = createMockPage({
                type: 'recaptcha_v2',
                sitekey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
            });
            const result = await detectCaptchaInfo(page);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('recaptcha_v2');
            expect(result!.sitekey).toBe('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI');
            expect(result!.pageUrl).toBe('https://example.com/form');
        });

        it('should detect reCAPTCHA v3 (invisible)', async () => {
            const { detectCaptchaInfo } = await import('../src/browsing/captchaSolver.js');
            const page = createMockPage({
                type: 'recaptcha_v3',
                sitekey: '6LfGqSErAAAAAPKHQ-M1qrOHTide4Y06GlKxjO_l',
            });
            const result = await detectCaptchaInfo(page);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('recaptcha_v3');
        });

        it('should detect Turnstile', async () => {
            const { detectCaptchaInfo } = await import('../src/browsing/captchaSolver.js');
            const page = createMockPage({
                type: 'turnstile',
                sitekey: '0x4AAAAAAADnPIDROrmt1Wwj',
            });
            const result = await detectCaptchaInfo(page);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('turnstile');
        });

        it('should return null when sitekey is empty', async () => {
            const { detectCaptchaInfo } = await import('../src/browsing/captchaSolver.js');
            const page = createMockPage({ type: 'recaptcha_v2', sitekey: '' });
            const result = await detectCaptchaInfo(page);
            expect(result).toBeNull();
        });
    });

    describe('solveCaptcha', () => {
        it('should return error when capsolver is disabled', async () => {
            const { loadConfig } = await import('../src/config/config.js');
            (loadConfig as any).mockReturnValueOnce({
                capsolver: { enabled: false, apiKey: '', timeoutMs: 10000, minScore: 0.7 },
            });

            const { solveCaptcha } = await import('../src/browsing/captchaSolver.js');
            const page = createMockPage();
            const result = await solveCaptcha(page);
            expect(result.solved).toBe(false);
            expect(result.error).toContain('not configured');
        });

        it('should return error when no apiKey', async () => {
            const { loadConfig } = await import('../src/config/config.js');
            (loadConfig as any).mockReturnValueOnce({
                capsolver: { enabled: true, apiKey: undefined, timeoutMs: 10000, minScore: 0.7 },
            });

            const { solveCaptcha } = await import('../src/browsing/captchaSolver.js');
            const page = createMockPage();
            const result = await solveCaptcha(page);
            expect(result.solved).toBe(false);
            expect(result.error).toContain('not configured');
        });

        it('should return error when no CAPTCHA on page', async () => {
            const { solveCaptcha } = await import('../src/browsing/captchaSolver.js');
            const page = createMockPage(null);
            const result = await solveCaptcha(page);
            expect(result.solved).toBe(false);
            expect(result.type).toBe('none');
        });

        it('should solve reCAPTCHA v2 via CapSolver API', async () => {
            const { solveCaptcha } = await import('../src/browsing/captchaSolver.js');
            // First call: detectCaptchaInfo (page.evaluate)
            // Second call: injectCaptchaToken (page.evaluate)
            const page = {
                url: vi.fn().mockReturnValue('https://example.com/form'),
                evaluate: vi.fn()
                    .mockResolvedValueOnce({
                        type: 'recaptcha_v2',
                        sitekey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
                    })
                    .mockResolvedValueOnce(undefined), // inject token
            } as any;

            mockFetch
                .mockResolvedValueOnce({
                    json: () => Promise.resolve({ errorId: 0, taskId: 'task-abc-123' }),
                })
                .mockResolvedValueOnce({
                    json: () => Promise.resolve({
                        errorId: 0,
                        status: 'ready',
                        solution: { gRecaptchaResponse: 'solved-token-xyz' },
                    }),
                });

            const result = await solveCaptcha(page);
            expect(result.solved).toBe(true);
            expect(result.type).toBe('recaptcha_v2');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('should handle CapSolver API errors', async () => {
            const { solveCaptcha } = await import('../src/browsing/captchaSolver.js');
            const page = {
                url: vi.fn().mockReturnValue('https://example.com/form'),
                evaluate: vi.fn().mockResolvedValueOnce({
                    type: 'recaptcha_v2',
                    sitekey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
                }),
            } as any;

            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({
                    errorId: 1,
                    errorDescription: 'ERROR_KEY_DOES_NOT_EXIST',
                }),
            });

            const result = await solveCaptcha(page);
            expect(result.solved).toBe(false);
            expect(result.error).toContain('ERROR_KEY_DOES_NOT_EXIST');
        });
    });

    describe('injectCaptchaToken', () => {
        it('should call page.evaluate with correct params for reCAPTCHA', async () => {
            const { injectCaptchaToken } = await import('../src/browsing/captchaSolver.js');
            const page = createMockPage(undefined);
            const info = {
                type: 'recaptcha_v2' as const,
                sitekey: 'test-key',
                pageUrl: 'https://example.com',
            };

            await injectCaptchaToken(page, info, 'test-token-abc');
            expect(page.evaluate).toHaveBeenCalledWith(
                expect.any(Function),
                { type: 'recaptcha_v2', token: 'test-token-abc' },
            );
        });

        it('should call page.evaluate with correct params for Turnstile', async () => {
            const { injectCaptchaToken } = await import('../src/browsing/captchaSolver.js');
            const page = createMockPage(undefined);
            const info = {
                type: 'turnstile' as const,
                sitekey: 'test-key',
                pageUrl: 'https://example.com',
            };

            await injectCaptchaToken(page, info, 'turnstile-token');
            expect(page.evaluate).toHaveBeenCalledWith(
                expect.any(Function),
                { type: 'turnstile', token: 'turnstile-token' },
            );
        });
    });
});
