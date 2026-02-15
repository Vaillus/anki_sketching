#!/bin/bash
# Run the Anki Sketching FastAPI application

uv run uvicorn src.anki_sketching.main:app --reload --port 5000
