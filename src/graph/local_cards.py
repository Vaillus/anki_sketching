"""
CRUD pour les cartes créées localement (pas dans Anki).
Tout est stocké dans la table unifiée cards (cards.db).
"""
import json
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
    tags: list[str] | None = None,
) -> str:
    """Crée une carte locale. Retourne le card_id."""
    card_id = _generate_id()

    texts = {}
    if front_text:
        texts["Front"] = front_text
    if back_text:
        texts["Back"] = back_text
    images = [image_filename] if image_filename else []
    tags_json = json.dumps(tags) if tags else None

    conn = get_cards_db_conn()
    try:
        conn.execute(
            """INSERT INTO cards
               (card_id, card_type, queue, locally_managed,
                is_blocking, is_blocked,
                texts_json, image_filenames_json, tags_json,
                created_at)
               VALUES (?, 0, 0, 1, 0, 0, ?, ?, ?,
                       datetime('now', 'localtime'))""",
            (card_id, json.dumps(texts), json.dumps(images), tags_json),
        )
        conn.commit()
    finally:
        conn.close()

    return card_id


def get_local_card(card_id: str) -> dict | None:
    conn = get_cards_db_conn()
    try:
        row = conn.execute(
            "SELECT card_id, texts_json, image_filenames_json, created_at, tags_json FROM cards WHERE card_id = ?",
            (card_id,),
        ).fetchone()
        if row is None:
            return None
        texts = json.loads(row[1]) if row[1] else {}
        images = json.loads(row[2]) if row[2] else []
        tags = json.loads(row[4]) if row[4] else []
        return {
            "card_id": row[0],
            "texts": texts,
            "images": images,
            "created_at": row[3],
            "tags": tags,
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
        # Read current values
        row = conn.execute(
            "SELECT texts_json, image_filenames_json FROM cards WHERE card_id = ?",
            (card_id,),
        ).fetchone()
        if row is None:
            return False

        texts = json.loads(row[0]) if row[0] else {}
        images = json.loads(row[1]) if row[1] else []

        if front_text is not None:
            texts["Front"] = front_text
        if back_text is not None:
            texts["Back"] = back_text
        if image_filename is not ...:
            images = [image_filename] if image_filename else []

        conn.execute(
            "UPDATE cards SET texts_json = ?, image_filenames_json = ? WHERE card_id = ?",
            (json.dumps(texts), json.dumps(images), card_id),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def delete_local_card(card_id: str) -> bool:
    """Supprime la carte locale et son fichier image."""
    card = get_local_card(card_id)
    if card is None:
        return False

    for filename in card["images"]:
        img_path = get_images_dir() / filename
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
            f"SELECT card_id, texts_json, image_filenames_json, created_at, tags_json FROM cards WHERE card_id IN ({placeholders})",
            card_ids,
        ).fetchall()
        return [
            {
                "card_id": r[0],
                "texts": json.loads(r[1]) if r[1] else {},
                "images": json.loads(r[2]) if r[2] else [],
                "created_at": r[3],
                "tags": json.loads(r[4]) if r[4] else [],
            }
            for r in rows
        ]
    finally:
        conn.close()
