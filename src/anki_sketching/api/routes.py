"""
Routes API pour Anki Sketching.
Gère toutes les routes API qui retournent du JSON.
"""
from fastapi import APIRouter, Request, Form, HTTPException
from fastapi.responses import JSONResponse
import json
import os
import sqlite3
from datetime import date, datetime, timedelta

from src.anki_interface import Card, get_collection_crt, find_all_profiles, anki_request
from src.anki_interface.get_cards_ids import get_cards_ids
from src.utilities.paths import get_positions_file, get_images_dir, get_data_dir, ensure_dir_exists
from src.graph.sync_card_state import sync_single_card
from src.graph.blocking import compute_blocking_states
from src.graph.parse_graph import parse_json_to_db
from src.graph.card_info import get_card_info, set_card_info, get_all_card_info
from src.graph.srs import review_card as srs_review, get_next_intervals


# Crée le router
router = APIRouter()

# Cache pour le crt (évite de lire la DB à chaque requête)
_cached_crt = None


def get_crt():
    """Récupère le crt de la collection (avec cache)."""
    global _cached_crt
    if _cached_crt is None:
        _cached_crt = get_collection_crt()
        if _cached_crt is not None:
            print(f"Collection crt loaded: {_cached_crt} ({datetime.fromtimestamp(_cached_crt)})")
    return _cached_crt


def _rebuild_edges_and_blocking() -> bool:
    """Met à jour les edges depuis le JSON et recalcule le blocking.

    N'appelle pas Anki — utile après une sauvegarde de canvas.
    Retourne False silencieusement si le DB ou le fichier JSON n'existe pas.
    """
    try:
        db_path = get_data_dir() / "graph.db"
        if not db_path.exists():
            return False
        positions_file = get_positions_file()
        if not positions_file.exists():
            return False
        conn = sqlite3.connect(str(db_path))
        try:
            parse_json_to_db(positions_file, conn)
            compute_blocking_states(conn)
        finally:
            conn.close()
        return True
    except Exception:
        return False


def _sync_and_recompute(conn, card_ids):
    """Synchronise l'état Anki d'une liste de cartes et recalcule le blocking."""
    crt = get_crt()
    for card_id in card_ids:
        sync_single_card(conn, crt, card_id)
    compute_blocking_states(conn)


@router.get("/anki_status")
async def anki_status():
    """Vérifie si Anki est connecté via AnkiConnect."""
    result = anki_request('deckNames')
    connected = result is not None
    return JSONResponse({"connected": connected})


@router.post("/save_positions")
async def save_positions(request: Request):
    """Sauvegarde les positions des cartes et recalcule le blocking."""
    try:
        positions_data = await request.json()
        positions_file = get_positions_file()
        with open(positions_file, 'w') as f:
            json.dump(positions_data, f, indent=2)
        _rebuild_edges_and_blocking()
        return JSONResponse({"success": True, "message": "Positions sauvegardées"})
    except Exception as e:
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=500
        )


@router.get("/load_positions")
async def load_positions():
    """Charge les positions sauvegardées des cartes."""
    try:
        positions_file = get_positions_file()
        if positions_file.exists():
            with open(positions_file, 'r') as f:
                positions_data = json.load(f)
            return JSONResponse({"success": True, "positions": positions_data})
        else:
            return JSONResponse({"success": True, "positions": {}})
    except Exception as e:
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=500
        )


@router.get("/collection_info")
async def get_collection_info():
    """Récupère les informations de la collection Anki."""
    try:
        crt = get_crt()
        profiles = find_all_profiles()
        
        info = {
            "success": True,
            "crt": crt,
            "crt_date": datetime.fromtimestamp(crt).isoformat() if crt else None,
            "profiles": [{"name": name, "path": path} for name, path in profiles]
        }
        
        return JSONResponse(info)
    except Exception as e:
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=500
        )


@router.post("/get_cards_by_ids")
async def get_cards_by_ids(request: Request):
    """Récupère les informations de cartes par leurs IDs avec planification."""
    try:
        data = await request.json()
        card_ids = data.get('card_ids', [])
        if not card_ids:
            return JSONResponse({"success": True, "cards": []})
        
        images_dir = get_images_dir()
        ensure_dir_exists(images_dir)
        
        # Récupérer le crt pour calculer les dates
        crt = get_crt()
        
        cards_data = []
        for card_id in card_ids:
            card = Card(int(card_id), load_images=True, image_output_dir=str(images_dir))
            
            if card.exists:
                # due : Review = jour relatif à crt, Learning/Relearning = timestamp Unix
                due_display = None
                if card.type == 2 and crt:  # Review : due = jours depuis crt
                    due_date = card.get_due_date(crt)
                    if due_date:
                        due_display = due_date.strftime('%Y-%m-%d')
                elif card.type in [1, 3]:  # Learning/Relearning : due = timestamp (0 = à réviser)
                    due_date = card.get_due_date()
                    if due_date:
                        due_display = due_date.strftime('%Y-%m-%d %H:%M')
                    else:
                        due_display = "À réviser"
                else:  # New card
                    due_display = "New"
                
                cards_data.append({
                    'card_id': card_id,
                    'texts': card.texts,
                    'images': [f'/static/images/{os.path.basename(img)}' for img in card.images],
                    'type': card.type,
                    'type_label': card.type_label,
                    'due': card.due,
                    'due_display': due_display,
                    'interval': card.interval,
                    'factor_percent': card.factor_percent,
                })
        
        return JSONResponse({"success": True, "cards": cards_data})
    except Exception as e:
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=500
        )


