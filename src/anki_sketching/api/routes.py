"""
Routes API pour Anki Sketching.
Gère toutes les routes API qui retournent du JSON.
"""
from fastapi import APIRouter, Request, Form, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
import json
import os
import shutil
import sqlite3
import uuid
from datetime import date, datetime, timedelta

import requests

from src.anki_interface import Card, get_collection_crt, find_all_profiles, anki_request
from src.anki_interface.get_cards_ids import get_cards_ids
from src.utilities.paths import get_positions_file, get_images_dir, get_data_dir, ensure_dir_exists
from src.graph.blocking import compute_blocking_states, compute_topo_depths
from src.graph.cards_db import MAX_INTERVAL_DAYS, get_cards_db_conn
from src.graph.parse_graph import parse_json_to_db
from src.graph.schema import get_config, set_config, migrate_db
from src.graph.local_cards import (
    create_local_card,
    get_local_card,
    update_local_card,
    delete_local_card,
)
from src.graph.cards_db import get_all_tags, add_tag, remove_tag


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
        # Le profil Anki vit sur le disque local ; injoignable depuis un déploiement.
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=503
        )


def _due_display_from_db(is_new: bool, due_date_str: str | None) -> str:
    """Calcule le due_display depuis les données DB."""
    if is_new:
        return "New"
    if due_date_str is None:
        return "À réviser"
    try:
        return format_due_relative(date.fromisoformat(due_date_str[:10]))
    except (ValueError, TypeError):
        return "Review"


def _card_from_db_row(row: tuple, images_dir) -> dict:
    """Construit un dict carte depuis une row de la table cards.

    Row: (card_id, is_new, due_date, interval,
          texts_json, image_filenames_json, tags_json)
    """
    (card_id, is_new, due_date, interval,
     texts_json, image_filenames_json, tags_json) = row

    texts = json.loads(texts_json) if texts_json else {}
    image_filenames = json.loads(image_filenames_json) if image_filenames_json else []
    images = [
        f'/static/images/{fn}'
        for fn in image_filenames
        if (images_dir / fn).exists()
    ]
    tags = json.loads(tags_json) if tags_json else []

    is_new_bool = bool(is_new)
    return {
        "card_id": card_id,
        "texts": texts,
        "images": images,
        "image_filenames": image_filenames,
        "tags": tags,
        "type_label": "New" if is_new_bool else "Review",
        "due_display": _due_display_from_db(is_new_bool, due_date),
        "interval": interval or 0,
    }


