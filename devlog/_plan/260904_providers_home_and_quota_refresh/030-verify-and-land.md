# 030 — Verify live, open one PR, merge with admin

Work-phase `wp3`. Depends on 010 and 020.

## Checks

Focused only. The repository-wide suite is explicitly forbidden for this unit:
no bare `bun test`, no `bun run test`.

1. `bun run typecheck`
2. `bun run lint:gui`
3. `bun test` on the specific new/changed test files only, plus
   `bun run test:changed` for import-connected coverage.
4. `bun run build:gui`, then restart or reload the live dashboard and verify
   the served bundle is the new one before believing any UI observation. A
   merged source tree is not a deployed one — `gui/dist` is gitignored and the
   proxy can serve a stale checkout.

## Live proof required

- Logo click at `#providers` lands on `#dashboard` (URL + screenshot).
- Overview refresh issues `/api/provider-quotas?refresh=1`, the button shows
  its pending label, and the settled result line appears (screenshot).

## Landing

Branch `codex/providers-home-and-quota-refresh`, incremental commits, push with
`--no-verify` (explicitly authorized). One PR against `dev` filling every
section of `.github/PULL_REQUEST_TEMPLATE.md`. The PR mentions `gui`, so
`enforce-target` requires a screenshot of the UI change in the description —
attach both.

Merge with admin, then prove it:

```bash
git fetch origin dev
git merge-base --is-ancestor <merge-sha> FETCH_HEAD
```

An empty `gh pr checks --required` is not green evidence; read the full rollup
for the exact head before merging.
