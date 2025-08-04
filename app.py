from flask import Flask, render_template, request, jsonify
from src.anki_interface.get_cards_ids import get_cards_ids
from src.anki_interface.get_card_information import get_card_information
from src.anki_interface.get_all_decks import get_all_decks
import json
import os

app = Flask(__name__)

# Fichier pour sauvegarder les positions des cartes
POSITIONS_FILE = 'card_positions.json'

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

@app.route('/save_positions', methods=['POST'])
def save_positions():
    try:
        positions_data = request.get_json()
        with open(POSITIONS_FILE, 'w') as f:
            json.dump(positions_data, f, indent=2)
        return jsonify({"success": True, "message": "Positions sauvegardées"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/load_positions', methods=['GET'])
def load_positions():
    try:
        if os.path.exists(POSITIONS_FILE):
            with open(POSITIONS_FILE, 'r') as f:
                positions_data = json.load(f)
            return jsonify({"success": True, "positions": positions_data})
        else:
            return jsonify({"success": True, "positions": {}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/get_cards_by_ids', methods=['POST'])
def get_cards_by_ids():
    try:
        card_ids = request.get_json().get('card_ids', [])
        if not card_ids:
            return jsonify({"success": True, "cards": []})
        
        cards_data = []
        for card_id in card_ids:
            card_info = get_card_information(int(card_id), 'static/images')
            if card_info:
                cards_data.append({
                    'card_id': card_id,
                    'texts': card_info['texts'],
                    'images': [f'/static/images/{os.path.basename(img)}' for img in card_info['images']]
                })
        
        return jsonify({"success": True, "cards": cards_data})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

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
