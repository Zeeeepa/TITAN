/**
 * TITAN — Email Skill (Built-in)
 * Send and read email via SMTP (with native TLS upgrade) and Gmail API stubs.
 *
 * Supported tools:
 *   email_send   — Send email over SMTP (Gmail or custom server)
 *   email_search — Search Gmail messages (OAuth2 stub)
 *   email_read   — Read a Gmail message by ID (OAuth2 stub)
 *   email_list   — List recent emails in a folder (IMAP/OAuth2 stub)
 */
import { createConnection } from 'net';
import { connect as tlsConnect, type TLSSocket } from 'tls';
import { registerSkill } from '../registry.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'EmailSkill';

// ---------------------------------------------------------------------------
// Rate-limit state (in-memory, reset on process restart)
// ---------------------------------------------------------------------------
let emailsSentThisSession = 0;
let lastRateLimitWarnAt = 0;
const RATE_LIMIT_WARN_THRESHOLD = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate a single email address with a permissive but sane regex */
function isValidEmail(addr: string): boolean {
    // RFC-5322 simplified — covers the vast majority of real addresses
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr.trim());
}

/** Parse and validate a comma-separated list of email addresses */
function parseAddressList(raw: string): { valid: string[]; invalid: string[] } {
    const parts = raw.split(/[,;]/).map(a => a.trim()).filter(Boolean);
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const addr of parts) {
        if (isValidEmail(addr)) valid.push(addr);
        else invalid.push(addr);
    }
    return { valid, invalid };
}

/** Base64-encode a string (Node.js built-in) */
function b64(s: string): string {
    return Buffer.from(s, 'utf-8').toString('base64');
}

/** Format a Date for email headers (RFC 2822) */
function rfc2822Date(d: Date = new Date()): string {
    return d.toUTCString().replace('GMT', '+0000');
}

/** Fold long header lines at 76 chars as per RFC 5321 */
function foldHeader(header: string): string {
    if (header.length <= 76) return header;
    // Simple fold: insert CRLF + whitespace before each subsequent word
    return header.replace(/(.{1,76})(\s|$)/g, '$1\r\n\t').trimEnd();
}

/** Escape a period at the start of a line (SMTP transparency, RFC 5321 §4.5.2) */
function smtpEscape(text: string): string {
    return text.split('\r\n').map(line => (line.startsWith('.') ? '.' + line : line)).join('\r\n');
}

// ---------------------------------------------------------------------------
// Low-level SMTP client using Node.js net + tls (no third-party deps)
// ---------------------------------------------------------------------------

interface SmtpConfig {
    host: string;
    port: number;
    user: string;
    pass: string;
}

/**
 * Minimal SMTP client that supports STARTTLS + AUTH LOGIN.
 *
 * Flow:
 *   TCP connect → read greeting → EHLO → STARTTLS → TLS handshake
 *   → EHLO again → AUTH LOGIN → MAIL FROM → RCPT TO → DATA → body → QUIT
 */
