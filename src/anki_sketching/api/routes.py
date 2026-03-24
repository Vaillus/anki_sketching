"""
Routes API pour Anki Sketching.
Gère toutes les routes API qui retournent du JSON.
"""
from fastapi import APIRouter, Request, Form, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
import json
import os
import sqlite3
import uuid
from datetime import date, datetime, timedelta

from src.anki_interface import Card, get_collection_crt, find_all_profiles, anki_request
from src.anki_interface.get_cards_ids import get_cards_ids
from src.utilities.paths import get_positions_file, get_images_dir, get_data_dir, ensure_dir_exists
from src.graph.blocking import compute_blocking_states, compute_topo_depths
from src.graph.cards_db import get_cards_db_conn
from src.graph.parse_graph import parse_json_to_db
from src.graph.schema import get_config, set_config, migrate_db
from src.graph.card_info import set_card_info, get_all_card_info
from src.graph.srs import review_card as srs_review, get_next_intervals
from src.graph.local_cards import (
    create_local_card,
    get_local_card,
    update_local_card,
    delete_local_card,
)


# Crée le router
router = APIRouter()

# Cache pour le crt (évite de lire la DB à chaque requête)
_cached_crt = None


def format_due_relative(due_date: datetime | date) -> str:
    """Formate une date d'échéance en temps relatif (ex: '3j', '2sem', 'overdue')."""
    today = date.today()
    d = due_date.date() if isinstance(due_date, datetime) else due_date
    delta_days = (d - today).days

    if delta_days < 0:
        return f"{delta_days}j"
    if delta_days == 0:
        return "aujourd'hui"
    if delta_days <= 6:
        return f"{delta_days}j"
    if delta_days <= 27:
        weeks = delta_days // 7
        return f"{weeks}sem"
    months = delta_days // 30
    return f"{max(1, months)}mois"


def get_crt():
    """Récupère le crt de la collection (avec cache).

    Ordre : cache mémoire → graph.db config → fichier Anki collection.anki2.
    Si trouvé via Anki, le persiste dans graph.db pour les prochaines fois.
    """
    global _cached_crt
    if _cached_crt is not None:
        return _cached_crt

    # 1. Lire depuis graph.db
    db_path = get_data_dir() / "graph.db"
    if db_path.exists():
        conn = sqlite3.connect(str(db_path))
        try:
            migrate_db(conn)
            stored = get_config(conn, "crt")
            if stored is not None:
                _cached_crt = int(stored)
                print(f"CRT loaded from graph.db: {_cached_crt} ({datetime.fromtimestamp(_cached_crt)})")
                return _cached_crt
        finally:
            conn.close()

    # 2. Fallback : lire depuis le fichier Anki
    _cached_crt = get_collection_crt()
    if _cached_crt is not None:
        print(f"CRT loaded from Anki: {_cached_crt} ({datetime.fromtimestamp(_cached_crt)})")
        # 3. Persister dans graph.db
        if db_path.exists():
            conn = sqlite3.connect(str(db_path))
            try:
                migrate_db(conn)
                set_config(conn, "crt", str(_cached_crt))
            finally:
                conn.close()

    return _cached_crt


def _get_graph_conn() -> sqlite3.Connection | None:
    """Ouvre graph.db si elle existe, sinon None."""
    db_path = get_data_dir() / "graph.db"
    if not db_path.exists():
        return None
    return sqlite3.connect(str(db_path))


def _rebuild_edges_and_blocking() -> bool:
    """Met à jour les edges depuis le JSON et recalcule le blocking."""
    try:
        db_path = get_data_dir() / "graph.db"
        if not db_path.exists():
            return False
        positions_file = get_positions_file()
        if not positions_file.exists():
            return False
        graph_conn = sqlite3.connect(str(db_path))
        cards_conn = get_cards_db_conn()
        try:
            parse_json_to_db(positions_file, graph_conn)
            compute_blocking_states(cards_conn, graph_conn)
            compute_topo_depths(cards_conn, graph_conn)
        finally:
            cards_conn.close()
            graph_conn.close()
        return True
    except Exception:
        return False


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


def _due_display_from_db(card_type: int, due_date_str: str | None) -> str:
    """Calcule le due_display depuis les données DB."""
    type_labels = {0: "New", 1: "Learning", 2: "Review", 3: "Relearning"}
    if card_type == 0:
        return "New"
    if due_date_str is None:
        return "À réviser"
    try:
        return format_due_relative(date.fromisoformat(due_date_str[:10]))
    except (ValueError, TypeError):
        return type_labels.get(card_type, "?")


