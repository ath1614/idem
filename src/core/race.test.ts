import { describe, expect, it } from 'vitest';
import { runBatch, runRace, type Strategy } from './race';

const base = { concurrency: 4, latencyMs: 40, jitterMs: 30, seed: 7 };

function batch(strategy: Strategy, runs = 200) {
  return runBatch({ ...base, strategy }, runs);
}

describe('strategies', () => {
  it('bills every attempt when there is no key', () => {
    const result = runRace({ ...base, strategy: 'none' });
    expect(result.charges).toBe(4);
    expect(result.exactlyOnce).toBe(false);
  });

  it('bills more than once with check-then-write when the reads overlap', () => {
    const result = runRace({ ...base, strategy: 'check-then-write', jitterMs: 0 });
    expect(result.charges).toBeGreaterThan(1);
  });

  it('bills once with a unique key under the same overlap', () => {
    const result = runRace({ ...base, strategy: 'unique-key', jitterMs: 0 });
    expect(result.charges).toBe(1);
    expect(result.attempts.filter((attempt) => attempt.outcome === 'conflict')).toHaveLength(3);
  });

  it('bills once with an atomic key and charge', () => {
    const result = runRace({ ...base, strategy: 'atomic', jitterMs: 0 });
    expect(result.charges).toBe(1);
    expect(result.exactlyOnce).toBe(true);
  });
});

describe('many schedules', () => {
  it('never duplicates for unique-key across 300 seeded races', () => {
    const result = batch('unique-key', 300);
    expect(result.duplicatedRuns).toBe(0);
    expect(result.worstChargeCount).toBe(1);
  });

  it('never duplicates for the atomic strategy across 300 seeded races', () => {
    const result = batch('atomic', 300);
    expect(result.duplicatedRuns).toBe(0);
    expect(result.histogram).toEqual({ 1: 300 });
  });

  it('finds duplicate charges for check-then-write across 300 seeded races', () => {
    const result = batch('check-then-write', 300);
    expect(result.duplicatedRuns).toBeGreaterThan(0);
    expect(result.exactlyOnceRuns + result.duplicatedRuns).toBe(300);
  });

  it('always duplicates without a key', () => {
    const result = batch('none', 50);
    expect(result.exactlyOnceRuns).toBe(0);
    expect(result.worstChargeCount).toBe(4);
  });
});

describe('determinism', () => {
  it('returns the same schedule for the same seed', () => {
    const first = runRace({ ...base, strategy: 'check-then-write' });
    const second = runRace({ ...base, strategy: 'check-then-write' });
    expect(second.attempts).toEqual(first.attempts);
    expect(second.charges).toBe(first.charges);
  });

  it('drifts with a different seed', () => {
    const first = runRace({ ...base, strategy: 'check-then-write', seed: 1 });
    const second = runRace({ ...base, strategy: 'check-then-write', seed: 999 });
    expect(second.attempts).not.toEqual(first.attempts);
  });
});
