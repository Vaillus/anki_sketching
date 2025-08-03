import requests
import json

def anki_request(action, **params):
    """
    Fonction générique pour envoyer une requête à l'API AnkiConnect.
    """
    payload = {"action": action, "params": params, "version": 6}
    payload_json = json.dumps(payload)
    
    try:
        response = requests.post("http://localhost:8765", data=payload_json)
        response.raise_for_status()
        response_json = response.json()
        
        if response_json.get("error"):
            raise Exception(f"Erreur de l'API Anki : {response_json['error']}")
            
        return response_json.get("result")

    except requests.exceptions.RequestException as e:
        print(f"Erreur de connexion à Anki. Anki est-il bien lancé avec AnkiConnect ?")
        print(f"Détail de l'erreur : {e}")
        return None
    except Exception as e:
        print(e)
        return None