def _card_from_db_row(row: tuple, images_dir) -> dict:
    """Construit un dict carte depuis une row de la table cards.

    Row: (card_id, card_type, queue, due_date, raw_due, interval, ease_factor,
          texts_json, image_filenames_json, reps, lapses)
    """
    (card_id, card_type, _queue, due_date, raw_due, interval, ease_factor,
     texts_json, image_filenames_json, reps, lapses) = row

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
        "due": raw_due,
        "due_display": _due_display_from_db(card_type, due_date),
        "interval": interval or 0,
        "factor_percent": (ease_factor or 2.5) * 100,
        "reps": reps or 0,
        "lapses": lapses or 0,
    }


_CARDS_COLS = ("card_id, card_type, queue, due_date, raw_due, interval, ease_factor,"
               " texts_json, image_filenames_json, reps, lapses")


@router.post("/get_cards_by_ids")
async def get_cards_by_ids(request: Request):
    """Récupère les informations de cartes par leurs IDs depuis cards.db."""
    try:
        data = await request.json()
        card_ids = data.get('card_ids', [])
        if not card_ids:
            return JSONResponse({"success": True, "cards": []})

        images_dir = get_images_dir()
        cards_conn = get_cards_db_conn()

        cards_data = []
        try:
            for card_id in card_ids:
                card_id_str = str(card_id)
                row = cards_conn.execute(
                    f"SELECT {_CARDS_COLS} FROM cards WHERE card_id = ?",
                    (card_id_str,),
                ).fetchone()
                if row:
                    cards_data.append(_card_from_db_row(row, images_dir))
                elif card_id_str.startswith("local_"):
                    # Fallback pour cartes locales sans entrée cards.db
                    local = get_local_card(card_id_str)
                    if local is None:
                        continue
                    local_images = [
                        f'/static/images/{fn}'
                        for fn in local["images"]
                        if (images_dir / fn).exists()
                    ]
                    cards_data.append({
                        'card_id': card_id_str,
                        'texts': local["texts"],
                        'images': local_images,
                        'type': 0,
                        'type_label': 'New',
                        'due': None,
                        'due_display': 'New',
                        'interval': 0,
                        'factor_percent': 250,
                    })
        finally:
            cards_conn.close()

        return JSONResponse({"success": True, "cards": cards_data})
    except Exception as e:
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=500
        )


@router.post("/import_deck")
async def import_deck(deck_name: str = Form(...)):
    """Importe un paquet de cartes Anki et stocke dans cards.db."""
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
    crt = get_crt()

    # Stocker CRT dans graph.db config
    db_path = get_data_dir() / "graph.db"
    if db_path.exists() and crt:
        graph_conn = sqlite3.connect(str(db_path))
        try:
            migrate_db(graph_conn)
            set_config(graph_conn, "crt", str(crt))
        finally:
            graph_conn.close()

    cards_conn = get_cards_db_conn()
    try:
        cards_data = []
        for card_id in card_ids:
            card = Card(card_id, load_images=True, image_output_dir=str(images_dir))
            if not card.exists:
                continue

            due_date_obj = card.get_due_date(crt)
            due_date_str = due_date_obj.isoformat() if due_date_obj else None
            due_display = _due_display_from_db(card.type, due_date_str)

            cards_conn.execute(
                f"""INSERT OR REPLACE INTO cards
                    ({_CARDS_COLS}, locally_managed, is_blocking, is_blocked)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)""",
                (
                    str(card_id), card.type, card.queue, due_date_str, card.due,
                    card.interval, card.factor / 1000.0 if card.factor else 2.5,
                    json.dumps(card.texts), json.dumps(card.image_filenames),
                    card.reps, card.lapses,
                ),
            )

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
        cards_conn.commit()
    finally:
        cards_conn.close()

    return JSONResponse(cards_data)


