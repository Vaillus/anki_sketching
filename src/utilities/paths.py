"""
Module pour gérer tous les chemins de fichiers du projet.
Utilise Path pour calculer les chemins relatifs à la racine du projet.
"""
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


def get_positions_file() -> Path:
    """
    Retourne le chemin vers le fichier de sauvegarde des positions.
    
    Returns:
        Path: Chemin vers data/card_positions.json
    """
    data_dir = get_project_root() / 'data'
    ensure_dir_exists(data_dir)
    return data_dir / 'card_positions.json'


def get_images_dir() -> Path:
    """
    Retourne le chemin vers le dossier des images statiques.
    
    Returns:
        Path: Chemin vers frontend/static/images/
    """
    return get_project_root() / 'frontend' / 'static' / 'images'


def ensure_dir_exists(directory: Union[Path, str]) -> None:
    """
    Crée un dossier s'il n'existe pas déjà.
    
    Args:
        directory: Chemin vers le dossier à créer (Path ou str)
    """
    Path(directory).mkdir(parents=True, exist_ok=True)
