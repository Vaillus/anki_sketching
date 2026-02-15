"""
Schéma SQLite pour le graphe de dépendances des cartes Anki.
"""
import sqlite3
from pathlib import Path
from typing import Union

_SCHEMA_SQL = """
-- État des cartes du graphe (données Anki + statuts blocking/blocked)
CREATE TABLE card_state (
    card_id TEXT PRIMARY KEY,
    card_type INTEGER NOT NULL,
    queue INTEGER NOT NULL,
    due_date TEXT,
    raw_due INTEGER,
    is_blocking BOOLEAN NOT NULL,
    is_blocked BOOLEAN NOT NULL
);

-- Relations parent → enfant (après expansion des groupes du JSON)
CREATE TABLE edges (
    parent_card_id TEXT NOT NULL,
    child_card_id TEXT NOT NULL,
    PRIMARY KEY (parent_card_id, child_card_id)
);
"""


def create_database(db_path: Union[Path, str]) -> sqlite3.Connection:
    """
    Crée ou réinitialise la base de données avec le schéma du graphe.

    Args:
        db_path: Chemin vers le fichier graph.db

    Returns:
        Connexion SQLite ouverte
    """
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(str(db_path))
    conn.executescript(_SCHEMA_SQL)
    conn.commit()
    return conn