@router.post("/import_deck")
async def import_deck(deck_name: str = Form(...)):
    """Importe un paquet de cartes Anki avec leurs informations de planification."""
    if not deck_name:
        raise HTTPException(status_code=400, detail="Nom du paquet manquant.")

    card_ids = get_cards_ids(deck_name)
    if card_ids is None:
        raise HTTPException(
            status_code=500,
            detail="Impossible de récupérer les cartes. Vérifiez Anki et le nom du paquet."
        )

    images_dir = get_images_dir()
    ensure_dir_exists(images_dir)
    
    # Récupérer le crt pour calculer les dates de révision
    crt = get_crt()
    
    cards_data = []
    for card_id in card_ids:
        # Utiliser la classe Card pour avoir accès aux infos de planification
        card = Card(card_id, load_images=True, image_output_dir=str(images_dir))
        
        if card.exists:
            # due est piégeux : Review = jour relatif à crt, Learning/Relearning = timestamp Unix
            due_display = None
            if card.type == 2 and crt:  # Review : due = jours depuis crt
                due_date = card.get_due_date(crt)
                if due_date:
                    due_display = due_date.strftime('%Y-%m-%d')
            elif card.type in [1, 3]:  # Learning/Relearning : due = timestamp (0 = à réviser)
                due_date = card.get_due_date()
                if due_date:
                    due_display = due_date.strftime('%Y-%m-%d %H:%M')
                else:
                    due_display = "À réviser"
            else:  # New card
                due_display = "New"
            
            cards_data.append({
                "card_id": card_id,
                "texts": card.texts,
                "images": [f'/static/images/{os.path.basename(img)}' for img in card.images],
                "type": card.type,
                "type_label": card.type_label,
                "due": card.due,
                "due_display": due_display,
                "interval": card.interval,
                "factor_percent": card.factor_percent,
            })
            
    return JSONResponse(cards_data)


@router.get("/due_cards")
async def get_due_cards():
    """Retourne les cartes non bloquées à réviser aujourd'hui et les nouvelles non bloquées."""
    db_path = get_data_dir() / "graph.db"
    if not db_path.exists():
        return JSONResponse({"success": True, "cards": [], "total": 0})

    type_labels = {0: "New", 1: "Learning", 2: "Review", 3: "Relearning"}

    conn = sqlite3.connect(str(db_path))
    try:
        cursor = conn.execute("""
            SELECT card_id, card_type, due_date, interval, ease_factor
            FROM card_state
            WHERE is_blocked = 0
              AND queue >= 0
              AND (
                card_type = 0
                OR (due_date IS NULL AND card_type IN (1, 3))
                OR (due_date IS NOT NULL AND date(due_date) <= date('now', 'localtime'))
              )
            ORDER BY
              CASE
                WHEN due_date IS NULL AND card_type IN (1, 3) THEN 0
                WHEN due_date IS NOT NULL THEN 1
                ELSE 2
              END,
              due_date ASC
        """)
        rows = cursor.fetchall()
    finally:
        conn.close()

    if not rows:
        return JSONResponse({"success": True, "cards": [], "total": 0})

    cards_data = []
    for card_id, card_type, due_date, interval, ease_factor in rows:
        card = Card(int(card_id), load_images=False)
        if not card.exists:
            continue

        if card_type == 0:
            due_display = "New"
        elif due_date is None:
            due_display = "À réviser"
        else:
            due_display = due_date[:10]  # YYYY-MM-DD

        images_dir = get_images_dir()
        images = [
            f'/static/images/{fn}'
            for fn in card.image_filenames
            if (images_dir / fn).exists()
        ]

        next_reviews = get_next_intervals(
            card_type, interval or 0, ease_factor or 2.5, due_date
        )

        cards_data.append({
            "card_id": card_id,
            "texts": card.texts,
            "images": images,
            "type": card_type,
            "type_label": type_labels.get(card_type, "New"),
            "due_date": due_date,
            "due_display": due_display,
            "next_reviews": next_reviews,
            "interval": interval or 0,
            "factor_percent": (ease_factor or 2.5) * 100,
            "reps": card.reps,
            "lapses": card.lapses,
        })

    return JSONResponse({"success": True, "cards": cards_data, "total": len(cards_data)})


