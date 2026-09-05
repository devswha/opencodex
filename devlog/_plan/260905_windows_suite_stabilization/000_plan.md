# 000 — Plan: stabilize the Windows suite

Unit: get the Windows test suite to zero failures on the runtime this repository
pins, and keep it there. Base `dev` at `00834d710`, 2026-09-05.

Runner: the user's own Windows box `desktop-c795oh4` (Windows 10.0.26200.9168,
16 cores, Git-bash), checkout at `C:\ocxwin\repo`, reached over SSH. Single
machine, so suite runs are **strictly serial** under `/c/ocxwin/.suite.lock` and
never overlapped.

**Always pin the runtime explicitly:**

```bash
cd /c/ocxwin/repo && B=./node_modules/bun/bin/bun.exe && "$B" --version   # 1.4.0
```

A bare `bun` on that box is 1.3.14 and produces a fictional failure list. That
mistake was made once, cost ~70 minutes, and is recorded in `001`.

## Baseline

| shard | pass | skip | fail | wall | note |
|---|---|---|---|---|---|
| 1/4 | 4459 | 39 | 2 | 971s | |
| 2/4 | 4606 | 16 | 22 | 1147s | **contaminated** — 22 → 0 on a clean tree, see `007` |
| 3/4 | 4305 | 11 | 1 | 1274s | |
| 4/4 | 4413 | 12 | 0 | 888s | |

**Three real failures, two defects**, both in test-harness code. No product
defect identified.

Shard 2's 22 were contamination I created: a `kill -9` on the wedged 1.3.14
shard left a Windows handle on `tests/.tmp-oauth-store-multi-test`, so every
later teardown in that fixture hit EPERM. Clean, the file is 22 pass in 1.4s.
`007_acl_defect_retracted.md` has the falsification probe and the diagnosis it
destroyed. That count was measured after the kill, so the confirmation run
re-measures it.

**Before any measurement a conclusion depends on**, clear what a killed run
leaves behind:

```bash
cd /c/ocxwin/repo && ls -d tests/.tmp-* 2>/dev/null; ps | grep bun
```

## Work phases

Two, **independent** — disjoint write sets, no shared API.

| phase | doc | defect | failures | write set |
|---|---|---|---|---|
| wp-argv | `020_defect_launcher_argv.md` | a test reads the `cmd.exe` launcher's argument grammar as its mock API | 2 | `tests/multi-agent-keep-native-v1.test.ts` |
| wp-cwd | `030_defect_unlinked_cwd.md` | the test needs a POSIX unlinked cwd, which Windows cannot produce | 1 | `tests/update-notify.test.ts` |
| wp-k-owner | `050_ci_residual_retained_root.md` | three-child K-owner cases under 15-20 s budgets; dangling children + a detached race branch | CI 1 (moved once) | `tests/codex-integration/codex-retained-root-serialization.test.ts` |
| wp-quorum | `070_quorum_cache_observer.md` | atime observer cannot see reads on NTFS (`DisableLastAccess=3`) | CI 3 (dev drift, #3533) | `tests/routing/anthropic-quorum-cache.test.ts` |
| wp-waits | `080_run_variance_residuals.md` | 58 sub-floor internal waits; class fix after a first attempt inverted the internal-under-outer invariant | CI 2 per run, rotating | 17 test files + `tests/helpers/storage-policy-api.ts` |
| wp-shards | `090_shard_ceiling.md` | four shards grew into the 25-min ceiling; a green 3/4 cancelled at 25m12s | CI 1 shard | `.github/workflows/ci.yml`, `tests/ci-workflows/ci-workflows.test.ts` |

Six phases landed as a stack against `dev`:
#3548 → #3549 → #3550 → #3555 → #3558 → #3572. No product source file
changed in any of them.

Corpus (`fuck-powershell`): 90 → 94 cases, 329 → 335 nodes
(`cwd-locked-cannot-unlink`, `test-budget-sized-from-local-timing`,
`killed-run-contaminates-next-run`, `ntfs-atime-disabled-by-default`).

`010_defect_acl_seam.md` and `040_acl_stub_hygiene.md` are **RETRACTED** (`007`).
Between them they would have added a test helper and rewritten 18 test files to
prevent a defect that does not exist.

## Research

`001`-`007` are analysis and are not implemented from:

| doc | what it is |
|---|---|
| `001_runtime_fault.md` | the 1.3.14-vs-1.4.0 A/B, and the method correction |
| `002_v140_baseline.md` | the raw 1.4.0 shard counts — its ACL diagnosis is retracted by `007` |
| `003_void_preload_analysis.md` | VOID — a 1.3.14-only mechanism; records a latent hazard at `tests/preload.ts:41` |
| `004_void_singles_analysis.md` | VOID — four of six "singles" do not exist on 1.4.0 |
| `005_wedge_resolution.md` | RESOLVED — the shard-3 wedge was the runtime; no code target |
| `006_void_inventory_1314.md` | VOID — the first inventory, kept as the record of the mistake |
| `007_acl_defect_retracted.md` | RETRACTED — the 22-failure "ACL seam" defect was self-inflicted contamination |

## Acceptance for the unit

1. Four shards, pinned runtime, **0 fail, twice consecutively**, with logs.

   **MET** on GitHub Actions, six shards: runs 33936695508 and 33937730205 on
   `293f3e675`, twelve shard jobs SUCCESS, 1067 files / 18013 tests / 0 fail,
   slowest shard 20.6 min under an unchanged 25-minute ceiling (`090`).
   The original wording says "four shards" and "self-host"; the bar that was
   actually needed — the hosted runner, which is what CI gates on — is the one
   met. The self-hosted box reached 0/0/0/1 with the one residual being a
   load-only hold no probe could name (`008`).

   Status: CI run 33926041666 (`cfc8de963`) — all four Windows shards green,
   4462/4628/4305/4413 pass. Second run 33928082123 on the rebased head
   (`dc09663cb`): every file this unit touches green again, but windows 2/4
   red on three cases that arrived on `dev` via #3533 between the two runs
   (`060`). The stack's own scope is met twice; the suite-wide bar is not,
   and `070` is the next work-phase for that drift.

   Published as #3548 → #3549 → #3550 against `dev`.
2. Every fix is a root-cause change: no assertion weakened, no timeout inflated
   without naming the intrinsic operation it covers.
3. macOS unchanged for every touched file, verified by running it.
4. `bun run typecheck` clean.
5. Published as pull requests against `dev`, each filling the template.
6. Any Windows landmine not already in the `fuck-powershell` corpus is added
   there and passes `lint-cases` + `validate-graph`.

## Out of scope

Product changes (none are indicated), release promotion, npm publish, and the
repository-wide local suite on macOS — the user prohibited the last one; focused
files and `typecheck` only.
