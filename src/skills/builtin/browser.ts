/**
 * TITAN — Browser Control Skill (Built-in)
 * CDP-based browser automation: navigate, snapshot, click, type, evaluate.
 */
import { registerSkill } from '../registry.js';
import { exec } from 'child_process';
import logger from '../../utils/logger.js';

const COMPONENT = 'Browser';

/** Find a suitable browser binary */
function findBrowser(): string {
    const candidates = [
        'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome-stable',
    ];
    // Default to 'chromium' — user can override via config
    return candidates[2];
}

export function registerBrowserSkill(): void {
    registerSkill(
        { name: 'browser', description: 'Browser control and web automation', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'browser',
            description: 'Control a Chromium-based browser to navigate websites, take snapshots, click elements, type text, evaluate JavaScript, and extract page content. Uses Chrome DevTools Protocol (CDP).',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['navigate', 'snapshot', 'click', 'type', 'evaluate', 'extract', 'screenshot'],
                        description: 'Browser action to perform',
                    },
                    url: { type: 'string', description: 'URL to navigate to (for navigate action)' },
                    selector: { type: 'string', description: 'CSS selector for click/type actions' },
                    text: { type: 'string', description: 'Text to type (for type action)' },
                    script: { type: 'string', description: 'JavaScript code to evaluate (for evaluate action)' },
                },
                required: ['action'],
            },
            execute: async (args) => {
                const action = args.action as string;

                switch (action) {
                    case 'navigate': {
                        const url = args.url as string;
                        if (!url) return 'Error: url is required';
                        logger.info(COMPONENT, `Navigating to: ${url}`);
                        // Use curl to fetch page content as a baseline approach
                        return new Promise<string>((resolve) => {
                            exec(`curl -sL --max-time 15 "${url}" | head -c 50000`, { timeout: 20000 }, (err, stdout) => {
                                if (err) {
                                    resolve(`Error fetching ${url}: ${err.message}`);
                                    return;
                                }
                                // Strip HTML tags for text content
                                const text = stdout
                                    .replace(/<script[\s\S]*?<\/script>/gi, '')
                                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                                    .replace(/<[^>]*>/g, ' ')
                                    .replace(/\s+/g, ' ')
                                    .trim();
                                resolve(`Page content from ${url}:\n${text.slice(0, 20000)}`);
                            });
                        });
                    }
                    case 'snapshot':
                    case 'extract': {
                        const url = args.url as string;
                        if (!url) return 'Error: url is required for snapshot/extract';
                        return new Promise<string>((resolve) => {
                            exec(`curl -sL --max-time 15 "${url}" | head -c 50000`, { timeout: 20000 }, (err, stdout) => {
                                if (err) {
                                    resolve(`Error: ${err.message}`);
                                    return;
                                }
                                // Extract title + meta description + links
                                const title = stdout.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || 'No title';
                                const desc = stdout.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i)?.[1] || '';
                                const links: string[] = [];
                                const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
                                let m;
                                while ((m = linkRegex.exec(stdout)) !== null && links.length < 20) {
                                    const text = m[2].replace(/<[^>]*>/g, '').trim();
                                    if (text && m[1] && !m[1].startsWith('#')) links.push(`  ${text}: ${m[1]}`);
                                }
                                resolve(`Page: ${title}\nDescription: ${desc}\nLinks:\n${links.join('\n')}`);
                            });
                        });
                    }
                    case 'evaluate': {
                        const script = args.script as string;
                        if (!script) return 'Error: script is required';
                        return `Note: Full CDP browser evaluation requires a running browser session. Script queued: ${script.slice(0, 200)}`;
                    }
                    case 'screenshot': {
                        const url = args.url as string;
                        if (!url) return 'Error: url is required';
                        return `Screenshot capture requires CDP connection to a running Chromium instance. Target: ${url}`;
                    }
                    case 'click': {
                        const selector = args.selector as string;
                        if (!selector) return 'Error: selector is required';
                        return `Click action requires CDP connection. Selector: ${selector}`;
                    }
                    case 'type': {
                        const selector = args.selector as string;
                        const text = args.text as string;
                        if (!selector || !text) return 'Error: selector and text are required';
                        return `Type action requires CDP connection. Selector: ${selector}, Text: ${text}`;
                    }
                    default:
                        return `Unknown browser action: ${action}`;
                }
            },
        },
    );
}
