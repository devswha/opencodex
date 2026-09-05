# 090 — wp6: the shard ceiling is where the wall time already lives

> **Decision changed after this was written.** The first cut raised
> `timeout-minutes` 25 → 40 (`97e3e84f0`). The user's call was the right one:
> keep the bound, cut the work — six shards instead of four (`293f3e675`).
> The analysis below still holds; the "MODIFY" section at the end is the
> superseded version, kept so the reasoning that led to the better answer is
> visible.

Research doc, with a one-line implementation at the end.

## What run 33934756997 showed

Head `c477a02a7` (the corrected wait-budget class fix, PR #3558):
windows 1/4, 2/4, 4/4 SUCCESS; **3/4 CANCELLED at 25m12s — not failed**. Its
log ends mid-file in `tests/vision/vision-routed.test.ts` with every case
before it green. The shard was never wedged; it was slow, and the job's
`timeout-minutes: 25` killed it while it was still doing the work it claims.

That is the exact failure mode the ceiling's own comment at `ci.yml:668-675`
records for the 15-minute version: "it truncated the evidence rather than
bounding a hang … CANCELLED at exactly 15m12s while still executing tests".
The number moved from 15 to 25; the margin did not.

## Wall time of every completed Windows shard on this stack

| run | 1/4 | 2/4 | 3/4 | 4/4 |
|---|---|---|---|---|
| 33926041666 | 24.1 | 21.2 | 23.5 | 16.8 |
| 33928082123 | — | — | 21.1 | — |
| 33930757649 | 16.1 | 20.9 | 24.4 | 21.8 |
| 33933578890 | — | — | 22.3 (cancelled by a newer push) | — |
| 33934756997 | — | — | **25.2 cancelled** | — |

Minutes. Shard 3/4 runs 21-25 on a green suite; shard 1/4 has hit 24.1. The
ceiling is 25. A shard that completes in 24 minutes on a good day has no
margin against the 2× run-to-run variance this unit has measured on every
other bound, and the crash-retry inside the step can double a shard's work
(`ci.yml:674-675`) — under 25 minutes that retry can never complete.

## Why this is not "just raise it"

The comment on the ceiling is right that an outer bound must exist so a wedged
shard still dies. It is also right that the bound has to cover the retry.
What it gets wrong is treating the ceiling as a fixed number rather than as a
function of what the shards actually take: with four shards at 17-25 minutes,
25 is not "headroom over a completed shard", it is the completed shard.

Two independent things are true:

1. The per-case fixes in this stack (#3550, #3558) are correct and necessary —
   they turn bare timeouts into named diagnostics and stop one slow child from
   failing a shard. They do not, and cannot, make the shard shorter.
2. The shard itself needs a ceiling that clears its own measured wall time
   with margin for variance AND for one retry attempt.

## The wedge case still dies

With 1.4.0 there is no known wedge in this suite (`005`). If one appears, a
40-minute ceiling reports it 15 minutes later than a 25-minute one; the report
is the same — cancelled, log ends at a named file. A 15-minute delay on a
wedge that is by definition already broken is a fair trade for never again
cancelling a green shard at 25m12s.

## What shipped: six shards, same ceiling

```yaml
-    name: windows ${{ matrix.shard }}/4
+    name: windows ${{ matrix.shard }}/6
     timeout-minutes: 25
-        shard: [1, 2, 3, 4]
+        shard: [1, 2, 3, 4, 5, 6]
-            bun test --isolate --timeout 60000 tests --shard=${{ matrix.shard }}/4 …
+            bun test --isolate --timeout 60000 tests --shard=${{ matrix.shard }}/6 …
```

Why this beats raising the ceiling: the ceiling is a HANG detector and it
works — a wedged shard dies. Raising it to 40 weakens the detector by fifteen
minutes to accommodate a shard that is not hung, merely full. Splitting the
suite six ways leaves the detector where it is and brings each shard back
into the margin the 25 was chosen to provide (≈ two-thirds of the four-shard
wall time: roughly 12-17 minutes against 25).

`tests/ci-workflows/ci-workflows.test.ts` had pinned the Windows matrix to
equal Linux's. The invariant it protects — matrix and divisor tile the suite
exactly — is kept and made explicit for Windows on its own; the equality with
Linux was incidental and is dropped. Its Linux divisor assertion was also
found to be matching the Windows `--shard` literal by coincidence; it now
reads the `TEST_SHARD` env line.

## Superseded: MODIFY `.github/workflows/ci.yml` (`platform-windows`) — raise to 40

---

## Result: run 33936695508 on the six-shard head (`293f3e675`)

| shard | wall | result |
|---|---|---|
| 1/6 | 19.1 min | SUCCESS |
| 2/6 | 16.0 min | SUCCESS |
| 3/6 | 16.0 min | SUCCESS |
| 4/6 | 18.6 min | SUCCESS |
| 5/6 | 7.7 min | SUCCESS |
| 6/6 | 10.4 min | SUCCESS |

All six green, every shard under the unchanged 25-minute ceiling, slowest at
19.1 with ~6 minutes of margin (the four-shard slowest was 25.2, which is to
say none). The spread (7.7 to 19.1) shows Bun's round-robin does not tile the
suite evenly by cost — the codex-integration files cluster — but the worst
shard is now where the four-shard AVERAGE used to be.

That is the first all-green Windows run since the stack rebased onto current
`dev`. Run 33937730205 is dispatched on the same head as the second
consecutive, which is `c-1`.

```yaml
-    timeout-minutes: 25
+    # 25 cancelled a green 3/4 at 25m12s on run 33934756997 — the same truncation the
+    # paragraph above records for 15. Measured across five runs of one branch, completed
+    # Windows shards take 17-25 minutes; 40 clears that with margin for the 2× run-to-run
+    # variance seen on every other Windows bound and for one crash-retry attempt.
+    timeout-minutes: 40
```

One number, with the run that motivated it, in the same comment block that
records the last time this exact thing happened.

## Acceptance

1. Two consecutive dispatches with all four Windows shards SUCCESS — the unit's
   `c-1`, which the shard ceiling was the last thing standing in front of.
2. No shard's wall time exceeds 30 minutes on either run (so 40 is margin, not
   the new normal).

## Stack position

PR 6 on top of #3558. Touches `.github/workflows/ci.yml`, so it is a workflow
change and per `MAINTAINERS.md` needs security review — the diff is one
integer in a `timeout-minutes` and nothing else.
