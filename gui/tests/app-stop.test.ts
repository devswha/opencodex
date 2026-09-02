import { describe, expect, test } from "bun:test";
import { requestProxyStop } from "../src/stop-proxy";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("App proxy stop", () => {
  test("routes standalone stop and connected disconnect to different machine mutations", async () => {
    const seen: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), method: String(init?.method), body: init?.body });
      return response({ success: true }, init?.body ? 202 : 200);
    }) as typeof fetch;
    expect((await requestProxyStop("http://machine", { fetchFn })).accepted).toBe(true);
    expect((await requestProxyStop("http://machine", { fetchFn, mode: "client" })).accepted).toBe(true);
    expect(seen).toEqual([
      { url: "http://machine/api/stop", method: "POST", body: undefined },
      { url: "http://machine/api/machine/disconnect", method: "POST", body: "{}" },
    ]);
  });

  test("releases the pending UI and exposes a non-2xx server message", async () => {
    const outcome = await requestProxyStop("", {
      fetchFn: (async () => response({
        success: false,
        message: "native Codex restore failed",
      }, 500)) as typeof fetch,
      formatFailure: status => `Failed to stop proxy (HTTP ${status}).`,
    });

    expect(outcome).toEqual({ accepted: false, message: "native Codex restore failed" });
  });

  test("rejects an HTTP 200 cleanup failure and exposes its server message", async () => {
    const outcome = await requestProxyStop("", {
      fetchFn: (async () => response({
        success: false,
        message: "native Codex cleanup failed",
      })) as typeof fetch,
      formatFailure: status => `Failed to stop proxy (HTTP ${status}).`,
    });

    expect(outcome).toEqual({ accepted: false, message: "native Codex cleanup failed" });
  });

  test("treats a stop timeout like a dropped connection", async () => {
    const outcome = await requestProxyStop("", {
      fetchFn: (async () => {
        throw new DOMException("The operation timed out.", "AbortError");
      }) as typeof fetch,
      timeoutMs: 1,
    });

    expect(outcome).toEqual({ accepted: true });
  });

  test("uses the localized fallback when the server omits a message", async () => {
    const outcome = await requestProxyStop("", {
      fetchFn: (async () => response({}, 503)) as typeof fetch,
      formatFailure: status => `HTTP ${status} stop failed`,
    });

    expect(outcome).toEqual({ accepted: false, message: "HTTP 503 stop failed" });
  });

  test("App clears stopping state and alerts for every rejected stop outcome", async () => {
    const app = await Bun.file(new URL("../src/App.tsx", import.meta.url)).text();
    const handleStopIdx = app.indexOf("const handleStop");
    const brandIdx = app.indexOf("const brand");
    expect(handleStopIdx).toBeGreaterThanOrEqual(0);
    expect(brandIdx).toBeGreaterThan(handleStopIdx);
    const handler = app.slice(handleStopIdx, brandIdx);

    expect(handler).toContain("await requestProxyStop(machineBase");
    expect(handler).toContain('mode: targets.connected ? "client" : "standalone"');
    expect(handler).toContain("if (!outcome.accepted)");
    expect(handler).toContain("setStopping(false)");
    expect(handler).toContain("alert(outcome.message)");
  });
});
