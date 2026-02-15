"""
Classe Card pour représenter une carte Anki avec toutes ses informations.
"""
import os
import re
import base64
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from .utils import anki_request


class Card:
    """
    Représente une carte Anki avec son contenu et ses informations de planification SRS.
    
    Attributes:
        card_id (int): Identifiant unique de la carte
        
        # Contenu
        texts (dict): Dictionnaire des champs texte {field_name: text_content}
        images (list): Liste des chemins vers les images de la carte
        
        # Planification SRS
        interval (int): Intervalle actuel en jours
        factor (int): Facteur de facilité (ease factor) brut (ex: 2600 = 260%)
        due (int): Date de prochaine révision (format dépend du type)
        type (int): Type de carte (0=new, 1=learning, 2=review, 3=relearning)
        queue (int): File d'attente (-3 à 3, voir documentation)
        
        # Statistiques
        reps (int): Nombre de révisions effectuées
        lapses (int): Nombre d'oublis
        next_reviews (list): Prochains intervalles possibles selon le bouton choisi
        
        # Métadonnées
        deck_name (str): Nom du deck contenant la carte
        note_id (int): ID de la note associée
        model_name (str): Nom du modèle de note
        
        # État de chargement
        _loaded (bool): Indique si les données ont été chargées
        _exists (bool): Indique si la carte existe dans Anki
    """
    
    def __init__(self, card_id: int, load_images: bool = False, image_output_dir: Optional[str] = None):
        """
        Initialise une carte et charge ses informations depuis Anki.
        
        Args:
            card_id: L'ID de la carte à charger
            load_images: Si True, télécharge les images de la carte
            image_output_dir: Dossier où sauvegarder les images (requis si load_images=True)
        """
        self.card_id = card_id
        
        # Contenu
        self.texts: Dict[str, str] = {}
        self.images: List[str] = []
        
        # Planification SRS
        self.interval: int = 0
        self.factor: int = 0
        self.due: int = 0
        self.type: int = 0
        self.queue: int = 0
        
        # Statistiques
        self.reps: int = 0
        self.lapses: int = 0
        self.next_reviews: List[str] = []
        
        # Métadonnées
        self.deck_name: str = ""
        self.note_id: int = 0
        self.model_name: str = ""
        
        # État
        self._loaded: bool = False
        self._exists: bool = False
        
        # Charger les données
        self._load(load_images, image_output_dir)
    
    def _load(self, load_images: bool = False, image_output_dir: Optional[str] = None):
        """
        Charge toutes les informations de la carte depuis AnkiConnect.
        
        Args:
            load_images: Si True, télécharge les images
            image_output_dir: Dossier pour sauvegarder les images
        """
        card_info_list = anki_request('cardsInfo', cards=[self.card_id])
        if not card_info_list:
            self._exists = False
            return
        
        self._exists = True
        card_info = card_info_list[0]
        
        # Extraire le contenu des champs
        fields = card_info.get('fields', {})
        img_regex = r'<img src="([^"]+)">'
        
        if load_images and image_output_dir:
            os.makedirs(image_output_dir, exist_ok=True)
        
        for field_name, content in fields.items():
            html_content = content.get('value', '')
            
            # Extraire le texte (sans HTML)
            text_content = re.sub(r'<[^>]+>', '', html_content).strip()
            if text_content:
                self.texts[field_name] = text_content
            
            # Extraire et télécharger les images si demandé
            if load_images and image_output_dir:
                image_filenames = re.findall(img_regex, html_content)
                for filename in image_filenames:
                    image_data_b64 = anki_request('retrieveMediaFile', filename=filename)
                    if image_data_b64:
                        try:
                            image_data = base64.b64decode(image_data_b64)
                            output_path = os.path.join(image_output_dir, filename)
                            with open(output_path, 'wb') as f:
                                f.write(image_data)
                            self.images.append(output_path)
                        except (ValueError, TypeError):
                            pass
        
        # Extraire les informations de planification SRS
        self.interval = card_info.get('interval', 0)
        self.factor = card_info.get('factor', 0)
        self.due = card_info.get('due', 0)
        self.type = card_info.get('type', 0)
        self.queue = card_info.get('queue', 0)
        
        # Extraire les statistiques
        self.reps = card_info.get('reps', 0)
        self.lapses = card_info.get('lapses', 0)
        self.next_reviews = card_info.get('nextReviews', [])
        
        # Extraire les métadonnées
        self.deck_name = card_info.get('deckName', '')
        self.note_id = card_info.get('note', 0)
        self.model_name = card_info.get('modelName', '')
        
        self._loaded = True
    
    # ==================== PROPRIÉTÉS CALCULÉES ====================
    
    @property
    def exists(self) -> bool:
        """Retourne True si la carte existe dans Anki."""
        return self._exists
    
    @property
    def factor_percent(self) -> float:
        """Facteur de facilité en pourcentage (ex: 2600 -> 260.0)."""
        return self.factor / 10 if self.factor else 0
    
    @property
    def is_new(self) -> bool:
        """Retourne True si c'est une nouvelle carte."""
        return self.type == 0
    
    @property
    def is_learning(self) -> bool:
        """Retourne True si la carte est en apprentissage."""
        return self.type in [1, 3]  # Learning ou Relearning
    
    @property
    def is_review(self) -> bool:
        """Retourne True si la carte est en révision."""
        return self.type == 2
    
    @property
    def is_suspended(self) -> bool:
        """Retourne True si la carte est suspendue."""
        return self.queue == -1
    
    @property
    def is_buried(self) -> bool:
        """Retourne True si la carte est enterrée."""
        return self.queue in [-2, -3]
    
    @property
    def is_difficult(self) -> bool:
        """Retourne True si la carte est considérée comme difficile (factor < 230%)."""
        return 0 < self.factor < 2300
    
    @property
    def is_easy(self) -> bool:
        """Retourne True si la carte est considérée comme facile (factor >= 250%)."""
        return self.factor >= 2500
    
    @property
    def type_label(self) -> str:
        """Label lisible du type de carte."""
        labels = {
            0: "New",
            1: "Learning",
            2: "Review",
            3: "Relearning"
        }
        return labels.get(self.type, f"Unknown ({self.type})")
    
    @property
    def queue_label(self) -> str:
        """Label lisible de la queue."""
        labels = {
            -3: "User Buried",
            -2: "Scheduler Buried",
            -1: "Suspended",
            0: "New",
            1: "Learning",
            2: "Review",
            3: "In Learning"
        }
        return labels.get(self.queue, f"Unknown ({self.queue})")
    
    @property
    def difficulty_level(self) -> str:
        """
        Niveau de difficulté basé sur le facteur.
        
        Returns:
            "new", "very_hard", "hard", "medium", "easy", ou "very_easy"
        """
        if self.factor == 0:
            return "new"
        elif self.factor < 2000:
            return "very_hard"
        elif self.factor < 2300:
            return "hard"
        elif self.factor < 2500:
            return "medium"
        elif self.factor < 2700:
            return "easy"
        else:
            return "very_easy"
    
    @property
    def front(self) -> str:
        """Raccourci pour accéder au champ Front."""
        return self.texts.get('Front', '')
    
    @property
    def back(self) -> str:
        """Raccourci pour accéder au champ Back."""
        return self.texts.get('Back', '')
    
    # ==================== MÉTHODES ====================
    
    def get_due_date(self, collection_creation_timestamp: Optional[int] = None) -> Optional[datetime]:
        """
        Calcule la date de prochaine révision.
        
        Args:
            collection_creation_timestamp: Timestamp de création de la collection (optionnel)
                Nécessaire pour les cartes en Review (type=2)
        
        Returns:
            datetime de la prochaine révision, ou None si impossible à calculer
        """
        if self.type == 2 and collection_creation_timestamp:
            # Review card: due est un numéro de jour relatif
            collection_creation = datetime.fromtimestamp(collection_creation_timestamp)
            return collection_creation + timedelta(days=self.due)
        elif self.type in [1, 3]:
            # Learning/Relearning: due est un timestamp
            try:
                return datetime.fromtimestamp(self.due)
            except (ValueError, OSError):
                return None
        return None
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convertit la carte en dictionnaire pour sérialisation JSON.
        
        Returns:
            Dictionnaire contenant toutes les informations de la carte
        """
        return {
            'card_id': self.card_id,
            'exists': self.exists,
            
            # Contenu
            'texts': self.texts,
            'images': self.images,
            
            # Planification SRS
            'interval': self.interval,
            'factor': self.factor,
            'factor_percent': self.factor_percent,
            'due': self.due,
            'type': self.type,
            'type_label': self.type_label,
            'queue': self.queue,
            'queue_label': self.queue_label,
            
            # Statistiques
            'reps': self.reps,
            'lapses': self.lapses,
            'next_reviews': self.next_reviews,
            
            # Métadonnées
            'deck_name': self.deck_name,
            'note_id': self.note_id,
            'model_name': self.model_name,
            
            # Propriétés calculées
            'is_new': self.is_new,
            'is_learning': self.is_learning,
            'is_review': self.is_review,
            'is_suspended': self.is_suspended,
            'is_buried': self.is_buried,
            'is_difficult': self.is_difficult,
            'is_easy': self.is_easy,
            'difficulty_level': self.difficulty_level,
        }
    
    def __repr__(self) -> str:
        """Représentation textuelle de la carte."""
        if not self.exists:
            return f"Card({self.card_id}) [NOT FOUND]"
        
        front_preview = self.front[:30] + '...' if len(self.front) > 30 else self.front
        return (f"Card({self.card_id}) [{self.type_label}] "
                f"interval={self.interval}d factor={self.factor_percent:.0f}% "
                f"lapses={self.lapses} | {front_preview}")
    
    def __str__(self) -> str:
        """Version lisible de la carte."""
        return self.__repr__()
    
    # ==================== MÉTHODES DE CLASSE ====================
    
    @classmethod
    def from_deck(cls, deck_name: str, load_images: bool = False, 
                  image_output_dir: Optional[str] = None) -> List['Card']:
        """
        Charge toutes les cartes d'un deck.
        
        Args:
            deck_name: Nom du deck
            load_images: Si True, télécharge les images
            image_output_dir: Dossier pour sauvegarder les images
        
        Returns:
            Liste d'objets Card
        """
        card_ids = anki_request('findCards', query=f'deck:"{deck_name}"')
        if not card_ids:
            return []
        
        return [cls(card_id, load_images, image_output_dir) for card_id in card_ids]
    
    @classmethod
    def find_difficult_cards(cls, deck_name: Optional[str] = None, 
                            max_factor: int = 2300) -> List['Card']:
        """
        Trouve les cartes difficiles (factor < max_factor).
        
        Args:
            deck_name: Nom du deck (optionnel, sinon toutes les cartes)
            max_factor: Facteur maximum pour considérer une carte comme difficile
        
        Returns:
            Liste de cartes difficiles triées par facteur croissant
        """
        query = f'deck:"{deck_name}"' if deck_name else '*'
        card_ids = anki_request('findCards', query=query)
        if not card_ids:
            return []
        
        difficult_cards = []
        for card_id in card_ids:
            card = cls(card_id)
            if card.exists and 0 < card.factor < max_factor:
                difficult_cards.append(card)
        
        # Trier par facteur croissant
        difficult_cards.sort(key=lambda c: c.factor)
        return difficult_cards
    
    @classmethod
    def get_deck_statistics(cls, deck_name: str) -> Dict[str, Any]:
        """
        Calcule des statistiques sur un deck.
        
        Args:
            deck_name: Nom du deck
        
        Returns:
            Dictionnaire de statistiques
        """
        cards = cls.from_deck(deck_name)
        if not cards:
            return {
                'total_cards': 0,
                'error': 'No cards found'
            }
        
        review_cards = [c for c in cards if c.is_review]
        
        stats = {
            'total_cards': len(cards),
            'new_cards': sum(1 for c in cards if c.is_new),
            'learning_cards': sum(1 for c in cards if c.is_learning),
            'review_cards': len(review_cards),
            'suspended_cards': sum(1 for c in cards if c.is_suspended),
        }
        
        if review_cards:
            total_interval = sum(c.interval for c in review_cards)
            total_factor = sum(c.factor for c in review_cards)
            total_lapses = sum(c.lapses for c in review_cards)
            
            stats.update({
                'avg_interval': total_interval / len(review_cards),
                'avg_factor': total_factor / len(review_cards),
                'avg_factor_percent': (total_factor / len(review_cards)) / 10,
                'avg_lapses': total_lapses / len(review_cards),
                'difficult_cards': sum(1 for c in review_cards if c.is_difficult),
                'easy_cards': sum(1 for c in review_cards if c.is_easy),
            })
        
        return stats
