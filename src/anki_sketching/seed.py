"""
Initialisation idempotente du volume persistant en prod.

En local (DATA_DIR non défini), no-op : les fichiers existent déjà dans
./data. En prod (Railway), DATA_DIR pointe vers un volume monté qui peut
être vide au premier démarrage. Cette fonction copie les fichiers seed
livrés dans l'image (./data/*) vers le volume, mais uniquement si la
destination n'existe pas — les redéploiements ne touchent jamais à un
fichier déjà présent.
"""
import os
import shutil
from pathlib import Path

from src.utilities.paths import get_project_root


SEED_FILES = ("cards.db", "graph.db", "card_positions.json")


def seed_data_dir() -> None:
    env_dir = os.environ.get("DATA_DIR")
    if not env_dir:
        return

    target_dir = Path(env_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    source_dir = get_project_root() / "data"
    for name in SEED_FILES:
        target = target_dir / name
        source = source_dir / name
        if target.exists() or not source.exists():
            continue
        shutil.copy2(source, target)
        print(f"[seed] copied {source} -> {target}")

    # Seed les images de cartes commitées (local_*.png) vers le volume.
    # Les fichiers déjà présents ne sont jamais écrasés.
    source_images = source_dir / "images"
    if not source_images.is_dir():
        return
    target_images = target_dir / "images"
    target_images.mkdir(parents=True, exist_ok=True)
    for src in source_images.iterdir():
        if not src.is_file():
            continue
        dest = target_images / src.name
        if dest.exists():
            continue
        shutil.copy2(src, dest)
        print(f"[seed] copied {src} -> {dest}")
