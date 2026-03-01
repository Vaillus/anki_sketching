"""
Moteur de révision SM-2 local.

Adapté de open-spaced-repetition/anki-sm-2 (AGPL-3.0).
Simplification : pas de learning steps en minutes — les nouvelles cartes
passent directement en Review après la première réponse.
"""

import random
from datetime import date, timedelta
from typing import Optional

# --- Paramètres du scheduler (défauts Anki) ---
GRADUATING_INTERVAL = 1
EASY_INTERVAL = 4
MINIMUM_INTERVAL = 1
MAXIMUM_INTERVAL = 36500
STARTING_EASE = 2.5
EASY_BONUS = 1.3
HARD_INTERVAL = 1.2
NEW_INTERVAL = 0.0  # multiplicateur interval après Again (0 = reset à minimum)
MIN_EASE = 1.3

# Ratings
AGAIN, HARD, GOOD, EASY = 1, 2, 3, 4


def _fuzz_interval(interval: int) -> int:
    """Applique un fuzz aléatoire pour éviter les clusters de révisions."""
    if interval < 2:
        return interval
    if interval == 2:
        return random.choice([2, 3])
    fuzz_range = max(1, round(interval * 0.05))
    return interval + random.randint(-fuzz_range, fuzz_range)


def _clamp_interval(interval: int) -> int:
    return max(MINIMUM_INTERVAL, min(MAXIMUM_INTERVAL, interval))


def review_card(
    card_type: int,
    interval: int,
    ease: float,
    rating: int,
    due_date: Optional[str] = None,
) -> dict:
    """Calcule le nouvel état SRS d'une carte après une review.

    Args:
        card_type: 0=New, 2=Review
        interval: intervalle actuel en jours
        ease: ease factor (float, ex: 2.5)
        rating: 1=Again, 2=Hard, 3=Good, 4=Easy
        due_date: date due ISO (YYYY-MM-DD), pour calculer l'overdue

    Returns:
        dict {card_type, interval, ease, due_date}
    """
    today = date.today()

    if card_type == 0:
        # Nouvelle carte → passe en Review
        new_ease = ease if ease else STARTING_EASE
        if rating == AGAIN:
            new_interval = MINIMUM_INTERVAL
            new_ease = STARTING_EASE - 0.20
        elif rating == HARD:
            new_interval = MINIMUM_INTERVAL
            new_ease = STARTING_EASE - 0.15
        elif rating == GOOD:
            new_interval = GRADUATING_INTERVAL
            new_ease = STARTING_EASE
        else:  # EASY
            new_interval = EASY_INTERVAL
            new_ease = STARTING_EASE

        new_interval = _clamp_interval(new_interval)
        new_due = (today + timedelta(days=new_interval)).isoformat()
        return {
            "card_type": 2,
            "interval": new_interval,
            "ease": max(MIN_EASE, new_ease),
            "due_date": new_due,
        }

    # Review card (type == 2)
    overdue = 0
    if due_date:
        try:
            due = date.fromisoformat(due_date)
            overdue = max(0, (today - due).days)
        except ValueError:
            pass

    if rating == AGAIN:
        new_interval = max(MINIMUM_INTERVAL, round(interval * NEW_INTERVAL))
        new_ease = max(MIN_EASE, ease - 0.20)
    elif rating == HARD:
        new_interval = round(interval * HARD_INTERVAL)
        new_ease = max(MIN_EASE, ease - 0.15)
    elif rating == GOOD:
        new_interval = round((interval + overdue / 2) * ease)
        new_ease = ease
    else:  # EASY
        new_interval = round((interval + overdue) * ease * EASY_BONUS)
        new_ease = ease + 0.15

    new_interval = _clamp_interval(_fuzz_interval(new_interval))
    new_due = (today + timedelta(days=new_interval)).isoformat()
    return {
        "card_type": 2,
        "interval": new_interval,
        "ease": max(MIN_EASE, new_ease),
        "due_date": new_due,
    }


def _format_interval(days: int) -> str:
    """Formate un intervalle en jours pour l'affichage."""
    if days < 30:
        return f"{days}j"
    if days < 365:
        months = round(days / 30, 1)
        return f"{months}mo" if months != int(months) else f"{int(months)}mo"
    years = round(days / 365, 1)
    return f"{years}a" if years != int(years) else f"{int(years)}a"


def get_next_intervals(
    card_type: int,
    interval: int,
    ease: float,
    due_date: Optional[str] = None,
) -> list[str]:
    """Simule les 4 ratings et retourne les intervalles formatés pour l'UI.

    Returns:
        Liste de 4 strings [Again, Hard, Good, Easy]
    """
    results = []
    for rating in (AGAIN, HARD, GOOD, EASY):
        result = review_card(card_type, interval, ease, rating, due_date)
        results.append(_format_interval(result["interval"]))
    return results
