"""
Module pour gérer tous les chemins de fichiers du projet.
Utilise Path pour calculer les chemins relatifs à la racine du projet.
"""
import os
from pathlib import Path
from typing import Union


def get_project_root() -> Path:
    """
    Calcule la racine du projet (dossier contenant pyproject.toml).

    Returns:
        Path: Chemin vers la racine du projet
    """
    # Ce fichier est dans src/utilities/, donc on remonte de 2 niveaux
    return Path(__file__).resolve().parent.parent.parent


def get_data_dir() -> Path:
    """
    Retourne le chemin vers le dossier data du projet.

    Honore DATA_DIR (env var) pour la persistance sur volume monté
    en prod ; fallback sur <project_root>/data en local.

    Returns:
        Path: Chemin vers data/
    """
    env_dir = os.environ.get("DATA_DIR")
    data_dir = Path(env_dir) if env_dir else get_project_root() / "data"
    ensure_dir_exists(data_dir)
    return data_dir


def get_positions_file() -> Path:
    """
    Retourne le chemin vers le fichier de sauvegarde des positions.

    Returns:
        Path: Chemin vers data/card_positions.json
    """
    return get_data_dir() / "card_positions.json"


def get_images_dir() -> Path:
    """
    Retourne le chemin vers le dossier des images de cartes.

    Vit sous DATA_DIR pour être persisté avec le reste des données
    utilisateur (cards.db, graph.db, card_positions.json).

    Returns:
        Path: Chemin vers <data_dir>/images/
    """
    images_dir = get_data_dir() / "images"
    ensure_dir_exists(images_dir)
    return images_dir


def ensure_dir_exists(directory: Union[Path, str]) -> None:
    """
    Crée un dossier s'il n'existe pas déjà.
    
    Args:
        directory: Chemin vers le dossier à créer (Path ou str)
    """
    Path(directory).mkdir(parents=True, exist_ok=True)
