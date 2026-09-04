# Remote Workspace architecture

Status: implemented on the `improved-remote-control` branch for private dogfood. It is not yet on
`dev`, released, or deployed as a hosted service.

Remote Hub and Remote Workspace solve different problems. Remote Hub lets another client use the
Hub's provider gateway. Remote Workspace keeps Codex, Claude Code, Pi, their login credentials, and
model sessions on the Hub while an OCX-only Executor performs file and command work in one locally
approved folder.

```text
Phone or Computer 3 browser
  | authenticated OCX GUI session
  v
Computer 1 OCX Hub
  |-- Codex / Claude Code / Pi process and credentials
  |-- persisted model-session metadata and recent event snapshot
  |-- thread -> device -> root -> capability binding
  |
  | outbound WSS already opened by the Executor
  | Ed25519-signed ephemeral P-256 ECDH + directional AES-256-GCM RPC
  v
Computer 2 OCX Executor
  |-- approved workspace roots
  |-- bounded file tools
  `-- Linux bubblewrap command sandbox when available
```

Computer 2 does not need Codex, Claude Code, Pi, a provider API key, or a ChatGPT login. It retains
only its device-scoped bearer, signing key, public Hub key, and local root paths. The Hub stores root
labels and opaque IDs, not Executor paths. No inbound Executor port or router port-forward is needed.

## Runtime paths

### Codex

The Hub starts an isolated Codex App Server. Current Codex exposes the Remote Workspace HTTP MCP
server through `functions.exec` Code Mode, so the path is:

```text
Codex App Server -> functions.exec -> ocx_remote_workspace MCP
  -> coordinator binding -> encrypted RPC -> selected Executor
