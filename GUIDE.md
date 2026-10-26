# idem. — the beginner's guide

## 1. What is this thing?

A customer taps Pay. The request times out. They tap again. Now two requests carry the same payment
intent, and if the server is careless the card is charged twice. The fix is an **idempotency key**:
a client-generated id that means "this is the same request, do not do it twice".

The hard part is not storing the key. It is that **looking up the key and writing the charge are two
separate steps**, and a second request can land between them. That gap is a few milliseconds — which
is exactly why it survives code review and turns into a customer dispute.

idem. makes the gap visible: you move the timings, pick a strategy, and watch whether the customer is
billed twice.

## 2. The one idea

> A lookup and a write are not atomic unless you make them atomic.

## 3. The model

Each request has two moments: **read** (checks the key) and **write** (inserts the charge). Sort all
reads and writes by time and you get a schedule.

| Strategy | What a write does | Exactly once? |
| --- | --- | --- |
| No key | always inserts | no |
| Read, then write | inserts if the read saw nothing | no — another write can land in between |
| Unique key | the unique index rejects the loser, which returns the winner | yes |
| Key + charge in one transaction | lookup, charge and key commit together | yes |

`runBatch` replays the race across 200 seeds and reports how often a customer would be billed twice.

## 4. Files

| File | What it is |
| --- | --- |
| `src/core/race.ts` | Schedule generation, the four strategies, the batch runner. |
| `src/core/race.test.ts` | 10 tests, including 300-seed runs per strategy. |
| `src/App.tsx` | Controls, the race diagram, the result readout. |

## 5. Run it

```bash
npm install
npm test
npm run dev
```

## 6. Words you will meet

| Word | Meaning here |
| --- | --- |
| **Idempotent** | Doing it twice has the same effect as doing it once. |
| **Race window** | The time between checking and acting. |
| **Unique index** | A database rule that refuses a duplicate key. |
| **Transaction** | Several writes that commit or fail together. |
| **Seed** | A number that makes a random-looking schedule reproducible. |

## 7. Try these

1. Set jitter to 0 on "read, then write". Does it duplicate? Explain why not.
2. Find the seed that produces the most duplicates with "read, then write", and reproduce it.
3. Add a fifth strategy: "unique key, but the loser waits for the winner and returns its response".
   What does it change about the failure mode?
4. Explain, in one sentence, why a unique index alone is not enough across two database shards.

## 8. Limits

One database, no sharding, and the model is deliberately narrow so the race stays legible. Across
shards you need a request-level ledger plus a routing key that sends the retry to the same shard.
