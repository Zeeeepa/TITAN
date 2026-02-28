import { describe, it, expect } from 'vitest';
import { listAgents, getAgentCapacity, spawnAgent, stopAgent } from '../src/agent/multiAgent.js';

describe('MultiAgent System', () => {
    it('should list one default agent initially', () => {
        expect(listAgents().length).toBeGreaterThanOrEqual(1);
        expect(listAgents()[0].id).toBe('default');
    });

    it('capacity should have maximum of 5 agents', () => {
        const cap = getAgentCapacity();
        expect(cap.max).toBe(5);
        expect(cap.current).toBeGreaterThanOrEqual(1);
    });

    it('should spawn and stop an agent', () => {
        const result = spawnAgent({ name: 'TestBot', model: 'ollama/llama3', systemPrompt: 'You are a test.' }) as any;
        expect(result).toHaveProperty('success', true);
        const agent = result.agent;
        expect(agent).toHaveProperty('id');
        expect(agent.name).toBe('TestBot');
        expect(listAgents().length).toBeGreaterThanOrEqual(2);

        const stopResult = stopAgent(agent.id);
        expect(stopResult).toHaveProperty('success', true);
    });
});
