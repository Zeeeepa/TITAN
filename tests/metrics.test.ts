import { describe, it, expect } from 'vitest';
import { Counter, Histogram, Gauge, serializePrometheus } from '../src/gateway/metrics.js';

describe('Counter', () => {
  it('starts at 0', () => {
    const c = new Counter('test_counter', 'A test counter');
    expect(c.get()).toBe(0);
  });

  it('increments without labels', () => {
    const c = new Counter('test_counter', 'A test counter');
    c.increment();
    c.increment();
    expect(c.get()).toBe(2);
  });

  it('increments with amount', () => {
    const c = new Counter('test_counter', 'A test counter');
    c.increment(undefined, 5);
    expect(c.get()).toBe(5);
  });

  it('tracks separate label sets independently', () => {
    const c = new Counter('http_requests', 'HTTP requests');
    c.increment({ method: 'GET' }, 3);
    c.increment({ method: 'POST' }, 7);
    expect(c.get({ method: 'GET' })).toBe(3);
    expect(c.get({ method: 'POST' })).toBe(7);
  });

  it('serializes to Prometheus format', () => {
    const c = new Counter('my_counter', 'Help text');
    c.increment({ status: 'ok' }, 10);
    c.increment({ status: 'err' }, 2);
    const out = c.serialize();
    expect(out).toContain('# HELP my_counter Help text');
    expect(out).toContain('# TYPE my_counter counter');
    expect(out).toContain('my_counter{status="ok"} 10');
    expect(out).toContain('my_counter{status="err"} 2');
  });

  it('serializes empty counter', () => {
    const c = new Counter('empty_counter', 'Empty');
    const out = c.serialize();
    expect(out).toContain('empty_counter 0');
  });

  it('getAll returns all label combinations', () => {
    const c = new Counter('test', 'test');
    c.increment({ tool: 'a' }, 3);
    c.increment({ tool: 'b' }, 1);
    const all = c.getAll();
    expect(all).toHaveLength(2);
    expect(all.find(e => e.labels['tool'] === 'a')?.value).toBe(3);
    expect(all.find(e => e.labels['tool'] === 'b')?.value).toBe(1);
  });
});

describe('Histogram', () => {
  it('starts empty', () => {
    const h = new Histogram('test_duration', 'Duration');
    const data = h.get();
    expect(data.count).toBe(0);
    expect(data.sum).toBe(0);
  });

  it('observes values and tracks count/sum', () => {
    const h = new Histogram('test_duration', 'Duration');
    h.observe(0.05);
    h.observe(0.5);
    h.observe(2.0);
    const data = h.get();
    expect(data.count).toBe(3);
    expect(data.sum).toBeCloseTo(2.55);
  });

  it('distributes into buckets correctly', () => {
    const h = new Histogram('test_duration', 'Duration', [0.1, 0.5, 1.0]);
    h.observe(0.05);  // fits in 0.1
    h.observe(0.3);   // fits in 0.5
    h.observe(0.8);   // fits in 1.0
    h.observe(5.0);   // exceeds all buckets
    const data = h.get();
    expect(data.buckets['0.1']).toBe(1);    // cumulative: 1
    expect(data.buckets['0.5']).toBe(2);    // cumulative: 1+1
    expect(data.buckets['1']).toBe(3);      // cumulative: 1+1+1
    expect(data.buckets['+Inf']).toBe(4);   // total
  });

  it('tracks labels independently', () => {
    const h = new Histogram('req_duration', 'Duration', [1, 5]);
    h.observe(0.5, { channel: 'api' });
    h.observe(3.0, { channel: 'web' });
    expect(h.get({ channel: 'api' }).count).toBe(1);
    expect(h.get({ channel: 'web' }).count).toBe(1);
    expect(h.get({ channel: 'api' }).sum).toBeCloseTo(0.5);
  });

  it('serializes to Prometheus format with cumulative buckets', () => {
    const h = new Histogram('req_seconds', 'Request seconds', [0.1, 1.0]);
    h.observe(0.05);
    h.observe(0.5);
    const out = h.serialize();
    expect(out).toContain('# TYPE req_seconds histogram');
    expect(out).toContain('req_seconds_bucket{le="0.1"} 1');
    expect(out).toContain('req_seconds_bucket{le="1"} 2');
    expect(out).toContain('req_seconds_bucket{le="+Inf"} 2');
    expect(out).toContain('req_seconds_sum 0.55');
    expect(out).toContain('req_seconds_count 2');
  });
});

describe('Gauge', () => {
  it('starts at 0', () => {
    const g = new Gauge('active_sessions', 'Active sessions');
    expect(g.get()).toBe(0);
  });

  it('sets a value', () => {
    const g = new Gauge('temperature', 'Temp');
    g.set(42);
    expect(g.get()).toBe(42);
  });

  it('increments and decrements', () => {
    const g = new Gauge('active', 'Active');
    g.inc();
    g.inc();
    g.dec();
    expect(g.get()).toBe(1);
  });

  it('supports labels', () => {
    const g = new Gauge('queue_size', 'Queue');
    g.set(10, { queue: 'high' });
    g.set(5, { queue: 'low' });
    expect(g.get({ queue: 'high' })).toBe(10);
    expect(g.get({ queue: 'low' })).toBe(5);
  });

  it('serializes to Prometheus format', () => {
    const g = new Gauge('test_gauge', 'A gauge');
    g.set(99);
    const out = g.serialize();
    expect(out).toContain('# HELP test_gauge A gauge');
    expect(out).toContain('# TYPE test_gauge gauge');
    expect(out).toContain('test_gauge 99');
  });
});

describe('serializePrometheus', () => {
  it('returns a string with all pre-defined metrics', () => {
    const output = serializePrometheus();
    expect(typeof output).toBe('string');
    expect(output).toContain('titan_requests_total');
    expect(output).toContain('titan_request_duration_seconds');
    expect(output).toContain('titan_tokens_total');
    expect(output).toContain('titan_errors_total');
    expect(output).toContain('titan_active_sessions');
    expect(output).toContain('titan_tool_calls_total');
    expect(output).toContain('titan_model_requests_total');
  });

  it('contains valid Prometheus exposition format headers', () => {
    const output = serializePrometheus();
    expect(output).toContain('# HELP');
    expect(output).toContain('# TYPE');
    // Should end with newline
    expect(output.endsWith('\n')).toBe(true);
  });
});
