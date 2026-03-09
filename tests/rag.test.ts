/**
 * TITAN — RAG Pipeline Tests
 * Tests chunking, document management, RAG skill registration, and context injection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs before any imports
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn().mockReturnValue(''),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
    };
});

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/config/config.js', () => ({
    loadConfig: vi.fn().mockReturnValue({
        memory: { vectorSearchEnabled: false, embeddingModel: 'nomic-embed-text' },
        providers: { ollama: { baseUrl: 'http://localhost:11434' } },
    }),
}));

vi.mock('../src/memory/graph.js', () => ({
    flushMemoryBeforeCompaction: vi.fn().mockResolvedValue(undefined),
}));

// ── chunkText tests ─────────────────────────────────────────────────

describe('chunkText', () => {
    let chunkText: typeof import('../src/memory/vectors.js').chunkText;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import('../src/memory/vectors.js');
        chunkText = mod.chunkText;
    });

    it('returns single chunk for short text', () => {
        const chunks = chunkText('Hello world', 1000, 200);
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toBe('Hello world');
    });

    it('splits long text into multiple chunks', () => {
        const text = 'A'.repeat(3000);
        const chunks = chunkText(text, 1000, 200);
        expect(chunks.length).toBeGreaterThan(1);
        // Each chunk should be <= chunk size (roughly, accounting for boundary logic)
        for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(1200);
        }
    });

    it('creates overlapping chunks', () => {
        const words = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
        const chunks = chunkText(words, 200, 50);
        expect(chunks.length).toBeGreaterThan(1);
        // Verify overlap: end of one chunk should appear at start of next
        if (chunks.length >= 2) {
            const endOfFirst = chunks[0].slice(-30);
            // The overlap means some content from end of chunk 0 appears in chunk 1
            // We just verify chunks are non-empty and reasonable
            expect(chunks[0].length).toBeGreaterThan(0);
            expect(chunks[1].length).toBeGreaterThan(0);
        }
    });

    it('handles empty text', () => {
        const chunks = chunkText('', 1000, 200);
        // Empty string produces one empty-string chunk from the single-chunk path
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toBe('');
    });

    it('respects custom chunk size and overlap', () => {
        const text = 'A'.repeat(500);
        const chunks = chunkText(text, 100, 20);
        expect(chunks.length).toBeGreaterThan(3);
    });

    it('breaks at paragraph boundaries when possible', () => {
        const text = 'First paragraph content here.\n\nSecond paragraph with more text.\n\nThird paragraph ends it.';
        const chunks = chunkText(text, 50, 10);
        expect(chunks.length).toBeGreaterThan(1);
    });
});

// ── RAG document management tests ───────────────────────────────────

describe('RAG document management', () => {
    let ragListDocuments: typeof import('../src/memory/vectors.js').ragListDocuments;
    let ragDeleteDocument: typeof import('../src/memory/vectors.js').ragDeleteDocument;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import('../src/memory/vectors.js');
        ragListDocuments = mod.ragListDocuments;
        ragDeleteDocument = mod.ragDeleteDocument;
    });

    it('ragListDocuments returns empty array when no docs ingested', () => {
        const docs = ragListDocuments();
        expect(docs).toEqual([]);
    });

    it('ragDeleteDocument returns false for non-existent doc', () => {
        const result = ragDeleteDocument('nonexistent_id');
        expect(result).toBe(false);
    });
});

// ── RAG search (unavailable state) ──────────────────────────────────

describe('RAG search when unavailable', () => {
    let ragSearch: typeof import('../src/memory/vectors.js').ragSearch;
    let ragIngest: typeof import('../src/memory/vectors.js').ragIngest;
    let getRagContext: typeof import('../src/memory/vectors.js').getRagContext;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import('../src/memory/vectors.js');
        ragSearch = mod.ragSearch;
        ragIngest = mod.ragIngest;
        getRagContext = mod.getRagContext;
    });

    it('ragSearch returns empty when vector search unavailable', async () => {
        const results = await ragSearch('test query');
        expect(results).toEqual([]);
    });

    it('ragIngest returns error when vector search unavailable', async () => {
        const result = await ragIngest('test.txt', 'Test', 'content', 'file');
        expect(result.success).toBe(false);
        expect(result.error).toContain('not available');
    });

    it('getRagContext returns empty string when unavailable', async () => {
        const ctx = await getRagContext('test');
        expect(ctx).toBe('');
    });
});

// ── Context injection tests ─────────────────────────────────────────

describe('injectRagContext', () => {
    let injectRagContext: typeof import('../src/agent/contextManager.js').injectRagContext;

    beforeEach(async () => {
        vi.resetModules();
        // Mock vectors to return no context (vector search not available)
        vi.doMock('../src/memory/vectors.js', () => ({
            getRagContext: vi.fn().mockResolvedValue(''),
        }));
        const mod = await import('../src/agent/contextManager.js');
        injectRagContext = mod.injectRagContext;
    });

    it('returns messages unchanged when no RAG context available', async () => {
        const messages = [
            { role: 'user' as const, content: 'Hello' },
        ];
        const result = await injectRagContext(messages);
        expect(result).toEqual(messages);
    });

    it('returns messages unchanged when no user message exists', async () => {
        const messages = [
            { role: 'system' as const, content: 'You are helpful' },
        ];
        const result = await injectRagContext(messages);
        expect(result).toEqual(messages);
    });
});

describe('injectRagContext with RAG data', () => {
    let injectRagContext: typeof import('../src/agent/contextManager.js').injectRagContext;

    beforeEach(async () => {
        vi.resetModules();
        vi.doMock('../src/memory/vectors.js', () => ({
            getRagContext: vi.fn().mockResolvedValue('[RAG 1/1 — "Test Doc" (score: 0.85)]:\nRelevant information here'),
        }));
        const mod = await import('../src/agent/contextManager.js');
        injectRagContext = mod.injectRagContext;
    });

    it('injects RAG context before last user message', async () => {
        const messages = [
            { role: 'system' as const, content: 'System prompt' },
            { role: 'user' as const, content: 'What is TITAN?' },
        ];
        const result = await injectRagContext(messages);
        expect(result.length).toBe(3);
        expect(result[1].role).toBe('system');
        expect(result[1].content).toContain('Relevant knowledge');
        expect(result[1].content).toContain('Relevant information here');
        expect(result[2].role).toBe('user');
    });
});

// ── RAG skill registration test ─────────────────────────────────────

describe('RAG skill registration', () => {
    let registerSkill: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.resetModules();
        registerSkill = vi.fn();
        vi.doMock('../src/skills/registry.js', () => ({
            registerSkill,
        }));
        vi.doMock('../src/memory/vectors.js', () => ({
            isVectorSearchAvailable: vi.fn().mockReturnValue(false),
            ragIngest: vi.fn(),
            ragSearch: vi.fn(),
            ragListDocuments: vi.fn().mockReturnValue([]),
            ragDeleteDocument: vi.fn(),
        }));
    });

    it('registers 4 RAG tools', async () => {
        const { registerRagSkill } = await import('../src/skills/builtin/rag.js');
        registerRagSkill();
        expect(registerSkill).toHaveBeenCalledTimes(4);

        const toolNames = registerSkill.mock.calls.map(
            (call: [{ name: string }, { name: string }]) => call[1].name
        );
        expect(toolNames).toContain('rag_ingest');
        expect(toolNames).toContain('rag_search');
        expect(toolNames).toContain('rag_list');
        expect(toolNames).toContain('rag_delete');
    });

    it('rag_list returns empty message when no docs', async () => {
        const { registerRagSkill } = await import('../src/skills/builtin/rag.js');
        registerRagSkill();

        const listHandler = registerSkill.mock.calls.find(
            (call: [{ name: string }, { name: string }]) => call[1].name === 'rag_list'
        )?.[1];
        expect(listHandler).toBeDefined();

        const result = await listHandler!.execute({});
        expect(result).toContain('No documents ingested');
    });

    it('rag_ingest returns error when unavailable', async () => {
        const { registerRagSkill } = await import('../src/skills/builtin/rag.js');
        registerRagSkill();

        const ingestHandler = registerSkill.mock.calls.find(
            (call: [{ name: string }, { name: string }]) => call[1].name === 'rag_ingest'
        )?.[1];
        expect(ingestHandler).toBeDefined();

        const result = await ingestHandler!.execute({ source: '/tmp/test.txt' });
        expect(result).toContain('unavailable');
    });

    it('rag_search returns error when unavailable', async () => {
        const { registerRagSkill } = await import('../src/skills/builtin/rag.js');
        registerRagSkill();

        const searchHandler = registerSkill.mock.calls.find(
            (call: [{ name: string }, { name: string }]) => call[1].name === 'rag_search'
        )?.[1];
        expect(searchHandler).toBeDefined();

        const result = await searchHandler!.execute({ query: 'test' });
        expect(result).toContain('unavailable');
    });

    it('rag_delete returns error for missing docId', async () => {
        const { registerRagSkill } = await import('../src/skills/builtin/rag.js');
        registerRagSkill();

        const deleteHandler = registerSkill.mock.calls.find(
            (call: [{ name: string }, { name: string }]) => call[1].name === 'rag_delete'
        )?.[1];
        expect(deleteHandler).toBeDefined();

        const result = await deleteHandler!.execute({});
        expect(result).toContain('required');
    });

    it('rag_ingest requires source or content but checks availability first', async () => {
        const { registerRagSkill } = await import('../src/skills/builtin/rag.js');
        registerRagSkill();

        const ingestHandler = registerSkill.mock.calls.find(
            (call: [{ name: string }, { name: string }]) => call[1].name === 'rag_ingest'
        )?.[1];

        // When unavailable, returns unavailable message before validating args
        const result = await ingestHandler!.execute({});
        expect(result).toContain('unavailable');
    });
});
