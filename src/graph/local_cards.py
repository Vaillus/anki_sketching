"""
CRUD pour les cartes créées localement (pas dans Anki).
Contenu dans card_info.db (table local_card_content),
scheduling dans graph.db (table card_state).
"""
import os
import sqlite3
import uuid

from src.graph.card_info import get_db_conn as get_card_info_conn
from src.utilities.paths import get_data_dir, get_images_dir


def _get_graph_conn() -> sqlite3.Connection:
    db_path = get_data_dir() / "graph.db"
    return sqlite3.connect(str(db_path))


def _generate_id() -> str:
    return f"local_{uuid.uuid4().hex[:8]}"


def create_local_card(
    front_text: str = "",
    back_text: str = "",
    image_filename: str | None = None,
) -> str:
    """Crée une carte locale. Retourne le card_id."""
    card_id = _generate_id()

    # Contenu dans card_info.db
    conn = get_card_info_conn()
    try:
        conn.execute(
            "INSERT INTO local_card_content (card_id, front_text, back_text, image_filename) VALUES (?, ?, ?, ?)",
            (card_id, front_text, back_text, image_filename),
        )
        conn.commit()
    finally:
        conn.close()

    # Scheduling dans graph.db
    graph_path = get_data_dir() / "graph.db"
    if graph_path.exists():
        gconn = sqlite3.connect(str(graph_path))
        try:
            gconn.execute(
                """INSERT OR IGNORE INTO card_state
                   (card_id, card_type, queue, due_date, raw_due, interval, ease_factor,
                    locally_managed, is_blocking, is_blocked)
                   VALUES (?, 0, 0, NULL, NULL, 0, 2.5, 1, 0, 0)""",
                (card_id,),
            )
            gconn.commit()
        finally:
            gconn.close()

    return card_id


def get_local_card(card_id: str) -> dict | None:
    conn = get_card_info_conn()
    try:
        row = conn.execute(
            "SELECT card_id, front_text, back_text, image_filename, created_at FROM local_card_content WHERE card_id = ?",
            (card_id,),
        ).fetchone()
        if row is None:
            return None
        return {
            "card_id": row[0],
            "front_text": row[1],
            "back_text": row[2],
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
    conn = get_card_info_conn()
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
            f"UPDATE local_card_content SET {', '.join(updates)} WHERE card_id = ?",
            params,
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_local_card(card_id: str) -> bool:
    """Supprime la carte locale (contenu + card_state + fichier image)."""
    # Récupère le nom de fichier image avant suppression
    card = get_local_card(card_id)
    if card is None:
        return False

    # Supprime le fichier image
    if card["image_filename"]:
        img_path = get_images_dir() / card["image_filename"]
        if img_path.exists():
            os.remove(img_path)

    # Supprime de local_card_content
    conn = get_card_info_conn()
    try:
        conn.execute("DELETE FROM local_card_content WHERE card_id = ?", (card_id,))
        conn.commit()
    finally:
        conn.close()

    # Supprime de card_state
    graph_path = get_data_dir() / "graph.db"
    if graph_path.exists():
        gconn = sqlite3.connect(str(graph_path))
        try:
            gconn.execute("DELETE FROM card_state WHERE card_id = ?", (card_id,))
            gconn.commit()
        finally:
            gconn.close()

    return True


def get_local_cards_by_ids(card_ids: list[str]) -> list[dict]:
    if not card_ids:
        return []
    conn = get_card_info_conn()
    try:
        placeholders = ",".join("?" for _ in card_ids)
        rows = conn.execute(
            f"SELECT card_id, front_text, back_text, image_filename, created_at FROM local_card_content WHERE card_id IN ({placeholders})",
            card_ids,
        ).fetchall()
        return [
            {
                "card_id": r[0],
                "front_text": r[1],
                "back_text": r[2],
                "image_filename": r[3],
                "created_at": r[4],
            }
            for r in rows
        ]
    finally:
        conn.close()


def restore_local_cards_to_graph() -> int:
    """Re-crée les lignes card_state pour toutes les cartes locales.

    Utile si graph.db a été recréé depuis zéro.
    Retourne le nombre de cartes restaurées.
    """
    graph_path = get_data_dir() / "graph.db"
    if not graph_path.exists():
        return 0

    conn = get_card_info_conn()
    try:
        rows = conn.execute("SELECT card_id FROM local_card_content").fetchall()
    finally:
        conn.close()

    if not rows:
        return 0

    gconn = sqlite3.connect(str(graph_path))
    count = 0
    try:
        for (card_id,) in rows:
            cursor = gconn.execute(
                """INSERT OR IGNORE INTO card_state
                   (card_id, card_type, queue, due_date, raw_due, interval, ease_factor,
                    locally_managed, is_blocking, is_blocked)
                   VALUES (?, 0, 0, NULL, NULL, 0, 2.5, 1, 0, 0)""",
                (card_id,),
            )
            count += cursor.rowcount
        gconn.commit()
    finally:
        gconn.close()

    return count
