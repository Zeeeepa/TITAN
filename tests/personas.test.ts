import { describe, it, expect, beforeEach } from 'vitest';
import { loadPersonas, getPersona, listPersonas, getActivePersonaContent, invalidatePersonaCache } from '../src/personas/manager.js';

describe('Persona Manager', () => {
  beforeEach(() => {
    invalidatePersonaCache();
  });

  describe('loadPersonas', () => {
    it('discovers persona files from assets/personas/', () => {
      const personas = loadPersonas();
      expect(personas.size).toBeGreaterThan(0);
    });

    it('includes the default persona', () => {
      const personas = loadPersonas();
      expect(personas.has('default')).toBe(true);
    });

    it('parses frontmatter correctly', () => {
      const personas = loadPersonas();
      const defaultPersona = personas.get('default');
      expect(defaultPersona).toBeDefined();
      expect(defaultPersona!.id).toBe('default');
      expect(defaultPersona!.name).toBe('Default');
    });
  });

  describe('getPersona', () => {
    it('returns a valid persona by id', () => {
      loadPersonas();
      const persona = getPersona('default');
      expect(persona).toBeDefined();
      expect(persona!.id).toBe('default');
    });

    it('returns undefined for unknown persona', () => {
      loadPersonas();
      const persona = getPersona('nonexistent-persona-xyz');
      expect(persona).toBeUndefined();
    });
  });

  describe('listPersonas', () => {
    it('returns an array of persona metadata', () => {
      loadPersonas();
      const list = listPersonas();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });

    it('each persona has required fields', () => {
      loadPersonas();
      const list = listPersonas();
      for (const p of list) {
        expect(p.id).toBeDefined();
        expect(p.name).toBeDefined();
        expect(p.description).toBeDefined();
        expect(p.division).toBeDefined();
      }
    });

    it('includes personas from multiple divisions', () => {
      loadPersonas();
      const list = listPersonas();
      const divisions = new Set(list.map(p => p.division));
      expect(divisions.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getActivePersonaContent', () => {
    it('returns empty string for default persona', () => {
      loadPersonas();
      const content = getActivePersonaContent('default');
      expect(content).toBe('');
    });

    it('returns content for a non-default persona', () => {
      loadPersonas();
      const list = listPersonas();
      const nonDefault = list.find(p => p.id !== 'default');
      if (nonDefault) {
        const content = getActivePersonaContent(nonDefault.id);
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it('returns empty string for unknown persona with fallback', () => {
      loadPersonas();
      const content = getActivePersonaContent('nonexistent-xyz');
      expect(content).toBe('');
    });
  });

  describe('invalidatePersonaCache', () => {
    it('clears cache so next load rediscovers files', () => {
      loadPersonas();
      const before = listPersonas().length;
      invalidatePersonaCache();
      loadPersonas();
      const after = listPersonas().length;
      expect(after).toBe(before);
    });
  });
});
