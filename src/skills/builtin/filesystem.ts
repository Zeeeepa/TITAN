/**
 * TITAN — Filesystem Skill (Built-in)
 * Read, write, edit, and list files and directories.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync, mkdirSync } from 'fs';
import { join, resolve, basename } from 'path';
import { registerSkill } from '../registry.js';

export function registerFilesystemSkill(): void {
    // Read File
    registerSkill(
        { name: 'read_file', description: 'Read file contents', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'read_file',
            description: 'Read the contents of a file. Returns the text content of the file.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute or relative path to the file' },
                    startLine: { type: 'number', description: 'Start line (1-indexed, optional)' },
                    endLine: { type: 'number', description: 'End line (1-indexed, optional)' },
                },
                required: ['path'],
            },
            execute: async (args) => {
                const filePath = resolve(args.path as string);
                if (!existsSync(filePath)) return `Error: File not found: ${filePath}`;
                try {
                    const content = readFileSync(filePath, 'utf-8');
                    const lines = content.split('\n');
                    const start = (args.startLine as number) || 1;
                    const end = (args.endLine as number) || lines.length;
                    const selected = lines.slice(start - 1, end);
                    return `File: ${filePath} (${lines.length} lines)\n---\n${selected.map((l, i) => `${start + i}: ${l}`).join('\n')}`;
                } catch (e) { return `Error reading file: ${(e as Error).message}`; }
            },
        },
    );

    // Write File
    registerSkill(
        { name: 'write_file', description: 'Write/create a file', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'write_file',
            description: 'Write content to a file. Creates the file and parent directories if they don\'t exist. Overwrites existing content.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to the file' },
                    content: { type: 'string', description: 'Content to write' },
                },
                required: ['path', 'content'],
            },
            execute: async (args) => {
                const filePath = resolve(args.path as string);
                try {
                    const dir = join(filePath, '..');
                    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                    writeFileSync(filePath, args.content as string, 'utf-8');
                    return `Successfully wrote ${(args.content as string).length} bytes to ${filePath}`;
                } catch (e) { return `Error writing file: ${(e as Error).message}`; }
            },
        },
    );

    // Edit File
    registerSkill(
        { name: 'edit_file', description: 'Search and replace in a file', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'edit_file',
            description: 'Edit a file by replacing a target string with new content.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to the file' },
                    target: { type: 'string', description: 'Exact string to find and replace' },
                    replacement: { type: 'string', description: 'Replacement content' },
                },
                required: ['path', 'target', 'replacement'],
            },
            execute: async (args) => {
                const filePath = resolve(args.path as string);
                if (!existsSync(filePath)) return `Error: File not found: ${filePath}`;
                try {
                    let content = readFileSync(filePath, 'utf-8');
                    const target = args.target as string;
                    if (!content.includes(target)) return `Error: Target string not found in ${filePath}`;
                    content = content.replace(target, args.replacement as string);
                    writeFileSync(filePath, content, 'utf-8');
                    return `Successfully edited ${filePath}`;
                } catch (e) { return `Error editing file: ${(e as Error).message}`; }
            },
        },
    );

    // List Directory
    registerSkill(
        { name: 'list_dir', description: 'List directory contents', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'list_dir',
            description: 'List the contents of a directory, showing files and subdirectories with sizes.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to the directory' },
                    recursive: { type: 'boolean', description: 'List recursively (default: false)' },
                },
                required: ['path'],
            },
            execute: async (args) => {
                const dirPath = resolve(args.path as string);
                if (!existsSync(dirPath)) return `Error: Directory not found: ${dirPath}`;
                try {
                    const entries = readdirSync(dirPath, { withFileTypes: true });
                    const lines = entries.map((entry) => {
                        const fullPath = join(dirPath, entry.name);
                        if (entry.isDirectory()) {
                            return `📁 ${entry.name}/`;
                        }
                        const stat = statSync(fullPath);
                        const size = stat.size < 1024 ? `${stat.size}B` : stat.size < 1048576 ? `${(stat.size / 1024).toFixed(1)}KB` : `${(stat.size / 1048576).toFixed(1)}MB`;
                        return `📄 ${entry.name} (${size})`;
                    });
                    return `Directory: ${dirPath}\n${lines.join('\n')}`;
                } catch (e) { return `Error listing directory: ${(e as Error).message}`; }
            },
        },
    );
}
