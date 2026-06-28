"""
Détection de l'environnement d'exécution (prod hébergé vs local).

Source de vérité unique : `is_production()`. À utiliser partout où le code a
besoin de savoir « est-ce que je tourne sur l'instance hébergée (Railway) ? »,
plutôt que de re-déduire la réponse depuis des proxys (APP_PASSWORD défini,
DATA_DIR défini, etc.). Voir specs/deployment.md.
"""
import os

# Variables auto-injectées par Railway sur la prod (absentes en local).
_RAILWAY_VARS = (
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_ENVIRONMENT_NAME",
    "RAILWAY_PROJECT_ID",
)


def is_production() -> bool:
    """True si l'app tourne sur l'instance hébergée (prod).

    1. APP_ENV explicite (`production`/`prod`) → prod ; autre valeur → local.
    2. Sinon, fallback sur les variables auto de Railway.
    3. Aucun signal → local/dev.
    """
    app_env = os.environ.get("APP_ENV", "").strip().lower()
    if app_env:
        return app_env in ("production", "prod")
    return any(os.environ.get(var) for var in _RAILWAY_VARS)
