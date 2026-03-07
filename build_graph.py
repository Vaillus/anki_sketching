#!/usr/bin/env python3
"""Reconstruit les edges du graphe et recalcule le blocking."""


from src.graph.blocking import compute_blocking_states, get_blocking_report
from src.graph.cards_db import get_cards_db_conn
from src.graph.parse_graph import parse_json_to_db
from src.graph.schema import create_database
from src.utilities.paths import get_data_dir


def main() -> None:
    db_path = get_data_dir() / "graph.db"
    json_path = get_data_dir() / "card_positions.json"

    # Recréer graph.db (edges + config seulement)
    graph_conn = create_database(db_path)
    parse_json_to_db(json_path, graph_conn)

    # Recalculer le blocking dans cards.db
    cards_conn = get_cards_db_conn()
    try:
        compute_blocking_states(cards_conn, graph_conn)
        report = get_blocking_report(cards_conn)
    finally:
        cards_conn.close()
    graph_conn.close()

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