_CARDS_COLS = ("card_id, is_new, due_date, interval,"
               " texts_json, image_filenames_json, tags_json")


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
                        'tags': local.get("tags", []),
                        'type_label': 'New',
                        'due_display': 'New',
                        'interval': 0,
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
            status_code=503,
            detail="AnkiConnect injoignable. Vérifiez qu'Anki est lancé localement."
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
            is_new = 1 if card.type == 0 else 0
            due_display = _due_display_from_db(bool(is_new), due_date_str)

            result = cards_conn.execute(
                """INSERT INTO cards
                    (card_id, is_new, due_date, interval,
                     texts_json, image_filenames_json,
                     is_blocking, is_blocked)
                    VALUES (?, ?, ?, ?, ?, ?, 0, 0)
                    ON CONFLICT(card_id) DO NOTHING""",
                (
                    str(card_id), is_new, due_date_str,
                    card.interval,
                    json.dumps(card.texts), json.dumps(card.image_filenames),
                ),
            )
            if result.rowcount == 0:
                continue

            cards_data.append({
                "card_id": card_id,
                "texts": card.texts,
                "images": [f'/static/images/{os.path.basename(img)}' for img in card.images],
                "tags": [],
                "type_label": "New" if is_new else "Review",
                "due_display": due_display,
                "interval": card.interval,
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
            SELECT {_CARDS_COLS}
            FROM cards
            WHERE is_blocked = 0
              AND (
                is_new = 1
                OR due_date IS NULL
                OR date(due_date) <= date('now', 'localtime')
              )
            ORDER BY
              topo_depth ASC,
              CASE
                WHEN is_new = 0 AND due_date IS NULL THEN 0
                WHEN is_new = 0 AND due_date IS NOT NULL THEN 1
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
        card_data = _card_from_db_row(row, images_dir)
        card_data["due_date"] = row[2]
        cards_data.append(card_data)

    return JSONResponse({"success": True, "cards": cards_data, "total": len(cards_data)})


@router.post("/review_card")
async def review_card_endpoint(request: Request):
    """Soumet une réponse de révision (failed / maintain / change)."""
    data = await request.json()
    card_id = data.get("card_id")
    action = data.get("action")  # "failed" | "maintain" | "change"

    if card_id is None or action not in ("failed", "maintain", "change"):
        return JSONResponse(
            {"success": False, "error": "card_id et action (failed|maintain|change) sont requis"},
            status_code=400,
        )

    cards_conn = get_cards_db_conn()
    try:
        row = cards_conn.execute(
            "SELECT interval FROM cards WHERE card_id = ?",
            (str(card_id),),
        ).fetchone()
        if not row:
            return JSONResponse({"success": False, "error": "Carte introuvable"}, status_code=404)

        (current_interval,) = row
        today = date.today()

        if action == "failed":
            new_interval = 1
        elif action == "maintain":
            new_interval = current_interval or 1
        else:  # change
            try:
                new_interval = int(data.get("interval", current_interval or 1))
            except (TypeError, ValueError):
                return JSONResponse(
                    {"success": False, "error": "interval doit être un entier"},
                    status_code=400,
                )

        # Plafond unique appliqué aux trois actions : aucune ne peut y échapper.
        new_interval = max(1, min(MAX_INTERVAL_DAYS, new_interval))

        new_due = (today + timedelta(days=new_interval)).isoformat()

        cards_conn.execute(
            """UPDATE cards
               SET is_new=0, due_date=?, interval=?
               WHERE card_id=?""",
            (new_due, new_interval, str(card_id)),
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
            "UPDATE cards SET due_date = ? WHERE card_id = ?",
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
    """Ramène à aujourd'hui les cartes dues dans > 5 jours, et écrête les intervalles.

    Les deux opérations sont indépendantes : une carte peut porter un intervalle de
    557 jours tout en étant due demain. Écrêter sans ramener (ou l'inverse) laisserait
    la carte repartir au loin dès le premier « Maintain ».
    """
    try:
        threshold = (date.today() + timedelta(days=5)).isoformat()
        today = date.today().isoformat()

        cards_conn = get_cards_db_conn()
        try:
            rescheduled = cards_conn.execute("""
                UPDATE cards SET due_date = ?
                WHERE is_new = 0
                  AND due_date IS NOT NULL AND date(due_date) > ?
            """, (today, threshold)).rowcount

            capped = cards_conn.execute(
                "UPDATE cards SET interval = ? WHERE interval > ?",
                (MAX_INTERVAL_DAYS, MAX_INTERVAL_DAYS),
            ).rowcount

            if not rescheduled and not capped:
                return JSONResponse({"success": True, "rescheduled": 0, "capped": 0})

            cards_conn.commit()

            graph_conn = _get_graph_conn()
            if graph_conn:
                try:
                    compute_blocking_states(cards_conn, graph_conn)
                finally:
                    graph_conn.close()
        finally:
            cards_conn.close()

        return JSONResponse({"success": True, "rescheduled": rescheduled, "capped": capped})
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

    tags = data.get("tags")
    card_id = create_local_card(front_text, back_text, image_filename, tags=tags)
    local = get_local_card(card_id)
    if not local:
        return JSONResponse({"success": False, "error": "Erreur création carte"}, status_code=500)
    card_data = _format_local_card(card_id, local)
    return JSONResponse({"success": True, "card": card_data})


@router.post("/update_card")
async def update_card_endpoint(request: Request):
    """Met à jour le texte et les tags d'une carte (locale ou Anki) dans cards.db."""
    data = await request.json()
    card_id = data.get("card_id")
    if card_id is None:
        return JSONResponse({"success": False, "error": "card_id requis"}, status_code=400)

    images_dir = get_images_dir()
    cards_conn = get_cards_db_conn()
    try:
        row = cards_conn.execute(
            f"SELECT {_CARDS_COLS} FROM cards WHERE card_id = ?",
            (str(card_id),),
        ).fetchone()
        if not row:
            return JSONResponse({"success": False, "error": "Carte introuvable"}, status_code=404)

        card_data = _card_from_db_row(row, images_dir)
        texts = dict(card_data["texts"])

        if "front_text" in data:
            texts["Front"] = data["front_text"]
        if "back_text" in data:
            texts["Back"] = data["back_text"]

        tags = data["tags"] if "tags" in data else card_data["tags"]

        image_filenames_new = data.get("image_filenames")
        if image_filenames_new is not None:
            cards_conn.execute(
                "UPDATE cards SET texts_json = ?, tags_json = ?, image_filenames_json = ? WHERE card_id = ?",
                (json.dumps(texts), json.dumps(tags), json.dumps(image_filenames_new), str(card_id)),
            )
        else:
            cards_conn.execute(
                "UPDATE cards SET texts_json = ?, tags_json = ? WHERE card_id = ?",
                (json.dumps(texts), json.dumps(tags), str(card_id)),
            )
        cards_conn.commit()

        # Re-fetch pour retourner les données à jour
        row = cards_conn.execute(
            f"SELECT {_CARDS_COLS} FROM cards WHERE card_id = ?",
            (str(card_id),),
        ).fetchone()
        updated = _card_from_db_row(row, images_dir)
    finally:
        cards_conn.close()

    return JSONResponse({"success": True, "card": updated})


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
    if "image_filenames" in data:
        kwargs["image_filenames"] = data["image_filenames"]

    ok = update_local_card(str(card_id), **kwargs)
    if not ok:
        return JSONResponse({"success": False, "error": "Carte introuvable"}, status_code=404)

    # Update tags if provided
    if "tags" in data:
        tags = data["tags"] or []
        cards_conn = get_cards_db_conn()
        try:
            cards_conn.execute(
                "UPDATE cards SET tags_json = ? WHERE card_id = ?",
                (json.dumps(tags), str(card_id)),
            )
            cards_conn.commit()
        finally:
            cards_conn.close()

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


_UPLOADABLE_DATA_FILES = {"cards.db", "graph.db", "card_positions.json"}
_UPLOADABLE_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


@router.post("/admin/upload_data_file")
async def upload_data_file(file: UploadFile = File(...)):
    """Remplace un fichier seed dans DATA_DIR (cards.db, graph.db, card_positions.json).

    Outil de synchronisation Mac → volume Railway, sans passer par git. Protégé
    par le middleware Basic Auth (APP_PASSWORD). L'écriture est atomique via
    .upload + rename. Les nouvelles requêtes ouvrent une connexion fraîche et
    voient immédiatement le contenu mis à jour ; pas besoin de redéployer.
    """
    filename = os.path.basename(file.filename or "")
    if filename not in _UPLOADABLE_DATA_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"filename doit être l'un de {sorted(_UPLOADABLE_DATA_FILES)}",
        )

    data_dir = get_data_dir()
    target = data_dir / filename
    tmp = data_dir / f"{filename}.upload"

    content = await file.read()
    with open(tmp, "wb") as f:
        f.write(content)
    os.replace(tmp, target)

    return JSONResponse({
        "success": True,
        "filename": filename,
        "size": target.stat().st_size,
    })


@router.post("/admin/upload_image_file")
async def upload_image_file(file: UploadFile = File(...)):
    """Pousse une image vers <DATA_DIR>/images/ (sync Mac → volume).

    Préserve le nom de fichier (basename uniquement, pas de path traversal).
    Allowlist d'extensions. Protégé par Basic Auth comme tout le reste.
    """
    filename = os.path.basename(file.filename or "")
    if not filename:
        raise HTTPException(status_code=400, detail="filename manquant")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in _UPLOADABLE_IMAGE_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"extension {ext!r} non autorisée (attendu : {sorted(_UPLOADABLE_IMAGE_EXTS)})",
        )

    images_dir = get_images_dir()
    target = images_dir / filename
    tmp = images_dir / f"{filename}.upload"

    content = await file.read()
    with open(tmp, "wb") as f:
        f.write(content)
    os.replace(tmp, target)

    return JSONResponse({
        "success": True,
        "filename": filename,
        "size": target.stat().st_size,
        "path": f"/static/images/{filename}",
    })


# ── Sync prod → Mac ─────────────────────────────────────────────────────────
#
# Served side (prod) exposes download_data_file + list_images. The local
# instance calls sync_from_prod, which pulls from PROD_URL and overwrites
# ./data. See specs/deployment.md.

DEFAULT_PROD_URL = "https://web-production-e02fd.up.railway.app"


@router.get("/admin/download_data_file")
async def download_data_file(name: str):
    """Renvoie un fichier de données du volume (miroir de upload_data_file).

    Allowlist stricte (cards.db / graph.db / card_positions.json). Protégé par
    le middleware Basic Auth. Utilisé par sync_from_prod côté local.
    """
    if name not in _UPLOADABLE_DATA_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"name doit être l'un de {sorted(_UPLOADABLE_DATA_FILES)}",
        )
    path = get_data_dir() / name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{name} introuvable")
    return FileResponse(
        str(path), filename=name, media_type="application/octet-stream"
    )