async function sendViaSMTP(
    cfg: SmtpConfig,
    from: string,
    to: string[],
    raw: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = 30_000;
        let upgrading = false;

        // ------------------------------------------------------------------
        // Step machine — each step sends a command and waits for the reply
        // ------------------------------------------------------------------
        type Step =
            | 'greeting'
            | 'ehlo1'
            | 'starttls'
            | 'ehlo2'
            | 'auth_login'
            | 'auth_user'
            | 'auth_pass'
            | 'mail_from'
            | 'rcpt_to'
            | 'data'
            | 'body'
            | 'quit'
            | 'done';

        let step: Step = 'greeting';
        let rcptIndex = 0;

        // We start on a plain TCP socket, then upgrade it in-place
        let socket: ReturnType<typeof createConnection> | TLSSocket =
            createConnection({ host: cfg.host, port: cfg.port });

        socket.setTimeout(timeout);

        function die(msg: string): void {
            socket.destroy();
            reject(new Error(msg));
        }

        function send(cmd: string): void {
            logger.debug(COMPONENT, `SMTP >> ${cmd}`);
            (socket as NodeJS.WritableStream).write(cmd + '\r\n');
        }

        let buffer = '';

        function onData(chunk: Buffer | string): void {
            buffer += chunk.toString('utf-8');

            // SMTP responses end with a complete line: "ddd text\r\n"
            // Multi-line responses use "ddd-text\r\n" until "ddd text\r\n"
            const lines = buffer.split('\r\n');
            // Keep the last (possibly incomplete) piece in the buffer
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                if (!line) continue;
                logger.debug(COMPONENT, `SMTP << ${line}`);

                const code = parseInt(line.slice(0, 3), 10);
                const isContinuation = line[3] === '-';
                if (isContinuation) continue; // Multi-line — wait for final line

                handleResponse(code, line);
            }
        }

        function handleResponse(code: number, line: string): void {
            // Any 4xx/5xx (except after DATA where 3xx is used) is a hard error
            const ok2xx = code >= 200 && code < 300;
            const ok3xx = code >= 300 && code < 400;

            switch (step) {
                case 'greeting':
                    if (code !== 220) return die(`Server rejected connection: ${line}`);
                    step = 'ehlo1';
                    send(`EHLO ${cfg.host}`);
                    break;

                case 'ehlo1':
                    if (!ok2xx) return die(`EHLO failed: ${line}`);
                    step = 'starttls';
                    send('STARTTLS');
                    break;

                case 'starttls':
                    if (code !== 220) return die(`STARTTLS failed: ${line}`);
                    // Upgrade the socket to TLS
                    upgrading = true;
                    socket.removeAllListeners('data');
                    socket.removeAllListeners('error');
                    socket.removeAllListeners('timeout');
                    socket.removeAllListeners('close');

                    const tlsSocket = tlsConnect({
                        socket: socket as any,
                        host: cfg.host,
                        servername: cfg.host,
                        rejectUnauthorized: true,
                    });

                    tlsSocket.setTimeout(timeout);
                    tlsSocket.on('data', onData);
                    tlsSocket.on('error', (err) => die(`TLS error: ${err.message}`));
                    tlsSocket.on('timeout', () => die('SMTP connection timed out'));
                    tlsSocket.on('close', () => {
                        if (step !== 'done') die('Connection closed unexpectedly');
                    });

                    socket = tlsSocket;
                    upgrading = false;
                    step = 'ehlo2';
                    send(`EHLO ${cfg.host}`);
                    break;

                case 'ehlo2':
                    if (!ok2xx) return die(`EHLO (post-TLS) failed: ${line}`);
                    step = 'auth_login';
                    send('AUTH LOGIN');
                    break;

                case 'auth_login':
                    // Server should reply 334 (challenge)
                    if (code !== 334) return die(`AUTH LOGIN rejected: ${line}`);
                    step = 'auth_user';
                    send(b64(cfg.user));
                    break;

                case 'auth_user':
                    if (code !== 334) return die(`AUTH username rejected: ${line}`);
                    step = 'auth_pass';
                    send(b64(cfg.pass));
                    break;

                case 'auth_pass':
                    if (code !== 235) return die(`AUTH password rejected (check credentials): ${code}`);
                    step = 'mail_from';
                    send(`MAIL FROM:<${from}>`);
                    break;

                case 'mail_from':
                    if (!ok2xx) return die(`MAIL FROM rejected: ${line}`);
                    rcptIndex = 0;
                    step = 'rcpt_to';
                    send(`RCPT TO:<${to[rcptIndex]}>`);
                    break;

                case 'rcpt_to':
                    if (!ok2xx) return die(`RCPT TO <${to[rcptIndex]}> rejected: ${line}`);
                    rcptIndex++;
                    if (rcptIndex < to.length) {
                        // More recipients to add
                        send(`RCPT TO:<${to[rcptIndex]}>`);
                    } else {
                        step = 'data';
                        send('DATA');
                    }
                    break;

                case 'data':
                    // Server should reply 354 (start input)
                    if (code !== 354) return die(`DATA command rejected: ${line}`);
                    step = 'body';
                    // Send the raw message body followed by <CRLF>.<CRLF>
                    (socket as NodeJS.WritableStream).write(smtpEscape(raw) + '\r\n.\r\n');
                    break;

                case 'body':
                    if (!ok2xx) return die(`Message rejected by server: ${line}`);
                    step = 'quit';
                    send('QUIT');
                    break;

                case 'quit':
                    // 221 is the expected goodbye — some servers send 2xx variants
                    step = 'done';
                    socket.destroy();
                    resolve();
                    break;

                default:
                    break;
            }
        }

        socket.on('data', onData);
        socket.on('error', (err: Error) => {
            if (!upgrading) die(`Socket error: ${err.message}`);
        });
        socket.on('timeout', () => die('SMTP connection timed out'));
        socket.on('close', () => {
            if (step !== 'done') die('Connection closed before message was sent');
        });
    });
}

