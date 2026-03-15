/**
 * TITAN — Smart Home Skill (Built-in)
 * Control and monitor Home Assistant devices via REST API.
 * Supports listing devices, controlling switches/lights, and checking status.
 */
import { registerSkill } from '../registry.js';

interface HAEntity {
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
    last_changed: string;
    last_updated: string;
}

interface HAStateResponse {
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
    last_changed: string;
    last_updated: string;
}

/**
 * Parse a simple filter expression like "age > 30" or "status == 'active'"
 * Used for basic query operations
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _evaluateExpression(expr: string, value: unknown): boolean {
    const operators = ['>=', '<=', '!=', '==', '>', '<', 'contains'];
    for (const op of operators) {
        if (expr.includes(op)) {
            const [left, right] = expr.split(op).map(s => s.trim());
            const leftVal = left === 'state' ? value : value;
            const rightVal = right.replace(/^['"]|['"]$/g, '');

            switch (op) {
                case '>':
                    return Number(leftVal) > Number(rightVal);
                case '<':
                    return Number(leftVal) < Number(rightVal);
                case '>=':
                    return Number(leftVal) >= Number(rightVal);
                case '<=':
                    return Number(leftVal) <= Number(rightVal);
                case '==':
                    return String(leftVal) === String(rightVal);
                case '!=':
                    return String(leftVal) !== String(rightVal);
                case 'contains':
                    return String(leftVal).includes(String(rightVal));
                default:
                    return false;
            }
        }
    }
    return true;
}

/**
 * Get Home Assistant URL from environment
 */
function getHAUrl(): string {
    return process.env.HOME_ASSISTANT_URL || '';
}

/**
 * Get Home Assistant token from environment
 */
function getHAToken(): string {
    return process.env.HOME_ASSISTANT_TOKEN || '';
}

/**
 * Make an authenticated request to Home Assistant API
 */
