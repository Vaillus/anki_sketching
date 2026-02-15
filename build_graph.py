#!/usr/bin/env python3
"""Construit la base de données du graphe et synchronise l'état Anki."""

from src.anki_interface import get_collection_crt
from src.graph.blocking import compute_blocking_states, get_blocking_report
from src.graph.parse_graph import parse_json_to_db
from src.graph.schema import create_database
from src.graph.sync_card_state import sync_anki_state
from src.utilities.paths import get_data_dir


def main() -> None:
    db_path = get_data_dir() / "graph.db"
    json_path = get_data_dir() / "card_positions.json"

    conn = create_database(db_path)
    card_ids = parse_json_to_db(json_path, conn)
    crt = get_collection_crt()
    sync_anki_state(conn, crt, card_ids)
    compute_blocking_states(conn)
    report = get_blocking_report(conn)
    conn.close()

    print("Blocking report:")
    print(f"  Total cards: {report['total_cards']}")
    print(f"  Blocking: {report['blocking_count']}")
    print(f"  Blocked: {report['blocked_count']}")
    if report["blocking"]:
        print("  Blocking cards:", [r["card_id"] for r in report["blocking"]])
    if report["blocked"]:
        print("  Blocked cards:", [r["card_id"] for r in report["blocked"]])


if __name__ == "__main__":
    main()
