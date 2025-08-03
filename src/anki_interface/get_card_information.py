import os
import re
import base64
from .utils import anki_request

def get_card_information(card_id, image_output_dir=None):
    """
    Récupère les informations d'une carte, y compris le texte et les images.
    
    Args:
        card_id (int): L'ID de la carte à récupérer.
        image_output_dir (str, optional): Le dossier où sauvegarder les images.
                                           Si None, les images ne sont pas sauvegardées.
    
    Returns:
        dict: Un dictionnaire contenant les textes et les chemins des images.
    """
    card_info_list = anki_request('cardsInfo', cards=[card_id])
    if not card_info_list:
        return None

    card_info = card_info_list[0]
    fields = card_info.get('fields', {})
    
    texts = {}
    images = []

    img_regex = r'<img src="([^"]+)">'

    if image_output_dir:
        os.makedirs(image_output_dir, exist_ok=True)

    for field_name, content in fields.items():
        html_content = content.get('value', '')
        
        # Extrait les noms de fichiers d'image
        image_filenames = re.findall(img_regex, html_content)
        
        # Supprime les balises HTML pour ne garder que le texte
        text_content = re.sub(r'<[^>]+>', '', html_content).strip()
        if text_content:
            texts[field_name] = text_content

        if image_output_dir and image_filenames:
            for filename in image_filenames:
                image_data_b64 = anki_request('retrieveMediaFile', filename=filename)
                if image_data_b64:
                    try:
                        image_data = base64.b64decode(image_data_b64)
                        output_path = os.path.join(image_output_dir, filename)
                        with open(output_path, 'wb') as f:
                            f.write(image_data)
                        images.append(output_path)
                    except (ValueError, TypeError):
                        pass # Ignore les erreurs de décodage

    return {"texts": texts, "images": images}
