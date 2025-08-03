from .utils import anki_request

def get_cards_ids(deck_name):
    """
    Récupère les IDs de toutes les cartes d'un paquet (deck) spécifié.
    """
    query = f'deck:"{deck_name}"'
    card_ids = anki_request('findCards', query=query)
    return card_ids
