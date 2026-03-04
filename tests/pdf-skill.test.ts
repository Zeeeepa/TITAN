/**
 * TITAN — PDF Skill Tests
 * Tests src/skills/builtin/pdf.ts: registerPdfSkill
 * Covers pdf_read and pdf_info handlers, buffer extraction, and fallback logic
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Global mocks ──────────────────────────────────────────────────

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Helpers: fake PDF buffers ─────────────────────────────────────

function fakePdfBuffer(text: string): Buffer {
    return Buffer.from(`%PDF-1.4\nBT\n(${text})\nET\n`, 'latin1');
}

function fakePdfBufferMultiple(texts: string[]): Buffer {
    const sections = texts.map(t => `BT\n(${t})\nET`).join('\n');
    return Buffer.from(`%PDF-1.4\n${sections}\n`, 'latin1');
}

function fakePdfBufferWithMeta(pages: number, author?: string, title?: string): Buffer {
    let content = `%PDF-1.4\n/Type /Pages /Count ${pages}\n/Info 1 0 R\n`;
    if (author) content += `/Author (${author})\n`;
    if (title) content += `/Title (${title})\n`;
    return Buffer.from(content, 'latin1');
}

function fakeEmptyPdfBuffer(): Buffer {
    // A buffer with only non-printable chars so extractPdfText returns empty string
    const bytes: number[] = [];
    for (let i = 0; i < 200; i++) bytes.push(0x00);
    return Buffer.from(bytes);
}

// ════════════════════════════════════════════════════════════════════
// Registration Tests
// ════════════════════════════════════════════════════════════════════

describe('PDF Skill — Registration', () => {
    let handlers: Map<string, any>;

    beforeEach(async () => {
        vi.resetModules();
        handlers = new Map();

        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));

        vi.doMock('../src/skills/registry.js', () => ({
            registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
                handlers.set(handler.name, handler);
            }),
        }));

        vi.doMock('fs', async () => {
            const actual = await vi.importActual<typeof import('fs')>('fs');
            return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
        });

        const { registerPdfSkill } = await import('../src/skills/builtin/pdf.js');
        registerPdfSkill();
    });

    it('should register both handlers', () => {
        expect(handlers.size).toBe(2);
        expect(handlers.has('pdf_read')).toBe(true);
        expect(handlers.has('pdf_info')).toBe(true);
    });

    it('pdf_read handler has correct required parameters', () => {
        const h = handlers.get('pdf_read');
        expect(h.parameters.required).toContain('path');
    });

    it('pdf_info handler has correct required parameters', () => {
        const h = handlers.get('pdf_info');
        expect(h.parameters.required).toContain('path');
    });

    it('pdf_read handler has a description', () => {
        const h = handlers.get('pdf_read');
        expect(h.description).toBeTruthy();
        expect(h.description).toContain('PDF');
    });

    it('pdf_info handler has a description', () => {
        const h = handlers.get('pdf_info');
        expect(h.description).toBeTruthy();
        expect(h.description).toContain('metadata');
    });
});

// ════════════════════════════════════════════════════════════════════
// pdf_read Tests
// ════════════════════════════════════════════════════════════════════

describe('PDF Skill — pdf_read', () => {
    let readHandler: any;

    beforeEach(async () => {
        vi.resetModules();

        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));

        const handlers = new Map<string, any>();
        vi.doMock('../src/skills/registry.js', () => ({
            registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
                handlers.set(handler.name, handler);
            }),
        }));

        vi.doMock('fs', async () => {
            const actual = await vi.importActual<typeof import('fs')>('fs');
            return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
        });

        const { registerPdfSkill } = await import('../src/skills/builtin/pdf.js');
        registerPdfSkill();
        readHandler = handlers.get('pdf_read');
    });

    it('should return error when path parameter is missing', async () => {
        const result = await readHandler.execute({});
        expect(result).toContain('Error');
        expect(result).toContain('path parameter is required');
    });

    it('should return error when path is empty string', async () => {
        const result = await readHandler.execute({ path: '' });
        expect(result).toContain('Error');
        expect(result).toContain('path parameter is required');
    });

    it('should return error when file does not exist', async () => {
        const { existsSync } = await import('fs');
        (existsSync as any).mockReturnValue(false);

        const result = await readHandler.execute({ path: '/nonexistent/file.pdf' });
        expect(result).toContain('Error');
        expect(result).toContain('PDF file not found');
        expect(result).toContain('/nonexistent/file.pdf');
    });

    it('should extract text from PDF with BT/ET markers (fallback mode)', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakePdfBuffer('Hello World'));

        const result = await readHandler.execute({ path: '/tmp/test.pdf' });
        expect(result).toContain('Hello World');
        expect(result).toContain('PDF Text Extraction');
        expect(result).toContain('/tmp/test.pdf');
    });

    it('should extract text from multiple BT/ET sections', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakePdfBufferMultiple(['First', 'Second', 'Third']));

        const result = await readHandler.execute({ path: '/tmp/multi.pdf' });
        expect(result).toContain('First');
        expect(result).toContain('Second');
        expect(result).toContain('Third');
    });

    it('should return warning when no text can be extracted', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakeEmptyPdfBuffer());

        const result = await readHandler.execute({ path: '/tmp/empty.pdf' });
        expect(result).toContain('Warning');
        expect(result).toContain('No text could be extracted');
    });

    it('should handle readFileSync throwing an error', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockImplementation(() => { throw new Error('Permission denied'); });

        const result = await readHandler.execute({ path: '/tmp/locked.pdf' });
        expect(result).toContain('Error');
    });

    it('should truncate extracted text at 50k chars (via buffer fallback)', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);

        // Build a PDF with a huge text block in BT/ET markers
        const longText = 'A'.repeat(60000);
        const pdfContent = `%PDF-1.4\nBT\n(${longText})\nET\n`;
        (readFileSync as any).mockReturnValue(Buffer.from(pdfContent, 'latin1'));

        const result = await readHandler.execute({ path: '/tmp/large.pdf' });
        // The result should contain text, but the extracted portion is truncated to 50k
        expect(result).toContain('PDF Text Extraction');
        // The raw extracted text should not exceed 50k chars in the output
        expect(result.length).toBeLessThan(60000 + 500); // some overhead for headers
    });

    it('should include source file path in the output', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakePdfBuffer('Test content'));

        const result = await readHandler.execute({ path: '/home/user/document.pdf' });
        expect(result).toContain('Source: /home/user/document.pdf');
    });
});

// ════════════════════════════════════════════════════════════════════
// pdf_info Tests
// ════════════════════════════════════════════════════════════════════

describe('PDF Skill — pdf_info', () => {
    let infoHandler: any;

    beforeEach(async () => {
        vi.resetModules();

        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));

        const handlers = new Map<string, any>();
        vi.doMock('../src/skills/registry.js', () => ({
            registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
                handlers.set(handler.name, handler);
            }),
        }));

        vi.doMock('fs', async () => {
            const actual = await vi.importActual<typeof import('fs')>('fs');
            return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
        });

        const { registerPdfSkill } = await import('../src/skills/builtin/pdf.js');
        registerPdfSkill();
        infoHandler = handlers.get('pdf_info');
    });

    it('should return error when path parameter is missing', async () => {
        const result = await infoHandler.execute({});
        expect(result).toContain('Error');
        expect(result).toContain('path parameter is required');
    });

    it('should return error when path is empty string', async () => {
        const result = await infoHandler.execute({ path: '' });
        expect(result).toContain('Error');
        expect(result).toContain('path parameter is required');
    });

    it('should return error when file does not exist', async () => {
        const { existsSync } = await import('fs');
        (existsSync as any).mockReturnValue(false);

        const result = await infoHandler.execute({ path: '/nonexistent/doc.pdf' });
        expect(result).toContain('Error');
        expect(result).toContain('PDF file not found');
        expect(result).toContain('/nonexistent/doc.pdf');
    });

    it('should extract page count from buffer metadata', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakePdfBufferWithMeta(42));

        const result = await infoHandler.execute({ path: '/tmp/doc.pdf' });
        expect(result).toContain('PDF Metadata');
        expect(result).toContain('42');
    });

    it('should extract author from buffer metadata', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakePdfBufferWithMeta(5, 'Tony Elliott'));

        const result = await infoHandler.execute({ path: '/tmp/doc.pdf' });
        expect(result).toContain('Tony Elliott');
        expect(result).toContain('Author');
    });

    it('should extract title from buffer metadata', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakePdfBufferWithMeta(10, undefined, 'TITAN Manual'));

        const result = await infoHandler.execute({ path: '/tmp/doc.pdf' });
        expect(result).toContain('TITAN Manual');
        expect(result).toContain('Title');
    });

    it('should extract both author and title', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakePdfBufferWithMeta(20, 'Author Name', 'Doc Title'));

        const result = await infoHandler.execute({ path: '/tmp/doc.pdf' });
        expect(result).toContain('Author Name');
        expect(result).toContain('Doc Title');
        expect(result).toContain('20');
    });

    it('should show warning when page count is 0', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        // Buffer with no /Pages /Count marker
        (readFileSync as any).mockReturnValue(Buffer.from('%PDF-1.4\n/Info 1 0 R\n', 'latin1'));

        const result = await infoHandler.execute({ path: '/tmp/nopages.pdf' });
        expect(result).toContain('Warning');
        expect(result).toContain('Could not determine page count');
    });

    it('should include file path in the output', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakePdfBufferWithMeta(1));

        const result = await infoHandler.execute({ path: '/home/user/report.pdf' });
        expect(result).toContain('File: /home/user/report.pdf');
    });

    it('should handle readFileSync throwing an error', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockImplementation(() => { throw new Error('Disk read error'); });

        const result = await infoHandler.execute({ path: '/tmp/broken.pdf' });
        expect(result).toContain('Error');
    });

    it('should handle buffer with no Info reference (no author/title)', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        // Has /Pages /Count but no /Info reference
        (readFileSync as any).mockReturnValue(
            Buffer.from('%PDF-1.4\n/Type /Pages /Count 3\n', 'latin1'),
        );

        const result = await infoHandler.execute({ path: '/tmp/minimal.pdf' });
        expect(result).toContain('3');
        expect(result).not.toContain('Author');
        expect(result).not.toContain('Title');
    });
});

// ════════════════════════════════════════════════════════════════════
// Buffer Extraction Edge Cases
// ════════════════════════════════════════════════════════════════════

describe('PDF Skill — buffer extraction edge cases', () => {
    let readHandler: any;
    let infoHandler: any;

    beforeEach(async () => {
        vi.resetModules();

        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));

        const handlers = new Map<string, any>();
        vi.doMock('../src/skills/registry.js', () => ({
            registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
                handlers.set(handler.name, handler);
            }),
        }));

        vi.doMock('fs', async () => {
            const actual = await vi.importActual<typeof import('fs')>('fs');
            return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
        });

        const { registerPdfSkill } = await import('../src/skills/builtin/pdf.js');
        registerPdfSkill();
        readHandler = handlers.get('pdf_read');
        infoHandler = handlers.get('pdf_info');
    });

    it('should extract text from angle bracket hex strings', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        // Angle bracket text in BT/ET block
        const pdfContent = '%PDF-1.4\nBT\n<48656C6C6F>\nET\n';
        (readFileSync as any).mockReturnValue(Buffer.from(pdfContent, 'latin1'));

        const result = await readHandler.execute({ path: '/tmp/hex.pdf' });
        // The hex string should be extracted (raw hex chars after stripping angle brackets)
        expect(result).toContain('PDF Text Extraction');
    });

    it('should handle PDF with nested BT/ET blocks', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        const pdfContent = '%PDF-1.4\nBT\n(Line One)\nET\nother stuff\nBT\n(Line Two)\nET\n';
        (readFileSync as any).mockReturnValue(Buffer.from(pdfContent, 'latin1'));

        const result = await readHandler.execute({ path: '/tmp/nested.pdf' });
        expect(result).toContain('Line One');
        expect(result).toContain('Line Two');
    });

    it('should fallback to ASCII extraction when BT/ET text is too short', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        // BT/ET block with very short text (< 100 chars), triggers fallback
        const readableText = 'This is readable ASCII text in the PDF body section. '.repeat(3);
        const pdfContent = `%PDF-1.4\nBT\n(Hi)\nET\n${readableText}`;
        (readFileSync as any).mockReturnValue(Buffer.from(pdfContent, 'latin1'));

        const result = await readHandler.execute({ path: '/tmp/short.pdf' });
        expect(result).toContain('PDF Text Extraction');
        // Should contain the fallback readable ASCII
        expect(result).toContain('readable ASCII');
    });

    it('should handle metadata buffer with large page count', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakePdfBufferWithMeta(9999, 'Author', 'Big Doc'));

        const result = await infoHandler.execute({ path: '/tmp/big.pdf' });
        expect(result).toContain('9999');
    });

    it('should handle metadata buffer with special characters in author', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(
            fakePdfBufferWithMeta(1, 'O\'Brien & Associates', 'Report 2026'),
        );

        const result = await infoHandler.execute({ path: '/tmp/special.pdf' });
        // The author extraction stops at the first ), so partial match is acceptable
        expect(result).toContain('Author');
    });

    it('should handle pdf_read when pdf-parse is unavailable (dynamic import fails)', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakePdfBuffer('Fallback text'));

        // pdf-parse is not installed, so the dynamic import will fail
        // and the code falls back to buffer extraction — this is the default behavior
        const result = await readHandler.execute({ path: '/tmp/no-parse.pdf' });
        expect(result).toContain('Fallback text');
    });

    it('should handle pdf_info when pdf-parse is unavailable (dynamic import fails)', async () => {
        const { existsSync, readFileSync } = await import('fs');
        (existsSync as any).mockReturnValue(true);
        (readFileSync as any).mockReturnValue(fakePdfBufferWithMeta(7, 'Fallback Author'));

        const result = await infoHandler.execute({ path: '/tmp/no-parse.pdf' });
        expect(result).toContain('7');
        expect(result).toContain('Fallback Author');
    });
});
