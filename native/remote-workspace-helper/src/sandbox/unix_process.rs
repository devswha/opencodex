use crate::protocol::CommandOutcome;
use signal_hook::consts::{SIGINT, SIGTERM};
use std::io::{self, Read};
use std::os::fd::AsRawFd;
use std::process::{Child, ExitStatus};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

fn nonblocking<T: AsRawFd>(stream: &T) -> Result<(), String> {
    let descriptor = stream.as_raw_fd();
    // SAFETY: descriptor belongs to a live child pipe; F_GETFL does not mutate memory.
    let flags = unsafe { libc::fcntl(descriptor, libc::F_GETFL) };
    if flags < 0 {
        return Err("could not inspect sandbox output pipe".to_owned());
    }
    // SAFETY: descriptor remains live and OR-ing O_NONBLOCK preserves every current flag.
    if unsafe { libc::fcntl(descriptor, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
        return Err("could not bound sandbox output pipe".to_owned());
    }
    Ok(())
}

fn drain<R: Read>(
    stream: &mut R,
    body: &mut Vec<u8>,
    combined: &mut usize,
    maximum: usize,
) -> Result<bool, String> {
    let mut chunk = [0u8; 8192];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => return Ok(true),
            Ok(read) => {
                let next = combined
                    .checked_add(read)
                    .ok_or_else(|| "remote workspace command output limit exceeded".to_owned())?;
                if next > maximum {
                    return Err("remote workspace command output limit exceeded".to_owned());
                }
                body.extend_from_slice(&chunk[..read]);
                *combined = next;
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => return Ok(false),
            Err(_) => return Err("could not read sandboxed command output".to_owned()),
        }
    }
}

fn terminate_process_group(pid: u32, signal: i32) {
    let process_group = i32::try_from(pid).unwrap_or(i32::MAX);
    // SAFETY: a negative id targets the dedicated group created for this sandbox launcher.
    unsafe {
        libc::kill(-process_group, signal);
    }
}

fn exit_code(status: ExitStatus) -> i32 {
    use std::os::unix::process::ExitStatusExt;
    status
        .code()
        .unwrap_or_else(|| 128 + status.signal().unwrap_or(1))
}

pub fn supervise(
    mut child: Child,
    timeout_ms: u64,
    max_output_bytes: usize,
) -> Result<CommandOutcome, String> {
    let pid = child.id();
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "sandbox stdout was not captured".to_owned())?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| "sandbox stderr was not captured".to_owned())?;
    nonblocking(&stdout)?;
    nonblocking(&stderr)?;
    let cancelled = Arc::new(AtomicBool::new(false));
    signal_hook::flag::register(SIGTERM, Arc::clone(&cancelled))
        .map_err(|_| "could not install helper termination handler".to_owned())?;
    signal_hook::flag::register(SIGINT, Arc::clone(&cancelled))
        .map_err(|_| "could not install helper interruption handler".to_owned())?;

    let mut stdout_body = Vec::with_capacity(max_output_bytes.min(8192));
    let mut stderr_body = Vec::with_capacity(max_output_bytes.min(8192));
    let mut combined = 0usize;
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let mut failure: Option<String> = None;
    let status = loop {
        if let Err(error) = drain(
            &mut stdout,
            &mut stdout_body,
            &mut combined,
            max_output_bytes,
        )
        .and_then(|_| {
            drain(
                &mut stderr,
                &mut stderr_body,
                &mut combined,
                max_output_bytes,
            )
        }) {
            failure = Some(error);
            break None;
        }
        if cancelled.load(Ordering::Acquire) {
            failure = Some("remote workspace command was cancelled".to_owned());
            break None;
        }
        if Instant::now() >= deadline {
            failure = Some("remote workspace command timed out".to_owned());
            break None;
        }
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => thread::sleep(Duration::from_millis(5)),
            Err(_) => {
                failure = Some("could not wait for sandboxed command".to_owned());
                break None;
            }
        }
    };

    // Remote commands never own persistent background processes. Close the dedicated group even
    // after the leader exits, then keep the pipe drain bounded. A descendant that called setsid
    // cannot make this helper wait forever: dropping the nonblocking read ends after the grace
    // closes that output channel, while Seatbelt confinement remains inherited.
    terminate_process_group(pid, libc::SIGTERM);
    let grace_deadline = Instant::now() + Duration::from_millis(500);
    let mut stdout_closed = false;
    let mut stderr_closed = false;
    while Instant::now() < grace_deadline && (!stdout_closed || !stderr_closed) {
        if !stdout_closed {
            stdout_closed = drain(
                &mut stdout,
                &mut stdout_body,
                &mut combined,
                max_output_bytes,
            )
            .unwrap_or_else(|error| {
                failure.get_or_insert(error);
                true
            });
        }
        if !stderr_closed {
            stderr_closed = drain(
                &mut stderr,
                &mut stderr_body,
                &mut combined,
                max_output_bytes,
            )
            .unwrap_or_else(|error| {
                failure.get_or_insert(error);
                true
            });
        }
        if !stdout_closed || !stderr_closed {
            thread::sleep(Duration::from_millis(5));
        }
    }
    drop(stdout);
    drop(stderr);
    if matches!(child.try_wait(), Ok(None)) {
        terminate_process_group(pid, libc::SIGKILL);
    }
    let final_status = match status {
        Some(status) => status,
        None => child
            .wait()
            .map_err(|_| "could not reap sandboxed command".to_owned())?,
    };
    if let Some(error) = failure {
        return Err(error);
    }
    Ok(CommandOutcome {
        exit_code: exit_code(final_status),
        stdout: stdout_body,
        stderr: stderr_body,
    })
}
