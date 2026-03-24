"""
Routes pour le dashboard d'apprentissage (/learn).
"""
import json
import sqlite3
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from fastapi.templating import Jinja2Templates

from src.graph.cards_db import get_cards_db_conn
from src.utilities.paths import get_data_dir, get_images_dir


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent.parent


templates_dir = get_project_root() / 'frontend' / 'templates'
templates = Jinja2Templates(directory=str(templates_dir))

router = APIRouter()

_COLS = ("card_id, card_type, queue, due_date, raw_due, interval, ease_factor,"
         " texts_json, image_filenames_json, reps, lapses")


def _build_card(row: tuple, images_dir: Path) -> dict:
    (card_id, card_type, _queue, _due_date, _raw_due, _interval, _ease_factor,
     texts_json, image_filenames_json, _reps, _lapses) = row

    texts = json.loads(texts_json) if texts_json else {}
    image_filenames = json.loads(image_filenames_json) if image_filenames_json else []
    images = [
        f'/static/images/{fn}'
        for fn in image_filenames
        if (images_dir / fn).exists()
    ]
    type_labels = {0: "New", 1: "Learning", 2: "Review", 3: "Relearning"}
    return {
        "card_id": card_id,
        "texts": texts,
        "images": images,
        "type": card_type,
        "type_label": type_labels.get(card_type, f"Unknown ({card_type})"),
    }


@router.get("/learn")
async def learn(request: Request):
    return templates.TemplateResponse("learn.html", {"request": request})


@router.get("/learn/card/{card_id}/context")
async def card_context(card_id: str):
    """Retourne la carte et ses parents/enfants immédiats."""
    try:
        db_path = get_data_dir() / "graph.db"
        images_dir = get_images_dir()

        parent_ids: list[str] = []
        child_ids: list[str] = []
        if db_path.exists():
            graph_conn = sqlite3.connect(str(db_path))
            try:
                parent_ids = [r[0] for r in graph_conn.execute(
                    "SELECT parent_card_id FROM edges WHERE child_card_id = ?", (card_id,)
                ).fetchall()]
                child_ids = [r[0] for r in graph_conn.execute(
                    "SELECT child_card_id FROM edges WHERE parent_card_id = ?", (card_id,)
                ).fetchall()]
            finally:
                graph_conn.close()

        cards_conn = get_cards_db_conn()
        try:
            def fetch(cid: str) -> dict | None:
                row = cards_conn.execute(
                    f"SELECT {_COLS} FROM cards WHERE card_id = ?", (cid,)
                ).fetchone()
                return _build_card(row, images_dir) if row else None

            card = fetch(card_id)
            if card is None:
                return JSONResponse({"success": False, "error": "Carte introuvable"}, status_code=404)

            parents = [c for cid in parent_ids if (c := fetch(cid)) is not None]
            children = [c for cid in child_ids if (c := fetch(cid)) is not None]
        finally:
            cards_conn.close()

        return JSONResponse({"success": True, "card": card, "parents": parents, "children": children})

    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)
