"""
Persistance des informations par carte (overrides utilisateur).
Stocké dans data/card_info.db, jamais touché par build_graph.py.
"""
import sqlite3
from pathlib import Path
from src.utilities.paths import get_data_dir


def get_card_info_db_path() -> Path:
    return get_data_dir() / "card_info.db"


def get_db_conn() -> sqlite3.Connection:
    """Ouvre la connexion et crée la table si besoin."""
    conn = sqlite3.connect(str(get_card_info_db_path()))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS card_info (
            card_id TEXT PRIMARY KEY,
            min_interval INTEGER
        )
    """)
    conn.commit()
    return conn


def get_card_info(card_id: str) -> dict:
    conn = get_db_conn()
    try:
        row = conn.execute(
            "SELECT min_interval FROM card_info WHERE card_id = ?", (str(card_id),)
        ).fetchone()
        if row is None:
            return {}
        return {"min_interval": row[0]}
    finally:
        conn.close()


def set_card_info(card_id: str, **fields) -> None:
    """Upsert des champs fournis. Passer None pour supprimer la valeur."""
    conn = get_db_conn()
    try:
        existing = conn.execute(
            "SELECT card_id FROM card_info WHERE card_id = ?", (str(card_id),)
        ).fetchone()

        if existing is None:
            conn.execute(
                "INSERT INTO card_info (card_id, min_interval) VALUES (?, ?)",
                (str(card_id), fields.get("min_interval"))
            )
        else:
            for col, val in fields.items():
                conn.execute(
                    f"UPDATE card_info SET {col} = ? WHERE card_id = ?",
                    (val, str(card_id))
                )
        conn.commit()
    finally:
        conn.close()


def get_all_card_info() -> dict:
    """Retourne {card_id: {min_interval: N, ...}} pour toutes les cartes ayant des données."""
    conn = get_db_conn()
    try:
        rows = conn.execute("SELECT card_id, min_interval FROM card_info").fetchall()
        result = {}
        for card_id, min_interval in rows:
            entry = {}
            if min_interval is not None:
                entry["min_interval"] = min_interval
            if entry:
                result[card_id] = entry
        return result
    finally:
        conn.close()
