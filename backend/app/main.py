from fastapi import FastAPI
from app.api import auth, portraits, assistant, spheres
from app.api.extras import game_router, diary_router, payments_router
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup ephemeris files path for pyswisseph
    import os
    import swisseph as swe

    eph_dir = os.path.join(os.path.dirname(__file__), "ephe")
    os.makedirs(eph_dir, exist_ok=True)
    swe.set_ephe_path(eph_dir)
    logger.info("PySwisseph ephemeris path configured.")

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
    return {"status": "healthy", "version": "v2.1"}

# Core routers
app.include_router(auth.router,       prefix="/api/auth",      tags=["auth"])
app.include_router(portraits.router,  prefix="/api/portraits", tags=["portraits"])
app.include_router(assistant.router,  prefix="/api/assistant", tags=["assistant"])
app.include_router(spheres.router,    prefix="/api/spheres",   tags=["spheres"])

# Feature routers (stubs — full impl in future sprints)
app.include_router(game_router,     prefix="/api/game",     tags=["game"])
app.include_router(diary_router,    prefix="/api/diary",    tags=["diary"])
app.include_router(payments_router, prefix="/api/payments", tags=["payments"])
