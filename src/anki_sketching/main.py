"""
FastAPI application principale pour Anki Sketching.
Configure les templates Jinja2, les fichiers statiques et les routes.
"""
import sqlite3

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
from src.anki_sketching.api import routes as api_routes
from src.anki_sketching.web import routes as web_routes
from src.anki_sketching.learn import routes as learn_routes
from src.graph.cards_db import migrate_from_legacy, get_cards_db_conn, migrate_cards_db
from src.graph.schema import migrate_db
from src.utilities.paths import get_data_dir


def get_project_root() -> Path:
    """Calcule la racine du projet."""
    return Path(__file__).resolve().parent.parent.parent


# Crée l'application FastAPI
app = FastAPI(title="Anki Sketching")

# Monte les fichiers statiques
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
app.include_router(web_routes.router)   # Routes web (templates)
app.include_router(api_routes.router)   # Routes API (JSON)
app.include_router(learn_routes.router) # Dashboard d'apprentissage


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000, reload=True)
