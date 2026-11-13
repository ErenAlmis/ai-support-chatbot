"""Lead storage: one JSON object per line in data/leads.jsonl."""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

LEADS_FILE = Path(__file__).resolve().parent.parent / "data" / "leads.jsonl"
_lock = threading.Lock()


def save_lead(name: str, contact: str, reason: str) -> dict:
    lead = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "name": name.strip()[:120],
        "contact": contact.strip()[:120],
        "reason": reason.strip()[:300],
    }
    LEADS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with _lock, LEADS_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(lead, ensure_ascii=False) + "\n")
    return lead


def list_leads() -> list[dict]:
    if not LEADS_FILE.exists():
        return []
    with LEADS_FILE.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]
