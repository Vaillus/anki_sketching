"""
FastAPI application principale pour Anki Sketching.
Configure les templates Jinja2, les fichiers statiques et les routes.
"""
import base64
import os
import secrets
import sqlite3

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
from src.anki_sketching.api import routes as api_routes
from src.anki_sketching.editor import routes as editor_routes
from src.anki_sketching.practice import routes as practice_routes
from src.anki_sketching.seed import seed_data_dir
from src.graph.cards_db import migrate_from_legacy, get_cards_db_conn, migrate_cards_db
from src.graph.schema import migrate_db
from src.utilities.paths import get_data_dir, get_images_dir


def get_project_root() -> Path:
    """Calcule la racine du projet."""
    return Path(__file__).resolve().parent.parent.parent


# Charge .env (PROD_URL / PROD_PASSWORD pour la sync prod → Mac) avant toute
# lecture d'env var. No-op si le fichier n'existe pas (ex. en prod sur Railway).
load_dotenv()

# Seed le volume persistant avant toute migration ou ouverture de DB.
seed_data_dir()

# Crée l'application FastAPI
app = FastAPI(title="Anki Sketching")


@app.middleware("http")
async def basic_auth_middleware(request: Request, call_next):
    """Doorman : si APP_PASSWORD est défini, exige un Basic Auth correspondant.

    En local (var non définie), no-op. Le nom d'utilisateur est ignoré —
    seul le mot de passe compte (ce n'est pas un vrai système d'auth).
    """
    expected = os.environ.get("APP_PASSWORD")
    if not expected:
        return await call_next(request)

    header = request.headers.get("authorization", "")
    if header.startswith("Basic "):
        try:
            decoded = base64.b64decode(header[6:]).decode("utf-8")
            _, _, password = decoded.partition(":")
            if secrets.compare_digest(password, expected):
                return await call_next(request)
        except Exception:
            pass

    return Response(
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="anki-sketching"'},
    )

# Monte les fichiers statiques. /static/images doit être enregistré avant /static
# pour que les images (sur le volume) court-circuitent le mount général (sur l'image).
images_dir = get_images_dir()
app.mount("/static/images", StaticFiles(directory=str(images_dir)), name="images")

static_dir = get_project_root() / 'frontend' / 'static'
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Configure les templates Jinja2
templates_dir = get_project_root() / 'frontend' / 'templates'
templates = Jinja2Templates(directory=str(templates_dir))

# Migration legacy : card_info.db + graph.db card_state → cards.db
migrate_from_legacy()

# Migre cards.db si nécessaire
cards_conn = get_cards_db_conn()
migrate_cards_db(cards_conn)
cards_conn.close()

# Migre graph.db si nécessaire (edges + config)
db_path = get_data_dir() / "graph.db"
if db_path.exists():
    _conn = sqlite3.connect(str(db_path))
    migrate_db(_conn)
    _conn.close()

# Inclut les routes
app.include_router(editor_routes.router)   # Page éditeur (/editor + redirection /)
app.include_router(api_routes.router)      # Routes API (JSON)
app.include_router(practice_routes.router) # Dashboard de practice (/practice)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5050, reload=True)
