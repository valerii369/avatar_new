from fastapi import FastAPI
from app.api import auth, portraits, assistant, assistant_v2
from app.api.extras import game_router, diary_router, payments_router
from app.api.recommendations import router as recommendations_router
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import sys

class OnboardingTimingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return "[TIMING] onboarding." in msg

class LlmTraceFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return "[LLM_TRACE]" in msg

class RagTraceFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return "[RAG_TRACE]" in msg


def setup_logging() -> None:
    root = logging.getLogger()
    if getattr(root, "_avatar_logging_configured", False):
        return

    root.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    root.addHandler(stream_handler)

    log_dir = Path(__file__).resolve().parents[1] / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    backend_log = RotatingFileHandler(
        log_dir / "backend.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    backend_log.setFormatter(formatter)
    root.addHandler(backend_log)

    timing_log = RotatingFileHandler(
        log_dir / "onboarding_timing.log",
        maxBytes=2 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    timing_log.setFormatter(formatter)
    timing_log.addFilter(OnboardingTimingFilter())
    root.addHandler(timing_log)

    llm_trace_log = RotatingFileHandler(
        log_dir / "llm_trace.log",
        maxBytes=20 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    llm_trace_log.setFormatter(formatter)
    llm_trace_log.addFilter(LlmTraceFilter())
    root.addHandler(llm_trace_log)

    rag_trace_log = RotatingFileHandler(
        log_dir / "rag_trace.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    rag_trace_log.setFormatter(formatter)
    rag_trace_log.addFilter(RagTraceFilter())
    root.addHandler(rag_trace_log)

    root._avatar_logging_configured = True  # type: ignore[attr-defined]


setup_logging()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup ephemeris files path for pyswisseph
    import os
    import swisseph as swe

    eph_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ephe")
    os.makedirs(eph_dir, exist_ok=True)
    swe.set_ephe_path(eph_dir)
    # Verify files exist
    se1_files = [f for f in os.listdir(eph_dir) if f.endswith(".se1")]
    logger.info(f"PySwisseph ephe path: {eph_dir} ({len(se1_files)} .se1 files: {se1_files})")

    yield

    logger.info("Shutting down Application...")

app = FastAPI(
    title="AVATAR v2.0 DSB Backend",
    version="2.1",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For active development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    import os
    import swisseph as swe
    eph_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ephe")
    se1_files = [f for f in os.listdir(eph_dir) if f.endswith(".se1")] if os.path.isdir(eph_dir) else []
    from app.core.config import settings as _s
    return {
        "status": "healthy", "version": "v2.1",
        "ephe_path": eph_dir,
        "ephe_files": len(se1_files),
        "model_heavy": _s.MODEL_HEAVY,
        "model_light": _s.MODEL_LIGHT,
    }

# Core routers
app.include_router(auth.router,       prefix="/api/auth",      tags=["auth"])
app.include_router(portraits.router,  prefix="/api/portraits", tags=["portraits"])
app.include_router(assistant.router,  prefix="/api/assistant", tags=["assistant"])
app.include_router(assistant_v2.router, prefix="/api/assistant-v2", tags=["assistant-v2"])

# Feature routers (stubs — full impl in future sprints)
app.include_router(game_router,     prefix="/api/game",     tags=["game"])
app.include_router(diary_router,    prefix="/api/diary",    tags=["diary"])
app.include_router(payments_router, prefix="/api/payments", tags=["payments"])
app.include_router(recommendations_router)
