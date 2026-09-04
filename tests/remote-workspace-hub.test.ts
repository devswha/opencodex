import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  RemoteWorkspaceHub,
  RemoteWorkspaceHubAgentConnection,
  REMOTE_WORKSPACE_AGENT_PROTOCOL_VERSION,
  generateRemoteControlIdentityKeyPair,
  parseRemoteWorkspaceHubState,
  serializeRemoteWorkspaceAgentMessage,
  type RemoteWorkspaceHubState,
  type RemoteWorkspaceHubStateStore,
} from "../src/remote-control";

class MemoryStore implements RemoteWorkspaceHubStateStore {
  state: RemoteWorkspaceHubState | null = null;
  writes = 0;

  load(): RemoteWorkspaceHubState | null {
    return this.state ? structuredClone(this.state) : null;
  }

  save(state: RemoteWorkspaceHubState): void {
    this.state = structuredClone(state);
    this.writes += 1;
  }
}

function pairedHub(now = Date.parse("2026-09-03T12:00:00.000Z")) {
  const store = new MemoryStore();
  const hub = new RemoteWorkspaceHub(store, () => now);
  const deviceIdentity = generateRemoteControlIdentityKeyPair();
  const grant = hub.createPairingGrant();
  const paired = hub.pairDevice({
    code: grant.code.replaceAll("-", " ").toLowerCase(),
    name: "Computer 2",
    platform: "linux-x64",
    publicKey: deviceIdentity.publicKey,
    roots: [{ id: randomUUID(), label: "Project" }],
  });
  return { hub, store, deviceIdentity, paired, now };
}

describe("remote workspace hub registry", () => {
  test("pairs one named OCX-only device without persisting its bearer token", () => {
    const state = pairedHub();
    expect(state.paired.device).toMatchObject({
      name: "Computer 2",
      platform: "linux-x64",
      online: false,
      roots: [{ label: "Project" }],
    });
    expect(state.paired.deviceToken).toStartWith("ocxrw_");
    expect(state.paired.hubPublicKey).toBe(state.hub.identity().publicKey);
    expect(state.hub.authenticateDeviceToken(state.paired.deviceToken)?.id).toBe(state.paired.device.id);
    expect(JSON.stringify(state.store.state)).not.toContain(state.paired.deviceToken);
    expect(JSON.stringify(state.hub.listDevices())).not.toContain("publicKey");
    expect(JSON.stringify(state.hub.listDevices())).not.toContain("tokenHash");
  });

  test("consumes pairing codes once and enforces unique device names", () => {
    const state = pairedHub();
    expect(() => state.hub.pairDevice({
      code: "not-a-code",
      name: "Computer 3",
      platform: "linux-x64",
      publicKey: generateRemoteControlIdentityKeyPair().publicKey,
      roots: [{ id: randomUUID(), label: "Project" }],
    })).toThrow("invalid or expired");

    const grant = state.hub.createPairingGrant();
    expect(() => state.hub.pairDevice({
      code: grant.code,
      name: "computer 2",
      platform: "windows-x64",
      publicKey: generateRemoteControlIdentityKeyPair().publicKey,
      roots: [{ id: randomUUID(), label: "Other" }],
    })).toThrow("already in use");
    expect(() => state.hub.pairDevice({
      code: grant.code,
      name: "Computer 3",
      platform: "windows-x64",
      publicKey: generateRemoteControlIdentityKeyPair().publicKey,
      roots: [{ id: randomUUID(), label: "Other" }],
    })).toThrow("invalid or expired");
  });

  test("tracks online presence, replaces reconnects, and revokes the device", () => {
    const state = pairedHub();
    const closes: string[] = [];
    const connection = new RemoteWorkspaceHubAgentConnection({
      deviceId: state.paired.device.id,
      devicePublicKey: state.deviceIdentity.publicKey,
      hubIdentity: state.hub.identity(),
      socket: {
        send: () => {},
        close: (_code, reason) => closes.push(reason),
      },
    });
    state.hub.attachConnection(state.paired.device.id, connection);
    expect(state.hub.listDevices()[0]).toMatchObject({ online: false });
    connection.receive(serializeRemoteWorkspaceAgentMessage({
      version: REMOTE_WORKSPACE_AGENT_PROTOCOL_VERSION,
      type: "presence",
      capabilities: ["workspace.read", "workspace.write"],
    }));
    expect(state.hub.listDevices()[0]).toMatchObject({ online: true, lastSeenAt: "2026-09-03T12:00:00.000Z" });
    expect(state.hub.connection(state.paired.device.id)).toBe(connection);
    expect(state.hub.revokeDevice(state.paired.device.id)).toBe(true);
    expect(state.hub.listDevices()).toEqual([]);
    expect(connection.isOnline()).toBe(false);
    expect(state.store.state?.devices).toEqual([]);
    expect(state.hub.authenticateDeviceToken(state.paired.deviceToken)).toBeNull();
    expect(closes).toEqual(["remote workspace device was revoked"]);
  });

  test("refuses mismatched persisted hub identity keys", () => {
    const first = generateRemoteControlIdentityKeyPair();
    const second = generateRemoteControlIdentityKeyPair();
    expect(() => parseRemoteWorkspaceHubState({
      version: 1,
      identity: { publicKey: first.publicKey, privateKey: second.privateKey },
      devices: [],
    })).toThrow("does not match");
  });
});
