"""
Parse card_positions.json et peuple la table edges en explosant les groupes.
"""
import json
import sqlite3
from pathlib import Path
from typing import Set, Union


def parse_json_to_db(
    json_path: Union[Path, str],
    db_conn: sqlite3.Connection,
) -> Set[str]:
    """
    Lit le JSON du graphe, insère les edges (après expansion des groupes)
    et retourne l'ensemble des card_ids du graphe.

    Args:
        json_path: Chemin vers card_positions.json
        db_conn: Connexion SQLite (table edges doit exister)

    Returns:
        Set de tous les card_ids (clés de cards + membres des groups)
    """
    json_path = Path(json_path)
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    cards_data = data.get("cards", {})
    groups_data = data.get("groups", {})
    arrows = data.get("arrows", [])

    card_ids: Set[str] = set(cards_data.keys())
    for group in groups_data.values():
        for cid in group.get("cards", []):
            card_ids.add(cid)

    group_to_cards: dict = {}
    for gid, g in groups_data.items():
        group_to_cards[gid] = g.get("cards", [])

    def expand_node(node_id: str) -> list:
        if node_id in group_to_cards:
            return list(group_to_cards[node_id])
        return [node_id]

    cursor = db_conn.cursor()
    cursor.execute("DELETE FROM edges")
    for arrow in arrows:
        from_id = arrow.get("from")
        to_id = arrow.get("to")
        if not from_id or not to_id:
            continue
        parent_ids = expand_node(from_id)
        child_ids = expand_node(to_id)
        for pid in parent_ids:
            for cid in child_ids:
                cursor.execute(
                    "INSERT OR IGNORE INTO edges (parent_card_id, child_card_id) VALUES (?, ?)",
                    (pid, cid),
                )
    db_conn.commit()
    return card_ids
