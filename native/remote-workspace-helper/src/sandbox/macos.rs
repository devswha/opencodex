use super::unix_process::supervise;
use crate::protocol::{CanonicalPaths, CommandOutcome, HelperRequest, PROTOCOL_VERSION};
use std::fs;
use std::net::TcpListener;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

const SANDBOX_EXEC: &str = "/usr/bin/sandbox-exec";
const PROFILE: &str = r#"
(version 1)
(deny default)
(allow process-fork)
(allow process-exec)
(allow process-info* (target self))
(allow signal (target self))
(allow sysctl-read)
(allow file-read*
  (subpath "/System")
  (subpath "/usr")
  (subpath "/bin")
  (subpath "/sbin")
  (subpath "/Library/Apple")
  (subpath "/Library/Frameworks")
  (subpath "/Library/Developer/CommandLineTools")
  (subpath "/Applications/Xcode.app/Contents")
  (literal "/Library/Preferences/.GlobalPreferences.plist")
  (literal "/Library/Preferences/com.apple.dt.Xcode.plist")
  (subpath "/private/etc")
  (subpath "/private/var/db/dyld")
  (subpath "/private/var/db/timezone")
  (subpath "/private/var/select")
  (literal "/dev/null")
  (literal "/dev/random")
  (literal "/dev/urandom")
  (subpath (param "OCX_WORKSPACE"))
  (subpath (param "OCX_TMP"))
  TOOLCHAIN_RULES)
(allow file-write*
  (literal "/dev/null")
  (subpath (param "OCX_WORKSPACE"))
  (subpath (param "OCX_TMP")))
NETWORK_RULE
"#;

fn string_path(path: &Path, label: &str) -> Result<String, String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| format!("{label} is not valid Unicode"))
}

fn temporary_workspace() -> Result<PathBuf, String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "system clock is unavailable".to_owned())?
        .as_nanos();
    let path =
        std::env::temp_dir().join(format!("ocx-remote-probe-{}-{nonce}", std::process::id()));
    fs::create_dir(&path).map_err(|_| "could not create confinement probe directory".to_owned())?;
    Ok(path)
}

struct WorkspaceTemporaryDirectory(PathBuf);

impl WorkspaceTemporaryDirectory {
    fn create(root: &Path) -> Result<Self, String> {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "system clock is unavailable".to_owned())?
            .as_nanos();
        let path = root.join(format!(".ocx-remote-tmp-{}-{nonce}", std::process::id()));
        fs::create_dir(&path)
            .map_err(|_| "could not create workspace temporary directory".to_owned())?;
        Ok(Self(path))
    }
}

impl Drop for WorkspaceTemporaryDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn profile(toolchains: &[PathBuf], network_access: bool) -> String {
    let rules = toolchains
        .iter()
        .enumerate()
        .map(|(index, _)| format!("(subpath (param \"OCX_TOOLCHAIN_{index}\"))"))
        .collect::<Vec<_>>()
        .join("\n  ");
    PROFILE.replace("TOOLCHAIN_RULES", &rules).replace(
        "NETWORK_RULE",
        if network_access {
            "(allow network*)"
        } else {
            ""
        },
    )
}

fn run_with_paths(
    request: &HelperRequest,
    paths: CanonicalPaths,
) -> Result<CommandOutcome, String> {
    if !Path::new(SANDBOX_EXEC).is_file() {
        return Err("macOS sandbox-exec is unavailable".to_owned());
    }
    let temporary = WorkspaceTemporaryDirectory::create(&paths.root)?;
    let temp = &temporary.0;
    let workspace = string_path(&paths.root, "workspace root")?;
    let cwd = string_path(&paths.cwd, "command cwd")?;
    let temp_string = string_path(temp, "workspace temporary directory")?;
    let mut command = Command::new(SANDBOX_EXEC);
    command
        .arg("-D")
        .arg(format!("OCX_WORKSPACE={workspace}"))
        .arg("-D")
        .arg(format!("OCX_TMP={temp_string}"));
    for (index, toolchain) in paths.toolchain_roots.iter().enumerate() {
        command.arg("-D").arg(format!(
            "OCX_TOOLCHAIN_{index}={}",
            string_path(toolchain, "toolchain root")?
        ));
    }
    command
        .arg("-p")
        .arg(profile(&paths.toolchain_roots, request.network_access))
        .arg("--")
        .args(&request.command)
        .current_dir(&paths.cwd)
        .env_clear()
        .env("HOME", &paths.root)
        .env("TMPDIR", temp)
        .env(
            "PATH",
            std::env::join_paths(
                paths
                    .toolchain_roots
                    .iter()
                    .map(|path| path.as_os_str())
                    .chain([
                        Path::new("/usr/local/bin").as_os_str(),
                        Path::new("/usr/bin").as_os_str(),
                        Path::new("/bin").as_os_str(),
                        Path::new("/usr/sbin").as_os_str(),
                        Path::new("/sbin").as_os_str(),
                    ]),
            )
            .map_err(|_| "toolchain path cannot be represented safely".to_owned())?,
        )
        .env("LANG", "C.UTF-8")
        .env("LC_ALL", "C.UTF-8")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0);
    command
        .spawn()
        .map_err(|_| format!("could not start sandboxed command in {cwd}"))
        .and_then(|child| supervise(child, request.timeout_ms, request.max_output_bytes))
}

pub fn run(request: &HelperRequest) -> Result<CommandOutcome, String> {
    run_with_paths(request, request.canonical_paths()?)
}

pub fn probe() -> Result<(), String> {
    let parent = temporary_workspace()?;
    let workspace = parent.join("workspace");
    let outside_file = parent.join("outside-secret");
    let outside_write = parent.join("outside-write");
    fs::create_dir(&workspace)
        .map_err(|_| "could not create confinement probe workspace".to_owned())?;
    fs::write(&outside_file, b"must-not-be-visible")
        .map_err(|_| "could not create confinement probe sentinel".to_owned())?;
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|_| "could not create confinement probe listener".to_owned())?;
    let listener_address = listener
        .local_addr()
        .map_err(|_| "could not inspect confinement probe listener".to_owned())?;
    let helper =
        std::env::current_exe().map_err(|_| "could not locate native helper".to_owned())?;
    let helper_parent = helper
        .parent()
        .ok_or_else(|| "native helper has no parent directory".to_owned())?;
    let request = HelperRequest {
        version: PROTOCOL_VERSION,
        operation: "run".to_owned(),
        root: string_path(&workspace, "probe workspace")?,
        cwd: string_path(&workspace, "probe workspace")?,
        command: vec![
            string_path(&helper, "native helper")?,
            "__probe-child".to_owned(),
            string_path(&workspace, "probe workspace")?,
            string_path(&outside_file, "probe sentinel")?,
            string_path(&outside_write, "probe escape target")?,
            listener_address.to_string(),
        ],
        toolchain_roots: vec![string_path(helper_parent, "native helper directory")?],
        timeout_ms: 5_000,
        max_output_bytes: 16 * 1024,
        network_access: false,
    };
    let result = run(&request);
    drop(listener);
    let marker_ok = matches!(
        fs::read(workspace.join("probe-marker")),
        Ok(value) if value == b"sandboxed"
    );
    let outside_ok = matches!(
        fs::read(&outside_file),
        Ok(value) if value == b"must-not-be-visible"
    ) && !outside_write.exists();
    let cleanup = fs::remove_dir_all(&parent);
    let outcome = result?;
    if cleanup.is_err() || !marker_ok || !outside_ok || outcome.exit_code != 0 {
        return Err("macOS confinement probe failed".to_owned());
    }
    Ok(())
}
