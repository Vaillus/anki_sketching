"""
Synchronise l'état des cartes (type, queue, due_date) depuis Anki vers card_state.
"""
import sqlite3
from typing import Optional, Set, Union

from src.anki_interface import Card


def sync_anki_state(
    db_conn: sqlite3.Connection,
    crt: Optional[int],
    card_ids: Set[str],
) -> None:
    """
    Vide card_state puis la repeuple pour chaque card_id en interrogeant Anki.

    Args:
        db_conn: Connexion SQLite
        crt: Timestamp de création de la collection (pour les cartes Review)
        card_ids: Ensemble des card_ids du graphe (retourné par parse_json_to_db)
    """
    cursor = db_conn.cursor()
    # Supprimer uniquement les cartes non gérées localement
    cursor.execute("DELETE FROM card_state WHERE locally_managed = 0")

    for cid in card_ids:
        # Carte gérée localement → on ne touche pas
        row = cursor.execute(
            "SELECT locally_managed FROM card_state WHERE card_id = ?", (cid,)
        ).fetchone()
        if row and row[0]:
            continue

        card = Card(int(cid), load_images=False)
        if not card.exists:
            continue
        due_date = card.get_due_date(crt) if crt else card.get_due_date()
        due_date_str = due_date.isoformat() if due_date else None

        cursor.execute(
            """INSERT OR REPLACE INTO card_state
               (card_id, card_type, queue, due_date, raw_due,
                interval, ease_factor, locally_managed,
                is_blocking, is_blocked)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0)""",
            (
                cid,
                card.type,
                card.queue,
                due_date_str,
                card.due,
                card.interval,
                card.factor / 1000.0 if card.factor else 2.5,
            ),
        )
    db_conn.commit()


def sync_single_card(
    db_conn: sqlite3.Connection,
    crt: Optional[int],
    card_id: Union[int, str],
) -> int:
    """
    Met à jour l'état d'une seule carte dans card_state depuis Anki.
    Ne touche pas aux cartes gérées localement (locally_managed=1).
    Ne touche pas aux flags is_blocking/is_blocked
    (appeler compute_blocking_states ensuite pour les recalculer).

    Args:
        db_conn: Connexion SQLite
        crt: Timestamp de création de la collection (pour les cartes Review)
        card_id: ID de la carte à mettre à jour

    Returns:
        Nombre de lignes mises à jour (rowcount).
    """
    # Ne pas écraser les cartes gérées localement
    row = db_conn.execute(
        "SELECT locally_managed FROM card_state WHERE card_id = ?",
        (str(card_id),),
    ).fetchone()
    if row and row[0]:
        return 0

    card = Card(int(card_id), load_images=False)
    if not card.exists:
        return 0
    due_date = card.get_due_date(crt) if crt else card.get_due_date()
    due_date_str = due_date.isoformat() if due_date else None

    cursor = db_conn.execute(
        """UPDATE card_state
           SET card_type = ?, queue = ?, due_date = ?, raw_due = ?,
               interval = ?, ease_factor = ?
           WHERE card_id = ?""",
        (
            card.type,
            card.queue,
            due_date_str,
            card.due,
            card.interval,
            card.factor / 1000.0 if card.factor else 2.5,
            str(card_id),
        ),
    )
    db_conn.commit()
    return cursor.rowcount
