import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { STRATEGIES, runBatch, runRace, type Outcome, type Strategy } from './core/race';

const OUTCOME_LABEL: Record<Outcome, string> = {
  charged: 'charged',
  duplicate: 'charged again',
  replayed: 'replayed',
  conflict: 'conflict, returned winner',
};

const SEED_START = 20261030;

export default function App() {
  const [strategy, setStrategy] = useState<Strategy>('check-then-write');
  const [concurrency, setConcurrency] = useState(4);
  const [jitter, setJitter] = useState(18);
  const [seed, setSeed] = useState(SEED_START);
  const [runs] = useState(200);
  const [batchSeed, setBatchSeed] = useState(SEED_START);
  const reduce = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const result = useMemo(
    () => runRace({ strategy, concurrency, latencyMs: 42, jitterMs: jitter, seed }),
    [strategy, concurrency, jitter, seed],
  );

  const batch = useMemo(
    () => runBatch({ strategy, concurrency, latencyMs: 42, jitterMs: jitter, seed: batchSeed }, runs),
    [strategy, concurrency, jitter, batchSeed, runs],
  );

  const counter = useRef<HTMLSpanElement>(null);
  const lanes = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) return;
    const context = gsap.context(() => {
      if (counter.current) {
        const node = counter.current;
        const state = { value: 0 };
        gsap.to(state, {
          value: result.charges,
          duration: 0.45,
          ease: 'power2.out',
          onUpdate: () => {
            node.textContent = String(Math.round(state.value));
          },
        });
      }
      if (lanes.current) {
        gsap.fromTo(
          lanes.current.querySelectorAll('[data-lane]'),
          { opacity: 0, x: -10 },
          { opacity: 1, x: 0, duration: 0.5, stagger: 0.05, ease: 'power2.out' },
        );
      }
    });
    return () => context.revert();
  }, [result, reduce]);

  const worst = Math.max(...result.attempts.map((attempt) => attempt.writeAt), 1);
  const firstWrite = Math.min(...result.attempts.map((attempt) => attempt.writeAt));
  const bad = result.charges > 1;
  const toggle = STRATEGIES.find((item) => item.id === strategy)!;

  return (
    <div className="shell">
      <a className="skip" href="#lab">
        Skip to the lab
      </a>

      <header className="masthead">
        <a className="wordmark" href="#top">
          idem<span>.</span>
        </a>
        <nav className="nav" aria-label="Primary">
          <a href="#lab">Lab</a>
          <a href="#method">Method</a>
          <a href="#limits">Limits</a>
        </nav>
        <p className="masthead__meta">deterministic simulator</p>
      </header>

      <main id="top">
        <section className="hero">
          <p className="kicker">Idempotency · a race you can see</p>
          <h1 className="display">
            Two retries.
            <br />
            One charge.
          </h1>
          <div className="hero__row">
            <p className="hero__lede">
              A customer taps Pay. The request times out. The client retries. Whether they are billed once or twice
              depends on four lines of code, and on how those four lines interleave with a second request. Move the
              jitter and watch the window open.
            </p>
            <div className="hero__counter" aria-live="polite">
              <p className="kicker">Charges written</p>
              <p className={`counter ${bad ? 'is-bad' : 'is-good'}`}>
                <span ref={counter}>{result.charges}</span>
                <em>/ {concurrency} attempts</em>
              </p>
              <p className={`verdict ${bad ? 'is-bad' : 'is-good'}`}>
                {bad ? 'The customer was billed more than once' : 'Exactly once, under this schedule'}
              </p>
            </div>
          </div>
        </section>

        <section className="lab" id="lab" aria-labelledby="lab-title">
          <div className="lab__head">
            <h2 id="lab-title">The race</h2>
            <p>
              Every request reads the idempotency key, then writes the charge. The read takes time. The gap between the
              read and the write is the whole bug.
            </p>
          </div>

          <div className="lab__grid">
            <aside className="controls" aria-label="Race settings">
              <p className="kicker">Strategy</p>
              <div className="strategies" role="radiogroup" aria-label="Idempotency strategy">
                {STRATEGIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={item.id === strategy}
                    className={item.id === strategy ? 'strategy is-active' : 'strategy'}
                    onClick={() => setStrategy(item.id)}
                  >
                    <span>{item.label}</span>
                    <em>{item.id === 'atomic' ? 'exactly once' : item.id === 'none' ? 'no protection' : item.id === 'unique-key' ? 'database enforced' : 'race window'}</em>
                  </button>
                ))}
              </div>

              <div className="sliders">
                <label className="slider">
                  <span className="kicker">Concurrent attempts</span>
                  <span className="slider__row">
                    <input
                      type="range"
                      min={2}
                      max={6}
                      step={1}
                      value={concurrency}
                      onChange={(event) => setConcurrency(Number(event.target.value))}
                    />
                    <strong>{concurrency}</strong>
                  </span>
                </label>
                <label className="slider">
                  <span className="kicker">Jitter between attempts</span>
                  <span className="slider__row">
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={2}
                      value={jitter}
                      onChange={(event) => setJitter(Number(event.target.value))}
                    />
                    <strong>{jitter} ms</strong>
                  </span>
                </label>
              </div>

              <div className="buttons">
                <button className="button" type="button" onClick={() => setSeed((value) => value + 1)}>
                  Race again
                  <span aria-hidden="true">→</span>
                </button>
                <button className="button button--ghost" type="button" onClick={() => setBatchSeed((value) => value + 1)}>
                  Re-roll {runs} races
                </button>
              </div>

              <p className="strategy-note">{toggle.note}</p>
            </aside>

            <div className="board">
              <div className="board__head">
                <p className="kicker">Schedule · seed {seed}</p>
                <p className={`board__verdict ${bad ? 'is-bad' : 'is-good'}`}>
                  {result.charges} {result.charges === 1 ? 'charge' : 'charges'} · {result.duplicates} duplicate
                </p>
              </div>

              <div className="lanes" ref={lanes}>
                {result.attempts.map((attempt) => {
                  const left = (attempt.readAt / worst) * 100;
                  const width = Math.max(1.5, ((attempt.writeAt - attempt.readAt) / worst) * 100);
                  return (
                    <div className="lane" key={attempt.id} data-lane>
                      <span className="lane__label mono">#{attempt.id}</span>
                      <div className="lane__track">
                        <span className="lane__read" style={{ left: `${left}%` }} aria-hidden="true" />
                        <span
                          className={attempt.outcome === 'duplicate' ? 'lane__flight is-bad' : 'lane__flight'}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          aria-hidden="true"
                        />
                        <span
                          className={`lane__write outcome-${attempt.outcome}`}
                          style={{ left: `${(attempt.writeAt / worst) * 100}%` }}
                          title={OUTCOME_LABEL[attempt.outcome]}
                        />
                      </div>
                      <span className={`lane__outcome outcome-${attempt.outcome}`}>
                        {OUTCOME_LABEL[attempt.outcome]}
                      </span>
                    </div>
                  );
                })}
                <div className="lanes__axis">
                  <span className="mono">0</span>
                  <span className="mono">read</span>
                  <span className="mono">write</span>
                  <span className="mono">{Math.round(worst)} ms</span>
                </div>
              </div>

              <div className="ledger">
                <p className="kicker">Ledger</p>
                <ul>
                  {Array.from({ length: result.charges }).map((_, index) => (
                    <li key={index} className={index > 0 ? 'is-bad' : ''}>
                      <span className="mono">ch_{String(index + 1).padStart(2, '0')}</span>
                      <span>₹1,299.00</span>
                      <span className="mono">{index === 0 ? 'first write' : 'duplicate'}</span>
                    </li>
                  ))}
                  {result.charges === 0 && <li className="is-empty">No charge was written.</li>}
                </ul>
                <p className="ledger__note">
                  First write at {Math.round(firstWrite)} ms. Everything after it is a duplicate the customer will
                  dispute.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="batch" aria-labelledby="batch-title">
          <div className="batch__head">
            <h2 id="batch-title">Two hundred schedules</h2>
            <p>
              One run is an anecdote. The same race across {runs} seeds is a rate. Each square is one schedule; red means
              the customer was charged more than once.
            </p>
          </div>

          <div className="batch__stats">
            <div>
              <p className="kicker">Exactly once</p>
              <p className="mono big">{batch.exactlyOnceRuns}</p>
            </div>
            <div>
              <p className="kicker">Duplicated</p>
              <p className={`mono big ${batch.duplicatedRuns > 0 ? 'is-bad' : 'is-good'}`}>{batch.duplicatedRuns}</p>
            </div>
            <div>
              <p className="kicker">Worst case</p>
              <p className="mono big">{batch.worstChargeCount} charges</p>
            </div>
          </div>

          <div className="squares" role="img" aria-label={`${batch.duplicatedRuns} of ${batch.runs} schedules duplicated a charge`}>
            {Array.from({ length: batch.runs }).map((_, index) => {
              const duplicated = index >= batch.exactlyOnceRuns;
              return <span key={index} className={duplicated ? 'square is-bad' : 'square'} />;
            })}
          </div>
          <p className="batch__note">
            {batch.duplicatedRuns === 0
              ? 'Every schedule produced one charge. This is what a database constraint buys you.'
              : `${Math.round((batch.duplicatedRuns / batch.runs) * 100)}% of these schedules would bill a real customer twice.`}
          </p>
        </section>

        <section className="method" id="method" aria-labelledby="method-title">
          <div className="method__head">
            <h2 id="method-title">Four ways to read a key</h2>
            <p>
              The difference is not the language or the framework. It is whether the lookup and the write are one
              operation, and where the uniqueness lives.
            </p>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Strategy</th>
                <th scope="col">What happens on a retry</th>
                <th scope="col">Exactly once</th>
              </tr>
            </thead>
            <tbody>
              {STRATEGIES.map((item) => (
                <tr key={item.id}>
                  <td>{item.label}</td>
                  <td>{item.note}</td>
                  <td className={item.id === 'atomic' || item.id === 'unique-key' ? 'is-good mono' : 'is-bad mono'}>
                    {item.id === 'atomic' || item.id === 'unique-key' ? 'yes' : 'no'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="limits" id="limits">
          <h2>What this is not</h2>
          <p>
            This is a discrete-event model, not a production payments system. It assumes one database and no
            partitioning, so the unique-key strategy is honest here and could be less obvious across shards. The point
            is narrower: the window between reading a key and writing a charge is where duplicate payments live.
          </p>
          <p>
            Every schedule comes from a seeded PRNG, so a run can be reproduced exactly, on any machine.
          </p>
        </section>
      </main>

      <footer className="footer">
        <p className="footer__mark">idem.</p>
        <p className="footer__line">A visible race for exactly-once payments. Built by Atharv Soni, 2026.</p>
        <p className="footer__fine">
          <a className="link" href="https://github.com/ath1614/idem">
            github.com/ath1614/idem
          </a>{' '}
          · No real card data. Not affiliated with Stripe.
        </p>
      </footer>
    </div>
  );
}
