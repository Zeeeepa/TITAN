/**
 * TITAN Logger — Structured logging with levels and colors
 */
import chalk from 'chalk';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    SILENT = 4,
}

const LEVEL_LABELS: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: chalk.gray('DEBUG'),
    [LogLevel.INFO]: chalk.cyan('INFO '),
    [LogLevel.WARN]: chalk.yellow('WARN '),
    [LogLevel.ERROR]: chalk.red('ERROR'),
    [LogLevel.SILENT]: '',
};

let currentLevel: LogLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
    currentLevel = level;
}

export function getLogLevel(): LogLevel {
    return currentLevel;
}

function formatTimestamp(): string {
    return chalk.gray(new Date().toISOString().replace('T', ' ').slice(0, 19));
}

function log(level: LogLevel, component: string, message: string, ...args: unknown[]): void {
    if (level < currentLevel) return;
    const prefix = `${formatTimestamp()} ${LEVEL_LABELS[level]} ${chalk.blue(`[${component}]`)}`;
    console.log(`${prefix} ${message}`, ...args);
}

export const logger = {
    debug: (component: string, msg: string, ...args: unknown[]) => log(LogLevel.DEBUG, component, msg, ...args),
    info: (component: string, msg: string, ...args: unknown[]) => log(LogLevel.INFO, component, msg, ...args),
    warn: (component: string, msg: string, ...args: unknown[]) => log(LogLevel.WARN, component, msg, ...args),
    error: (component: string, msg: string, ...args: unknown[]) => log(LogLevel.ERROR, component, msg, ...args),
};

export default logger;
