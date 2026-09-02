import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";

test("App mounts the relay pairing form and installs only the returned shared session", async () => {
  const keys = ["window", "document", "navigator", "sessionStorage", "localStorage", "fetch", "confirm", "alert", "IS_REACT_ACT_ENVIRONMENT", "__APP_VERSION__"] as const;
  const previous = Object.fromEntries(keys.map(key => [key, Reflect.get(globalThis, key)]));
  const win = new Window({ url: "http://localhost/#usage" });
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: win },
    document: { configurable: true, value: win.document },
    navigator: { configurable: true, value: win.navigator },
    sessionStorage: { configurable: true, value: win.sessionStorage },
    localStorage: { configurable: true, value: win.localStorage },
    confirm: { configurable: true, value: () => true },
    alert: { configurable: true, value: () => {} },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
    __APP_VERSION__: { configurable: true, value: "0.0.0-test" },
  });
  for (const [name, content] of [
    ["opencodex-session-token", "ocx_session_machine"],
    ["opencodex-session-csrf", "machine-csrf"],
    ["opencodex-session-origin", "http://localhost"],
    ["opencodex-session-server-origin", "http://localhost"],
    // The server states the role in the served document. Without it this reads as
    // standalone, discovery never runs, and the relay pairing form never mounts — which
    // is exactly the behavior a plain install should get.
    ["opencodex-runtime-role", "client"],
  ]) {
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.append(meta);
  }

  let pairingRequest: { method: string; body: string; headers: Headers } | null = null;
  const sessionHtml = [
    '<meta name="opencodex-session-token" content="ocx_session_hub">',
    '<meta name="opencodex-session-csrf" content="hub-csrf">',
    '<meta name="opencodex-session-origin" content="http://localhost">',
    '<meta name="opencodex-session-server-origin" content="https://hub.example.test">',
  ].join("");
  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost/");
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (url.pathname === "/api/machine/status") return Response.json({
      mode: "client", connected: true, machineBase: "http://localhost",
      sharedBase: "http://localhost/api/machine/hub-relay",
      sharedServerOrigin: "https://hub.example.test", managementTransport: "relay",
      apiKeyId: "client-key-a", protocolVersion: 1, connectedAt: "2026-08-28T00:00:00.000Z",
      hubReachability: "unknown",
    });
    if (url.pathname === "/api/machine/hub-relay/opencodex-session" && init?.method === "POST") {
      pairingRequest = { method: init.method, body: String(init.body), headers };
      return new Response(sessionHtml, { headers: { "Content-Type": "text/html" } });
    }
    if (url.pathname === "/healthz") return Response.json({ version: "0.0.0-test" });
    if (url.pathname.endsWith("/api/usage")) return Response.json({
      range: "30d", surface: "all", since: null, generatedAt: Date.now(),
      summary: { requests: 0, attemptCount: 0, measuredRequests: 0, reportedRequests: 0, unreportedRequests: 0, unsupportedRequests: 0, estimatedRequests: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0, coverageRatio: 0, estimatedCostUsd: 0, pricedRequests: 0, unpricedRequests: 0, unmeteredRequests: 0 },
      days: [], models: [], providers: [], accounts: [], historyTruncated: false,
    });
    return Response.json({});
  }) as typeof fetch;
  Object.defineProperties(globalThis, {
    fetch: { configurable: true, value: mockFetch },
  });
  Object.defineProperty(win, "fetch", { configurable: true, value: mockFetch });

  const container = document.createElement("div");
  document.body.append(container);
  const { LanguageProvider } = await import("../src/i18n/provider");
  // Bind the auth-fetch wrapper to THIS window before App mounts.
  //
  // App calls installApiAuthFetch() at module scope, so it runs on first import only. A
  // later test importing App gets the cached module and no install, leaving the wrapper
  // bound to whichever window imported it first. The relayed pairing request then goes out
  // unwrapped — no machine-session headers, which is exactly what this test asserts.
  // Standalone the ordering happens to work; in the full suite it does not. Re-binding here
  // makes the test independent of import order rather than of any product behavior.
  const { resetApiAuthFetchForTests, installApiAuthFetch, configureApiTargets } = await import("../src/api");
  const { standaloneApiTargets } = await import("../src/api-targets");
  resetApiAuthFetchForTests();
  configureApiTargets(standaloneApiTargets(""));
  installApiAuthFetch();
  const { default: App } = await import("../src/App");
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: win.fetch });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(container);
  try {
    await act(async () => { root.render(createElement(LanguageProvider, null, createElement(App))); });
    const deadline = Date.now() + 1_000;
    while (!container.querySelector("#connect-pairing-code")) {
      if (Date.now() >= deadline) throw new Error("pairing form did not mount from App");
      await act(async () => { await new Promise(resolve => win.setTimeout(resolve, 10)); });
    }
    const input = container.querySelector("#connect-pairing-code") as HTMLInputElement;
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!.call(input, `ocx_pair_${"a".repeat(43)}`);
    await act(async () => { input.dispatchEvent(new win.Event("input", { bubbles: true })); });
    const form = input.closest("form")!;
    await act(async () => { form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })); });
    const successDeadline = Date.now() + 1_000;
    while (container.querySelector("#connect-pairing-code")) {
      if (Date.now() >= successDeadline) throw new Error("pairing form did not hide after success");
      await act(async () => { await Promise.resolve(); });
    }
    expect(pairingRequest?.method).toBe("POST");
    expect(pairingRequest?.body).toBe(JSON.stringify({ grant: `ocx_pair_${"a".repeat(43)}` }));
    expect(pairingRequest?.headers.get("x-opencodex-machine-session")).toBe("ocx_session_machine");
    expect(pairingRequest?.headers.get("x-opencodex-api-key")).toBeNull();
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
    win.close();
    for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: previous[key] });
  }
});

test("a refused pairing renders an accessible error without clearing the pasted code", async () => {
  const keys = ["window", "document", "navigator", "sessionStorage", "fetch", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const previous = Object.fromEntries(keys.map(key => [key, Reflect.get(globalThis, key)]));
  const win = new Window({ url: "http://localhost/" });
  const mockFetch = (async () => new Response("refused", { status: 403 })) as typeof fetch;
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: win },
    document: { configurable: true, value: win.document },
    navigator: { configurable: true, value: win.navigator },
    sessionStorage: { configurable: true, value: win.sessionStorage },
    fetch: { configurable: true, value: mockFetch },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  Object.defineProperty(win, "fetch", { configurable: true, value: mockFetch });
  const container = document.createElement("div");
  document.body.append(container);
  const { LanguageProvider } = await import("../src/i18n/provider");
  const { ConnectPairingForm } = await import("../src/connect-pairing");
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(container);
  const code = `ocx_pair_${"b".repeat(43)}`;
  try {
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(ConnectPairingForm, {
        target: { id: "shared", baseUrl: "https://hub.example.test", serverOrigin: "https://hub.example.test", bootstrapPath: "https://hub.example.test/opencodex-session", transport: "direct" },
        onConnected: () => { throw new Error("unexpected success"); },
      })));
    });
    const input = container.querySelector("#connect-pairing-code") as HTMLInputElement;
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!.call(input, code);
    await act(async () => { input.dispatchEvent(new win.Event("input", { bubbles: true })); });
    await act(async () => { input.closest("form")!.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })); });
    const deadline = Date.now() + 1_000;
    while (!container.querySelector('[role="alert"]')) {
      if (Date.now() >= deadline) throw new Error("pairing error did not render");
      await act(async () => { await Promise.resolve(); });
    }
    expect(input.value).toBe(code);
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
    win.close();
    for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: previous[key] });
  }
});