@router.get("/admin/list_images")
async def list_images():
    """Liste les noms d'images du volume (pour que sync_from_prod sache quoi tirer)."""
    images_dir = get_images_dir()
    names = sorted(
        f.name
        for f in images_dir.iterdir()
        if f.is_file() and f.suffix.lower() in _UPLOADABLE_IMAGE_EXTS
    )
    return JSONResponse({"images": names})


@router.post("/admin/sync_from_prod")
async def sync_from_prod():
    """Tire la base distante (prod) et écrase la base locale.

    Tourne sur l'instance LOCALE. Télécharge les 3 fichiers de données + toutes
    les images depuis PROD_URL (auth via PROD_PASSWORD), avec backup des fichiers
    locaux dans .sync_backup/ avant écrasement atomique. N'efface pas les images
    locales absentes de la prod (add/overwrite uniquement).
    """
    global _cached_crt

    prod_url = (os.environ.get("PROD_URL") or DEFAULT_PROD_URL).rstrip("/")
    password = os.environ.get("PROD_PASSWORD")
    auth = ("x", password) if password else None

    data_dir = get_data_dir()
    images_dir = get_images_dir()
    backup_dir = data_dir / ".sync_backup"
    tmp_files: list = []

    try:
        # 1. Télécharger les 3 fichiers de données dans des temp.
        staged = []  # (tmp_path, target_path)
        for name in sorted(_UPLOADABLE_DATA_FILES):
            resp = requests.get(
                f"{prod_url}/admin/download_data_file",
                params={"name": name},
                auth=auth,
                timeout=60,
            )
            resp.raise_for_status()
            tmp = data_dir / f"{name}.download"
            tmp.write_bytes(resp.content)
            tmp_files.append(tmp)
            staged.append((tmp, data_dir / name))

        # 2. Backup des fichiers locaux actuels, puis 3. swap atomique.
        ensure_dir_exists(backup_dir)
        for _, target in staged:
            if target.exists():
                shutil.copy2(target, backup_dir / target.name)
        for tmp, target in staged:
            os.replace(tmp, target)
        tmp_files = []

        # 4. Images : lister puis télécharger chacune (add/overwrite).
        list_resp = requests.get(
            f"{prod_url}/admin/list_images", auth=auth, timeout=60
        )
        list_resp.raise_for_status()
        image_names = list_resp.json().get("images", [])

        images_synced = 0
        for img in image_names:
            img_resp = requests.get(
                f"{prod_url}/static/images/{img}", auth=auth, timeout=120
            )
            if img_resp.status_code != 200:
                continue
            tmp = images_dir / f"{img}.download"
            tmp.write_bytes(img_resp.content)
            os.replace(tmp, images_dir / img)
            images_synced += 1
    except requests.RequestException as e:
        for tmp in tmp_files:
            tmp.unlink(missing_ok=True)
        return JSONResponse(
            {"success": False, "error": f"Échec sync depuis {prod_url} : {e}"},
            status_code=502,
        )

    # 5. graph.db a changé : invalide le cache crt.
    _cached_crt = None

    return JSONResponse({
        "success": True,
        "data_files": sorted(_UPLOADABLE_DATA_FILES),
        "images": images_synced,
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
        "tags": local.get("tags", []),
        "type_label": "New",
        "due": None,
        "due_display": "New",
        "interval": 0,
    }


# ── Tags ──────────────────────────────────────────────────────────────────


@router.get("/all_tags")
async def all_tags_endpoint():
    """Retourne tous les tags distincts."""
    try:
        tags = get_all_tags()
        return JSONResponse({"success": True, "tags": tags})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@router.post("/add_tag")
async def add_tag_endpoint(request: Request):
    """Ajoute un tag à une liste de cartes."""
    data = await request.json()
    card_ids = data.get("card_ids", [])
    tag = data.get("tag", "").strip()
    if not card_ids or not tag:
        return JSONResponse({"success": False, "error": "card_ids et tag requis"}, status_code=400)
    try:
        add_tag([str(cid) for cid in card_ids], tag)
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@router.post("/remove_tag")
async def remove_tag_endpoint(request: Request):
    """Retire un tag d'une liste de cartes."""
    data = await request.json()
    card_ids = data.get("card_ids", [])
    tag = data.get("tag", "").strip()
    if not card_ids or not tag:
        return JSONResponse({"success": False, "error": "card_ids et tag requis"}, status_code=400)
    try:
        remove_tag([str(cid) for cid in card_ids], tag)
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)
