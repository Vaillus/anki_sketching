"""
Module anki_interface - Interface Python pour Anki via AnkiConnect.

Classe principale:
    Card: Représentation orientée objet d'une carte Anki

Fonctions utilitaires (compatibilité):
    get_card_information: Récupère le contenu d'une carte
    get_card_scheduling_info: Récupère les infos de planification
    get_cards_ids: Récupère les IDs de cartes d'un deck
    get_all_decks: Récupère tous les decks disponibles
    get_collection_crt: Récupère le timestamp de création de la collection
"""

from .card import Card
from .get_card_information import get_card_information
from .get_card_scheduling import get_card_scheduling_info, get_card_scheduling_info_with_absolute_date
from .get_cards_ids import get_cards_ids
from .get_all_decks import get_all_decks
from .get_collection_crt import get_collection_crt, find_all_profiles
from .utils import anki_request

__all__ = [
    'Card',
    'get_card_information',
    'get_card_scheduling_info',
    'get_card_scheduling_info_with_absolute_date',
    'get_cards_ids',
    'get_all_decks',
    'get_collection_crt',
    'find_all_profiles',
    'anki_request',
]
