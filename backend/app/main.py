"""RefundShield API entry point.

    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from .guard import DemoGuard
from fastapi.middleware.cors import CORSMiddleware

from .api.investigation_routes import router as investigation_router
from .api.routes import router
from .config import SYNTHETIC_NOTICE

app = FastAPI(
    title="RefundShield",
    description=(
        "Investigation-prioritisation API for coordinated return abuse (CX0507). "
        + SYNTHETIC_NOTICE
    ),
    version="0.4.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("REFUNDSHIELD_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173").split(",") if o.strip() and o.strip() != "*"],
    allow_methods=["GET", "HEAD"],
    allow_headers=["*"],
)
app.add_middleware(DemoGuard)

@app.exception_handler(Exception)
async def unexpected_error(request, exc):
    return JSONResponse({"detail": "Synthetic analysis could not be completed"}, status_code=500)

app.include_router(router, prefix="/api")
app.include_router(investigation_router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "RefundShield", "docs": "/docs", "api": "/api",
            "notice": SYNTHETIC_NOTICE}
