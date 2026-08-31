# 050 — Hover affordance and the column gate

Third and last phase of the row work. Depends on `020` (labels visible at rest)
and `040` (cap cluster). Scope decided by `030`, and narrowed twice by the
independent audit — what is NOT here matters as much as what is.

## The affordance

`030` fixed the contract: **every control stays in the resting layout, and
`020`'s label text is visible at rest.** So this phase cannot reveal existence
and cannot reveal meaning. What is left is emphasis, and it is deliberately
small:

```css
/* The pencil is the one control that is genuinely secondary: a provider alias is
   set once and then left alone. It stays in layout, in tab order, and in the
   accessibility tree - only its resting contrast drops. */
.models-provider-actions .btn-ghost.models-alias-edit { opacity: .65; }
.models-provider-head:hover .models-alias-edit,
.models-provider-head:focus-within .models-alias-edit,
.models-alias-edit:focus-visible { opacity: 1; }
```

Three properties of that rule, each load-bearing:

- `:focus-within` on the header, not only `:hover`, so a keyboard user reaching
  the pencil by Tab gets the same emphasis a mouse user gets by proximity.
- Only `opacity`, never `display`, `visibility`, or `content-visibility`. The
  control is always hit-testable and always announced; `0.65` is a contrast
  change, not a disclosure.
- `opacity` is animated at `--motion-fast` and **instant** under reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  .models-provider-actions .models-alias-edit { transition: none; }
}
```

And the no-hover path, which is the reason this is safe on touch:

```css
/* A pointer that cannot hover never triggers the emphasis rule, so the resting
   dim would be permanent. Full contrast is the resting state there. */
@media (hover: none) {
  .models-provider-actions .models-alias-edit { opacity: 1; }
}
```

## The column gate

Corrected by the second audit round against `evidence/030-baseline.json`, and the
correction is the whole reason this section is short:

- **780px is not alignment evidence.** All ten cards already report
  `actsLeft: 281` because `@container models-workspace (max-width: 720px)` has
  wrapped the actions to full width. A width where alignment is already uniform
  cannot demonstrate that alignment improved.
- **The gate is 1280 and 1440.**
- **The cap-value slot must be occupied on every card** — that is what `040`
  buys by always rendering the `Select`, disabled when the cap is off, and it is
  the mismatch the user actually reported (`openai` shows `1.05M`, `anthropic`
  shows nothing).
- **The preset-driven delta is accepted, with its number recorded.** Providers
  with no shipped preset keep `if (!preset) return null`. Forcing their left
  edges to match would require a disabled segmented control, which is the dead
  control `011` rejected and `030` re-rejected.

Explicitly not in this phase: `min-width` floors on the conditional slots. The
first draft proposed them; the audit identified them as the ghost placeholder in
CSS form.

## Regression coverage

Extends `gui/tests/models-provider-head.test.ts` rather than replacing it. New
assertions:

1. The alias-edit control carries a stable class and is styled with `opacity`,
   and the stylesheet contains no `display: none` or `visibility: hidden` for it
   — the assertion that keeps a future "tidy up" from turning emphasis back into
   gating.
2. `:focus-within` appears in the emphasis rule, so the keyboard path cannot be
   dropped while the hover path survives.
3. A `@media (hover: none)` block restores full opacity.
4. A `prefers-reduced-motion` block removes the transition.

Read with `effectiveDeclaration` from `tests/helpers/css-declarations`, which
already handles duplicate selectors and commented-out values, and each assertion
driven red against current CSS first.

## Implementation guard

From the audit, because the existing tests pin exact source text and a plausible
refactor breaks them without touching the design:

- `className="row models-provider-toggle"` and
  `className="row models-provider-actions"` stay byte-exact. **No template
  literal, and no hover wrapper element around the actions row.**
- `t("models.contextSettings")` stays in the header.
- The 720px container query and 768px media query wrap rules stay.
- The toggle keeps `flex: "1 1 auto"`.
- The active/total count stays inside `.models-provider-toggle`.

