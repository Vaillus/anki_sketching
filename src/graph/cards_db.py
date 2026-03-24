"""
Base de données unifiée pour les cartes (cards.db).
Fusionne card_state, card_info et local_card_content en une seule table.
"""
import json
import sqlite3
from pathlib import Path

from src.utilities.paths import get_data_dir

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS cards (
    card_id TEXT PRIMARY KEY,
    card_type INTEGER NOT NULL DEFAULT 0,
    queue INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    raw_due INTEGER,
    interval INTEGER NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    locally_managed BOOLEAN NOT NULL DEFAULT 0,
    texts_json TEXT,
    image_filenames_json TEXT,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    is_blocking BOOLEAN NOT NULL DEFAULT 0,
    is_blocked BOOLEAN NOT NULL DEFAULT 0,
    topo_depth INTEGER NOT NULL DEFAULT 0,
    min_interval INTEGER,
    created_at TEXT
);
"""


def get_cards_db_path() -> Path:
    return get_data_dir() / "cards.db"


def get_cards_db_conn() -> sqlite3.Connection:
    """Ouvre la connexion et crée la table si besoin."""
    db_path = get_cards_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.executescript(_SCHEMA_SQL)
    return conn


def migrate_cards_db(conn: sqlite3.Connection) -> None:
    """Ajoute les colonnes manquantes à cards et migre les données (idempotent)."""
    cursor = conn.execute("PRAGMA table_info(cards)")
    existing = {row[1] for row in cursor.fetchall()}

    add_migrations = [
        ("min_interval", "INTEGER"),
        ("front_text", "TEXT"),
        ("back_text", "TEXT"),
        ("image_filename", "TEXT"),
        ("created_at", "TEXT"),
        ("topo_depth", "INTEGER NOT NULL DEFAULT 0"),
    ]
    for col_name, col_def in add_migrations:
        if col_name not in existing:
            conn.execute(f"ALTER TABLE cards ADD COLUMN {col_name} {col_def}")
    conn.commit()

    # Migrate local cards: populate texts_json/image_filenames_json from scalar columns
    rows = conn.execute(
        "SELECT card_id, front_text, back_text, image_filename FROM cards "
        "WHERE texts_json IS NULL AND (front_text IS NOT NULL OR back_text IS NOT NULL)"
    ).fetchall()
    for card_id, front_text, back_text, image_filename in rows:
        texts = {}
        if front_text:
            texts["Front"] = front_text
        if back_text:
            texts["Back"] = back_text
        images = [image_filename] if image_filename else []
        conn.execute(
            "UPDATE cards SET texts_json = ?, image_filenames_json = ? WHERE card_id = ?",
            (json.dumps(texts), json.dumps(images), card_id),
        )
    if rows:
        conn.commit()
        print(f"  Migrated {len(rows)} local cards to JSON columns")

    # Drop deprecated scalar columns (SQLite 3.35+)
    existing = {row[1] for row in conn.execute("PRAGMA table_info(cards)").fetchall()}
    for col in ("front_text", "back_text", "image_filename"):
        if col in existing:
            conn.execute(f"ALTER TABLE cards DROP COLUMN {col}")
    conn.commit()


def migrate_from_legacy() -> None:
    """Migration one-shot depuis les anciennes DBs (card_info.db + graph.db card_state) vers cards.db.

    Si card_info.db n'existe pas, on considère la migration déjà faite ou fresh install.
    """
    data_dir = get_data_dir()
    card_info_path = data_dir / "card_info.db"
    graph_path = data_dir / "graph.db"

    if not card_info_path.exists():
        return

    print("Migrating legacy DBs to cards.db...")
    cards_conn = get_cards_db_conn()
    migrate_cards_db(cards_conn)

    try:
        # 1. Copier card_state depuis graph.db
        if graph_path.exists():
            graph_conn = sqlite3.connect(str(graph_path))
            try:
                # Vérifier que card_state existe
                table_check = graph_conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='card_state'"
                ).fetchone()
                if table_check:
                    rows = graph_conn.execute("""
                        SELECT card_id, card_type, queue, due_date, raw_due, interval,
                               ease_factor, locally_managed, texts_json, image_filenames_json,
                               reps, lapses, is_blocking, is_blocked
                        FROM card_state
                    """).fetchall()
                    for row in rows:
                        cards_conn.execute("""
                            INSERT OR IGNORE INTO cards
                                (card_id, card_type, queue, due_date, raw_due, interval,
                                 ease_factor, locally_managed, texts_json, image_filenames_json,
                                 reps, lapses, is_blocking, is_blocked)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, row)
                    cards_conn.commit()
                    print(f"  Migrated {len(rows)} cards from graph.db card_state")
            finally:
                graph_conn.close()

        # 2. Merger card_info.min_interval
        info_conn = sqlite3.connect(str(card_info_path))
        try:
            # card_info table
            table_check = info_conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='card_info'"
            ).fetchone()
            if table_check:
                rows = info_conn.execute("SELECT card_id, min_interval FROM card_info").fetchall()
                for card_id, min_interval in rows:
                    if min_interval is not None:
                        cards_conn.execute(
                            "UPDATE cards SET min_interval = ? WHERE card_id = ?",
                            (min_interval, card_id),
                        )
                cards_conn.commit()
                print(f"  Merged {len(rows)} card_info entries")

            # 3. Merger local_card_content
            table_check = info_conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='local_card_content'"
            ).fetchone()
            if table_check:
                rows = info_conn.execute(
                    "SELECT card_id, front_text, back_text, image_filename, created_at FROM local_card_content"
                ).fetchall()
                for card_id, front_text, back_text, image_filename, created_at in rows:
                    # Build JSON columns from scalar values
                    texts = {}
                    if front_text:
                        texts["Front"] = front_text
                    if back_text:
                        texts["Back"] = back_text
                    images = [image_filename] if image_filename else []
                    # Ensure the card exists in cards table (may not have been in card_state)
                    cards_conn.execute("""
                        INSERT OR IGNORE INTO cards
                            (card_id, card_type, queue, locally_managed, is_blocking, is_blocked)
                        VALUES (?, 0, 0, 1, 0, 0)
                    """, (card_id,))
                    cards_conn.execute("""
                        UPDATE cards SET front_text=?, back_text=?, image_filename=?,
                                         texts_json=?, image_filenames_json=?, created_at=?
                        WHERE card_id=?
                    """, (front_text, back_text, image_filename,
                          json.dumps(texts), json.dumps(images), created_at, card_id))
                cards_conn.commit()
                print(f"  Merged {len(rows)} local_card_content entries")
        finally:
            info_conn.close()

        # 4. Renommer card_info.db en .bak
        bak_path = card_info_path.with_suffix(".db.bak")
        card_info_path.rename(bak_path)
        print("  Renamed card_info.db → card_info.db.bak")
        print("Legacy migration complete.")
    finally:
        cards_conn.close()
