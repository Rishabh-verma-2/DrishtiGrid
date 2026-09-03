"""
Temporary file manager.
Each processing session gets its own subdirectory under TEMP_DIR.
Old sessions are cleaned up automatically.
"""

import logging
import os
import shutil
import time
from pathlib import Path

from app.config.settings import MODEL_CONFIG

logger = logging.getLogger(__name__)

TEMP_DIR = Path(MODEL_CONFIG["TEMP_DIR"])
RETENTION_SECONDS = MODEL_CONFIG["TEMP_RETENTION_SECONDS"]


class SessionTempDir:
    """Context manager that creates and optionally cleans up a session directory."""

    def __init__(self, session_id: str, auto_cleanup: bool = True):
        self.session_id = session_id
        self.path = TEMP_DIR / session_id
        self.auto_cleanup = auto_cleanup

    def __enter__(self) -> Path:
        self.path.mkdir(parents=True, exist_ok=True)
        return self.path

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.auto_cleanup:
            try:
                shutil.rmtree(self.path, ignore_errors=True)
            except Exception as e:
                logger.warning(f"Failed to clean up temp dir {self.path}: {e}")


def save_temp_image(image_bytes: bytes, session_dir: Path, filename: str) -> Path:
    """Save raw image bytes to a session temp directory."""
    dest = session_dir / filename
    dest.write_bytes(image_bytes)
    return dest


def cleanup_old_sessions(retention_seconds: int = RETENTION_SECONDS) -> int:
    """
    Delete session directories older than retention_seconds.
    Returns the number of directories removed.
    """
    if not TEMP_DIR.exists():
        return 0

    now = time.time()
    removed = 0
    for entry in TEMP_DIR.iterdir():
        if entry.is_dir():
            age = now - entry.stat().st_mtime
            if age > retention_seconds:
                try:
                    shutil.rmtree(entry, ignore_errors=True)
                    removed += 1
                except Exception as e:
                    logger.warning(f"Could not remove old session dir {entry}: {e}")
    if removed:
        logger.info(f"Cleaned up {removed} old temp session(s).")
    return removed
