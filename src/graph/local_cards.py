"""
CRUD pour les cartes créées localement (pas dans Anki).
Tout est stocké dans la table unifiée cards (cards.db).
"""
import os
import uuid

from src.graph.cards_db import get_cards_db_conn
from src.utilities.paths import get_images_dir


def _generate_id() -> str:
    return f"local_{uuid.uuid4().hex[:8]}"


def create_local_card(
    front_text: str = "",
    back_text: str = "",
    image_filename: str | None = None,
) -> str:
    """Crée une carte locale. Retourne le card_id."""
    card_id = _generate_id()

    conn = get_cards_db_conn()
    try:
        conn.execute(
            """INSERT INTO cards
               (card_id, card_type, queue, locally_managed,
                is_blocking, is_blocked,
                front_text, back_text, image_filename,
                created_at)
               VALUES (?, 0, 0, 1, 0, 0, ?, ?, ?,
                       datetime('now', 'localtime'))""",
            (card_id, front_text, back_text, image_filename),
        )
        conn.commit()
    finally:
        conn.close()

    return card_id


def get_local_card(card_id: str) -> dict | None:
    conn = get_cards_db_conn()
    try:
        row = conn.execute(
            "SELECT card_id, front_text, back_text, image_filename, created_at FROM cards WHERE card_id = ?",
            (card_id,),
        ).fetchone()
        if row is None:
            return None
        return {
            "card_id": row[0],
            "front_text": row[1] or "",
            "back_text": row[2] or "",
            "image_filename": row[3],
            "created_at": row[4],
        }
    finally:
        conn.close()


def update_local_card(
    card_id: str,
    front_text: str | None = None,
    back_text: str | None = None,
    image_filename: str | None = ...,  # type: ignore[assignment]
) -> bool:
    """Met à jour les champs fournis. Retourne True si la carte existait."""
    conn = get_cards_db_conn()
    try:
        updates = []
        params: list = []
        if front_text is not None:
            updates.append("front_text = ?")
            params.append(front_text)
        if back_text is not None:
            updates.append("back_text = ?")
            params.append(back_text)
        if image_filename is not ...:
            updates.append("image_filename = ?")
            params.append(image_filename)
        if not updates:
            return True
        params.append(card_id)
        cursor = conn.execute(
            f"UPDATE cards SET {', '.join(updates)} WHERE card_id = ?",
            params,
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_local_card(card_id: str) -> bool:
    """Supprime la carte locale et son fichier image."""
    card = get_local_card(card_id)
    if card is None:
        return False

    if card["image_filename"]:
        img_path = get_images_dir() / card["image_filename"]
        if img_path.exists():
            os.remove(img_path)

    conn = get_cards_db_conn()
    try:
        conn.execute("DELETE FROM cards WHERE card_id = ?", (card_id,))
        conn.commit()
    finally:
        conn.close()

    return True


def get_local_cards_by_ids(card_ids: list[str]) -> list[dict]:
    if not card_ids:
        return []
    conn = get_cards_db_conn()
    try:
        placeholders = ",".join("?" for _ in card_ids)
        rows = conn.execute(
            f"SELECT card_id, front_text, back_text, image_filename, created_at FROM cards WHERE card_id IN ({placeholders})",
            card_ids,
        ).fetchall()
        return [
            {
                "card_id": r[0],
                "front_text": r[1] or "",
                "back_text": r[2] or "",
                "image_filename": r[3],
                "created_at": r[4],
            }
            for r in rows
        ]
    finally:
        conn.close()
