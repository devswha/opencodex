# 003 — Parent decisions on drafter escalations (binding amendments to 000/002)

Twenty-one drafters (one per stack) returned 75 decade docs. Fourteen of them
escalated the same conflict and six raised stack-specific questions. Each
decision below is an amendment to 000_plan.md constraints and is what the
A-phase audits and every executor obey.

## PURE-MOVE-SIZE-01 — the ≤500-line changeset cap for pure-move layers

Conflict: cxc-dev §1 says "PR changeset >500 lines → split" (DEFAULT class:
exceed only with a stated reason). A pure move of a file that must lose
≥1,000 original lines produces ≥2,000 raw diff lines however it is layered;
adding layers only multiplies fully-gated PRs and leaves intermediate residuals
over 400 with no review benefit (S02, S03, S05, S07, S08, S10, S11, S13, S15,
S16, S19, S20, S21 all showed this arithmetic).

Decision (stated reason for exceeding): for a layer whose decade doc classes
it as pure-move, the 500-line cap is measured on the **non-move diff** — the
lines that are not a verbatim relocation: re-export blocks, import edits in
the residual and in consumers, test retargets, route-registry metadata. That
non-move diff must stay ≤150 lines per layer. Moved lines are reviewed as
moves: the PR body links `git diff --color-moved=dimmed-zebra` guidance and the
executor's C phase records `git diff -M --stat` plus a symbol-inventory check
(every symbol in the doc's inventory appears exactly once in the tree after
the move).

Permitted transformations of a moved line (still pure-move):

1. Adding or removing the `export` modifier on a moved declaration (a leaf must
   export what the residual re-exports; a symbol that was module-private and
   is now consumed only inside its leaf may stay private).
