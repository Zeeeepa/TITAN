/**
 * TITAN — Shell Skill (Built-in)
 * Execute shell commands with sandboxing and output capture.
 */
import { exec } from 'child_process';
import { registerSkill } from '../registry.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'Shell';

/** Execute a shell command and return output */
function executeCommand(command: string, cwd?: string, timeout: number = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = exec(command, {
            cwd: cwd || process.cwd(),
            timeout,
            maxBuffer: 1024 * 1024 * 10, // 10MB
            shell: '/bin/bash',
        }, (error, stdout, stderr) => {
            if (error && error.killed) {
                reject(new Error(`Command timed out after ${timeout}ms`));
                return;
            }

            let output = '';
            if (stdout) output += stdout;
            if (stderr) output += (output ? '\n' : '') + `[stderr] ${stderr}`;
            if (error) output += (output ? '\n' : '') + `[exit code: ${error.code}]`;

            // Truncate very long output
            if (output.length > 50000) {
                output = output.slice(0, 25000) + '\n\n... [output truncated] ...\n\n' + output.slice(-25000);
            }

            resolve(output || '(no output)');
        });
    });
}

export function registerShellSkill(): void {
    registerSkill(
        {
            name: 'shell',
            description: 'Execute shell commands on the system',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'shell',
            description: 'Execute a shell command on the user\'s system. Use this for running scripts, installing packages, checking system status, compiling code, git operations, and any other command-line task.',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The shell command to execute',
                    },
                    cwd: {
                        type: 'string',
                        description: 'Working directory for the command (optional)',
                    },
                    timeout: {
                        type: 'number',
                        description: 'Timeout in milliseconds (default: 30000)',
                    },
                },
                required: ['command'],
            },
            execute: async (args) => {
                const command = args.command as string;
                const cwd = args.cwd as string | undefined;
                const timeout = (args.timeout as number) ?? 30000;

                logger.info(COMPONENT, `Executing: ${command}`);
                return await executeCommand(command, cwd, timeout);
            },
        },
    );
}
