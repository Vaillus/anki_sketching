from flask import Flask, render_template, request, jsonify
from src.anki_interface.get_cards_ids import get_cards_ids
from src.anki_interface.get_card_information import get_card_information
from src.anki_interface.get_all_decks import get_all_decks

app = Flask(__name__)

@app.route('/')
def index():
    all_decks = get_all_decks()
    dessin_decks = []
    if all_decks:
        parent_deck = 'dessin'
        dessin_decks = [
            deck for deck in all_decks 
            if deck == parent_deck or deck.startswith(f"{parent_deck}::")
        ]
    return render_template('index.html', decks=sorted(dessin_decks))

@app.route('/import_deck', methods=['POST'])
def import_deck():
    deck_name = request.form.get('deck_name')
    if not deck_name:
        return jsonify({"error": "Nom du paquet manquant."}), 400

    card_ids = get_cards_ids(deck_name)
    if card_ids is None:
        return jsonify({"error": "Impossible de récupérer les cartes. Vérifiez Anki et le nom du paquet."}), 500

    cards_data = []
    for card_id in card_ids:
        info = get_card_information(card_id, image_output_dir='static/images')
        if info:
            cards_data.append({
                "card_id": card_id,
                "texts": info.get('texts', {}),
                "images": info.get('images', [])
            })
            
    return jsonify(cards_data)

if __name__ == '__main__':
    app.run(debug=True)
