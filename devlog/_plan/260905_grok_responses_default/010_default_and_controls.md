# Implementation slice

Dependencies: existing modelWireDefaults, modelAdapters, provider PATCH and startup migration pattern. One new persisted version marker; no new wire enum.

| Action | Path | Before -> after |
| --- | --- | --- |
| MODIFY | `src/providers/registry.ts` | Grok 4.5/4.6 `wire: openai-chat` -> `openai-responses`; keep inbound/auth/tier fences |
| MODIFY | `src/providers/xai-responses-opt-in.ts` | Stored Responses equality -> explicit allowed override, registry default, provider adapter; derive true/mixed/false for Responses inbound |
| MODIFY | `src/providers/xai-responses-opt-in.ts` | Add pure idempotent `migrateXaiResponsesDefault(config)`; if version < 1 and canonical OAuth defaults select Responses, copy provider/map, remove only old Chat entries for 4.5/4.6, mark version 1 |
| NEW | `src/server/xai-responses-startup.ts` | Follow `subagent-models-startup.ts`: project, mutate fresh disk under lock, return whole rebased config; warn/fall back to projection when unavailable |
| MODIFY | `src/server/index.ts` | Wrap the existing startup migration result before live consumers initialize; no async changes |
| MODIFY | `src/types/provider.ts`, `src/config.ts` | Declare `xaiResponsesDefaultVersion?: number`, positive integer optional with degraded invalid load; preserve future versions |
| MODIFY | `src/server/auth-cors.ts` | Classify the marker as runtime-owned in PROVIDER_CONFIG_FIELD_POLICY; raw editor must not remove/replace it |
| MODIFY | `src/server/management/provider-routes.ts` | false deletes entries -> false writes explicit `openai-chat`; true remains explicit Responses; mark version 1 on either operator choice |
| MODIFY | `src/server/management/provider-routes.ts` | Existing xai POST replacement retains omitted modelAdapters and migration version from the latest live row after DNS; switch version uses max(existing, 1), never downgrades future version |
| MODIFY | `src/cli/provider-runtime.ts` | Add `--xai-chat on|off`, parsed with takeBooleanOption; xAI-only guard; map to `xaiResponsesOptIn: !xaiChat` |
| MODIFY | `src/cli/provider.ts` | Add a provider-edit example documenting both directions |
| MODIFY | `gui/src/components/provider-workspace/ProviderAuthPanel.tsx` | Rename private control to Chat; checked when Responses state is false; next Responses value is `state === false`; fallback initial state true |
| MODIFY | `gui/src/i18n/*.ts` | Replace three old Responses opt-in keys with Chat selection keys and translated descriptions; same layout/styles |
| MODIFY | `tests/server/adapter-resolve.test.ts` | Native default expectation; add explicit Chat, omitted auth, custom destination and effective-state cases |
| MODIFY | `tests/server/config.test.ts` | One-time migration, post-upgrade opt-in retention, schema persistence/future version, no-change custom/key/other provider, fresh-disk rebase, read-only load, persistence failures |
| MODIFY | `tests/server/server-startup-reconcile-resilience.test.ts` | Real startServer upgrades both legacy Chat overrides, persists marker, and subsequent restart preserves new Chat choice |
| MODIFY | `tests/routing/fastwire-policy.test.ts` | Native OAuth default expectation, no caller tier promotion |
| MODIFY | `tests/server/management-provider-validation.test.ts` | Make mixed fixture truly mixed; assert both explicit Chat entries after false, persisted parity and effective routing |
| MODIFY | `tests/server/management-provider-validation.test.ts` | POST overwrite retains later Chat selection and future migration marker; malformed/non-xAI writes still rejected |
| MODIFY | `tests/cli/cli-headless-parity.test.ts` | on/off PATCH parity, invalid value/wrong provider make no request |
| MODIFY | `gui/tests/provider-xai-responses-optin.test.tsx` | Inverted checked state and payload; mixed normalization, pending/failure/server-echo behavior |
| MODIFY | `docs-site/src/content/docs/reference/configuration/providers.md` | Default scope and GUI/CLI Chat selection instructions, legacy API behavior |
| MODIFY | `structure/04_transports-and-sidecars.md` | Replace obsolete Chat-default rationale with current bounded Responses default and explicit rollback |

Use existing files, so no test-layout registry additions. Capability surface currently records selected commands, not the provider-edit flag list; only add a capability entry if the generator requires it.

## Specific edits

```diff
- wire: "openai-chat",
+ wire: "openai-responses",
```

Only the two entries preceding the multi-agent entry change. Preserve `authModes: ["oauth"]`, `inbound: ["responses"]`, `forwardCallerServiceTier: false`.

```diff
- else delete modelAdapters[model];
+ else modelAdapters[model] = "openai-chat";
```

```diff
- const next = state !== true;
+ const next = state === false;
- on={state === true}
+ on={state === false}
```

Existing response field names and derived DTO filters remain unchanged for compatibility. The new CLI flag is transient argv -> boolean parser -> legacy PATCH boolean -> modelAdapters -> persisted config -> resolver / DTO / GUI. Marker chain: startup migration or explicit switch write -> provider config save -> provider schema read -> migration guard; unknown future positive integers suppress migration, invalid markers degrade to absent on load. Never seed the marker from registry defaults over existing configs. The existing model-adapter enum is unchanged.

Startup wrapper uses the same exact algorithm and failure handling as `src/server/subagent-models-startup.ts`, substituting `migrateXaiResponsesDefault` and a non-sensitive `[xai-responses-migration]` warning. Migration copies the provider and modelAdapters before editing so the input projection does not mutate the stale config. Only model entries equal to `openai-chat` are deleted; other entries stay byte-equivalent.

Default scope is the reserved `xai` provider ID: its OAuth transport always resolves to the official subscription URL irrespective of saved baseUrl. A custom provider ID keeps its own transport and defaults; no new URL filtering is added to either resolver or Fast authority.

## Check and closure

Capture fresh CI URLs and exact SHA, inspected isolated GUI screenshot, CLI receipts, independent review and merge proof in `011_verification.md`. Archive the unit after completion. No production proxy restart or default changes to the running account.