async function haRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: Record<string, unknown>
): Promise<unknown> {
    const url = getHAUrl();
    const token = getHAToken();

    if (!url || !token) {
        throw new Error(
            'Home Assistant not configured. Set HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN environment variables.'
        );
    }

    const fullUrl = `${url}${endpoint}`;
    const options: RequestInit = {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(fullUrl, options);
    if (!response.ok) {
        throw new Error(`Home Assistant API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Format device state info into readable output
 */
function formatStateInfo(entity: HAEntity): string {
    const lines: string[] = [];
    lines.push(`Entity: ${entity.entity_id}`);
    lines.push(`State: ${entity.state}`);

    if (Object.keys(entity.attributes).length > 0) {
        lines.push('Attributes:');
        for (const [key, value] of Object.entries(entity.attributes)) {
            lines.push(`  ${key}: ${JSON.stringify(value)}`);
        }
    }

    lines.push(`Last Updated: ${entity.last_updated}`);
    return lines.join('\n');
}

/**
 * Format a list of devices into a table
 */
function formatDeviceList(entities: HAEntity[]): string {
    if (entities.length === 0) {
        return 'No devices found.';
    }

    const lines: string[] = [];
    lines.push(`Found ${entities.length} device(s):\n`);

    for (const entity of entities) {
        const attrs = entity.attributes as Record<string, unknown>;
        const friendly_name = (attrs.friendly_name as string) || entity.entity_id;
        lines.push(`• ${friendly_name} (${entity.entity_id})`);
        lines.push(`  State: ${entity.state}`);
        if (attrs.temperature !== undefined) {
            lines.push(`  Temperature: ${attrs.temperature}°C`);
        }
        if (attrs.brightness !== undefined) {
            lines.push(`  Brightness: ${attrs.brightness}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

export function registerSmartHomeSkill(): void {
    registerSkill(
        {
            name: 'smart_home',
            description: 'Use this for any home control or status request — "turn on the lights", "set thermostat to X", "lock the doors", "what\'s the temperature inside", "turn off everything", "show me my smart home devices". Controls Home Assistant via REST API.',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'ha_devices',
            description: 'List all smart home devices and their current states. Use when asked "what smart home devices do you see?", "show me my lights", "list my switches", "what\'s connected to Home Assistant", or before controlling a device to find its entity ID. Optionally filter by type: light, switch, sensor, climate, media_player, etc.',
            parameters: {
                type: 'object',
                properties: {
                    domain: {
                        type: 'string',
                        description: 'Device type to list (e.g., "light", "switch", "sensor", "climate") — omit for all devices',
                    },
                },
                required: [],
            },
            execute: async (args) => {
                try {
                    const domain = (args.domain as string) || '';

                    const entities = (await haRequest('/api/states')) as HAEntity[];

                    let filtered = entities;
                    if (domain) {
                        filtered = entities.filter(e => e.entity_id.startsWith(`${domain}.`));
                    }

                    return formatDeviceList(filtered);
                } catch (e) {
                    return `Error listing Home Assistant devices: ${(e as Error).message}`;
                }
            },
        }
    );

    registerSkill(
        {
            name: 'smart_home',
            description: 'Use this for any home control or status request — "turn on the lights", "set thermostat to X", "lock the doors", "what\'s the temperature inside", "turn off everything", "show me my smart home devices". Controls Home Assistant via REST API.',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'ha_control',
            description: 'Control a smart home device — turn it on, off, toggle it, or set a value. Use when asked to "turn on the lights", "turn off the kitchen switch", "set brightness to 80%", "set thermostat to 72", "lock the front door", "toggle the fan", or any command to change a device\'s state.',
            parameters: {
                type: 'object',
                properties: {
                    entityId: {
                        type: 'string',
                        description: 'The Home Assistant entity ID (e.g., "light.living_room", "switch.kitchen", "climate.thermostat")',
                    },
                    action: {
                        type: 'string',
                        enum: ['turn_on', 'turn_off', 'toggle', 'set'],
                        description: 'What to do: turn_on, turn_off, toggle, or set (for adjustments like brightness)',
                    },
                    data: {
                        type: 'object',
                        description: 'Optional parameters like brightness (0-255), temperature (kelvin), color_temp, hvac_mode, etc.',
                    },
                },
                required: ['entityId', 'action'],
            },
            execute: async (args) => {
                try {
                    const entityId = args.entityId as string;
                    const action = args.action as string;
                    const data = (args.data as Record<string, unknown>) || {};

                    // Extract domain from entity_id (e.g., "light" from "light.living_room")
                    const [domain] = entityId.split('.');
                    if (!domain) {
                        return `Error: Invalid entity ID format: ${entityId}`;
                    }

                    // Map actions to Home Assistant services
                    let service = action;
                    if (action === 'set') {
                        service = 'turn_on'; // Most set operations go through turn_on with data
                    }

                    const body = {
                        entity_id: entityId,
                        ...data,
                    };

                    await haRequest(`/api/services/${domain}/${service}`, 'POST', body);

                    return `Successfully executed ${action} on ${entityId}`;
                } catch (e) {
                    return `Error controlling Home Assistant device: ${(e as Error).message}`;
                }
            },
        }
    );

    registerSkill(
        {
            name: 'smart_home',
            description: 'Use this for any home control or status request — "turn on the lights", "set thermostat to X", "lock the doors", "what\'s the temperature inside", "turn off everything", "show me my smart home devices". Controls Home Assistant via REST API.',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'ha_status',
            description: 'Check the current state of a specific smart home device. Use when asked "what\'s the temperature inside?", "are the lights on?", "is the front door locked?", "what\'s the thermostat set to?", or any question about a device\'s current status.',
            parameters: {
                type: 'object',
                properties: {
                    entityId: {
                        type: 'string',
                        description: 'The entity ID to check (e.g., "light.living_room", "sensor.temperature", "lock.front_door")',
                    },
                },
                required: ['entityId'],
            },
            execute: async (args) => {
                try {
                    const entityId = args.entityId as string;

                    const entity = (await haRequest(`/api/states/${entityId}`)) as HAStateResponse;

                    return formatStateInfo(entity as HAEntity);
                } catch (e) {
                    return `Error getting Home Assistant device status: ${(e as Error).message}`;
                }
            },
        }
    );
}