@router.get("/due_cards")
async def get_due_cards():
    """Retourne les cartes non bloquées à réviser aujourd'hui et les nouvelles non bloquées."""
    images_dir = get_images_dir()

    cards_conn = get_cards_db_conn()
    try:
        cursor = cards_conn.execute(f"""
            SELECT {_CARDS_COLS}, ease_factor AS ease2
            FROM cards
            WHERE is_blocked = 0
              AND queue >= 0
              AND (
                card_type = 0
                OR (due_date IS NULL AND card_type IN (1, 3))
                OR (due_date IS NOT NULL AND date(due_date) <= date('now', 'localtime'))
              )
            ORDER BY
              topo_depth ASC,
              CASE
                WHEN due_date IS NULL AND card_type IN (1, 3) THEN 0
                WHEN due_date IS NOT NULL THEN 1
                ELSE 2
              END,
              due_date ASC
        """)
        rows = cursor.fetchall()
    finally:
        cards_conn.close()

    if not rows:
        return JSONResponse({"success": True, "cards": [], "total": 0})

    cards_data = []
    for row in rows:
        # row has 12 cols: 11 from _CARDS_COLS + ease2 (duplicate)
        base_row = row[:11]
        card_type = base_row[1]
        due_date = base_row[3]
        interval = base_row[5]
        ease_factor = base_row[6]

        card_data = _card_from_db_row(base_row, images_dir)

        next_reviews = get_next_intervals(
            card_type, interval or 0, ease_factor or 2.5, due_date
        )
        card_data["due_date"] = due_date
        card_data["next_reviews"] = next_reviews

        cards_data.append(card_data)

    return JSONResponse({"success": True, "cards": cards_data, "total": len(cards_data)})


@router.post("/review_card")
async def review_card_endpoint(request: Request):
    """Soumet une réponse de révision via le moteur SM-2 local."""
    data = await request.json()
    card_id = data.get("card_id")
    rating = data.get("ease")  # 1=Again, 2=Hard, 3=Good, 4=Easy

    if card_id is None or rating is None:
        return JSONResponse({"success": False, "error": "card_id et ease sont requis"}, status_code=400)

    cards_conn = get_cards_db_conn()
    try:
        row = cards_conn.execute(
            "SELECT card_type, interval, ease_factor, due_date, min_interval FROM cards WHERE card_id = ?",
            (str(card_id),),
        ).fetchone()
        if not row:
            return JSONResponse({"success": False, "error": "Carte introuvable"}, status_code=404)

        card_type, interval, ease, due_date, min_ivl = row
        result = srs_review(card_type, interval, ease or 2.5, int(rating), due_date)

        # Applique l'intervalle minimum si défini
        if min_ivl and result["interval"] < min_ivl:
            result["interval"] = min_ivl
            result["due_date"] = (date.today() + timedelta(days=min_ivl)).isoformat()

        cards_conn.execute(
            """UPDATE cards
               SET card_type=?, queue=0, due_date=?, interval=?, ease_factor=?, locally_managed=1
               WHERE card_id=?""",
            (result["card_type"], result["due_date"], result["interval"], result["ease"], str(card_id)),
        )
        cards_conn.commit()

        graph_conn = _get_graph_conn()
        if graph_conn:
            try:
                compute_blocking_states(cards_conn, graph_conn)
            finally:
                graph_conn.close()
    finally:
        cards_conn.close()

    return JSONResponse({"success": True})


@router.post("/reschedule_card")
async def reschedule_card(request: Request):
    """Ramène une carte à aujourd'hui."""
    data = await request.json()
    card_id = data.get("card_id")
    if card_id is None:
        return JSONResponse({"success": False, "error": "card_id requis"}, status_code=400)

    if str(card_id).startswith("local_"):
        return JSONResponse({"success": False, "error": "Opération non supportée pour les cartes locales"}, status_code=400)

    today = date.today().isoformat()
    cards_conn = get_cards_db_conn()
    try:
        cards_conn.execute(
            "UPDATE cards SET due_date = ?, locally_managed = 1 WHERE card_id = ?",
            (today, str(card_id)),
        )
        cards_conn.commit()
        graph_conn = _get_graph_conn()
        if graph_conn:
            try:
                compute_blocking_states(cards_conn, graph_conn)
            finally:
                graph_conn.close()
    finally:
        cards_conn.close()

    return JSONResponse({"success": True})


