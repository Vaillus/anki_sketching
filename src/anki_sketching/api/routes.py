"""
Routes API pour Anki Sketching.
Gère toutes les routes API qui retournent du JSON.
"""
from fastapi import APIRouter, Request, Form, HTTPException
from fastapi.responses import JSONResponse
import json
import os
from datetime import datetime

from src.anki_interface import Card, get_collection_crt, find_all_profiles
from src.anki_interface.get_cards_ids import get_cards_ids
from src.anki_interface.get_card_information import get_card_information
from src.utilities.paths import get_positions_file, get_images_dir, ensure_dir_exists


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


@router.post("/save_positions")
async def save_positions(request: Request):
    """Sauvegarde les positions des cartes."""
    try:
        positions_data = await request.json()
        positions_file = get_positions_file()
        with open(positions_file, 'w') as f:
            json.dump(positions_data, f, indent=2)
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
