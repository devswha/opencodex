#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
mod unix_process;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
use crate::protocol::{CommandOutcome, HelperRequest};
use std::fs::{self, OpenOptions};
use std::io::Read;
use std::net::{SocketAddr, TcpStream};
#[cfg(target_os = "macos")]
use std::process::Command;
use std::time::Duration;

#[cfg(target_os = "macos")]
pub use macos::{probe, run};
#[cfg(target_os = "windows")]
pub use windows::{probe, run};

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn probe() -> Result<(), String> {
    Err("native helper is supported only on macOS and Windows".to_owned())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn run(_request: &HelperRequest) -> Result<CommandOutcome, String> {
    Err("native helper is supported only on macOS and Windows".to_owned())
}

pub fn run_probe_child() -> i32 {
    let mut args = std::env::args().skip(2);
    let Some(workspace) = args.next() else {
        return 20;
    };
    let Some(outside_file) = args.next() else {
        return 21;
    };
    let Some(outside_write) = args.next() else {
        return 22;
    };
    let Some(listener_address) = args.next() else {
        return 23;
    };
    let Some(existing_workspace_file) = args.next() else {
        return 24;
    };
    if args.next().is_some() {
        return 24;
    }

    let marker = std::path::Path::new(&workspace).join("probe-marker");
    if fs::write(&marker, b"sandboxed").is_err() {
        return 25;
    }
    if !matches!(fs::read(&existing_workspace_file), Ok(value) if value == b"existing")
        || fs::write(&existing_workspace_file, b"updated").is_err()
    {
        return 29;
    }
    let mut outside = Vec::new();
    if OpenOptions::new()
        .read(true)
        .open(&outside_file)
        .and_then(|mut file| file.read_to_end(&mut outside))
        .is_ok()
    {
        return 26;
    }
    if fs::write(&outside_write, b"escaped").is_ok() {
        return 27;
    }
    let Ok(listener_address) = listener_address.parse::<SocketAddr>() else {
        return 23;
    };
    if TcpStream::connect_timeout(&listener_address, Duration::from_millis(500)).is_ok() {
        return 28;
    }
    #[cfg(target_os = "macos")]
    {
        // A macOS process group cannot contain a descendant that calls setsid(). Seatbelt must
        // therefore deny both direct fork and the ordinary posix_spawn path; otherwise a command
        // could retain workspace-write authority after its Remote Workspace session is stopped.
        // SAFETY: the probe performs no allocation or lock-sensitive work in the child before
        // immediately calling _exit; the parent synchronously reaps it when the sandbox regresses.
        let forked = unsafe { libc::fork() };
        if forked == 0 {
            // SAFETY: this is the post-fork probe child and must not run Rust destructors.
            unsafe { libc::_exit(0) };
        }
        if forked > 0 {
            let mut status = 0;
            // SAFETY: forked is the positive PID returned to this parent and status is writable.
            unsafe { libc::waitpid(forked, &mut status, 0) };
            return 30;
        }
        if Command::new("/usr/bin/true").status().is_ok() {
            return 30;
        }
    }
    0
}
