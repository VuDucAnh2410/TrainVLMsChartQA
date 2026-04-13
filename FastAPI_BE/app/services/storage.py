"""
Storage service for JSON database operations
"""
import json
from typing import Dict, Any
from app.core.config import DB_FILE


def read_db() -> Dict[str, Any]:
    """Read database from JSON file"""
    if not DB_FILE.exists():
        return {"conversations": {}, "predictLog": {}}
    
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"conversations": {}, "predictLog": {}}


def write_db(data: Dict[str, Any]) -> None:
    """Write database to JSON file"""
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_conversation(chat_id: str) -> Dict[str, Any]:
    """Get a single conversation by ID"""
    db = read_db()
    return db.get("conversations", {}).get(chat_id)


def save_conversation(chat_id: str, conversation: Dict[str, Any]) -> None:
    """Save or update a conversation"""
    db = read_db()
    db.setdefault("conversations", {})[chat_id] = conversation
    write_db(db)


def delete_conversation(chat_id: str) -> bool:
    """Delete a conversation and its predict log"""
    db = read_db()
    
    if chat_id not in db.get("conversations", {}):
        return False
    
    del db["conversations"][chat_id]
    
    if chat_id in db.get("predictLog", {}):
        del db["predictLog"][chat_id]
    
    write_db(db)
    return True


def get_all_conversations() -> list:
    """Get all conversations sorted by creation date"""
    db = read_db()
    items = [v["item"] for v in db.get("conversations", {}).values()]
    items.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    return items


def save_predict_log(chat_id: str, entry: Dict[str, Any]) -> None:
    """Save a prediction log entry"""
    db = read_db()
    db.setdefault("predictLog", {}).setdefault(chat_id, []).insert(0, entry)
    db["predictLog"][chat_id] = db["predictLog"][chat_id][:200]  # Keep last 200
    write_db(db)


def get_predict_log(chat_id: str) -> list:
    """Get prediction log for a conversation"""
    db = read_db()
    return db.get("predictLog", {}).get(chat_id, [])
