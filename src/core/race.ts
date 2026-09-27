/**
 * A deterministic model of the same request arriving twice at the same time.
 *
 * Each attempt has a read phase (look up the idempotency key) and a write phase
 * (insert the charge). The scheduler orders those phases by time. Whether a duplicate
 * charge is possible depends only on the strategy and the overlap between phases.
 */

export type Strategy = 'none' | 'check-then-write' | 'unique-key' | 'atomic';

export type Outcome = 'charged' | 'duplicate' | 'replayed' | 'conflict';

export interface Attempt {
  id: number;
  readAt: number;
  writeAt: number;
  outcome: Outcome;
  /** What the attempt saw when it looked up the key. */
  sawCharge: boolean;
}

export interface RaceOptions {
  strategy: Strategy;
  concurrency: number;
  /** Milliseconds of server latency; reads and writes land somewhere inside it. */
  latencyMs: number;
  /** How much the attempts can drift apart. Zero means a perfect race. */
  jitterMs: number;
  seed: number;
}

export interface RaceResult {
  strategy: Strategy;
  options: RaceOptions;
  attempts: Attempt[];
  charges: number;
  duplicates: number;
  durationMs: number;
  exactlyOnce: boolean;
}

export interface BatchResult {
  runs: number;
  strategy: Strategy;
  exactlyOnceRuns: number;
  duplicatedRuns: number;
  worstChargeCount: number;
  histogram: Record<number, number>;
}

export const STRATEGIES: Array<{ id: Strategy; label: string; note: string }> = [
  {
    id: 'none',
    label: 'No key',
    note: 'Every attempt writes a charge. Retrying a timed-out request bills the customer again.',
  },
  {
    id: 'check-then-write',
    label: 'Read, then write',
    note: 'Look up the key, then insert. Two requests can both look before either writes.',
  },
  {
    id: 'unique-key',
    label: 'Unique key',
    note: 'A unique index on the key makes the second insert fail. The loser returns the winner.',
  },
  {
    id: 'atomic',
    label: 'Key and charge in one transaction',
    note: 'The lookup, the charge and the key commit together. There is no window to lose.',
  },
];

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface Phase {
  at: number;
  kind: 'read' | 'write';
  attempt: number;
}

export function runRace(options: RaceOptions): RaceResult {
  const concurrency = Math.max(2, Math.min(8, Math.round(options.concurrency)));
  const rng = mulberry32(options.seed);
  const attempts: Attempt[] = Array.from({ length: concurrency }, (_, index) => {
    const readAt = rng() * options.jitterMs;
    const writeAt = readAt + options.latencyMs * (0.4 + rng() * 0.6);
    return { id: index + 1, readAt, writeAt, outcome: 'charged', sawCharge: false };
  });

  const phases: Phase[] = [];
  for (const attempt of attempts) {
    if (options.strategy === 'check-then-write') {
      phases.push({ at: attempt.readAt, kind: 'read', attempt: attempt.id });
    }
    phases.push({ at: attempt.writeAt, kind: 'write', attempt: attempt.id });
  }
  phases.sort((a, b) => a.at - b.at || a.attempt - b.attempt);

  let charges = 0;
  for (const phase of phases) {
    const attempt = attempts[phase.attempt - 1];
    if (phase.kind === 'read') {
      attempt.sawCharge = charges > 0;
      continue;
    }

    if (options.strategy === 'none') {
      attempt.outcome = charges === 0 ? 'charged' : 'duplicate';
      charges += 1;
      continue;
    }

    if (options.strategy === 'check-then-write' && attempt.sawCharge) {
      attempt.outcome = 'replayed';
      continue;
    }

    if (charges === 0) {
      attempt.outcome = 'charged';
      charges += 1;
    } else if (options.strategy === 'unique-key') {
      attempt.outcome = 'conflict';
    } else if (options.strategy === 'atomic') {
      attempt.outcome = 'replayed';
    } else {
      // check-then-write looked before the first charge existed, so it writes anyway.
      attempt.outcome = 'duplicate';
      charges += 1;
    }
  }

  const durationMs = Math.max(...attempts.map((attempt) => attempt.writeAt));
  const duplicates = attempts.filter((attempt) => attempt.outcome === 'duplicate').length;

  return {
    strategy: options.strategy,
    options: { ...options, concurrency },
    attempts,
    charges,
    duplicates,
    durationMs,
    exactlyOnce: charges === 1,
  };
}

/** Run the same race across many seeds and count how often the customer is billed twice. */
export function runBatch(options: RaceOptions, runs: number): BatchResult {
  const histogram: Record<number, number> = {};
  let exactlyOnceRuns = 0;
  let duplicatedRuns = 0;
  let worstChargeCount = 0;

  for (let index = 0; index < runs; index += 1) {
    const result = runRace({ ...options, seed: options.seed + index });
    histogram[result.charges] = (histogram[result.charges] ?? 0) + 1;
    if (result.exactlyOnce) exactlyOnceRuns += 1;
    else duplicatedRuns += 1;
    worstChargeCount = Math.max(worstChargeCount, result.charges);
  }

  return { runs, strategy: options.strategy, exactlyOnceRuns, duplicatedRuns, worstChargeCount, histogram };
}
