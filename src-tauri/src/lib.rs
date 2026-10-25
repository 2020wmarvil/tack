use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Reads a project file as UTF-8 text.
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Replaces a file safely: the new contents are written and flushed to a
/// temporary file in the same folder, which is then renamed over the target.
/// A crash mid-write leaves either the old file or the new one, never half.
#[tauri::command]
fn write_file_atomic(path: String, contents: String) -> Result<(), String> {
    write_atomic(Path::new(&path), contents.as_bytes()).map_err(|e| e.to_string())
}

/// Creates a new file, refusing to touch one that already exists.
#[tauri::command]
fn create_file(path: String, contents: String) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::AlreadyExists => "A file already exists at this location.".to_string(),
            _ => e.to_string(),
        })?;
    file.write_all(contents.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())
}

/// A cheap fingerprint of a file's size and modification time, used to notice
/// external edits. Returns an empty string when the file does not exist.
#[tauri::command]
fn file_stamp(path: String) -> Result<String, String> {
    stamp(Path::new(&path)).map_err(|e| e.to_string())
}

fn stamp(path: &Path) -> std::io::Result<String> {
    match fs::metadata(path) {
        Ok(meta) => {
            let modified = meta
                .modified()?
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            Ok(format!("{}:{}", meta.len(), modified))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e),
    }
}

fn temp_path(path: &Path) -> PathBuf {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    path.with_file_name(format!(".{}.tack-{}.tmp", name, std::process::id()))
}

fn write_atomic(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let temp = temp_path(path);
    let result = (|| {
        let mut file = File::create(&temp)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);
        if let Ok(meta) = fs::metadata(path) {
            fs::set_permissions(&temp, meta.permissions())?;
        }
        // On Windows this replaces the existing file as well.
        fs::rename(&temp, path)?;
        #[cfg(unix)]
        if let Some(dir) = path.parent() {
            File::open(dir)?.sync_all()?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_file, write_file_atomic, create_file, file_stamp])
        .run(tauri::generate_context!())
        .expect("error while running Tack");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tack-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn atomic_write_creates_and_replaces() {
        let dir = scratch("replace");
        let file = dir.join("project.md");
        write_atomic(&file, b"# One\n").unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "# One\n");
        write_atomic(&file, b"# Two\n").unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "# Two\n");
        let leftovers: Vec<_> = fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(leftovers, vec![std::ffi::OsString::from("project.md")]);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn atomic_write_failure_leaves_original() {
        let dir = scratch("failure");
        let file = dir.join("project.md");
        fs::write(&file, "# Original\n").unwrap();
        // A directory in the way of the temp file makes the write fail.
        fs::create_dir(temp_path(&file)).unwrap();
        assert!(write_atomic(&file, b"# New\n").is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "# Original\n");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn stamp_changes_with_contents_and_is_empty_when_missing() {
        let dir = scratch("stamp");
        let file = dir.join("project.md");
        assert_eq!(stamp(&file).unwrap(), "");
        fs::write(&file, "a").unwrap();
        let first = stamp(&file).unwrap();
        fs::write(&file, "ab").unwrap();
        assert_ne!(stamp(&file).unwrap(), first);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn create_file_refuses_existing() {
        let dir = scratch("create");
        let file = dir.join("project.md").to_string_lossy().into_owned();
        create_file(file.clone(), "# A\n".into()).unwrap();
        assert!(create_file(file.clone(), "# B\n".into()).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "# A\n");
        fs::remove_dir_all(dir).unwrap();
    }
}
