//! Share: render the release video with the system Node, open a PR with git and gh, and hand
//! files and links to the Finder and the browser. Nothing here runs unless the designer presses
//! the button for it.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};

/// Apps launched from the Finder get a bare PATH; ask the login shell for the real one once.
fn login_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let out = Command::new(shell).args(["-lic", "printf '__PATH__%s' \"$PATH\""]).stderr(Stdio::null()).output();
        let found = out
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.rsplit("__PATH__").next().map(|p| p.trim().to_string()))
            .filter(|p| !p.is_empty());
        found.unwrap_or_else(|| "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin".into())
    })
}

fn cmd(program: &str) -> Command {
    let mut c = Command::new(program);
    c.env("PATH", login_path());
    c
}

fn run(mut c: Command) -> Result<String, String> {
    let out = c.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(err.trim().lines().last().unwrap_or("command failed").to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn safe_id(id: &str) -> Result<(), String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("bad id".into());
    }
    Ok(())
}

/// The renderer package next to this crate in the repo, when it's there (dev builds).
#[tauri::command]
pub fn renderer_default_dir() -> Option<String> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../packages/renderer");
    dir.join("render.ts").exists().then(|| dir.canonicalize().ok()).flatten().map(|p| p.to_string_lossy().into_owned())
}

#[derive(Clone, Serialize)]
struct Progress {
    id: String,
    line: String,
}

/// Writes the story's props and runs `node render.ts`, streaming its JSON progress lines as
/// `story-progress` events. Returns the final line.
#[tauri::command]
pub async fn story_render(app: AppHandle, id: String, props: String, renderer_dir: String) -> Result<String, String> {
    safe_id(&id)?;
    let dir = PathBuf::from(&renderer_dir);
    if !dir.join("render.ts").exists() {
        return Err(format!("No renderer at {renderer_dir}. Point Settings at packages/renderer in the Composer repo."));
    }
    let out = app.path().app_data_dir().map_err(|e| e.to_string())?.join("stories").join(&id);
    std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    let props_path = out.join("props.json");
    std::fs::write(&props_path, props).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut child = cmd("node")
            .current_dir(&dir)
            .arg("render.ts")
            .arg("--props")
            .arg(&props_path)
            .arg("--out")
            .arg(&out)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Couldn't start Node ({e}). Install Node 22.6 or later."))?;
        let mut last = String::new();
        if let Some(stdout) = child.stdout.take() {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if line.starts_with('{') {
                    let _ = app.emit("story-progress", Progress { id: id.clone(), line: line.clone() });
                    last = line;
                }
            }
        }
        let status = child.wait().map_err(|e| e.to_string())?;
        if !status.success() && !last.contains("\"error\"") {
            let mut err = String::new();
            if let Some(mut stderr) = child.stderr.take() {
                use std::io::Read;
                let _ = stderr.read_to_string(&mut err);
            }
            return Err(err.trim().lines().last().unwrap_or("render failed").to_string());
        }
        Ok(last)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Video files a reference can be read from.
const VIDEO_EXTENSIONS: [&str; 7] = ["mp4", "mov", "m4v", "webm", "mkv", "avi", "gif"];

