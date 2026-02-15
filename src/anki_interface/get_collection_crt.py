"""
Récupère le timestamp de création de la collection Anki (crt).
"""
import sqlite3
import os
from pathlib import Path
from typing import Optional

# Timeout (secondes) pour attendre que le verrou Anki soit libéré
_DB_TIMEOUT = 15


def get_collection_crt(collection_path: Optional[str] = None) -> Optional[int]:
    """
    Récupère le timestamp de création de la collection Anki (crt).
    
    Le crt (creation time) est nécessaire pour calculer les dates de révision
    des cartes en mode Review (type=2), où 'due' est un numéro de jour relatif
    à la date de création de la collection.
    
    AnkiConnect n'expose pas directement le crt, donc cette fonction lit
    directement la base de données SQLite de la collection.
    
    Fonctionne même quand Anki est ouvert : on attend le verrou (timeout)
    puis en secours on tente une lecture immutable (sans prendre de lock).
    
    Args:
        collection_path: Chemin vers le fichier collection.anki2
                        Si None, tente de le trouver automatiquement dans
                        les emplacements standards de macOS
    
    Returns:
        int: Timestamp Unix (en secondes) de la création de la collection,
             ou None si impossible à récupérer.
    """
    if collection_path is None:
        collection_path = _find_collection_path()
    
    if collection_path is None or not os.path.exists(collection_path):
        return None
    
    # 1) Lecture normale avec timeout : on attend que Anki libère le lock
    result = _read_crt(f'file:{collection_path}?mode=ro', timeout=_DB_TIMEOUT)
    if result is not None:
        return result
    
    # 2) Secours : lecture immutable (pas de lock, lecture directe du fichier)
    # Sans danger pour crt car cette valeur ne change jamais
    result = _read_crt(f'file:{collection_path}?mode=ro&immutable=1', timeout=0)
    if result is not None:
        return result
    
    return None


def _read_crt(uri: str, timeout: float) -> Optional[int]:
    """Exécute SELECT crt FROM col. Retourne None en cas d'erreur."""
    try:
        conn = sqlite3.connect(uri, uri=True, timeout=timeout)
        cursor = conn.cursor()
        cursor.execute('SELECT crt FROM col')
        result = cursor.fetchone()
        conn.close()
        if result is not None:
            return result[0]
    except (sqlite3.OperationalError, sqlite3.DatabaseError):
        pass
    except Exception:
        pass
    return None


def _find_collection_path() -> Optional[str]:
    """
    Cherche le fichier collection.anki2 dans les emplacements standards.
    
    Returns:
        str: Chemin vers collection.anki2, ou None si non trouvé
    """
    home = Path.home()
    
    # Chemins standards pour différents systèmes
    possible_paths = [
        # macOS
        home / 'Library' / 'Application Support' / 'Anki2' / 'User 1' / 'collection.anki2',
        home / 'Documents' / 'Anki2' / 'User 1' / 'collection.anki2',
        # Linux
        home / '.local' / 'share' / 'Anki2' / 'User 1' / 'collection.anki2',
        # Windows (via WSL ou autre)
        home / 'AppData' / 'Roaming' / 'Anki2' / 'User 1' / 'collection.anki2',
    ]
    
    # Chercher d'autres profils aussi
    anki_base = home / 'Library' / 'Application Support' / 'Anki2'
    if anki_base.exists():
        for profile_dir in anki_base.iterdir():
            if profile_dir.is_dir():
                coll_file = profile_dir / 'collection.anki2'
                if coll_file.exists():
                    return str(coll_file)
    
    # Essayer les chemins standards
    for path in possible_paths:
        if path.exists():
            return str(path)
    
    return None


def find_all_profiles() -> list[tuple[str, str]]:
    """
    Trouve tous les profils Anki disponibles.
    
    Returns:
        list[tuple[str, str]]: Liste de tuples (nom_profil, chemin_collection)
    """
    profiles = []
    home = Path.home()
    
    # Base Anki sur macOS
    anki_base = home / 'Library' / 'Application Support' / 'Anki2'
    
    if anki_base.exists():
        for profile_dir in anki_base.iterdir():
            if profile_dir.is_dir():
                coll_file = profile_dir / 'collection.anki2'
                if coll_file.exists():
                    profiles.append((profile_dir.name, str(coll_file)))
    
    return profiles
