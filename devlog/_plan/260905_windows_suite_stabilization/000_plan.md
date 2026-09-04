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

| shard | pass | skip | fail | wall |
|---|---|---|---|---|
| 1/4 | 4459 | 39 | 2 | 971s |
| 2/4 | 4606 | 16 | 22 | 1147s |
| 3/4 | 4305 | 11 | 1 | 1274s |
| 4/4 | 4413 | 12 | 0 | 888s |
| total | **17783** | 78 | **25** | 4280s |

25 failures, three defects, all in test-harness code. No product defect
identified.

## Work phases

Three, **independent** — disjoint write sets, no shared API. Any stacking is for
review convenience, ordered by size.

| phase | doc | defect | failures | write set |
|---|---|---|---|---|
| wp-acl | `010_defect_acl_seam.md` | the ACL stub seam can be installed half-way, so a real `icacls.exe` outlives teardown | 22 | `tests/helpers/windows-secret-acl-stubs.ts` (new), `tests/oauth-store-multi.test.ts` |
| wp-argv | `020_defect_launcher_argv.md` | a test reads the `cmd.exe` launcher's argument grammar as its mock API | 2 | `tests/multi-agent-keep-native-v1.test.ts` |
| wp-cwd | `030_defect_unlinked_cwd.md` | the test needs a POSIX unlinked cwd, which Windows cannot produce | 1 | `tests/update-notify.test.ts` |

One follow-up phase, which unlike the three above is **dependent**:

| phase | doc | purpose | depends on |
|---|---|---|---|
| wp-hygiene | `040_acl_stub_hygiene.md` | make the half-installed seam unrepresentable: a repo-hygiene rule plus 17 fixture migrations | `010` (enforces adoption of the helper it introduces) |

It is separate because it is a mechanical 18-file change that would swamp the
review of a 22-failure bug fix. It fixes no failing test; it stops the next one.

## Research

`001`-`006` are analysis and are not implemented from:

| doc | what it is |
|---|---|
| `001_runtime_fault.md` | the 1.3.14-vs-1.4.0 A/B, and the method correction |
| `002_v140_baseline.md` | the corrected baseline and root-cause roll-up |
| `003_void_preload_analysis.md` | VOID — a 1.3.14-only mechanism; records a latent hazard at `tests/preload.ts:41` |
| `004_void_singles_analysis.md` | VOID — four of six "singles" do not exist on 1.4.0 |
| `005_wedge_resolution.md` | RESOLVED — the shard-3 wedge was the runtime; no code target |
| `006_void_inventory_1314.md` | VOID — the first inventory, kept as the record of the mistake |

## Acceptance for the unit

1. Four shards, pinned runtime, **0 fail, twice consecutively**, with logs.
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
