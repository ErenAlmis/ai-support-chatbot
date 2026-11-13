"""FastAPI server: chat API (Server-Sent Events), embeddable widget, demo page, leads API."""

from __future__ import annotations

import json
import os
import secrets
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

load_dotenv()  # must run before importing bot, which reads env at import time

import anthropic  # noqa: E402
from fastapi import FastAPI, Header, HTTPException, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, StreamingResponse  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from . import bot  # noqa: E402
from .leads import list_leads  # noqa: E402

STATIC = Path(__file__).resolve().parent.parent / "static"
MAX_HISTORY = 20
RATE_LIMIT = int(os.getenv("RATE_LIMIT_PER_MINUTE", "20"))
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
# Caps total API spend on a public demo. 0 = unlimited.
DAILY_LIMIT = int(os.getenv("DAILY_MESSAGE_LIMIT", "0"))
DAILY_LIMIT_TEXT = (
    "This demo has reached its message limit for today. Please come back tomorrow! "
    "/ Bu demo bugünkü mesaj limitine ulaştı, lütfen yarın tekrar deneyin."
)

app = FastAPI(title="AI Support Chatbot")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)


_hits: dict[str, deque] = defaultdict(deque)


def _rate_limited(ip: str) -> bool:
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        return True
    q.append(now)
    return False


_daily = {"day": "", "count": 0}


def _daily_limit_reached() -> bool:
    if DAILY_LIMIT <= 0:
        return False
    today = time.strftime("%Y-%m-%d", time.gmtime())
    if _daily["day"] != today:
        _daily.update(day=today, count=0)
    if _daily["count"] >= DAILY_LIMIT:
        return True
    _daily["count"] += 1
    return False


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    if _rate_limited(ip):
        raise HTTPException(429, "Too many messages, please wait a minute.")

    history = [m.model_dump() for m in req.messages][-MAX_HISTORY:]
    while history and history[0]["role"] != "user":  # API requires a user turn first
        history.pop(0)
    if not history or history[-1]["role"] != "user":
        raise HTTPException(400, "The last message must come from the user.")

    if _daily_limit_reached():
        async def limited():
            yield _sse({"type": "text", "text": DAILY_LIMIT_TEXT})
            yield _sse({"type": "done"})
        return StreamingResponse(limited(), media_type="text/event-stream")

    async def events():
        try:
            async for chunk in bot.stream_reply(history):
                yield _sse({"type": "text", "text": chunk})
            yield _sse({"type": "done"})
        except anthropic.AuthenticationError:
            yield _sse({"type": "error", "message": "Server is missing a valid API key."})
        except anthropic.RateLimitError:
            yield _sse({"type": "error", "message": "We're busy right now, please try again shortly."})
        except anthropic.APIError:
            yield _sse({"type": "error", "message": "Something went wrong, please try again."})

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/leads")
async def leads(x_admin_token: str = Header(default="")):
    if not ADMIN_TOKEN or not secrets.compare_digest(x_admin_token, ADMIN_TOKEN):
        raise HTTPException(401, "Unauthorized")
    return list_leads()


@app.get("/api/health")
async def health():
    return {"ok": True, "demo_mode": bot.DEMO_MODE, "model": bot.MODEL}


@app.get("/widget.js")
async def widget():
    return FileResponse(STATIC / "widget.js", media_type="application/javascript")


@app.get("/")
async def demo_page():
    return FileResponse(STATIC / "demo.html")
