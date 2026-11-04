//! Prototypes Claude writes are plain files under the app's data directory, served to a sandboxed
//! iframe through the asset protocol. They never run inside Composer's own origin.

use serde::Deserialize;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Deserialize)]
pub struct ProtoFile {
    path: String,
    content: String,
}

fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = Path::new(rel);
    if rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("unsafe path in prototype: {}", rel.display()));
    }
    Ok(root.join(rel))
}

/// Writes a prototype's files and returns the absolute path of its index.html.
#[tauri::command]
pub fn prototype_write(app: AppHandle, id: String, files: Vec<ProtoFile>) -> Result<String, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("bad prototype id".into());
    }
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("prototypes").join(&id);
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    for f in &files {
        let target = safe_join(&root, &f.path)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&target, &f.content).map_err(|e| e.to_string())?;
    }
    Ok(root.join("index.html").to_string_lossy().into_owned())
}
