/**
 * TITAN — Web Search Skill (Built-in)
 * Search the web and retrieve information.
 */
import { registerSkill } from '../registry.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'WebSearch';

export function registerWebSearchSkill(): void {
    registerSkill(
        { name: 'web_search', description: 'Search the web', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'web_search',
            description: 'Search the web for information. Returns search results with titles, URLs, and snippets. Useful for finding current information, documentation, tutorials, etc.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query' },
                    maxResults: { type: 'number', description: 'Maximum results to return (default: 5)' },
                },
                required: ['query'],
            },
            execute: async (args) => {
                const query = args.query as string;
                const maxResults = (args.maxResults as number) || 5;
                logger.info(COMPONENT, `Searching: ${query}`);

                try {
                    // Use DuckDuckGo HTML search as a fallback (no API key required)
                    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
                    const response = await fetch(url, {
                        headers: {
                            'User-Agent': 'TITAN/1.0 (Autonomous AI Agent)',
                        },
                    });

                    if (!response.ok) {
                        return `Search failed with status ${response.status}`;
                    }

                    const html = await response.text();

                    // Parse results from DuckDuckGo HTML
                    const results: Array<{ title: string; url: string; snippet: string }> = [];
                    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi;
                    let match;

                    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
                        const rawUrl = match[1];
                        const title = match[2].replace(/<[^>]*>/g, '').trim();
                        const snippet = match[3].replace(/<[^>]*>/g, '').trim();

                        // Decode DuckDuckGo redirect URL
                        const urlMatch = rawUrl.match(/uddg=([^&]*)/);
                        const decodedUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;

                        if (title && decodedUrl) {
                            results.push({ title, url: decodedUrl, snippet });
                        }
                    }

                    if (results.length === 0) {
                        return `No results found for: "${query}"`;
                    }

                    return results
                        .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
                        .join('\n\n');
                } catch (error) {
                    return `Search error: ${(error as Error).message}`;
                }
            },
        },
    );
}
