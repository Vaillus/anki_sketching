"""
Routes pour la page éditeur (/editor) et la redirection / → /editor.
"""
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path

from src.anki_interface.get_all_decks import get_all_decks
from src.utilities.env import is_production


def get_project_root() -> Path:
    """Calcule la racine du projet."""
    return Path(__file__).resolve().parent.parent.parent.parent


# Configure les templates Jinja2
templates_dir = get_project_root() / 'frontend' / 'templates'
templates = Jinja2Templates(directory=str(templates_dir))

# Crée le router
router = APIRouter()


@router.get("/")
async def root():
    return RedirectResponse(url="/editor")


@router.get("/editor")
async def index(request: Request):
    """Affiche le canvas éditeur."""
    all_decks = get_all_decks()
    dessin_decks = []
    if all_decks:
        parent_deck = 'dessin'
        dessin_decks = [
            deck for deck in all_decks
            if deck == parent_deck or deck.startswith(f"{parent_deck}::")
        ]
    return templates.TemplateResponse("index.html", {
        "request": request,
        "decks": sorted(dessin_decks),
        "is_prod": is_production(),
    })
