use std::fs::{File, OpenOptions};
use std::path::Path;

use anyhow::{Context, Result};
use fs2::FileExt;

/// Advisory file lock for coordinating concurrent access to shared state files.
///
/// Acquires an exclusive lock on `<path>.lock` (created alongside the target file).
/// The lock is held for the lifetime of the returned `FileLock` guard and released
/// automatically when dropped.
pub struct FileLock {
    _lock_file: File,
}

impl FileLock {
    /// Acquire an exclusive lock on the given path.
    ///
    /// Creates a `.lock` sidecar file and blocks until the lock is acquired.
    /// Returns a guard that releases the lock on drop.
    pub fn acquire(path: &Path) -> Result<Self> {
        let lock_path = path.with_extension(format!(
            "{}.lock",
            path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
        ));

        // Ensure parent directory exists
        if let Some(parent) = lock_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let lock_file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(&lock_path)
            .with_context(|| format!("failed to open lock file: {}", lock_path.display()))?;

        lock_file
            .lock_exclusive()
            .with_context(|| format!("failed to acquire lock on: {}", lock_path.display()))?;

        Ok(Self { _lock_file: lock_file })
    }
}

/// Acquire an exclusive lock, execute a closure, then release the lock.
///
/// This is a convenience wrapper around `FileLock:: acquire` for
/// read-modify-write operations on shared state files.
pub fn with_lock<F, R>(path: &Path, f: F) -> Result<R>
where
    F: FnOnce() -> Result<R>,
{
    let _lock = FileLock::acquire(path)?;
    f()
}
