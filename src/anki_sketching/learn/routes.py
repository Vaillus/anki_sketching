"""
Routes pour le dashboard d'apprentissage (/learn).
"""
from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from pathlib import Path


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent.parent


templates_dir = get_project_root() / 'frontend' / 'templates'
templates = Jinja2Templates(directory=str(templates_dir))

router = APIRouter()


@router.get("/learn")
async def learn(request: Request):
    return templates.TemplateResponse("learn.html", {"request": request})