```

The App Server receives a named permission profile, not a simultaneous legacy `sandbox` value. Its
filesystem contains only the empty coordinator directory and the minimum Codex runtime paths;
command network access, inherited shell environment, local tools, other MCP servers, hooks, apps,
browser tools, plugins, memories, web search, and subagents are disabled. The loopback MCP bearer is
passed through an environment-variable name and never enters thread configuration or model input.

If the selected Codex configuration still contains legacy `sandbox_mode` or
`sandbox_workspace_write`, Codex Remote Workspace reports unavailable instead of silently starting
without the permission-profile boundary. This follows the current official App Server contract:
<https://learn.chatgpt.com/docs/app-server#threads>.

### Claude Code

The Hub invokes Claude Code in print/stream-json mode with an empty settings source, strict MCP
configuration, no ordinary tools, and only `mcp__ocx_remote_workspace__*` allowed. New sessions use
`--session-id`; restored sessions use `--resume`. A real Claude Code CLI integration test uses a
local mock Anthropic endpoint and proves the MCP result from the Executor is returned to the model.

### Pi

The Hub invokes Pi RPC mode with built-ins, ambient extensions, skills, prompt templates, themes,
and context files disabled. One generated extension registers only the capability-filtered Remote
Workspace tools. The persisted session ID is reused after Hub restart.

All three Hub runtimes share one platform launcher. Linux and macOS preserve argv directly;
Windows resolves PATH with PATHEXT and routes npm `.cmd`/`.bat` shims through the repository's
escaped `ComSpec /d /s /c` implementation. Stopping a Windows session terminates the exact
Hub-owned wrapper tree through trusted System32 `taskkill /T /F`, preventing an orphaned Node CLI.
Temporary runtime directories use bounded removal retries for short Windows AV/indexer locks.
Linux and macOS first request a graceful process stop and then use a bounded force-kill fallback;
a CLI that ignores termination cannot keep a stopped Hub session alive indefinitely.

## Device and transport ownership

- A GUI session creates a ten-minute, one-use pairing code.
- The Executor creates its Ed25519 key locally and exchanges the code for a random device bearer.
- The Hub stores only the bearer hash. A valid code is consumed even when submitted metadata is
  rejected, preventing repeated enrollment attempts with one copied secret.
- After WSS upgrade, the Executor sends its current capability manifest and waits for the Hub's
  acknowledgement before reporting `online`. The Hub also refuses session traffic until that
  acknowledgement has been written, so a bearer-authenticated socket alone is not presence.
- Every work session performs a signed ephemeral handshake and derives ordered directional AEAD
  keys. Device ID, session ID, profile, and negotiated capabilities are authenticated.
- Reconnect opens a new encrypted transport for the same device and root. A capability downgrade
  requires a new session rather than silently weakening an existing binding.
- Disconnect never falls back to Hub-local file or command execution.

The Hub sees prompts and model output because it owns the coding-agent process. The WSS routing
path cannot read encrypted Executor RPC frames. This is transport E2EE, not a claim that the Hub is
blind to the model conversation it intentionally runs.

## Capability and consent model

| Capability | Executor support | Exposed tools |
| --- | --- | --- |
| `workspace.read` | all supported OCX Executors | `list_directory`, `read_file` |
| `workspace.write` | all supported OCX Executors | `write_file` |
| `workspace.exec` | Linux bubblewrap, macOS Seatbelt, or Windows AppContainer after a real confinement probe succeeds | `exec` |

macOS and Windows command execution is owned by the separately built Rust Executor helper. OCX pins
that helper's SHA-256 digest at pairing and rechecks it before probes and commands. The GUI displays
the exact capability instead of claiming builds work when the helper is absent, replaced, or blocked
by local OS policy.

A new GUI session defaults to **read only**. Choosing **Edit files and run commands** is the explicit
session-scoped grant for the selected computer and root. This avoids prompting for every ordinary
agent file operation while making write/exec authority visible at the action that creates the
session. It is not a grant for another root, device, or resumed thread.

The Linux runner provides one writable `/workspace`, minimal read-only runtime and certificate
trees, the current OCX Bun executable as one read-only file, a private
process/IPC/UTS namespace, an empty temporary directory, cleared environment, and network disabled
by default. Command argv, timeout, concurrent requests, and combined output are bounded. Closing the
session aborts active command processes rather than leaving them until timeout.
Additional user-installed toolchain directories are visible only when the Executor owner explicitly
adds `--toolchain-root` during local pairing; those real paths remain in device-local state.
Merely finding the `bwrap` file is not sufficient: enrollment runs a bounded namespace probe. A
Linux host whose kernel/container policy rejects that probe advertises file tools only.

The native helper applies the same rule. Its probe must write within a disposable workspace while
failing to read or write an adjacent sentinel and failing to connect to a live loopback listener.
macOS launches the command under a per-command Seatbelt profile and owns the complete process group.
Windows creates a capability-free AppContainer, attaches it to a non-breakaway kill-on-close Job
Object at process creation, temporarily grants that unique SID access to the workspace and approved
toolchains, and allowlists only the three standard handles for inheritance. It never passes command
argv or root paths on the helper command line; the bounded protocol travels over stdin.

File operations are serialized per Executor so a parallel command cannot replace a checked path
with a symlink or junction mid-operation. Reads bind the opened descriptor back to the current
regular-file identity before and after bounded I/O. Writes repeat their expected-hash precondition
immediately before an atomic replace; Windows retries only short `EBUSY`/`EPERM`/`EACCES` replace
holds. The approved root identity is pinned for the lifetime of the Executor, and toolchain roots
are revalidated before every command. Windows device names, alternate data streams, and
trailing-dot/space aliases are rejected.
The capability manifest is the intersection of the pairing-time grant and what the current host can
actually enforce. Reconnecting can remove a capability when its sandbox disappears, but can never
silently add authority that the owner did not grant while pairing.

## Persistence and shutdown

`remote-workspace-sessions.json` stores bounded session metadata and a small recent event snapshot
under the protected OpenCodex state directory. It does not contain provider credentials, device
bearers, device private keys, or Executor root paths. The Hub device registry and Executor local
state remain separate owner-only files.

After a Hub restart, non-stopped sessions appear as `waiting_for_executor`. The first prompt after
the same Executor reconnects resumes the original Codex thread, Claude session, or Pi session ID.
Claude Code creates durable history lazily on its first completed prompt; a brand-new Claude handle
that never completed a turn is therefore not advertised as resumable after a restart.
The session remains pinned to its stored device, root, capability set, and access mode. Server
shutdown stops every model runtime, encrypted session, loopback bridge, timer, and connected device
socket.

The dashboard keeps Stop available while a prompt request is in flight. Starting, stopping, and
revoking are race-safe: a session that finishes its startup after cancellation cannot overwrite the
terminal `stopped` state or leave a model/Executor process behind.
The pairing card provides separate Linux/macOS shell and Windows PowerShell commands. An Executor
socket stopped before its WebSocket opens settles locally even on runtimes that throw when closing
a `CONNECTING` socket.

## Main modules

| Module | Responsibility |
| --- | --- |
| `workspace-device.ts` | Local enrollment state, capability probe, WSS reconnect loop |
| `workspace-hub.ts` | Hub identity, pairing grants, hashed device tokens, presence and revoke |
| `workspace-agent-protocol.ts` | Bounded WSS control messages and capability acknowledgement |
| `workspace-agent-connection.ts` | Signed per-session handshake and encrypted channel lifecycle |
| `workspace-rpc.ts` | Bounded request/result RPC, timeout, concurrency, and cancellation |
| `workspace-rpc-framing.ts` | Ordered, bounded fragmentation for logical RPC messages larger than one relay frame |
| `workspace-executor.ts` | Approved-root path and file enforcement |
| `workspace-command-runner.ts` | Linux bubblewrap and digest-pinned native-helper selection/protocol |
| `native/remote-workspace-helper` | Rust Seatbelt/AppContainer command containment and process ownership |
| `workspace-coordinator.ts` | Thread/device/root/capability binding and local-fallback refusal |
| `workspace-tool-bridge.ts` | Loopback bearer-authenticated MCP/CLI bridge |
| `workspace-*-runtime.ts` | Hub-owned Codex, Claude Code, and Pi adapters |
| `workspace-sessions.ts` | Session limits, event history, persistence, resume, and shutdown |

## Invariants

1. `src/router.ts`, `src/server/lifecycle.ts`, and `src/server/responses/core.ts` do not import this
   optional subsystem.
2. Only `runtimeRole=hub` mounts pairing, agent WSS, and management operations.
3. Pairing, session creation, prompt, stop, and revoke mutations require the existing interactive
   GUI-session boundary where applicable; a reusable admin token cannot substitute for consent.
4. A session is fixed to one profile, model thread, Executor, root, access mode, and capability set.
5. The model sees only tools allowed by both the session grant and current Executor manifest.
6. Missing or disconnected transport fails closed and never changes the Hub workspace.
7. Provider credentials and coding-agent history never move to an Executor.
8. Payload, output, event, process, session, device, and reconnect limits apply before unbounded
   allocation or forwarding.

## Resource and native-code boundary

Remote Workspace keeps allocation ownership explicit rather than relying on garbage collection as
the first limit. Pairing responses are streamed into a 64 KiB cap and cancelled on overflow.
Loopback tool bridges accept at most eight authenticated requests at once, bound each body to
512 KiB, cancel oversized streams, and expose an idempotent asynchronous stop that every runtime
awaits. A failed Executor session acceptance destroys its cipher endpoint before replying, and a
closed device connection releases its agent reference immediately. Directory listing reads at most
4,097 entries incrementally instead of materializing an arbitrary directory first. UTF-8 event and
assistant truncation uses logarithmic boundary search rather than repeated one-code-unit rescans.
Logical tool messages larger than one 64 KiB relay frame are fragmented without increasing the
relay allocation ceiling. Reassembly accepts only ordered full-size intermediate fragments, retains
at most eight incomplete messages of at most 2 MiB each, expires them after 30 seconds, and clears
them immediately when the encrypted session closes.
Runtime teardown executes every process, bridge, transport, and temporary-directory cleanup owner
even when an earlier owner fails. Process exit waits clear their timers, forced termination is
verified instead of assumed, and incomplete cleanup is surfaced as a failed session rather than a
false stopped state.

The TypeScript surface remains `strict` and contains no explicit `any` in the Remote Workspace
implementation. Untrusted JSON enters as `unknown`, passes runtime guards, and RPC results use a
success/error discriminated union. The unavoidable WebSocket constructor cast is isolated at the
Bun/DOM declaration mismatch; it does not widen application payload types.

Rust remains outside the control-plane and cryptographic orchestration, which continue to use strict
Bun TypeScript and native OpenSSL. It is used only for the separately signed Executor helper, where
Seatbelt, AppContainer, Job Object, SID/ACL, inherited-handle, process-group, and pipe lifetimes need
native OS APIs. The helper has a 64 KiB request cap, 256 KiB combined-output cap, 64 argument/16 KiB
argv cap, 60-second deadline, 256-process Windows job cap, bounded collector buffers, and RAII owners
for every native allocation and handle. No N-API ABI or long-lived native heap is added to the Hub.

[Decision Log]
- 목적과 의도: Prevent long-running Hub/Executor sessions from accumulating response bodies,
  requests, ciphers, timers, child-process waits, or GUI tombstones.
- 기존 구현 및 제약 조건: The flows were individually bounded, but chunked pairing used
  `response.text()`, bridge shutdown was not awaited, bridge concurrency had no front-door cap,
  failed session acceptance retained an endpoint, teardown could skip later owners after one error,
  and UTF-8 truncation could rescan quadratically.
- 검토한 주요 대안: Rewrite the control plane in Rust, depend on GC, lower every payload limit,
  or retain Bun/TypeScript while making every allocation and shutdown owner explicit.
- 선택한 방식: Keep strict typed orchestration in Bun, add streaming and concurrency bounds,
  discriminated wire results, bounded RPC fragmentation, incremental directory reads, awaited
  idempotent shutdown, and direct cleanup at every failure boundary.
- 다른 대안 대신 이 방식을 선택한 이유: It fixes the measured ownership problems without a new
  ABI, installer, updater, and three-OS artifact supply chain. Native code is reserved for the PTY
  and sandbox boundary that actually needs OS APIs.
- 장점, 단점 및 영향: Idle and adversarial paths retain bounded memory and fewer transient copies;
  native command containment is now implemented, while signed/notarized binary distribution and
  exact-binary native CI remain release work.

## Known release boundary

The implementation is suitable for branch-level private dogfood, not a claim of a finished hosted
product. Linux-host tests and cross-target compilation cover the common contract, but they are not a
substitute for executing the confinement probe on native macOS and Windows runners. Before release
it still needs independent maintainer review, current-`dev` rebase, exact-binary native CI, a real
three-computer acceptance run, signed/notarized background-agent packaging, and the chosen HTTPS
identity frontend. A centrally hosted paid Coordinator/Executor remains a separate deliverable.
Super Sync and credential replication remain out of scope.

[Decision Log]
- 목적과 의도: Enable real Executor-side builds on Windows and macOS without turning a remote
  command into access to the Executor user's whole account.
- 기존 구현 및 제약 조건: Bun could bound a child but could not create AppContainer security
  capabilities or reliably own native process trees, and cwd alone is not a filesystem boundary.
- 검토한 주요 대안: Direct spawn, Windows Job Object alone, Docker/Podman as a mandatory runtime,
  one native rewrite of the entire Executor, or a narrow per-command Rust helper.
- 선택한 방식: Keep file/RPC/control logic in strict TypeScript and use a digest-pinned helper only
  for macOS Seatbelt and Windows AppContainer plus Job Object. Advertise exec only after an active
  positive/negative confinement probe.
- 다른 대안 대신 이 방식을 선택한 이유: Job Objects solve lifetime but not filesystem access;
  containers add a large user dependency; a narrow helper gives the OS boundary without duplicating
  pairing, transport, encryption, or filesystem logic.
- 장점, 단점 및 영향: The helper's native memory and handles have deterministic owners and command
  resources remain bounded. Release packaging now needs platform signing/notarization and native
  probe evidence; unsupported machines safely retain read/write file tools without exec.

[Decision Log]
- 목적과 의도: Let a phone or third computer control a Hub-owned coding-agent session whose actual
  workspace operations occur on a second OCX-only computer.
- 기존 구현 및 제약 조건: Remote Hub centralizes provider traffic but not tools; installing and
  authenticating every coding CLI on every computer duplicates credentials and session state.
- 검토한 주요 대안: Copy credentials, mount remote files on the Hub, rely only on prompt guidance,
  use remote Code Mode alone, or bind a minimal OCX Executor through authenticated E2EE RPC.
- 선택한 방식: Keep model processes and credentials on the Hub, advertise capability-filtered MCP
  tools, enforce thread/device/root binding in OCX, and execute only on the selected outbound-connected
  Executor.
- 다른 대안 대신 이 방식을 선택한 이유: It gives one credential and history authority while
  preserving Executor-local filesystem and build compute, with an enforceable no-local-fallback point.
- 장점, 단점 및 영향: Computer 2 needs only OCX and no inbound port. The Hub remains required and
  sees the conversation, while cross-platform command containment and hosted service operations need
  separate work.

[Decision Log]
- 목적과 의도: Make write authority safe enough for ordinary use without approval fatigue.
- 기존 구현 및 제약 조건: Per-tool approval would stall unattended turns, while unconditional
  write/exec exposure makes merely opening a session destructive.
- 검토한 주요 대안: Approve every tool, expose all device capabilities automatically, or grant a
  visible access mode once for one session/device/root binding.
- 선택한 방식: Default new sessions to read-only and require an explicit GUI selection for the
  bounded workspace-write/exec mode.
- 다른 대안 대신 이 방식을 선택한 이유: The user makes one clear decision at session creation,
  and the resulting scope is small enough to enforce in the tool catalog and coordinator.
- 장점, 단점 및 영향: Normal agent work remains convenient after one grant; destructive commands
  inside the granted workspace remain possible and must be treated like local coding-agent access.
