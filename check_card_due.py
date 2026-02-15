#!/usr/bin/env python3
"""
Affiche la date de révision d'une carte et vérifie que le CRT est chargé.
Usage: uv run python check_card_due.py [card_id]
"""
import sys
from datetime import datetime

from src.anki_interface import Card, get_collection_crt


def main():
    if len(sys.argv) > 1:
        try:
            card_id = int(sys.argv[1])
        except ValueError:
            print("Usage: uv run python check_card_due.py [card_id]")
            sys.exit(1)
    else:
        card_id = 1721160391157  # default for quick test

    print("\n" + "=" * 60)
    print(f"Card ID: {card_id}")
    print("=" * 60)

    crt = get_collection_crt()
    if crt:
        print(f"Collection created: {datetime.fromtimestamp(crt).strftime('%Y-%m-%d %H:%M:%S')}")
    else:
        print("⚠️  CRT not found")

    print()

    card = Card(card_id, load_images=False)

    if not card.exists:
        print(f"❌ Card {card_id} not found")
        print("=" * 60 + "\n")
        sys.exit(1)

    print(f"Type: {card.type_label}")
    print(f"Due (raw): {card.due}")
    print(f"Interval: {card.interval} days")
    print(f"Ease: {card.factor_percent:.1f}%")
    if card.front:
        preview = card.front[:60] + "..." if len(card.front) > 60 else card.front
        print(f"Front: {preview}")

    print("\n" + "-" * 60)
    print("DUE DATE:")
    print("-" * 60)

    if card.type == 0:
        print("📘 NEW card - not yet studied")
    elif card.type == 2:
        if crt:
            due_date = card.get_due_date(crt)
            if due_date:
                print(f"📅 {due_date.strftime('%Y-%m-%d')}")
                days_diff = (due_date - datetime.now()).days
                if days_diff < 0:
                    print(f"   ⚠️  OVERDUE by {abs(days_diff)} days")
                elif days_diff == 0:
                    print("   ⏰ DUE TODAY")
                else:
                    print(f"   ⏳ Due in {days_diff} days")
        else:
            print(f"❌ Can't calculate (need CRT). Raw due = {card.due} days")
    elif card.type in [1, 3]:
        due_date = card.get_due_date()
        if due_date:
            print(f"📅 {due_date.strftime('%Y-%m-%d %H:%M:%S')}")
            time_diff = (due_date - datetime.now()).total_seconds()
            if time_diff < 0:
                print("   ⚠️  OVERDUE")
            elif time_diff < 3600:
                print(f"   ⏰ Due in {int(time_diff / 60)} minutes")
            else:
                print(f"   ⏳ Due in {int(time_diff / 3600)} hours")

    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
