# 060 — Delivery

Merged to `dev` as `dcbc28074` via PR
[#3096](https://github.com/lidge-jun/opencodex/pull/3096), admin squash.

## What shipped

| phase | doc | commits |
|---|---|---|
| labels on the opaque controls | `020` | `b2fc3f423`, `abd45522f` |
| hover/focus emphasis | `050` | `d25e696d5` |
| cap cluster + occupied slot | `040` | `9af2bdb53` |

One PR rather than the stacked chain the plan anticipated. The three phases
landed as separate commits on one branch and the later ones depend on the
earlier ones by construction — `040` measures the cluster at the width `020`
gives it — so splitting them into dependent PRs would have produced three
reviews of a diff nobody could evaluate in isolation. Recorded as a deviation
rather than quietly done: `DEV-STACK-01` asks for stacked PRs when the parts are
separately reviewable, and here they were not.

## The validator earned its place

`xai/grok-4.6` reviewed every phase. Five blockers, all fixed before merge, and
three of them were invisible to every test that existed at the time:

1. **The visible label did not activate the control.** The text was an
   `aria-hidden` sibling span, so it read correctly, looked correct, and did
   nothing when clicked. A source-text assertion could not see this; the fix
   needed a rendered test.
2. **`title` defaulted to `label`.** Every untouched `Switch` in the app gained
   an accessible description repeating its own name — a change to a shared
   primitive, made while the commit message claimed no call site changed.
3. **The touch fallback could not win the cascade.** Overrides written at
   `0,2,0` against a `0,3,0` resting rule meant `(hover: none)` never applied
   and `:focus-visible` was a silent no-op. A rule that exists but cannot win is
   worse than a missing one, because it reads as covered.
4. **A nowrap cluster would have clipped invisibly.** `.models-provider-card` is
   `overflow: hidden`, so the overflow would have been swallowed while a
   page-level `scrollWidth === clientWidth` assertion still passed. This is why
   the geometry probe records card clip and cluster clip separately.
5. **The custom-cap editor outlived its cap.** `providerCapCustomOpen` is
   independent state that nothing cleared on switch-off, and its Apply button
   sends `enabled: true` — a field that looked inert could turn the cap back on.
   Already reachable for the native group before this unit touched anything.

The pattern worth keeping: every one of these was a defect that *looked* fine in
the diff. Three needed a browser to see and two needed someone reading the
cascade rather than the rule.

## What was deliberately not done

Hover that **gates** — controls hidden until the pointer arrives — was the
literal first reading of the request and was rejected twice on review. It would
delete the pencil, the alias-defaults switch and custom-add from the default
visual inventory, worsening the exact opacity this unit exists to fix. What
shipped is emphasis. If density-hover is still wanted, it is rejected, not
unimplemented, and it would need `020` reopened first.

The preset control keeps `if (!preset) return null`. The residual left-edge
delta it causes is measured and accepted: `101.2px` at ko/1440, `2.0px` at
en/1440, `0.0px` everywhere else. Forcing those edges to match would need a
disabled segmented control — the dead control `011` rejected.
