"""
Calcule is_blocking et is_blocked et met à jour card_state.
"""
import sqlite3
from datetime import date, datetime
from typing import Any, Dict, List, Optional


def _is_blocking_row(
    card_type: int,
    queue: int,
    due_date_str: Optional[str],
) -> bool:
    """Retourne True si la carte est bloquante selon type, queue et due_date."""
    if queue in (-3, -2, -1):
        return False
    if card_type == 0:
        return True  # new cards always block
    if card_type in (1, 2, 3):
        if due_date_str is None:
            return True  # due now
        try:
            dt = datetime.fromisoformat(due_date_str.replace("Z", "+00:00"))
            due_date = dt.date() if hasattr(dt, "date") else date(dt.year, dt.month, dt.day)
            return due_date <= date.today()
        except (ValueError, TypeError):
            return True
    return False


def _get_children(db_conn: sqlite3.Connection, parent_card_id: str) -> List[str]:
    """Retourne la liste des child_card_id pour ce parent."""
    cursor = db_conn.cursor()
    cursor.execute(
        "SELECT child_card_id FROM edges WHERE parent_card_id = ?",
        (parent_card_id,),
    )
    return [row[0] for row in cursor.fetchall()]


def _mark_descendants_blocked(db_conn: sqlite3.Connection, parent_card_id: str) -> None:
    """Met is_blocked=True pour tous les enfants de ce parent et leurs descendants (DFS)."""
    cursor = db_conn.cursor()
    for child_id in _get_children(db_conn, parent_card_id):
        cursor.execute(
            "UPDATE card_state SET is_blocked = 1 WHERE card_id = ?",
            (child_id,),
        )
        _mark_descendants_blocked(db_conn, child_id)


def compute_blocking_states(db_conn: sqlite3.Connection) -> None:
    """
    Phase 1 : calcule is_blocking pour chaque carte et met à jour la DB.
    Phase 2 : propage is_blocked depuis chaque carte blocking vers ses descendants.
    """
    cursor = db_conn.cursor()
    cursor.execute(
        "SELECT card_id, card_type, queue, due_date FROM card_state"
    )
    rows = cursor.fetchall()

    for card_id, card_type, queue, due_date in rows:
        is_blocking = 1 if _is_blocking_row(card_type, queue, due_date) else 0
        cursor.execute(
            "UPDATE card_state SET is_blocking = ? WHERE card_id = ?",
            (is_blocking, card_id),
        )

    cursor.execute("UPDATE card_state SET is_blocked = 0")

    for card_id, card_type, queue, due_date in rows:
        is_blocking = _is_blocking_row(card_type, queue, due_date)
        if is_blocking:
            _mark_descendants_blocked(db_conn, card_id)

    db_conn.commit()


def get_blocking_report(db_conn: sqlite3.Connection) -> Dict[str, Any]:
    """
    Retourne un rapport avec statistiques et listes des cartes blocking/blocked.
    """
    cursor = db_conn.cursor()
    cursor.execute(
        """SELECT card_id, card_type, queue, due_date, is_blocking, is_blocked
           FROM card_state ORDER BY card_id"""
    )
    rows = cursor.fetchall()
    columns = ["card_id", "card_type", "queue", "due_date", "is_blocking", "is_blocked"]
    blocking_list = []
    blocked_list = []
    for row in rows:
        rec = dict(zip(columns, row))
        if rec["is_blocking"]:
            blocking_list.append(rec)
        if rec["is_blocked"]:
            blocked_list.append(rec)

    return {
        "total_cards": len(rows),
        "blocking_count": len(blocking_list),
        "blocked_count": len(blocked_list),
        "blocking": blocking_list,
        "blocked": blocked_list,
    }
