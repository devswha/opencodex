# wp5 — live verification, and three things measured along the way

No code in this doc. It records the end-to-end proof on the live proxy and the
measurements that came out of chasing a false lead.

## The verification chain, in order

1. `ocx service restart` (user-authorized; the dogfood symlink
   `~/.bun/bin/ocx` → `/Users/jun/Developer/new/700_projects/opencodex`, pulled clean
   to `b5777aa2d`). New PID, `/healthz` uptime reset, version 2.42.0.
2. One minimal streaming turn through the live proxy
   (`meta-muse/muse-spark-1.3`, `stream: true`, `max_output_tokens: 512`,
   reply "ok").
3. `/api/oauth/accounts?provider=meta-muse&quota=1` returns
   `fiveHourPercent: 0, fiveHourResetAt, weeklyPercent: 0, weeklyResetAt,
   updatedAt` = the turn time.
4. `/api/provider-quotas` carries
   `{ provider: "meta-muse", source: "meta-muse:subscription-observation", ... }`.
5. The live dashboard renders it in all three surfaces, read back through a browser:
   - Providers overview → 사용량 제한: "Muse Code 21분 전 전 확인 5시간 한도 … 0% 사용
     주간 한도 … 0% 사용"
   - 계정 tab: "23분 전에 확인한 값" above the two bars
   - 사용량 tab → 요청 한도: both windows, 출처 "meta-muse · subscription observation",
     쿼터 갱신 "24분 전"

Screenshots: `assets/042_live_overview.png`, `assets/042_live_accounts.png`,
`assets/042_live_usage.png`.

## The raw API evidence

`/api/oauth/accounts?provider=meta-muse&quota=1`, after the streaming turn:

```json
{ "activeAccountId": "12aa2dd21fa72edb0f8dc81a7a475360",
  "accounts": [ { "id": "12aa2dd21fa72edb0f8dc81a7a475360",
    "quota": { "updatedAt": 1788447368848,
      "fiveHourPercent": 0, "fiveHourResetAt": 1788465334000,
      "weeklyPercent": 0, "weeklyResetAt": 1788739200000 } } ] }
```

`/api/provider-quotas`, the new row:

```json
{ "provider": "meta-muse", "label": "Meta Muse Code (CLI credential)",
  "source": "meta-muse:subscription-observation",
  "quota": { "updatedAt": 1788447368848, "fiveHourPercent": 0,
    "fiveHourResetAt": 1788465334000, "weeklyPercent": 0, "weeklyResetAt": 1788739200000 },
  "updatedAt": 1788447368848 }
```

The dashboard evidence is attached to PR #3363 as a comment
(`issuecomment-5527983009`) rendering the three committed screenshots.

## Finding 1 — the event reaches the proxy but not the client

While chasing "why no observation", a long bisect of request shapes found nothing,
because the premise was wrong: **the upstream emits the event to the proxy just fine** —
the observation in step 3 proves it. What is missing is the CLIENT-facing copy: the
passthrough relay does not forward `response.subscription_usage` to the caller.

That is a separate, smaller defect from the one this unit fixed: a passthrough client
that wants the event cannot see it. It did not block the dashboard feature because the
observation seam (`onParsedPayload`) reads the inspection side, which sees every frame.
Recorded here as the correct place for a future contributor to look; not fixed in this
unit because changing relay frame forwarding has fidelity implications beyond Meta.

## Finding 2 — `top_logprobs: 0` suppresses the event, Meta-side

The bisect was not wasted. Measured against `api.meta.ai` directly, with everything
else held constant:

| Request | `response.subscription_usage` |
|---|---|
| minimal body | emitted |
| + `service_tier`, `store`, `reasoning`, `temperature`, `top_p` | emitted |
| + `top_logprobs: 0` | **not emitted** |

Deterministic across three repeats. The proxy does not send `top_logprobs` on this path
(verified by wrapping `fetch` in-process and capturing the exact outbound request:
byte-identical to the minimal direct call), so this does not affect OpenCodex today —
but any client that adds `top_logprobs` to a Muse request will silently lose its usage
event. Worth knowing before anyone "harmlessly" normalizes that field.

## Finding 3 — 004 Q1 answered: the Contributor tier emits it

`260903_muse_spark_plan_oauth/004` Q1 asked whether `muse-spark-1.3-contributor`
carries subscription windows. Measured 2026-09-04: yes — the same
`response.subscription_usage` frame with the same tier id, both windows present. Both
seeded models report usage.

## Terminal outcome

`DONE`: the live dashboard shows Muse subscription usage with its observation age, from
a real streaming turn on the user's own account.
