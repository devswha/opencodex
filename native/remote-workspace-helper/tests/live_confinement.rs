#![cfg(any(target_os = "macos", target_os = "windows"))]

use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn native_helper_proves_workspace_write_and_denies_host_read_write_and_network() {
    let binary = env!("CARGO_BIN_EXE_opencodex-remote-workspace-helper");
    let mut child = Command::new(binary)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("native helper starts");
    child
        .stdin
        .take()
        .expect("native helper stdin")
        .write_all(br#"{"version":1,"operation":"probe"}"#)
        .expect("probe request is written");
    let output = child.wait_with_output().expect("native helper exits");
    assert!(
        output.status.success(),
        "helper stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let response: Value = serde_json::from_slice(&output.stdout).expect("helper response is JSON");
    assert_eq!(
        response,
        serde_json::json!({ "version": 1, "ok": true, "probe": true })
    );
}
