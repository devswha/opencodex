# 260905 — RESOLVABLE_NOW split train (stacked PRs)

Date: 2026-09-05. Worktree a2c0, docs branch `codex/260905-modular-debt-ledger-docs`
at 4cc219549 (source basis 980a9fbed; origin/dev tip at unit open 583d6a91b,
6 commits ahead, only one of which touches a NOW file — see 001). Session
01a06e97-b9d8-7250-8204-bb788338c288, goalplan
`.codexclaw/goalplans/reduce-the-68-resolvable-now-modularization-debt/`.
Input ledger: `devlog/_plan/260905_modular_debt_ledger/021_ledger.md` (68 rows
with `RESOLVABLE_NOW`); lane evidence in that unit's 011–016.

## Objective

Bring each of the 68 files under the cxc-dev §1 400-line limit by pure-move
splits (leaf modules + barrel re-exports), published as stacked PRs against
`dev`, each layer independently reviewable and mergeable. Zero behavior
change; every existing export stays importable from its original path.
Per-file success is `RESOLVED` or `RESIDUAL-FN` (003 RESIDUAL-ACCOUNTING-01);
the closeout tallies both and only the first counts as resolved.

## Constraints (binding on every layer)

- Pure move only. No renames of exported identifiers, no signature changes,
  no deletion of exports, no "while I'm here" fixes. A behavior defect found
  during a move is recorded in the decade doc and left alone.
- New leaf files ≤400 lines; the residual original file ≤400 lines or the
  layer states why a second layer (`#b`) follows (003 INTERMEDIATE-RESIDUAL-01,
  RESIDUAL-FN-01).
- The ≤500-line PR cap is measured on the non-move diff for pure-move layers
  (003 PURE-MOVE-SIZE-01); non-move diff ≤150 lines.
- Re-export binds nothing locally (260818 WP1 lesson): internal call sites in
  the residual file import from the leaf explicitly.
- Text-oracle tests that read a split file as source (001 column
  `textoracle`) are retargeted to the leaf **without weakening**; the
  decade doc names each and the C phase drives the retargeted guard red once
  when it is a guard.
- `tests/lab/core-lab-boundary.test.ts` PROTECTED roots are never edited;
  a new leaf imported from a protected root must not reach `src/lab`.
- Verification from WP400 onward: typecheck, focused tests, privacy scan and
  full suite run in an isolated checkout on `ssh lidge`; no local suites.
- Git: layer branches `codex/split-<slug>`; bottom layer base `dev`, each
  upper layer base = the branch below; push + PR creation pre-authorized by
  the user for this loop; **merge never** (DEV-STACK-04 ESCALATE). Cascade
  with `git rebase --update-refs` + `--force-with-lease` when a lower layer
  changes (DEV-STACK-02).
- Open-stack depth cap 5: no stack in 002 exceeds 5 layers, so the cap is
  satisfied by construction; 21 stacks run as parallel trains off `dev`.
- From WP400 onward, code and receipts use the existing a2c0 worktree in
  place (003 WORKTREE-EVIDENCE-01). Preserve each previous branch before
  selecting the next layer branch. Never relocate or recreate a2c0.

## Work-phase map (dependency-ordered)

| WP | Deliverable | Depends on | Verifier |
|---|---|---|---|
| wp1 | 000–002 + every layer's decade doc (010…750) at diff level | — | docs checks (numbered only, every layer has a doc, every NOW file appears in exactly one stack); privacy scan |
| wp2… | one layer per work-phase, in 002 order within a stack; stacks are independent and may be interleaved (S01 L1, S02 L1, … then L2s) so that no open stack waits on another | its layer below | per-layer acceptance (003 §"Per-layer gate") |

Total: 77 implementation layers across 21 stacks (002_layer_map.md; 105 and
625 appended per 003).

## Out of scope

The 151 `RESOLVABLE_AFTER` and 19 `ACCEPTED` rows; core.ts / config.ts /
service.ts / auth-api.ts; merges; releases.

## Terminal outcome expected

DONE when every layer in 002 has an open PR with a green exact-head CI rollup
recorded in its decade doc.
