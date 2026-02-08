# Anki Sketching

Interface web pour visualiser et organiser spatialement vos cartes Anki sur un canevas infini.

## ⚠️ Important

**Anki Desktop + AnkiConnect doivent être lancés** pour que ça fonctionne.
- Plugin AnkiConnect : code **2055492159**
- Sans Anki : le menu déroulant est vide et les cartes sont vides

## Lancer l'application

```bash
# Installer les dépendances Python
python3 -m pip install -e .

# Lancer l'application
python3 -m uvicorn src.anki_sketching.main:app --reload
```

Puis ouvrir : http://localhost:5000

## Où en est le projet

- ✅ Interface canvas avec drag & drop, zoom, pan
- ✅ Import de decks Anki (filtrés sur "dessin::")
- ✅ Dessin de flèches entre cartes
- ✅ Création de groupes de cartes
- ✅ Sauvegarde automatique dans `data/card_positions.json`
- ✅ Restauration de l'état au démarrage

La session actuelle : 31 cartes du deck "dessin::encre::1-lignes" positionnées et organisées.
