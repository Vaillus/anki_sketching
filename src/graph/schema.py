"""
Schéma SQLite pour le graphe de dépendances (graph.db).
Ne contient que les edges et la config — les données cartes sont dans cards.db.
"""
import sqlite3
from pathlib import Path
from typing import Union

_SCHEMA_SQL = """
-- Relations parent → enfant (après expansion des groupes du JSON)
CREATE TABLE edges (
    parent_card_id TEXT NOT NULL,
    child_card_id TEXT NOT NULL,
    PRIMARY KEY (parent_card_id, child_card_id)
);

-- Configuration clé-valeur (ex: crt)
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


def migrate_db(conn: sqlite3.Connection) -> None:
    """S'assure que la table config existe (idempotent)."""
    conn.execute("CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)")
    conn.commit()


def get_config(conn: sqlite3.Connection, key: str) -> str | None:
    """Lit une valeur de la table config."""
    row = conn.execute("SELECT value FROM config WHERE key = ?", (key,)).fetchone()
    return row[0] if row else None


def set_config(conn: sqlite3.Connection, key: str, value: str) -> None:
    """Écrit une valeur dans la table config (upsert)."""
    conn.execute(
        "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
        (key, value, value),
    )
    conn.commit()


def create_database(db_path: Union[Path, str]) -> sqlite3.Connection:
    """
    Crée ou réinitialise la base de données avec le schéma du graphe.
    Ne contient que edges + config (pas de données cartes).
    """
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(str(db_path))
    conn.executescript(_SCHEMA_SQL)
    conn.commit()
    return conn
