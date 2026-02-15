from datetime import datetime, timedelta
from .utils import anki_request

def get_card_scheduling_info(card_id):
    """
    Récupère les informations de planification SRS d'une carte.
    
    Args:
        card_id (int): L'ID de la carte à récupérer.
    
    Returns:
        dict: Un dictionnaire contenant les informations de planification :
            - card_id: L'ID de la carte
            - interval: Intervalle actuel en jours
            - factor: Le facteur de facilité (EF) en pourcentage (ex: 2600 = 260%)
            - due: Date de prochaine révision (format dépend du type)
            - due_date: Date de prochaine révision convertie en datetime (si possible)
            - type: Type de carte (0=new, 1=learning, 2=review, 3=relearning)
            - type_label: Label lisible du type
            - queue: Queue de la carte (-3=user buried, -2=sched buried, -1=suspended, 
                     0=new, 1=learning, 2=review, 3=in learning)
            - queue_label: Label lisible de la queue
            - reps: Nombre de révisions effectuées
            - lapses: Nombre d'oublis
            - next_reviews: Prochains intervalles possibles
            - deck_name: Nom du deck
            - note_id: ID de la note associée
        None si la carte n'existe pas.
    """
    card_info_list = anki_request('cardsInfo', cards=[card_id])
    if not card_info_list:
        return None
    
    card_info = card_info_list[0]
    
    # Extraire les informations de base
    interval = card_info.get('interval', 0)
    factor = card_info.get('factor', 0)
    due = card_info.get('due', 0)
    card_type = card_info.get('type', 0)
    queue = card_info.get('queue', 0)
    reps = card_info.get('reps', 0)
    lapses = card_info.get('lapses', 0)
    next_reviews = card_info.get('nextReviews', [])
    deck_name = card_info.get('deckName', '')
    note_id = card_info.get('note', 0)
    
    # Labels pour les types
    type_labels = {
        0: "New",
        1: "Learning",
        2: "Review",
        3: "Relearning"
    }
    
    queue_labels = {
        -3: "User Buried",
        -2: "Scheduler Buried",
        -1: "Suspended",
        0: "New",
        1: "Learning",
        2: "Review",
        3: "In Learning"
    }
    
    # Calculer la date de prochaine révision
    due_date = None
    due_info = {
        'raw_value': due,
        'interpretation': None
    }
    
    if card_type == 2:  # Review card
        # due est un numéro de jour relatif à la création de la collection
        # Pour obtenir la date absolue, on aurait besoin de la date de création de la collection
        # On peut au moins indiquer que c'est un numéro de jour
        due_info['interpretation'] = f"Day number {due} (relative to collection creation)"
        # Note: Pour convertir en date absolue, il faudrait récupérer la date de création 
        # de la collection via: collection = anki_request('getCollectionInfo')
        # puis: due_date = datetime.fromtimestamp(collection['crt']) + timedelta(days=due)
    elif card_type in [1, 3]:  # Learning or Relearning
        # due est un timestamp Unix en secondes
        try:
            due_date = datetime.fromtimestamp(due)
            due_info['interpretation'] = f"Timestamp: {due_date.isoformat()}"
        except (ValueError, OSError):
            due_info['interpretation'] = "Invalid timestamp"
    elif card_type == 0:  # New card
        due_info['interpretation'] = "Position in new queue"
    
    return {
        'card_id': card_id,
        'interval': interval,
        'factor': factor,
        'factor_percent': factor / 10 if factor else 0,  # Convertir en pourcentage (ex: 2600 -> 260%)
        'due': due_info,
        'due_date': due_date,
        'type': card_type,
        'type_label': type_labels.get(card_type, f"Unknown ({card_type})"),
        'queue': queue,
        'queue_label': queue_labels.get(queue, f"Unknown ({queue})"),
        'reps': reps,
        'lapses': lapses,
        'next_reviews': next_reviews,
        'deck_name': deck_name,
        'note_id': note_id
    }


def get_card_scheduling_info_with_absolute_date(card_id, collection_creation_timestamp=None):
    """
    Récupère les informations de planification avec conversion de la date absolue.
    
    Args:
        card_id (int): L'ID de la carte à récupérer.
        collection_creation_timestamp (int, optional): Timestamp Unix de création de la collection.
            Si fourni, permet de calculer la date absolue de révision pour les cartes en Review.
            Pour l'obtenir: ouvrir Anki, aller dans Browse, noter la date de la première carte créée.
    
    Returns:
        dict: Même format que get_card_scheduling_info mais avec due_date_absolute calculée si possible.
    """
    info = get_card_scheduling_info(card_id)
    if not info:
        return None
    
    # Si on a le timestamp de création de la collection et que c'est une carte en Review
    if collection_creation_timestamp and info['type'] == 2:
        try:
            collection_creation = datetime.fromtimestamp(collection_creation_timestamp)
            due_date_absolute = collection_creation + timedelta(days=info['due']['raw_value'])
            info['due_date_absolute'] = due_date_absolute
            info['due']['interpretation'] = f"Absolute date: {due_date_absolute.isoformat()}"
            
            # Ajouter le nombre de jours restants
            days_until = (due_date_absolute - datetime.now()).days
            info['days_until_due'] = days_until
        except (ValueError, OSError):
            pass
    
    return info