/// Runs `node reference.ts` on a video the designer picked: ffmpeg finds its cuts and pulls a few
/// stills into the app's stories folder. Returns the script's JSON line.
#[tauri::command]
pub async fn reference_frames(app: AppHandle, video: String, renderer_dir: String) -> Result<String, String> {
    let dir = PathBuf::from(&renderer_dir);
    if !dir.join("reference.ts").exists() {
        return Err(format!("No reference reader at {renderer_dir}. Point Settings at packages/renderer in the Composer repo."));
    }
    let path = PathBuf::from(&video);
    let ext = path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default();
    if !path.is_file() || !VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        return Err("Pick a video file: MP4, MOV, M4V, WebM, MKV, AVI or GIF.".into());
    }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let out = app.path().app_data_dir().map_err(|e| e.to_string())?.join("stories").join(format!("ref-{stamp}"));
    std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut c = cmd("node");
        c.current_dir(&dir).arg("reference.ts").arg("--video").arg(&path).arg("--out").arg(&out);
        let output = c.output().map_err(|e| format!("Couldn't start Node ({e}). Install Node 22.6 or later."))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let last = stdout.lines().rev().find(|l| l.starts_with('{')).map(str::to_string);
        match last {
            Some(line) => Ok(line),
            None => {
                let err = String::from_utf8_lossy(&output.stderr);
                Err(err.trim().lines().last().unwrap_or("couldn't read the video").to_string())
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
pub struct PrFile {
    /// File name inside the PR's folder.
    name: String,
    /// Copy from this absolute path…
    from: Option<String>,
    /// …or write this text.
    content: Option<String>,
}

fn safe_branch(b: &str) -> bool {
    !b.is_empty() && !b.starts_with('-') && !b.contains("..") && b.chars().all(|c| c.is_ascii_alphanumeric() || "-_/.".contains(c))
}

/// Opens a PR without touching the designer's checkout: a temporary worktree off the default
/// branch gets the files, one commit, a push, and `gh pr create`. Returns the PR URL.
/// `{{raw:NAME}}` in the body becomes a link to that file on the new branch.
#[tauri::command]
pub async fn pr_open(repo: String, branch: String, folder: String, title: String, body: String, files: Vec<PrFile>) -> Result<String, String> {
    let repo = PathBuf::from(repo);
    if !repo.join(".git").exists() {
        return Err(format!("{} isn't a git repository.", repo.display()));
    }
    if !safe_branch(&branch) || !safe_branch(&folder) || folder.starts_with('/') {
        return Err("bad branch or folder name".into());
    }
    if files.iter().any(|f| f.name.contains('/') || f.name.starts_with('.') || f.name.is_empty()) {
        return Err("bad file name".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let git = |args: &[&str], dir: &Path| {
            let mut c = cmd("git");
            c.arg("-C").arg(dir).args(args);
            run(c)
        };
        git(&["fetch", "origin"], &repo)?;
        let base = git(&["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], &repo).or_else(|_| {
            let mut c = cmd("gh");
            c.current_dir(&repo).args(["repo", "view", "--json", "defaultBranchRef", "-q", ".defaultBranchRef.name"]);
            run(c).map(|b| format!("origin/{b}"))
        })?;
        let slug = {
            let mut c = cmd("gh");
            c.current_dir(&repo).args(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
            run(c)?
        };
        let tmp = std::env::temp_dir().join(format!("composer-pr-{}", branch.replace('/', "-")));
        let _ = git(&["worktree", "remove", "--force", &tmp.to_string_lossy()], &repo);
        git(&["worktree", "add", "-b", &branch, &tmp.to_string_lossy(), &base], &repo)?;
        let result = (|| {
            let dest = tmp.join(&folder);
            std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            for f in &files {
                let target = dest.join(&f.name);
                match (&f.from, &f.content) {
                    (Some(from), _) => std::fs::copy(from, &target).map(|_| ()).map_err(|e| e.to_string())?,
                    (None, Some(text)) => std::fs::write(&target, text).map_err(|e| e.to_string())?,
                    _ => return Err(format!("{} has no content", f.name)),
                }
            }
            git(&["add", &folder], &tmp)?;
            git(&["commit", "-m", &title], &tmp)?;
            git(&["push", "-u", "origin", &branch], &tmp)?;
            let mut body = body.clone();
            for f in &files {
                body = body.replace(&format!("{{{{raw:{}}}}}", f.name), &format!("https://github.com/{slug}/blob/{branch}/{folder}/{}?raw=true", f.name));
            }
            let mut c = cmd("gh");
            c.current_dir(&tmp).args(["pr", "create", "--title", &title, "--body", &body, "--head", &branch]);
            let out = run(c)?;
            Ok(out.lines().rev().find(|l| l.starts_with("https://")).unwrap_or(&out).to_string())
        })();
        let _ = git(&["worktree", "remove", "--force", &tmp.to_string_lossy()], &repo);
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Shows a file in the Finder.
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    let mut c = Command::new("open");
    c.arg("-R").arg(path);
    run(c).map(|_| ())
}

/// Opens a web link in the default browser.
/// The GitHub account `gh` is signed in as, for the Connectors list. Errors say what's missing.
#[tauri::command]
pub fn gh_status() -> Result<String, String> {
    let mut c = cmd("gh");
    c.args(["api", "user", "--jq", ".login"]);
    match run(c) {
        Ok(login) if !login.is_empty() => Ok(login),
        Ok(_) => Err("gh is installed but not signed in. Run gh auth login.".into()),
        Err(e) if e.contains("No such file") || e.contains("not found") => Err("The GitHub CLI (gh) isn't installed.".into()),
        Err(e) if e.contains("auth login") || e.contains("not logged") => Err("gh is installed but not signed in. Run gh auth login.".into()),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only web links".into());
    }
    let mut c = Command::new("open");
    c.arg(url);
    run(c).map(|_| ())
}

/// Reads a markdown or JSON file the designer chose to import (foundations). `~` is the home folder.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let expanded = match path.strip_prefix("~/") {
        Some(rest) => PathBuf::from(std::env::var("HOME").map_err(|e| e.to_string())?).join(rest),
        None => PathBuf::from(&path),
    };
    let ok = expanded.extension().and_then(|e| e.to_str()).is_some_and(|e| matches!(e, "md" | "json" | "txt"));
    if !ok {
        return Err("Only .md, .json and .txt files can be imported.".into());
    }
    let meta = std::fs::metadata(&expanded).map_err(|e| format!("{}: {e}", expanded.display()))?;
    if meta.len() > 2_000_000 {
        return Err("That file is over 2 MB.".into());
    }
    std::fs::read_to_string(&expanded).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct FolderFile {
    path: String,
    content: String,
}

/// Reads a skills folder the designer picked: its text files (md, txt, json, yaml), relative
/// paths, skipping hidden folders and node_modules. Capped so a stray pick can't load a disk.
#[tauri::command]
pub fn read_folder(path: String) -> Result<Vec<FolderFile>, String> {
    const MAX_FILES: usize = 400;
    const MAX_BYTES: u64 = 4_000_000;
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err("That isn't a folder.".into());
    }
    let mut out = Vec::new();
    let mut total = 0u64;
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        let entries = std::fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        for entry in entries.flatten() {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            let text = p.extension().and_then(|e| e.to_str()).is_some_and(|e| matches!(e.to_ascii_lowercase().as_str(), "md" | "markdown" | "txt" | "json" | "yaml" | "yml"));
            if !text {
                continue;
            }
            let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
            if out.len() >= MAX_FILES || total + len > MAX_BYTES {
                return Err("That folder holds more text than a skills folder should (400 files or 4 MB).".into());
            }
            total += len;
            let content = std::fs::read_to_string(&p).unwrap_or_default();
            let rel = p.strip_prefix(&root).map(|r| r.to_string_lossy().to_string()).unwrap_or(name);
            out.push(FolderFile { path: rel, content });
        }
    }
    Ok(out)
}