@router.post("/review_card")
async def review_card_endpoint(request: Request):
    """Soumet une réponse de révision via le moteur SM-2 local."""
    data = await request.json()
    card_id = data.get("card_id")
    rating = data.get("ease")  # 1=Again, 2=Hard, 3=Good, 4=Easy

    if card_id is None or rating is None:
        return JSONResponse({"success": False, "error": "card_id et ease sont requis"}, status_code=400)

    db_path = get_data_dir() / "graph.db"
    if not db_path.exists():
        return JSONResponse({"success": False, "error": "graph.db introuvable"}, status_code=500)

    conn = sqlite3.connect(str(db_path))
    try:
        row = conn.execute(
            "SELECT card_type, interval, ease_factor, due_date FROM card_state WHERE card_id = ?",
            (str(card_id),),
        ).fetchone()
        if not row:
            return JSONResponse({"success": False, "error": "Carte introuvable dans card_state"}, status_code=404)

        card_type, interval, ease, due_date = row
        result = srs_review(card_type, interval, ease or 2.5, int(rating), due_date)

        # Applique l'intervalle minimum si défini
        info = get_card_info(str(card_id))
        min_ivl = info.get("min_interval")
        if min_ivl and result["interval"] < min_ivl:
            result["interval"] = min_ivl
            result["due_date"] = (date.today() + timedelta(days=min_ivl)).isoformat()

        conn.execute(
            """UPDATE card_state
               SET card_type=?, queue=0, due_date=?, interval=?, ease_factor=?, locally_managed=1
               WHERE card_id=?""",
            (result["card_type"], result["due_date"], result["interval"], result["ease"], str(card_id)),
        )
        conn.commit()

        compute_blocking_states(conn)
    finally:
        conn.close()

    return JSONResponse({"success": True})


@router.post("/reschedule_card")
async def reschedule_card(request: Request):
    """Ramène une carte à aujourd'hui via setDueDate."""
    data = await request.json()
    card_id = data.get("card_id")
    if card_id is None:
        return JSONResponse({"success": False, "error": "card_id requis"}, status_code=400)

    anki_request("setDueDate", cards=[int(card_id)], days="0")

    db_path = get_data_dir() / "graph.db"
    if db_path.exists():
        conn = sqlite3.connect(str(db_path))
        try:
            _sync_and_recompute(conn, [card_id])
        finally:
            conn.close()

    return JSONResponse({"success": True})


@router.post("/reschedule_distant_cards")
async def reschedule_distant_cards():
    """Ramène à aujourd'hui toutes les cartes du canvas dues dans > 5 jours."""
    try:
        positions_file = get_positions_file()
        if not positions_file.exists():
            return JSONResponse({"success": True, "rescheduled": 0})
        with open(positions_file) as f:
            state = json.load(f)
        card_ids = [int(cid) for cid in state.get("cards", {}).keys()]
        if not card_ids:
            return JSONResponse({"success": True, "rescheduled": 0})

        cards_info = anki_request("cardsInfo", cards=card_ids)
        if not cards_info:
            return JSONResponse({"success": False, "error": "Impossible de contacter Anki"}, status_code=503)

        crt = get_crt()
        threshold = datetime.now() + timedelta(days=5)
        to_reschedule = []
        for card_data in cards_info:
            if card_data.get("type") != 2:
                continue
            if card_data.get("queue", 0) < 0:  # suspended/buried
                continue
            if crt is None:
                continue
            due_date = datetime.fromtimestamp(crt) + timedelta(days=card_data["due"])
            if due_date > threshold:
                to_reschedule.append(card_data["cardId"])

        if not to_reschedule:
            return JSONResponse({"success": True, "rescheduled": 0})

        anki_request("setDueDate", cards=to_reschedule, days="0")

        db_path = get_data_dir() / "graph.db"
        if db_path.exists():
            conn = sqlite3.connect(str(db_path))
            try:
                _sync_and_recompute(conn, to_reschedule)
            finally:
                conn.close()

        return JSONResponse({"success": True, "rescheduled": len(to_reschedule)})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@router.get("/card_info_all")
async def card_info_all():
    """Retourne toutes les infos par carte (min_interval, etc.)."""
    try:
        info = get_all_card_info()
        return JSONResponse({"card_info": info})
    except Exception:
        return JSONResponse({"card_info": {}})


@router.post("/set_card_info")
async def set_card_info_endpoint(request: Request):
    """Upsert des infos pour une carte (min_interval, etc.)."""
    data = await request.json()
    card_id = data.get("card_id")
    if card_id is None:
        return JSONResponse({"success": False, "error": "card_id requis"}, status_code=400)
    fields = {k: v for k, v in data.items() if k != "card_id"}
    try:
        set_card_info(str(card_id), **fields)
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@router.get("/blocking_cards")
async def get_blocking_cards():
    """Retourne les IDs des cartes qui bloquent d'autres cartes (is_blocking=1, is_blocked=0)."""
    db_path = get_data_dir() / "graph.db"
    if not db_path.exists():
        return JSONResponse({"success": True, "card_ids": []})

    conn = sqlite3.connect(str(db_path))
    try:
        cursor = conn.execute("""
            SELECT card_id FROM card_state
            WHERE is_blocking = 1
              AND is_blocked = 0
              AND queue >= 0
        """)
        card_ids = [row[0] for row in cursor.fetchall()]
    finally:
        conn.close()

    return JSONResponse({"success": True, "card_ids": card_ids})
