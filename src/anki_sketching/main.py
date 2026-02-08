"""
FastAPI application principale pour Anki Sketching.
Configure les templates Jinja2, les fichiers statiques et les routes.
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
from src.anki_sketching.api import routes as api_routes
from src.anki_sketching.web import routes as web_routes


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

# Inclut les routes
app.include_router(web_routes.router)  # Routes web (templates)
app.include_router(api_routes.router)  # Routes API (JSON)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000, reload=True)
