/**
 * TITAN — Web Fetch Skill (Built-in)
 * Fetch any URL and extract content as markdown or text.
 * Matches OpenClaw's web_fetch tool.
 */
import { registerSkill } from '../registry.js';
import { exec } from 'child_process';
import logger from '../../utils/logger.js';

const COMPONENT = 'WebFetch';

/** Convert HTML to clean readable text */
function htmlToText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<li>/gi, '• ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Convert HTML to simple markdown */
function htmlToMarkdown(html: string): string {
    let md = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');

    // Headers
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
    md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n');
    // Links
    md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    // Bold/italic
    md = md.replace(/<(strong|b)>(.*?)<\/\1>/gi, '**$2**');
    md = md.replace(/<(em|i)>(.*?)<\/\1>/gi, '*$2*');
    // Code
    md = md.replace(/<code>(.*?)<\/code>/gi, '`$1`');
    md = md.replace(/<pre>([\s\S]*?)<\/pre>/gi, '```\n$1\n```\n');
    // Lists
    md = md.replace(/<li>/gi, '- ');
    md = md.replace(/<\/li>/gi, '\n');
    // Images
    md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, '![$1]($2)');
    md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');
    // Remaining tags
    md = md.replace(/<br\s*\/?>/gi, '\n');
    md = md.replace(/<\/p>/gi, '\n\n');
    md = md.replace(/<[^>]*>/g, '');
    // Entities
    md = md.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    md = md.replace(/\n{3,}/g, '\n\n');
    return md.trim();
}

export function registerWebFetchSkill(): void {
    registerSkill(
        { name: 'web_fetch', description: 'Fetch URL content', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'web_fetch',
            description: 'Fetch a URL and extract its content as markdown or plain text. Good for reading documentation, articles, and web pages. For JS-heavy sites, prefer the browser tool.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'URL to fetch' },
                    extractMode: { type: 'string', enum: ['markdown', 'text'], description: 'Output format (default: markdown)' },
                    maxChars: { type: 'number', description: 'Max characters to return (default: 50000)' },
                },
                required: ['url'],
            },
            execute: async (args) => {
                const url = args.url as string;
                const mode = (args.extractMode as string) || 'markdown';
                const maxChars = Math.min((args.maxChars as number) || 50000, 100000);

                return new Promise<string>((resolve) => {
                    const escapedUrl = url.replace(/"/g, '\\"');
                    exec(
                        `curl -sL --max-time 20 -A "Mozilla/5.0 (compatible; TITAN/1.0)" "${escapedUrl}" | head -c 200000`,
                        { timeout: 25000, maxBuffer: 1024 * 1024 * 5 },
                        (err, stdout) => {
                            if (err) {
                                resolve(`Error fetching ${url}: ${err.message}`);
                                return;
                            }
                            if (!stdout.trim()) {
                                resolve(`Empty response from ${url}`);
                                return;
                            }

                            // Extract title
                            const title = stdout.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || 'Untitled';

                            // Convert
                            const content = mode === 'markdown' ? htmlToMarkdown(stdout) : htmlToText(stdout);

                            resolve(`# ${title}\n\nSource: ${url}\n\n${content.slice(0, maxChars)}`);
                        },
                    );
                });
            },
        },
    );
}
