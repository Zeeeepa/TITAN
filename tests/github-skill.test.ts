/**
 * TITAN — GitHub Skill Tests
 * Tests for src/skills/builtin/github.ts
 * Covers all 5 tool handlers: github_repos, github_issues, github_prs, github_commits, github_files
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Global mocks ──────────────────────────────────────────────────

const handlers = new Map<string, any>();

vi.mock('../src/skills/registry.js', () => ({
    registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
        handlers.set(handler.name, handler);
    }),
}));

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/config/config.js', () => ({
    loadConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../src/utils/helpers.js', () => ({
    fetchWithRetry: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────

function mockResponse(data: unknown, status = 200, headers: Record<string, string> = {}): any {
    const headerMap = new Map(Object.entries({
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': '100',
        'X-RateLimit-Limit': '5000',
        ...headers,
    }));
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        headers: { get: (key: string) => headerMap.get(key) ?? null },
        json: vi.fn().mockResolvedValue(data),
        text: vi.fn().mockResolvedValue(typeof data === 'string' ? data : JSON.stringify(data)),
    };
}

let fetchMock: ReturnType<typeof vi.fn>;
let loggerMock: any;

// ─── Setup ──────────────────────────────────────────────────────────

beforeEach(async () => {
    handlers.clear();
    process.env.GITHUB_TOKEN = 'test-token';

    const helpers = await import('../src/utils/helpers.js');
    fetchMock = helpers.fetchWithRetry as ReturnType<typeof vi.fn>;
    fetchMock.mockReset();

    const logger = await import('../src/utils/logger.js');
    loggerMock = logger.default;
    vi.mocked(loggerMock.warn).mockClear();
    vi.mocked(loggerMock.info).mockClear();
    vi.mocked(loggerMock.error).mockClear();

    const { registerSkill } = await import('../src/skills/registry.js');
    vi.mocked(registerSkill).mockClear();

    const { registerGitHubSkill } = await import('../src/skills/builtin/github.js');
    registerGitHubSkill();
});

afterEach(() => {
    delete process.env.GITHUB_TOKEN;
});

// ════════════════════════════════════════════════════════════════════
// Registration
// ════════════════════════════════════════════════════════════════════

describe('GitHub Skill — Registration', () => {
    it('should register all 5 tool handlers', () => {
        expect(handlers.size).toBe(5);
        expect(handlers.has('github_repos')).toBe(true);
        expect(handlers.has('github_issues')).toBe(true);
        expect(handlers.has('github_prs')).toBe(true);
        expect(handlers.has('github_commits')).toBe(true);
        expect(handlers.has('github_files')).toBe(true);
    });

    it('should warn when GITHUB_TOKEN is not set', async () => {
        handlers.clear();
        delete process.env.GITHUB_TOKEN;

        const { registerGitHubSkill } = await import('../src/skills/builtin/github.js');
        registerGitHubSkill();

        expect(loggerMock.warn).toHaveBeenCalledWith(
            'GitHubSkill',
            expect.stringContaining('GITHUB_TOKEN is not set'),
        );
    });

    it('should log info on successful registration', () => {
        expect(loggerMock.info).toHaveBeenCalledWith(
            'GitHubSkill',
            expect.stringContaining('5 tools'),
        );
    });
});

// ════════════════════════════════════════════════════════════════════
// github_repos
// ════════════════════════════════════════════════════════════════════

describe('GitHub Skill — github_repos', () => {
    it('should list repos for authenticated user', async () => {
        const repos = [{ name: 'repo1' }, { name: 'repo2' }];
        fetchMock.mockResolvedValue(mockResponse(repos));

        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'list' });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/user/repos'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result).toContain('repo1');
        expect(result).toContain('repo2');
    });

    it('should pass pagination params for list action', async () => {
        fetchMock.mockResolvedValue(mockResponse([]));

        const handler = handlers.get('github_repos');
        await handler.execute({ action: 'list', page: 3, perPage: 50 });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('per_page=50'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('page=3'),
            expect.any(Object),
            expect.any(Object),
        );
    });

    it('should get a specific repo with owner+repo', async () => {
        const repoData = { full_name: 'octocat/hello-world', stargazers_count: 42 };
        fetchMock.mockResolvedValue(mockResponse(repoData));

        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'get', owner: 'octocat', repo: 'hello-world' });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/octocat/hello-world'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result).toContain('octocat/hello-world');
    });

    it('should return error for get action without owner', async () => {
        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'get', repo: 'hello-world' });
        expect(result).toContain('Error');
        expect(result).toContain('owner');
    });

    it('should return error for get action without repo', async () => {
        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'get', owner: 'octocat' });
        expect(result).toContain('Error');
        expect(result).toContain('repo');
    });

    it('should search repositories by query', async () => {
        const searchResult = { total_count: 1, items: [{ full_name: 'found/repo' }] };
        fetchMock.mockResolvedValue(mockResponse(searchResult));

        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'search', query: 'typescript agent' });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/search/repositories'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result).toContain('found/repo');
    });

    it('should return error for search action without query', async () => {
        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'search' });
        expect(result).toContain('Error');
        expect(result).toContain('query');
    });

    it('should return error for unknown action', async () => {
        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'delete' });
        expect(result).toContain('Error');
        expect(result).toContain('Unknown action');
    });

    it('should cap perPage at 100', async () => {
        fetchMock.mockResolvedValue(mockResponse([]));

        const handler = handlers.get('github_repos');
        await handler.execute({ action: 'list', perPage: 500 });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('per_page=100'),
            expect.any(Object),
            expect.any(Object),
        );
    });
});

// ════════════════════════════════════════════════════════════════════
// github_issues
// ════════════════════════════════════════════════════════════════════

describe('GitHub Skill — github_issues', () => {
    it('should list issues for a repo', async () => {
        const issues = [{ number: 1, title: 'Bug report' }];
        fetchMock.mockResolvedValue(mockResponse(issues));

        const handler = handlers.get('github_issues');
        const result = await handler.execute({ action: 'list', owner: 'octocat', repo: 'hello' });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/octocat/hello/issues'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result).toContain('Bug report');
    });

    it('should get a single issue by number', async () => {
        const issue = { number: 42, title: 'Feature request', state: 'open' };
        fetchMock.mockResolvedValue(mockResponse(issue));

        const handler = handlers.get('github_issues');
        const result = await handler.execute({ action: 'get', owner: 'org', repo: 'proj', issueNumber: 42 });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/issues/42'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result).toContain('Feature request');
    });

    it('should return error for get action without issueNumber', async () => {
        const handler = handlers.get('github_issues');
        const result = await handler.execute({ action: 'get', owner: 'org', repo: 'proj' });
        expect(result).toContain('Error');
        expect(result).toContain('issueNumber');
    });

    it('should create a new issue with title', async () => {
        const created = { number: 99, title: 'New issue' };
        fetchMock.mockResolvedValue(mockResponse(created));

        const handler = handlers.get('github_issues');
        const result = await handler.execute({
            action: 'create',
            owner: 'org',
            repo: 'proj',
            title: 'New issue',
            body: 'Description here',
            labels: ['bug'],
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/issues'),
            expect.objectContaining({ method: 'POST' }),
            expect.any(Object),
        );
        expect(result).toContain('New issue');
    });

    it('should return error for create action without title', async () => {
        const handler = handlers.get('github_issues');
        const result = await handler.execute({ action: 'create', owner: 'org', repo: 'proj' });
        expect(result).toContain('Error');
        expect(result).toContain('title');
    });

    it('should close an issue', async () => {
        const closed = { number: 42, state: 'closed' };
        fetchMock.mockResolvedValue(mockResponse(closed));

        const handler = handlers.get('github_issues');
        const result = await handler.execute({ action: 'close', owner: 'org', repo: 'proj', issueNumber: 42 });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/issues/42'),
            expect.objectContaining({ method: 'PATCH' }),
            expect.any(Object),
        );
        expect(result).toContain('closed');
    });

    it('should return error for close without issueNumber', async () => {
        const handler = handlers.get('github_issues');
        const result = await handler.execute({ action: 'close', owner: 'org', repo: 'proj' });
        expect(result).toContain('Error');
        expect(result).toContain('issueNumber');
    });

    it('should post a comment on an issue', async () => {
        const comment = { id: 1, body: 'A comment' };
        fetchMock.mockResolvedValue(mockResponse(comment));

        const handler = handlers.get('github_issues');
        const result = await handler.execute({
            action: 'comment',
            owner: 'org',
            repo: 'proj',
            issueNumber: 42,
            body: 'A comment',
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/issues/42/comments'),
            expect.objectContaining({ method: 'POST' }),
            expect.any(Object),
        );
        expect(result).toContain('A comment');
    });

    it('should return error for comment without issueNumber', async () => {
        const handler = handlers.get('github_issues');
        const result = await handler.execute({ action: 'comment', owner: 'org', repo: 'proj', body: 'text' });
        expect(result).toContain('Error');
        expect(result).toContain('issueNumber');
    });

    it('should return error for comment without body', async () => {
        const handler = handlers.get('github_issues');
        const result = await handler.execute({ action: 'comment', owner: 'org', repo: 'proj', issueNumber: 42 });
        expect(result).toContain('Error');
        expect(result).toContain('body');
    });

    it('should return error for unknown action', async () => {
        const handler = handlers.get('github_issues');
        const result = await handler.execute({ action: 'reopen', owner: 'org', repo: 'proj' });
        expect(result).toContain('Error');
        expect(result).toContain('Unknown action');
    });

    it('should return error when owner is missing', async () => {
        const handler = handlers.get('github_issues');
        const result = await handler.execute({ action: 'list', repo: 'proj' });
        expect(result).toContain('Error');
        expect(result).toContain('owner');
    });
});

// ════════════════════════════════════════════════════════════════════
// github_prs
// ════════════════════════════════════════════════════════════════════

describe('GitHub Skill — github_prs', () => {
    it('should list pull requests', async () => {
        const prs = [{ number: 10, title: 'Add feature' }];
        fetchMock.mockResolvedValue(mockResponse(prs));

        const handler = handlers.get('github_prs');
        const result = await handler.execute({ action: 'list', owner: 'org', repo: 'proj' });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/pulls'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result).toContain('Add feature');
    });

    it('should get a single PR by number', async () => {
        const pr = { number: 10, title: 'PR detail', mergeable: true };
        fetchMock.mockResolvedValue(mockResponse(pr));

        const handler = handlers.get('github_prs');
        const result = await handler.execute({ action: 'get', owner: 'org', repo: 'proj', prNumber: 10 });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/pulls/10'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result).toContain('PR detail');
    });

    it('should return error for get without prNumber', async () => {
        const handler = handlers.get('github_prs');
        const result = await handler.execute({ action: 'get', owner: 'org', repo: 'proj' });
        expect(result).toContain('Error');
        expect(result).toContain('prNumber');
    });

    it('should create a PR with title, head, and base', async () => {
        const created = { number: 20, title: 'New PR' };
        fetchMock.mockResolvedValue(mockResponse(created));

        const handler = handlers.get('github_prs');
        const result = await handler.execute({
            action: 'create',
            owner: 'org',
            repo: 'proj',
            title: 'New PR',
            head: 'feature-branch',
            base: 'main',
            body: 'PR body text',
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/pulls'),
            expect.objectContaining({ method: 'POST' }),
            expect.any(Object),
        );
        expect(result).toContain('New PR');
    });

    it('should return error for create without title', async () => {
        const handler = handlers.get('github_prs');
        const result = await handler.execute({ action: 'create', owner: 'org', repo: 'proj', head: 'a', base: 'b' });
        expect(result).toContain('Error');
        expect(result).toContain('title');
    });

    it('should return error for create without head', async () => {
        const handler = handlers.get('github_prs');
        const result = await handler.execute({ action: 'create', owner: 'org', repo: 'proj', title: 'X', base: 'main' });
        expect(result).toContain('Error');
        expect(result).toContain('head');
    });

    it('should return error for create without base', async () => {
        const handler = handlers.get('github_prs');
        const result = await handler.execute({ action: 'create', owner: 'org', repo: 'proj', title: 'X', head: 'feat' });
        expect(result).toContain('Error');
        expect(result).toContain('base');
    });

    it('should merge a PR', async () => {
        fetchMock.mockResolvedValue(mockResponse({ merged: true }, 200));

        const handler = handlers.get('github_prs');
        const result = await handler.execute({ action: 'merge', owner: 'org', repo: 'proj', prNumber: 10 });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/pulls/10/merge'),
            expect.objectContaining({ method: 'PUT' }),
            expect.any(Object),
        );
        expect(result).toContain('merged');
    });

    it('should return error for merge without prNumber', async () => {
        const handler = handlers.get('github_prs');
        const result = await handler.execute({ action: 'merge', owner: 'org', repo: 'proj' });
        expect(result).toContain('Error');
        expect(result).toContain('prNumber');
    });

    it('should fetch diff of a PR', async () => {
        const diffText = 'diff --git a/file.ts b/file.ts\n+added line';
        const headerMap = new Map(Object.entries({
            'Content-Type': 'application/vnd.github.diff',
            'X-RateLimit-Remaining': '100',
            'X-RateLimit-Limit': '5000',
        }));
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: (key: string) => headerMap.get(key) ?? null },
            json: vi.fn().mockResolvedValue(diffText),
            text: vi.fn().mockResolvedValue(diffText),
        });

        const handler = handlers.get('github_prs');
        const result = await handler.execute({ action: 'diff', owner: 'org', repo: 'proj', prNumber: 10 });

        expect(result).toContain('+added line');
    });

    it('should return error for diff without prNumber', async () => {
        const handler = handlers.get('github_prs');
        const result = await handler.execute({ action: 'diff', owner: 'org', repo: 'proj' });
        expect(result).toContain('Error');
        expect(result).toContain('prNumber');
    });

    it('should return error for unknown action', async () => {
        const handler = handlers.get('github_prs');
        const result = await handler.execute({ action: 'approve', owner: 'org', repo: 'proj' });
        expect(result).toContain('Error');
        expect(result).toContain('Unknown action');
    });
});

// ════════════════════════════════════════════════════════════════════
// github_commits
// ════════════════════════════════════════════════════════════════════

describe('GitHub Skill — github_commits', () => {
    it('should list commits', async () => {
        const commits = [{ sha: 'abc123', commit: { message: 'Initial commit' } }];
        fetchMock.mockResolvedValue(mockResponse(commits));

        const handler = handlers.get('github_commits');
        const result = await handler.execute({ action: 'list', owner: 'org', repo: 'proj' });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/commits'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result).toContain('Initial commit');
    });

    it('should list commits from a specific branch/sha', async () => {
        fetchMock.mockResolvedValue(mockResponse([]));

        const handler = handlers.get('github_commits');
        await handler.execute({ action: 'list', owner: 'org', repo: 'proj', sha: 'develop' });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('sha=develop'),
            expect.any(Object),
            expect.any(Object),
        );
    });

    it('should get a single commit by sha', async () => {
        const commit = { sha: 'abc123', commit: { message: 'Fix bug' }, files: [] };
        fetchMock.mockResolvedValue(mockResponse(commit));

        const handler = handlers.get('github_commits');
        const result = await handler.execute({ action: 'get', owner: 'org', repo: 'proj', sha: 'abc123' });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/commits/abc123'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result).toContain('Fix bug');
    });

    it('should return error for get without sha', async () => {
        const handler = handlers.get('github_commits');
        const result = await handler.execute({ action: 'get', owner: 'org', repo: 'proj' });
        expect(result).toContain('Error');
        expect(result).toContain('sha');
    });

    it('should compare two refs', async () => {
        const comparison = { ahead_by: 3, behind_by: 0, commits: [] };
        fetchMock.mockResolvedValue(mockResponse(comparison));

        const handler = handlers.get('github_commits');
        const result = await handler.execute({
            action: 'compare',
            owner: 'org',
            repo: 'proj',
            base: 'main',
            head: 'develop',
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/compare/main...develop'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result).toContain('ahead_by');
    });

    it('should return error for compare without base', async () => {
        const handler = handlers.get('github_commits');
        const result = await handler.execute({ action: 'compare', owner: 'org', repo: 'proj', head: 'dev' });
        expect(result).toContain('Error');
        expect(result).toContain('base');
    });

    it('should return error for compare without head', async () => {
        const handler = handlers.get('github_commits');
        const result = await handler.execute({ action: 'compare', owner: 'org', repo: 'proj', base: 'main' });
        expect(result).toContain('Error');
        expect(result).toContain('head');
    });

    it('should return error for unknown action', async () => {
        const handler = handlers.get('github_commits');
        const result = await handler.execute({ action: 'revert', owner: 'org', repo: 'proj' });
        expect(result).toContain('Error');
        expect(result).toContain('Unknown action');
    });
});

// ════════════════════════════════════════════════════════════════════
// github_files
// ════════════════════════════════════════════════════════════════════

describe('GitHub Skill — github_files', () => {
    it('should read a file and decode base64 content', async () => {
        const fileData = {
            type: 'file',
            encoding: 'base64',
            content: Buffer.from('Hello, World!').toString('base64'),
            sha: 'abc123',
        };
        fetchMock.mockResolvedValue(mockResponse(fileData));

        const handler = handlers.get('github_files');
        const result = await handler.execute({ action: 'read', owner: 'org', repo: 'proj', path: 'README.md' });

        expect(result).toContain('Hello, World!');
    });

    it('should return error hint when reading a directory', async () => {
        // GitHub returns an array for directories
        fetchMock.mockResolvedValue(mockResponse([{ name: 'file.ts', type: 'file' }]));

        const handler = handlers.get('github_files');
        const result = await handler.execute({ action: 'read', owner: 'org', repo: 'proj', path: 'src/' });

        expect(result).toContain('directory');
        expect(result).toContain('list');
    });

    it('should pass branch param as ref query string for read', async () => {
        const fileData = { type: 'file', encoding: 'base64', content: Buffer.from('x').toString('base64') };
        fetchMock.mockResolvedValue(mockResponse(fileData));

        const handler = handlers.get('github_files');
        await handler.execute({ action: 'read', owner: 'org', repo: 'proj', path: 'file.ts', branch: 'develop' });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('ref=develop'),
            expect.any(Object),
            expect.any(Object),
        );
    });

    it('should list directory contents', async () => {
        const dirEntries = [
            { name: 'index.ts', type: 'file', size: 1234, path: 'src/index.ts', sha: 'aaa', download_url: null },
            { name: 'utils', type: 'dir', size: 0, path: 'src/utils', sha: 'bbb', download_url: null },
        ];
        fetchMock.mockResolvedValue(mockResponse(dirEntries));

        const handler = handlers.get('github_files');
        const result = await handler.execute({ action: 'list', owner: 'org', repo: 'proj', path: 'src/' });

        expect(result).toContain('index.ts');
        expect(result).toContain('utils');
    });

    it('should return error hint when listing a file', async () => {
        // Non-array response means it is a file
        fetchMock.mockResolvedValue(mockResponse({ type: 'file', name: 'single.ts' }));

        const handler = handlers.get('github_files');
        const result = await handler.execute({ action: 'list', owner: 'org', repo: 'proj', path: 'single.ts' });

        expect(result).toContain('file');
        expect(result).toContain('read');
    });

    it('should create a file with content and message', async () => {
        const created = { content: { sha: 'new123' }, commit: { sha: 'commit456' } };
        fetchMock.mockResolvedValue(mockResponse(created));

        const handler = handlers.get('github_files');
        const result = await handler.execute({
            action: 'create',
            owner: 'org',
            repo: 'proj',
            path: 'docs/guide.md',
            content: '# Guide',
            message: 'Add guide',
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/contents/docs/guide.md'),
            expect.objectContaining({ method: 'PUT' }),
            expect.any(Object),
        );
        expect(result).toContain('new123');
    });

    it('should return error for create without content', async () => {
        const handler = handlers.get('github_files');
        const result = await handler.execute({
            action: 'create',
            owner: 'org',
            repo: 'proj',
            path: 'file.ts',
            message: 'msg',
        });
        expect(result).toContain('Error');
        expect(result).toContain('content');
    });

    it('should return error for create without message', async () => {
        const handler = handlers.get('github_files');
        const result = await handler.execute({
            action: 'create',
            owner: 'org',
            repo: 'proj',
            path: 'file.ts',
            content: 'data',
        });
        expect(result).toContain('Error');
        expect(result).toContain('message');
    });

    it('should update a file with sha', async () => {
        const updated = { content: { sha: 'upd123' }, commit: { sha: 'commit789' } };
        fetchMock.mockResolvedValue(mockResponse(updated));

        const handler = handlers.get('github_files');
        const result = await handler.execute({
            action: 'update',
            owner: 'org',
            repo: 'proj',
            path: 'file.ts',
            content: 'updated content',
            message: 'Update file',
            sha: 'oldsha',
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/repos/org/proj/contents/file.ts'),
            expect.objectContaining({ method: 'PUT' }),
            expect.any(Object),
        );
        expect(result).toContain('upd123');
    });

    it('should return error for update without sha', async () => {
        const handler = handlers.get('github_files');
        const result = await handler.execute({
            action: 'update',
            owner: 'org',
            repo: 'proj',
            path: 'file.ts',
            content: 'x',
            message: 'y',
        });
        expect(result).toContain('Error');
        expect(result).toContain('sha');
    });

    it('should return error for unknown action', async () => {
        const handler = handlers.get('github_files');
        const result = await handler.execute({ action: 'delete', owner: 'org', repo: 'proj', path: 'file.ts' });
        expect(result).toContain('Error');
        expect(result).toContain('Unknown action');
    });

    it('should strip leading slashes from path', async () => {
        const fileData = { type: 'file', encoding: 'base64', content: Buffer.from('ok').toString('base64') };
        fetchMock.mockResolvedValue(mockResponse(fileData));

        const handler = handlers.get('github_files');
        await handler.execute({ action: 'read', owner: 'org', repo: 'proj', path: '/src/main.ts' });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/contents/src/main.ts'),
            expect.any(Object),
            expect.any(Object),
        );
    });
});

// ════════════════════════════════════════════════════════════════════
// Error handling & rate limits
// ════════════════════════════════════════════════════════════════════

describe('GitHub Skill — Error handling', () => {
    it('should handle 404 API error', async () => {
        fetchMock.mockResolvedValue(mockResponse({ message: 'Not Found' }, 404));

        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'get', owner: 'org', repo: 'nonexistent' });

        expect(result).toContain('Error');
        expect(result).toContain('404');
    });

    it('should handle 500 API error', async () => {
        fetchMock.mockResolvedValue(mockResponse({ message: 'Internal Server Error' }, 500));

        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'get', owner: 'org', repo: 'proj' });

        expect(result).toContain('Error');
        expect(result).toContain('500');
    });

    it('should handle network/fetch rejection', async () => {
        fetchMock.mockRejectedValue(new Error('Network timeout'));

        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'list' });

        expect(result).toContain('Error');
        expect(result).toContain('Network timeout');
    });

    it('should warn when rate limit is low', async () => {
        fetchMock.mockResolvedValue(mockResponse([], 200, {
            'X-RateLimit-Remaining': '5',
            'X-RateLimit-Limit': '5000',
            'X-RateLimit-Reset': '1700000000',
        }));

        const handler = handlers.get('github_repos');
        await handler.execute({ action: 'list' });

        expect(loggerMock.warn).toHaveBeenCalledWith(
            'GitHubSkill',
            expect.stringContaining('rate limit low'),
        );
    });

    it('should truncate large responses', async () => {
        // Generate a response larger than 50000 chars
        const largeData = 'x'.repeat(60000);
        fetchMock.mockResolvedValue(mockResponse(largeData));

        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'list' });

        expect(result).toContain('truncated');
    });

    it('should handle error response with no JSON body', async () => {
        const headerMap = new Map(Object.entries({
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': '100',
            'X-RateLimit-Limit': '5000',
        }));
        fetchMock.mockResolvedValue({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            headers: { get: (key: string) => headerMap.get(key) ?? null },
            json: vi.fn().mockRejectedValue(new Error('invalid json')),
            text: vi.fn().mockResolvedValue('Bad Gateway'),
        });

        const handler = handlers.get('github_repos');
        const result = await handler.execute({ action: 'list' });

        expect(result).toContain('Error');
        expect(result).toContain('502');
    });
});
