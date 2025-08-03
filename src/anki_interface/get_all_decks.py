from .utils import anki_request

def get_all_decks():
    """
    Récupère les noms de tous les paquets Anki.
    """
    deck_names = anki_request('deckNames')
    return deck_names
