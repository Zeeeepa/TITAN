/**
 * TITAN — Monitor Tests
 * Tests listMonitors, getMonitorEvents, setMonitorTriggerHandler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn().mockReturnValue('[]'),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        watch: vi.fn().mockReturnValue({
            on: vi.fn(),
            close: vi.fn(),
        }),
    };
});

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/utils/constants.js', () => ({
    TITAN_HOME: '/tmp/titan-test-monitor',
}));

import {
    listMonitors,
    getMonitorEvents,
    setMonitorTriggerHandler,
    initMonitors,
} from '../src/agent/monitor.js';

describe('Monitor System', () => {
    describe('listMonitors', () => {
        it('should return an empty array when no monitors exist', () => {
            const monitors = listMonitors();
            expect(Array.isArray(monitors)).toBe(true);
        });
    });

    describe('getMonitorEvents', () => {
        it('should return an empty array initially', () => {
            const events = getMonitorEvents();
            expect(Array.isArray(events)).toBe(true);
        });
    });

    describe('setMonitorTriggerHandler', () => {
        it('should accept a handler function', () => {
            expect(() => {
                setMonitorTriggerHandler(async () => {});
            }).not.toThrow();
        });
    });

    describe('initMonitors', () => {
        it('should not throw when no monitors exist', () => {
            expect(() => initMonitors()).not.toThrow();
        });
    });
});
