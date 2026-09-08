from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import incidents, system
from app.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# `allow_origins=["*"]` together with `allow_credentials=True` is invalid per
# the CORS spec and rejected by browsers - it only appeared to work because
# nothing sent credentials. In dev the Vite proxy handles /api, so this list is
# a fallback for direct cross-origin calls.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router)
app.include_router(incidents.router)