2. Changing the import specifier path of a moved symbol's own imports.
3. Object-literal method → factory-produced function when an adapter's
   returned object literal is split across leaves (S03 Anthropic #b,
   `createAnthropicAdapter` returns `{ ...methods }` capturing lexical
   `provider`/`toolNames`): the method body is moved verbatim into a
   leaf function `makeX(captured…)` whose parameters are exactly the
   lexical bindings the body captures, called once inside the original
   factory so the returned property becomes `x: makeX(provider, toolNames)`.
   Capture identity and invocation lifetime are preserved because the
   factory is invoked in the same closure scope the literal was built in.
   Evidence: the C phase pastes `git diff --color-moved=dimmed-zebra
   --color-moved-ws=allow-indentation-change` for each converted method and
   shows the body as a move block; the layer's focused tests cover every
   converted method (listed in the doc's Tests section). The same rule
   covers a class method split by `this`-fields, should one occur.
4. JSX block → sibling component with verbatim props (GUI-SEAM-01).

Anything else (reordering statements inside a moved body, renaming, changing
a literal, altering control flow) is not pure-move; the layer falls back to
the literal 500-line cap or is re-sliced.

The layer count in 002 stands as drafted; no stack is re-sliced for size.

## RESIDUAL-FN-01 — residual >400 caused by a single function

S07 L1: `parseRequest` is 464 lines by itself, so `src/responses/parser.ts`
cannot reach ≤400 by moving other symbols. Splitting the function is a
behavior-preserving extraction, not a move, and is out of this train's scope.
Decision: the layer moves everything movable, the residual stays over 400,
and the doc records the function as `RESOLVABLE_AFTER(design:L1-parse-request-extraction)`
for the 021 ledger's next revision. Same rule applies to any other layer that
finds a single >350-line function (none other reported).

## INTERMEDIATE-RESIDUAL-01 — over-400 residuals inside a multi-part file

S13 (config-export #a), S18 (IntegrationsOverview), S21 (release-notes #a),
S02 (registry #a/#b): an intermediate residual over 400 is acceptable when a
**bounded successor chain inside the same stack** brings it under 400 and
each doc states the number it hands to the next layer (registry:
3250 → 2429 → 1267 → 219 across #a/#b/#c). S18 had no next layer: **layer
625 (IntegrationsOverview #b)** is appended to 002 and drafted by the same
agent.

## RESIDUAL-ACCOUNTING-01 — what "done" means for a file

000's objective is amended: the train's success measure is per file, one of
`RESOLVED` (residual ≤400 and all leaves ≤400), or `RESIDUAL-FN` (residual
>400 solely because of one unsplittable function, recorded per
RESIDUAL-FN-01 with the `design:` id for the ledger). The closeout doc
tallies both; a file in the second bucket is *not* counted as resolved. At
draft time exactly one file is expected there: `src/responses/parser.ts`
(561, `parseRequest`).

## TYPE-CYCLE-01 — pre-existing type-only cycles

S04 L1 reports `src/types.ts → src/types/provider.ts → native-exec-desktop.ts
→ native-exec-tools.ts → tool-definitions.ts → src/types.ts`; S02 reports an
Antigravity type cycle. Both pre-exist on `dev` and are erased at runtime.
Decision: a layer must not add a **runtime** cycle and must not add a new
type-only cycle; it may leave existing ones untouched. The audit checks the
delta, not the whole graph.

S04 is the exception: its new leaves would each join the existing type cycle
(`tool-naming → ../../types → provider → native-exec-desktop →
native-exec-tools → tool-definitions → tool-naming`), which is a *new* cycle
through new files. Decision: the prerequisite the S04 drafter named is
approved and becomes **layer 105 (`codex/split-cursor-desktop-executor-contract`,
base `dev`, new bottom of S04)**: move `DesktopExecutorConfig`
(`src/adapters/cursor/native-exec-desktop.ts:28–37`) to a new dependency-free
`src/adapters/cursor/desktop-executor-contract.ts`, keep it exported from
`native-exec-desktop.ts` via `export type { DesktopExecutorConfig } from
"./desktop-executor-contract"` plus a local `import type`, and retarget the
inline `import("../adapters/cursor/native-exec-desktop").DesktopExecutorConfig`
at `src/types/provider.ts:701` to the contract file. Type-only, zero runtime
effect; breaks the provider → desktop-implementation edge for good. 110's
base becomes `codex/split-cursor-desktop-executor-contract`. S04 has six
members including 105. The original linear proposal called that depth 6 and
made an exception; STACK-INDEPENDENCE-01 below superseded that topology.
Current planned parents are 105→dev, 110/120/130→105, 140→130, 150→110.
Thus S04's maximum dependent depth is 3, and the five-layer cap still applies.

## COMPANION-EDIT-01 — allowed edits outside the split file

- S09 L2/L3: `src/server/management/route-registry.ts` module-path metadata
  for routes whose handler moves to a leaf — allowed (it is the route table's
  pointer to the owning file; the registry test enumerates siblings).
- S02 L3: one `import type` path change for FastWire types — allowed
  (type-only, no runtime effect).
- Consumer import edits are only allowed when the doc lists them; default is
  that consumers keep importing from the original path via re-export.

## GUI-SEAM-01 — React component extraction as the seam

S17 (Storage policy panel) and other gui layers: extracting a JSX block into a
sibling component file with its props passed through verbatim counts as a
pure move for this train when the rendered tree is unchanged. Verification for
such layers adds the GUI checks: `bun run lint:gui`, `bun run build:gui`, and
a before/after screenshot of the affected page attached to the PR (the
`enforce-target` gate requires a screenshot for gui PRs anyway).

## STACK-INDEPENDENCE-01 — stacks whose layers do not depend on each other

DEV-STACK-01 says independent parts go as parallel PRs off trunk. The
original 002 chained every stack by directory. Decision, applied **per
layer** to every stack: a layer's base is the nearest lower layer in its
stack that it imports from (001's 47 edges) or that is a `#`-part of the
same file; S04 layers additionally base on the 105 type-contract layer;
otherwise the base is `dev`. 002 is regenerated with this rule (29 chained
layers, 48 `dev`-based). The stack id still groups execution order and PR
stack-map navigation; a `dev`-based layer's PR body still shows its stack's
map but states "base: dev — no dependency on the layers below". Each decade
doc's PR section is the authority for its own base and must match 002.

## S06-ORACLE-01 — correcting 002

002's S06 thesis said "47 text oracles retargeted". The drafter showed the
count came from a broad `index.ts` basename match; no test reads
`src/vision/index.ts` as text. 002 is corrected to "no text oracle; three
recursive source-walk guards must include the new leaves".

## S10-SIZE-01 — resolved by PURE-MOVE-SIZE-01

prompt-layers stays two layers (518 + 913 moved lines) under the pure-move
measure.

## WORKTREE-EVIDENCE-01 — real implementation and receipt identity

Current WP400 authority: branch `codex/split-clients-config-export-a`, PR #3611,
base `dev` at `be81013fab6d83ff630ca5f38e7881678a303871`. This is the base
commit, not the tested layer head; the verifier derives the latter from the
clean current branch and matches it to the fetched remote branch. #3610 has
landed as `5ab8aa9a2d9d2a3926469f9d8c82387b43c6d0e9`; it is no longer an
open prerequisite or a retargeting destination. Scoped CI reruns and repair
work are authorized; no local suite or merge is requested.

Historical only: WP400 temporarily used #3610 at
`afdd38ff43c64696153372fc2e27a38aff208c73` to separate a verification fix
from the split. That older basis and its open-parent workflow are retired.
The historical evidence remains in400; do not execute it as the current plan.

The original dedicated-worktree execution choice conflicts with the FSM's
checkout-local source identity. Operational audit by Wegener found no
separate supported execution-root binding: `--cwd` selects both state and
source. The main agent amends its own topology choice, not the user's scope.

From WP400, preserve the docs branch and every completed layer branch, then
create the current layer branch in the same a2c0 directory from its pinned
base. Carry 000, 003 and the current decade doc as tracked layer documentation;
the complete roadmap remains on `codex/260905-modular-debt-ledger-docs` and
can be read by immutable commit/ref. The ignored `.codexclaw` state stays
in a2c0; do not copy, hand-edit or relocate session state. Actual source edits
must occur there during B. Commit the layer before C and preserve that HEAD
through its receipt and C→D. Source changes from another checkout cannot be
represented by a documentation-only delta.

All tests from WP400 run remotely. Each run uses its own mktemp checkout,
fetches the layer branch, and requires the fetched SHA to equal a2c0 HEAD.
Never switch or reset the shared remote seed checkout. Install root and GUI
dependencies with frozen lockfiles, then typecheck, focused checks, privacy
scan and full suite. Preserve full output and propagate each actual exit
code, including SSH transport failures. Failed or incomplete gates keep the
layer unverified; do not synthesize a passing receipt. Retain temporary
checkouts/evidence until scoped cleanup is authorized.

Use the complete isolated Bash recipe in400's Verification section from C.
It checks the clean local layer HEAD, fetched remote HEAD and final remote
state, while preserving output and failures inside the receipt command.
No local Bun test command is allowed. Older shared-checkout recipes must not
be reused; each current plan must supply its isolated verifier. Availability
and success require real execution evidence.
