# 070 — Closeout

Snapshot: 2026-09-05T00:16Z. `origin/dev` = `445742966`. Session
`01a06e87-0804-7ed1-a317-a724b8ee1c35`, goalplan `opencodex-open-bug-triage-and-stacked-pr-fix-tra`,
work-phases wp1 → wp2..wp6 → wp99 all closed through D.

Constraints honoured: no repository-wide local suite (one accidental `bun run test:changed` was
killed by the user mid-run and never completed; nothing was read from it); every push used
`--no-verify`; hosted exact-head CI was the acceptance gate; no merges performed.

## Issue → disposition → PR/commit → CI

| Issue | Disposition | PR / commit | Exact-head CI |
|---|---|---|---|
| #3424 | ALREADY_FIXED_ON_DEV → **closed** (completed) | #3317 `878f75417` | n/a (on dev) |
| #3352 | ALREADY_FIXED_ON_DEV → **closed** (completed) | #3460 `f3d0edb34` | n/a (on dev) |
| #3467 | FIXED, carry of #3469 | **#3547** head `fd1dbbedb` base `dev` | 24 pass / 0 fail / 2 skip |
| #3462 | FIXED (independent of #3489) | **#3551** head `37622b92d` base #3547 | 24 pass / 0 fail / 2 skip |
| #3464 | FIXED (partial: launcher parity; `Refs`, stays open) | **#3554** head `131449856` base #3551 | 23 pass / 0 fail / 2 skip |
| #3522 | NOOP — carry of #3525 landed by a parallel session | #3542 merged `7eddfb3eb` | 28 pass / 0 fail |
| #3406 | FIXED, carry of #3407 | **#3556** head `89486bd08` base #3554 | 19 pass / 0 fail / 3 **queued** (macos 2/2, keyring macos, npm-global macos — runner backlog since 23:50Z, no job executed has failed) |
| #3425 | NEEDS_INFO (stale-snapshot vs disabled-failover vs fixed-account indistinguishable) | — | — |
| #3320 | NEEDS_INFO (decoding fixed by #3438; pre-repair XML needed) | — | — |
| #3245 | NEEDS_INFO / UPSTREAM (no POST reached the proxy) | — | — |
| #3506 | UPSTREAM (tracker; liveness ≠ semantic progress) | — | — |
| #3433 | PRODUCT_DECISION (session_id provenance contract) | — | — |

## Stack topology (all open, none merged)

`dev` ← #3547 ← #3551 ← #3554 ← #3556. Each layer is independent in code; after a lower PR
lands, retarget the next one to `dev` (005 §child propagation applies if a lower head moves).
Superseded contributor PRs left open for the maintainer to close: #3469, #3407 (#3525 was already
closed by #3542).

## Gate incidents (fixed forward)

- #3547 / #3551: `missing_coauthor_credit` hygiene — the gate keys on "carry"/"supersedes" +
  a PR number in the *body*; a commit trailer alone is not read. Fix: trailer repeated in the body
  (#3547) / wording changed for a non-carry mention (#3551).
- #3554 / #3556: `enforce-target` showed "fail" for a run *cancelled* by concurrency when the
  ledger push landed seconds after PR creation; a manual rerun on the exact head passed.
- #3554: privacy scan caught `/Users/u/` in test fixtures — replaced with `/home/u/` before PR.

## Audit ledger

wp1 GO-WITH-FIXES(4) folded · wp2 GO-WITH-FIXES(1) folded · wp3 FAIL → GO-WITH-FIXES(1) folded
(transport gate) · wp4 GO-WITH-FIXES(1) folded · wp5 pass (live GitHub fact) · wp6 pass (clean
merge of reviewed PR). All reviewers: gpt-6-astra, high.

Terminal outcome: **DONE** for the objective's scope, with #3556's three macOS jobs still queued
on the hosted runner at closeout (every executed job on the stack is green).


Goalplan criteria c-1..c-3 met at 2026-09-05T00:11Z (see ledger.jsonl).
