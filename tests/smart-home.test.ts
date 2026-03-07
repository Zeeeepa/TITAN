/**
 * TITAN — Smart Home Skill Tests
 * Tests the 3 built-in Home Assistant tools: ha_devices, ha_control, ha_status.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock registerSkill to capture tool handlers
const registeredTools: Map<string, { execute: (args: Record<string, unknown>) => Promise<string> }> = new Map();

vi.mock('../src/skills/registry.js', () => ({
    registerSkill: vi.fn((_meta: unknown, handler: { name: string; execute: (args: Record<string, unknown>) => Promise<string> }) => {
        registeredTools.set(handler.name, handler);
    }),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { registerSmartHomeSkill } from '../src/skills/builtin/smart_home.js';

describe('Smart Home Skill', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        registeredTools.clear();
        process.env.HOME_ASSISTANT_URL = 'http://ha.local:8123';
        process.env.HOME_ASSISTANT_TOKEN = 'test-token-123';
        registerSmartHomeSkill();
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('registers all 3 smart home tools', () => {
        expect(registeredTools.has('ha_devices')).toBe(true);
        expect(registeredTools.has('ha_control')).toBe(true);
        expect(registeredTools.has('ha_status')).toBe(true);
    });

    // ── ha_devices ──────────────────────────────────────────────

    describe('ha_devices', () => {
        const mockEntities = [
            {
                entity_id: 'light.living_room',
                state: 'on',
                attributes: { friendly_name: 'Living Room Light', brightness: 200 },
                last_changed: '2026-03-06T10:00:00Z',
                last_updated: '2026-03-06T10:00:00Z',
            },
            {
                entity_id: 'switch.kitchen',
                state: 'off',
                attributes: { friendly_name: 'Kitchen Switch' },
                last_changed: '2026-03-06T09:00:00Z',
                last_updated: '2026-03-06T09:00:00Z',
            },
            {
                entity_id: 'sensor.temperature',
                state: '22.5',
                attributes: { friendly_name: 'Temperature Sensor', temperature: 22.5 },
                last_changed: '2026-03-06T08:00:00Z',
                last_updated: '2026-03-06T08:00:00Z',
            },
        ];

        it('lists all devices when no domain filter', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockEntities,
            });

            const handler = registeredTools.get('ha_devices')!;
            const result = await handler.execute({});

            expect(result).toContain('Found 3 device(s)');
            expect(result).toContain('Living Room Light');
            expect(result).toContain('Kitchen Switch');
            expect(result).toContain('Temperature Sensor');
            expect(result).toContain('Brightness: 200');
            expect(result).toContain('Temperature: 22.5');
        });

        it('filters devices by domain', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockEntities,
            });

            const handler = registeredTools.get('ha_devices')!;
            const result = await handler.execute({ domain: 'light' });

            expect(result).toContain('Found 1 device(s)');
            expect(result).toContain('Living Room Light');
            expect(result).not.toContain('Kitchen Switch');
        });

        it('returns message when no devices found', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockEntities,
            });

            const handler = registeredTools.get('ha_devices')!;
            const result = await handler.execute({ domain: 'climate' });

            expect(result).toContain('No devices found');
        });

        it('returns error when HA is not configured', async () => {
            delete process.env.HOME_ASSISTANT_URL;
            delete process.env.HOME_ASSISTANT_TOKEN;

            const handler = registeredTools.get('ha_devices')!;
            const result = await handler.execute({});

            expect(result).toContain('Error listing Home Assistant devices');
            expect(result).toContain('not configured');
        });

        it('returns error on API failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            const handler = registeredTools.get('ha_devices')!;
            const result = await handler.execute({});

            expect(result).toContain('Error listing Home Assistant devices');
            expect(result).toContain('500');
        });

        it('sends correct authorization header', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [],
            });

            const handler = registeredTools.get('ha_devices')!;
            await handler.execute({});

            expect(mockFetch).toHaveBeenCalledWith(
                'http://ha.local:8123/api/states',
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        Authorization: 'Bearer test-token-123',
                    }),
                })
            );
        });
    });

    // ── ha_control ──────────────────────────────────────────────

    describe('ha_control', () => {
        it('turns on a light', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

            const handler = registeredTools.get('ha_control')!;
            const result = await handler.execute({
                entityId: 'light.living_room',
                action: 'turn_on',
            });

            expect(result).toContain('Successfully executed turn_on on light.living_room');
            expect(mockFetch).toHaveBeenCalledWith(
                'http://ha.local:8123/api/services/light/turn_on',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ entity_id: 'light.living_room' }),
                })
            );
        });

        it('turns off a switch', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

            const handler = registeredTools.get('ha_control')!;
            const result = await handler.execute({
                entityId: 'switch.kitchen',
                action: 'turn_off',
            });

            expect(result).toContain('Successfully executed turn_off on switch.kitchen');
            expect(mockFetch).toHaveBeenCalledWith(
                'http://ha.local:8123/api/services/switch/turn_off',
                expect.anything()
            );
        });

        it('toggles a device', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

            const handler = registeredTools.get('ha_control')!;
            const result = await handler.execute({
                entityId: 'light.bedroom',
                action: 'toggle',
            });

            expect(result).toContain('Successfully executed toggle on light.bedroom');
        });

        it('maps "set" action to turn_on service with data', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

            const handler = registeredTools.get('ha_control')!;
            const result = await handler.execute({
                entityId: 'light.living_room',
                action: 'set',
                data: { brightness: 128 },
            });

            expect(result).toContain('Successfully executed set on light.living_room');
            expect(mockFetch).toHaveBeenCalledWith(
                'http://ha.local:8123/api/services/light/turn_on',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ entity_id: 'light.living_room', brightness: 128 }),
                })
            );
        });

        it('returns error for invalid entity ID format', async () => {
            const handler = registeredTools.get('ha_control')!;
            const result = await handler.execute({
                entityId: '',
                action: 'turn_on',
            });

            expect(result).toContain('Error');
        });

        it('returns error when HA is not configured', async () => {
            delete process.env.HOME_ASSISTANT_URL;
            delete process.env.HOME_ASSISTANT_TOKEN;

            const handler = registeredTools.get('ha_control')!;
            const result = await handler.execute({
                entityId: 'light.living_room',
                action: 'turn_on',
            });

            expect(result).toContain('Error controlling Home Assistant device');
            expect(result).toContain('not configured');
        });

        it('returns error on API failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            const handler = registeredTools.get('ha_control')!;
            const result = await handler.execute({
                entityId: 'light.nonexistent',
                action: 'turn_on',
            });

            expect(result).toContain('Error controlling Home Assistant device');
            expect(result).toContain('404');
        });

        it('passes additional data fields in request body', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

            const handler = registeredTools.get('ha_control')!;
            await handler.execute({
                entityId: 'light.living_room',
                action: 'turn_on',
                data: { brightness: 255, color_temp: 400 },
            });

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: JSON.stringify({
                        entity_id: 'light.living_room',
                        brightness: 255,
                        color_temp: 400,
                    }),
                })
            );
        });
    });

    // ── ha_status ───────────────────────────────────────────────

    describe('ha_status', () => {
        it('returns formatted state info for a device', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    entity_id: 'sensor.temperature',
                    state: '22.5',
                    attributes: { friendly_name: 'Temperature Sensor', unit_of_measurement: '°C' },
                    last_changed: '2026-03-06T10:00:00Z',
                    last_updated: '2026-03-06T10:05:00Z',
                }),
            });

            const handler = registeredTools.get('ha_status')!;
            const result = await handler.execute({ entityId: 'sensor.temperature' });

            expect(result).toContain('Entity: sensor.temperature');
            expect(result).toContain('State: 22.5');
            expect(result).toContain('friendly_name');
            expect(result).toContain('Temperature Sensor');
            expect(result).toContain('Last Updated: 2026-03-06T10:05:00Z');
        });

        it('calls correct API endpoint', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    entity_id: 'light.bedroom',
                    state: 'off',
                    attributes: {},
                    last_changed: '2026-03-06T10:00:00Z',
                    last_updated: '2026-03-06T10:00:00Z',
                }),
            });

            const handler = registeredTools.get('ha_status')!;
            await handler.execute({ entityId: 'light.bedroom' });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://ha.local:8123/api/states/light.bedroom',
                expect.objectContaining({ method: 'GET' })
            );
        });

        it('shows attributes section when attributes exist', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    entity_id: 'light.living_room',
                    state: 'on',
                    attributes: { brightness: 200, color_mode: 'color_temp' },
                    last_changed: '2026-03-06T10:00:00Z',
                    last_updated: '2026-03-06T10:00:00Z',
                }),
            });

            const handler = registeredTools.get('ha_status')!;
            const result = await handler.execute({ entityId: 'light.living_room' });

            expect(result).toContain('Attributes:');
            expect(result).toContain('brightness: 200');
            expect(result).toContain('color_mode: "color_temp"');
        });

        it('omits attributes section when empty', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    entity_id: 'switch.test',
                    state: 'off',
                    attributes: {},
                    last_changed: '2026-03-06T10:00:00Z',
                    last_updated: '2026-03-06T10:00:00Z',
                }),
            });

            const handler = registeredTools.get('ha_status')!;
            const result = await handler.execute({ entityId: 'switch.test' });

            expect(result).not.toContain('Attributes:');
        });

        it('returns error when HA is not configured', async () => {
            delete process.env.HOME_ASSISTANT_URL;
            delete process.env.HOME_ASSISTANT_TOKEN;

            const handler = registeredTools.get('ha_status')!;
            const result = await handler.execute({ entityId: 'light.living_room' });

            expect(result).toContain('Error getting Home Assistant device status');
            expect(result).toContain('not configured');
        });

        it('returns error on API failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            const handler = registeredTools.get('ha_status')!;
            const result = await handler.execute({ entityId: 'sensor.nonexistent' });

            expect(result).toContain('Error getting Home Assistant device status');
            expect(result).toContain('404');
        });
    });
});
