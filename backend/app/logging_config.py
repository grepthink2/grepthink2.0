"""
Structured logging configuration for GrepThink 2.0 backend.

Outputs:
- Console (stderr): all levels from DEBUG up, for interactive development
- logs/app.out:      INFO and above (rotating, 10MB x 5 backups)
- logs/error.out:    WARNING and above (rotating, 5MB x 5 backups)

Usage (in any module):
    import logging
    logger = logging.getLogger(__name__)

    logger.debug("fine-grained state info")
    logger.info("normal operation info")
    logger.warning("something looks off")
    logger.error("operation failed", exc_info=True)

Environment variables (optional):
    LOG_LEVEL           Override root log level (default: DEBUG)
    LOG_DIR             Override log directory (default: backend/logs)
    LOG_CONSOLE_LEVEL   Override console handler level (default: DEBUG)
    LOG_FILE_LEVEL      Override app.out handler level (default: INFO)
"""
import logging
import logging.handlers
import os
from pathlib import Path


# Formatter used for all handlers: timestamp | level | module:line | message
_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def _resolve_log_dir() -> Path:
    """Return the directory where log files are written, creating it if needed."""
    env_dir = os.environ.get("LOG_DIR")
    if env_dir:
        log_dir = Path(env_dir)
    else:
        # backend/logs relative to this file (backend/app/logging_config.py)
        log_dir = Path(__file__).resolve().parent.parent / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir


def configure_logging() -> None:
    """
    Configure the root logger with console + rotating file handlers.
    Idempotent: safe to call multiple times (subsequent calls are no-ops).
    """
    root = logging.getLogger()

    # If handlers are already attached by a previous call, don't duplicate.
    if getattr(root, "_grepthink_configured", False):
        return

    root_level = os.environ.get("LOG_LEVEL", "DEBUG").upper()
    console_level = os.environ.get("LOG_CONSOLE_LEVEL", "DEBUG").upper()
    file_level = os.environ.get("LOG_FILE_LEVEL", "INFO").upper()

    root.setLevel(root_level)

    formatter = logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)

    # Console handler — everything visible in the terminal
    console_handler = logging.StreamHandler()
    console_handler.setLevel(console_level)
    console_handler.setFormatter(formatter)
    root.addHandler(console_handler)

    log_dir = _resolve_log_dir()

    # app.out — INFO and above, rotating
    app_handler = logging.handlers.RotatingFileHandler(
        log_dir / "app.out",
        maxBytes=10 * 1024 * 1024,  # 10 MB per file
        backupCount=5,
        encoding="utf-8",
    )
    app_handler.setLevel(file_level)
    app_handler.setFormatter(formatter)
    root.addHandler(app_handler)

    # error.out — WARNING and above only, for quick triage
    error_handler = logging.handlers.RotatingFileHandler(
        log_dir / "error.out",
        maxBytes=5 * 1024 * 1024,  # 5 MB per file
        backupCount=5,
        encoding="utf-8",
    )
    error_handler.setLevel(logging.WARNING)
    error_handler.setFormatter(formatter)
    root.addHandler(error_handler)

    # Tame noisy third-party loggers (uvicorn/supabase can flood DEBUG)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("hpack").setLevel(logging.WARNING)
    logging.getLogger("postgrest").setLevel(logging.INFO)

    root._grepthink_configured = True  # type: ignore[attr-defined]

    logging.getLogger(__name__).info(
        "Logging configured | root=%s console=%s file=%s | log_dir=%s",
        root_level, console_level, file_level, log_dir,
    )