@router.post("/reschedule_distant_cards")
async def reschedule_distant_cards():
    """Ramène à aujourd'hui toutes les cartes du canvas dues dans > 5 jours."""
    try:
        threshold = (date.today() + timedelta(days=5)).isoformat()
        today = date.today().isoformat()

        cards_conn = get_cards_db_conn()
        try:
            cursor = cards_conn.execute("""
                SELECT card_id FROM cards
                WHERE card_type = 2 AND queue >= 0
                  AND due_date IS NOT NULL AND date(due_date) > ?
            """, (threshold,))
            to_reschedule = [row[0] for row in cursor.fetchall()]

            if not to_reschedule:
                return JSONResponse({"success": True, "rescheduled": 0})

            cards_conn.executemany(
                "UPDATE cards SET due_date = ?, locally_managed = 1 WHERE card_id = ?",
                [(today, cid) for cid in to_reschedule],
            )
            cards_conn.commit()

            graph_conn = _get_graph_conn()
            if graph_conn:
                try:
                    compute_blocking_states(cards_conn, graph_conn)
                finally:
                    graph_conn.close()
        finally:
            cards_conn.close()

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
    cards_conn = get_cards_db_conn()
    try:
        cursor = cards_conn.execute("""
            SELECT card_id FROM cards
            WHERE is_blocking = 1
              AND is_blocked = 0
              AND queue >= 0
        """)
        card_ids = [row[0] for row in cursor.fetchall()]
    finally:
        cards_conn.close()

    return JSONResponse({"success": True, "card_ids": card_ids})


# ── Local cards ───────────────────────────────────────────────────────────


@router.post("/create_local_card")
async def create_local_card_endpoint(request: Request):
    """Crée une carte locale (pas dans Anki)."""
    data = await request.json()
    front_text = data.get("front_text", "")
    back_text = data.get("back_text", "")
    image_filename = data.get("image_filename")

    card_id = create_local_card(front_text, back_text, image_filename)
    local = get_local_card(card_id)
    if not local:
        return JSONResponse({"success": False, "error": "Erreur création carte"}, status_code=500)
    card_data = _format_local_card(card_id, local)
    return JSONResponse({"success": True, "card": card_data})


@router.post("/update_local_card")
async def update_local_card_endpoint(request: Request):
    """Met à jour le contenu d'une carte locale."""
    data = await request.json()
    card_id = data.get("card_id")
    if not card_id or not str(card_id).startswith("local_"):
        return JSONResponse({"success": False, "error": "card_id local requis"}, status_code=400)

    kwargs = {}
    if "front_text" in data:
        kwargs["front_text"] = data["front_text"]
    if "back_text" in data:
        kwargs["back_text"] = data["back_text"]
    if "image_filename" in data:
        kwargs["image_filename"] = data["image_filename"]

    ok = update_local_card(str(card_id), **kwargs)
    if not ok:
        return JSONResponse({"success": False, "error": "Carte introuvable"}, status_code=404)

    local = get_local_card(str(card_id))
    if not local:
        return JSONResponse({"success": False, "error": "Carte introuvable après mise à jour"}, status_code=404)
    card_data = _format_local_card(str(card_id), local)
    return JSONResponse({"success": True, "card": card_data})


@router.post("/upload_image")
async def upload_image(file: UploadFile = File(...)):
    """Upload une image pour une carte locale."""
    images_dir = get_images_dir()
    ensure_dir_exists(images_dir)

    ext = os.path.splitext(file.filename or "img.png")[1] or ".png"
    filename = f"local_{uuid.uuid4().hex[:8]}{ext}"
    filepath = images_dir / filename

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    return JSONResponse({
        "success": True,
        "filename": filename,
        "path": f"/static/images/{filename}",
    })


@router.post("/delete_local_card")
async def delete_local_card_endpoint(request: Request):
    """Supprime une carte locale."""
    data = await request.json()
    card_id = data.get("card_id")
    if not card_id or not str(card_id).startswith("local_"):
        return JSONResponse({"success": False, "error": "card_id local requis"}, status_code=400)

    ok = delete_local_card(str(card_id))
    if not ok:
        return JSONResponse({"success": False, "error": "Carte introuvable"}, status_code=404)

    return JSONResponse({"success": True})


def _format_local_card(card_id: str, local: dict) -> dict:
    """Formate une carte locale comme /get_cards_by_ids le ferait."""
    images = [f'/static/images/{fn}' for fn in local["images"]]
    return {
        "card_id": card_id,
        "texts": local["texts"],
        "images": images,
        "type": 0,
        "type_label": "New",
        "due": None,
        "due_display": "New",
        "interval": 0,
        "factor_percent": 250,
    }
