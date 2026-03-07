"""
Persistance des informations par carte (min_interval, etc.).
Lit/écrit dans la table unifiée cards (cards.db).
"""
from src.graph.cards_db import get_cards_db_conn


def get_card_info(card_id: str) -> dict:
    conn = get_cards_db_conn()
    try:
        row = conn.execute(
            "SELECT min_interval FROM cards WHERE card_id = ?", (str(card_id),)
        ).fetchone()
        if row is None or row[0] is None:
            return {}
        return {"min_interval": row[0]}
    finally:
        conn.close()


def set_card_info(card_id: str, **fields) -> None:
    """Upsert du min_interval. Passer None pour supprimer la valeur."""
    conn = get_cards_db_conn()
    try:
        existing = conn.execute(
            "SELECT card_id FROM cards WHERE card_id = ?", (str(card_id),)
        ).fetchone()

        if existing is None:
            conn.execute(
                "INSERT INTO cards (card_id, min_interval) VALUES (?, ?)",
                (str(card_id), fields.get("min_interval")),
            )
        else:
            for col, val in fields.items():
                if col == "min_interval":
                    conn.execute(
                        "UPDATE cards SET min_interval = ? WHERE card_id = ?",
                        (val, str(card_id)),
                    )
        conn.commit()
    finally:
        conn.close()


def get_all_card_info() -> dict:
    """Retourne {card_id: {min_interval: N}} pour toutes les cartes ayant un min_interval."""
    conn = get_cards_db_conn()
    try:
        rows = conn.execute(
            "SELECT card_id, min_interval FROM cards WHERE min_interval IS NOT NULL"
        ).fetchall()
        result = {}
        for card_id, min_interval in rows:
            result[card_id] = {"min_interval": min_interval}
        return result
    finally:
        conn.close()
