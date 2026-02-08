"""
Routes API pour Anki Sketching.
Gère toutes les routes API qui retournent du JSON.
"""
from fastapi import APIRouter, Request, Form, HTTPException
from fastapi.responses import JSONResponse
import json
import os

from src.anki_interface.get_cards_ids import get_cards_ids
from src.anki_interface.get_card_information import get_card_information
from src.utilities.paths import get_positions_file, get_images_dir, ensure_dir_exists


# Crée le router
router = APIRouter()


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


@router.post("/get_cards_by_ids")
async def get_cards_by_ids(request: Request):
    """Récupère les informations de cartes par leurs IDs."""
    try:
        data = await request.json()
        card_ids = data.get('card_ids', [])
        if not card_ids:
            return JSONResponse({"success": True, "cards": []})
        
        images_dir = get_images_dir()
        ensure_dir_exists(images_dir)
        
        cards_data = []
        for card_id in card_ids:
            card_info = get_card_information(int(card_id), str(images_dir))
            if card_info:
                cards_data.append({
                    'card_id': card_id,
                    'texts': card_info['texts'],
                    'images': [f'/static/images/{os.path.basename(img)}' for img in card_info['images']]
                })
        
        return JSONResponse({"success": True, "cards": cards_data})
    except Exception as e:
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=500
        )


@router.post("/import_deck")
async def import_deck(deck_name: str = Form(...)):
    """Importe un paquet de cartes Anki."""
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
    
    cards_data = []
    for card_id in card_ids:
        info = get_card_information(card_id, image_output_dir=str(images_dir))
        if info:
            cards_data.append({
                "card_id": card_id,
                "texts": info.get('texts', {}),
                "images": info.get('images', [])
            })
            
    return JSONResponse(cards_data)
