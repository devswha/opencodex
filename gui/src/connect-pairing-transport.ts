import { installApiSessionFromHtml } from "./api";
import type { ApiTarget } from "./api-targets";

const PAIRING_CODE = /^ocx_pair_[A-Za-z0-9_-]{43}$/;

/**
 * Exchange a pairing code for a shared-plane session.
 *
 * Separate module from the form that calls it so neither file mixes a component export with
 * a plain one. That mix is what `react-refresh/only-export-components` flags, and the two
 * have no reason to share a file: the transport is testable without React and the form has
 * no logic beyond calling it.
 */
export async function submitConnectPairing(
  target: ApiTarget,
  grant: string,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  const code = grant.trim();
  if (!PAIRING_CODE.test(code)) throw new Error("pairing_code_invalid");
  // Resolved at CALL time, not as a default parameter.
  //
  // `installApiAuthFetch` replaces `window.fetch` with the wrapper that attaches plane
  // credentials — including the machine-session headers a relayed exchange needs to reach
  // the hub. A default of `fetch` binds whatever the global was when this module was
  // evaluated, which on the relay path is the unwrapped original, so the request went out
  // unauthenticated and the relay refused it.
  const send = fetchImpl ?? ((input, init) => window.fetch(input, init));
  const response = await send(target.bootstrapPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/html" },
    body: JSON.stringify({ grant: code }),
  });
  if (!response.ok) throw new Error("pairing_refused");
  const html = await response.text();
  if (!installApiSessionFromHtml("shared", html)) throw new Error("pairing_response_invalid");
  return true;
}