// ---------------------------------------------------------------------------
// Build a raw RFC 5322 email message
// ---------------------------------------------------------------------------

interface MessageOptions {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    html: boolean;
}

function buildRawMessage(opts: MessageOptions): string {
    const boundary = `titan_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const lines: string[] = [];

    lines.push(`Date: ${rfc2822Date()}`);
    lines.push(`From: ${opts.from}`);
    lines.push(`To: ${opts.to.join(', ')}`);
    if (opts.cc && opts.cc.length > 0) lines.push(`Cc: ${opts.cc.join(', ')}`);
    // BCC is intentionally omitted from headers (included in RCPT TO only)
    lines.push(foldHeader(`Subject: ${opts.subject}`));
    lines.push('MIME-Version: 1.0');

    if (opts.html) {
        // Multipart/alternative with plain-text fallback
        lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
        lines.push('');
        lines.push(`--${boundary}`);
        lines.push('Content-Type: text/plain; charset=UTF-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        // Simple HTML → plain fallback: strip tags
        const plain = opts.body
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();
        lines.push(plain);
        lines.push('');
        lines.push(`--${boundary}`);
        lines.push('Content-Type: text/html; charset=UTF-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        lines.push(opts.body);
        lines.push('');
        lines.push(`--${boundary}--`);
    } else {
        lines.push('Content-Type: text/plain; charset=UTF-8');
        lines.push('Content-Transfer-Encoding: 7bit');
        lines.push('');
        lines.push(opts.body);
    }

    return lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// Resolve SMTP config from env vars
// ---------------------------------------------------------------------------

interface SmtpResolved {
    cfg: SmtpConfig;
    from: string;
}

function resolveSmtpConfig(): SmtpResolved | null {
    // Gmail takes priority
    const gmailAddr = process.env.GMAIL_ADDRESS?.trim();
    const gmailPass = process.env.GMAIL_APP_PASSWORD?.trim();
    if (gmailAddr && gmailPass) {
        return {
            cfg: { host: 'smtp.gmail.com', port: 587, user: gmailAddr, pass: gmailPass },
            from: gmailAddr,
        };
    }

    // Custom SMTP
    const smtpHost = process.env.SMTP_HOST?.trim();
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();
    const smtpPort = parseInt(process.env.SMTP_PORT ?? '587', 10);
    if (smtpHost && smtpUser && smtpPass) {
        return {
            cfg: { host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass },
            from: smtpUser,
        };
    }

    return null;
}

// ---------------------------------------------------------------------------
// Skill registrations
// ---------------------------------------------------------------------------

export function registerEmailSkill(): void {
    // -------------------------------------------------------------------------
    // Tool 1: email_send
    // -------------------------------------------------------------------------
    registerSkill(
        {
            name: 'email_send',
            description: 'Send an email via SMTP',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'email_send',
            description:
                'Send an email to one or more recipients. ' +
                'Requires GMAIL_ADDRESS + GMAIL_APP_PASSWORD env vars (or SMTP_HOST/SMTP_USER/SMTP_PASS). ' +
                'Supports plain text and HTML bodies, CC, and BCC.',
            parameters: {
                type: 'object',
                properties: {
                    to: {
                        type: 'string',
                        description: 'Recipient email address(es), comma-separated',
                    },
                    subject: {
                        type: 'string',
                        description: 'Email subject line',
                    },
                    body: {
                        type: 'string',
                        description: 'Email body — plain text by default, or HTML if html=true',
                    },
                    cc: {
                        type: 'string',
                        description: 'CC recipient(s), comma-separated (optional)',
                    },
                    bcc: {
                        type: 'string',
                        description: 'BCC recipient(s), comma-separated (optional)',
                    },
                    html: {
                        type: 'boolean',
                        description: 'Set to true to send body as HTML (default: false)',
                    },
                },
                required: ['to', 'subject', 'body'],
            },
            execute: async (args) => {
                const toRaw = (args.to as string) || '';
                const subject = (args.subject as string) || '';
                const body = (args.body as string) || '';
                const ccRaw = (args.cc as string) || '';
                const bccRaw = (args.bcc as string) || '';
                const isHtml = Boolean(args.html);

                // ----------------------------------------------------------
                // Validate inputs
                // ----------------------------------------------------------
                if (!toRaw.trim()) return 'Error: "to" is required.';
                if (!subject.trim()) return 'Error: "subject" is required.';
                if (!body.trim()) return 'Error: "body" is required.';

                const toResult = parseAddressList(toRaw);
                if (toResult.invalid.length > 0) {
                    return `Error: Invalid "to" address(es): ${toResult.invalid.join(', ')}`;
                }
                if (toResult.valid.length === 0) {
                    return 'Error: No valid "to" addresses provided.';
                }

                const ccResult = ccRaw ? parseAddressList(ccRaw) : { valid: [], invalid: [] };
                if (ccResult.invalid.length > 0) {
                    return `Error: Invalid "cc" address(es): ${ccResult.invalid.join(', ')}`;
                }

                const bccResult = bccRaw ? parseAddressList(bccRaw) : { valid: [], invalid: [] };
                if (bccResult.invalid.length > 0) {
                    return `Error: Invalid "bcc" address(es): ${bccResult.invalid.join(', ')}`;
                }

                // ----------------------------------------------------------
                // Resolve SMTP config
                // ----------------------------------------------------------
                const resolved = resolveSmtpConfig();
                if (!resolved) {
                    return (
                        'Error: No email configuration found. ' +
                        'Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD environment variables for Gmail, ' +
                        'or SMTP_HOST, SMTP_USER, SMTP_PASS (and optionally SMTP_PORT) for a custom SMTP server.'
                    );
                }

                // ----------------------------------------------------------
                // Rate-limit warning
                // ----------------------------------------------------------
                emailsSentThisSession++;
                if (
                    emailsSentThisSession > RATE_LIMIT_WARN_THRESHOLD &&
                    Date.now() - lastRateLimitWarnAt > 60_000
                ) {
                    lastRateLimitWarnAt = Date.now();
                    logger.warn(
                        COMPONENT,
                        `High email volume: ${emailsSentThisSession} emails sent this session`,
                    );
                }

                // ----------------------------------------------------------
                // All recipients for RCPT TO (To + CC + BCC)
                // ----------------------------------------------------------
                const allRecipients = [
                    ...toResult.valid,
                    ...ccResult.valid,
                    ...bccResult.valid,
                ];

                // ----------------------------------------------------------
                // Build raw RFC 5322 message
                // ----------------------------------------------------------
                const raw = buildRawMessage({
                    from: resolved.from,
                    to: toResult.valid,
                    cc: ccResult.valid.length > 0 ? ccResult.valid : undefined,
                    bcc: bccResult.valid.length > 0 ? bccResult.valid : undefined,
                    subject,
                    body,
                    html: isHtml,
                });

                // ----------------------------------------------------------
                // Send via SMTP
                // ----------------------------------------------------------
                logger.info(
                    COMPONENT,
                    `Sending email to ${toResult.valid.join(', ')} via ${resolved.cfg.host}:${resolved.cfg.port}`,
                );

                try {
                    await sendViaSMTP(resolved.cfg, resolved.from, allRecipients, raw);

                    const recipientSummary = [
                        `To: ${toResult.valid.join(', ')}`,
                        ccResult.valid.length > 0 ? `CC: ${ccResult.valid.join(', ')}` : '',
                        bccResult.valid.length > 0 ? `BCC: ${bccResult.valid.length} recipient(s)` : '',
                    ]
                        .filter(Boolean)
                        .join(' | ');

                    logger.info(COMPONENT, `Email sent successfully — ${recipientSummary}`);
                    return (
                        `Email sent successfully.\n` +
                        `Subject: ${subject}\n` +
                        `${recipientSummary}\n` +
                        `Server: ${resolved.cfg.host}:${resolved.cfg.port}`
                    );
                } catch (err) {
                    const msg = (err as Error).message;
                    // Never echo credentials in error messages
                    logger.error(COMPONENT, `SMTP send failed: ${msg}`);
                    return `Error sending email: ${msg}`;
                }
            },
        },
    );

    // -------------------------------------------------------------------------
    // Tool 2: email_search
    // -------------------------------------------------------------------------
    registerSkill(
        {
            name: 'email_search',
            description: 'Search Gmail messages (requires OAuth2)',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'email_search',
            description:
                'Search for emails using Gmail API query syntax (e.g. "from:boss@company.com subject:report is:unread"). ' +
                'NOTE: Requires Gmail OAuth2 setup — currently returns setup instructions.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Gmail search query (e.g. "from:alice@example.com is:unread")',
                    },
                    maxResults: {
                        type: 'number',
                        description: 'Maximum number of results to return (default: 10)',
                    },
                },
                required: ['query'],
            },
            execute: async (args) => {
                const query = (args.query as string) || '';
                const maxResults = (args.maxResults as number) || 10;

                logger.info(COMPONENT, `email_search called — query="${query}" maxResults=${maxResults}`);

                // Gmail API requires an OAuth2 access token, which involves a
                // browser-based consent flow that cannot be automated inline.
                // Until an OAuth2 helper is wired into TITAN config, we return
                // clear setup instructions.
                return [
                    'Gmail API search requires OAuth2 authentication, which has not been configured yet.',
                    '',
                    'To enable Gmail search and read functionality:',
                    '  1. Go to https://console.cloud.google.com/ and create a project.',
                    '  2. Enable the "Gmail API" for the project.',
                    '  3. Create OAuth 2.0 credentials (type: Desktop app).',
                    '  4. Download the credentials JSON and run the authorisation flow to obtain',
                    '     a refresh token.',
                    '  5. Set the following environment variables:',
                    '       GMAIL_OAUTH_CLIENT_ID=<your-client-id>',
                    '       GMAIL_OAUTH_CLIENT_SECRET=<your-client-secret>',
                    '       GMAIL_OAUTH_REFRESH_TOKEN=<your-refresh-token>',
                    '',
                    'Alternatively, use an IMAP-capable email client with the email_list tool once',
                    'IMAP support is added in a future TITAN release.',
                    '',
                    `Your query was: "${query}"`,
                ].join('\n');
            },
        },
    );

    // -------------------------------------------------------------------------
    // Tool 3: email_read
    // -------------------------------------------------------------------------
    registerSkill(
        {
            name: 'email_read',
            description: 'Read a specific Gmail message by ID (requires OAuth2)',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'email_read',
            description:
                'Retrieve the full content of a specific email by its Gmail message ID. ' +
                'NOTE: Requires Gmail OAuth2 setup — currently returns setup instructions.',
            parameters: {
                type: 'object',
                properties: {
                    messageId: {
                        type: 'string',
                        description: 'The Gmail message ID to retrieve',
                    },
                },
                required: ['messageId'],
            },
            execute: async (args) => {
                const messageId = (args.messageId as string) || '';

                logger.info(COMPONENT, `email_read called — messageId="${messageId}"`);

                return [
                    'Reading individual Gmail messages requires OAuth2 authentication, which has not been configured yet.',
                    '',
                    'To enable this feature, follow the OAuth2 setup instructions returned by email_search.',
                    '',
                    `Requested message ID: ${messageId}`,
                    '',
                    'Once OAuth2 is configured, this tool will call:',
                    `  GET https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
                ].join('\n');
            },
        },
    );

    // -------------------------------------------------------------------------
    // Tool 4: email_list
    // -------------------------------------------------------------------------
    registerSkill(
        {
            name: 'email_list',
            description: 'List recent emails in a folder (requires IMAP/OAuth2)',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'email_list',
            description:
                'List recent emails from a mailbox folder such as inbox, sent, or spam. ' +
                'NOTE: Requires Gmail OAuth2 or IMAP setup — currently returns setup instructions.',
            parameters: {
                type: 'object',
                properties: {
                    folder: {
                        type: 'string',
                        description: 'Mailbox folder to list (e.g. "inbox", "sent", "spam"). Default: inbox',
                    },
                    count: {
                        type: 'number',
                        description: 'Number of emails to retrieve (default: 10)',
                    },
                },
            },
            execute: async (args) => {
                const folder = (args.folder as string) || 'inbox';
                const count = (args.count as number) || 10;

                logger.info(COMPONENT, `email_list called — folder="${folder}" count=${count}`);

                return [
                    `Listing emails from "${folder}" requires either Gmail OAuth2 or IMAP authentication,`,
                    'neither of which has been configured yet.',
                    '',
                    'Options:',
                    '',
                    'Option A — Gmail OAuth2 (search/read via Gmail API):',
                    '  Follow the OAuth2 setup instructions returned by email_search.',
                    '  Once configured, this tool will call:',
                    `  GET https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${folder.toUpperCase()}&maxResults=${count}`,
                    '',
                    'Option B — Gmail app password (sending only, already supported):',
                    '  Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD to use email_send without OAuth2.',
                    '  Note: App passwords only enable SMTP sending; reading requires OAuth2 or IMAP.',
                    '',
                    'IMAP support (read/list without OAuth2) is planned for a future TITAN release.',
                    '',
                    `Requested: ${count} email(s) from "${folder}"`,
                ].join('\n');
            },
        },
    );
}
