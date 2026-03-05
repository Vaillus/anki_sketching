#!/bin/bash
# Run the Anki Sketching FastAPI application

PORT=5000
echo ""
echo "=========================================="
echo "  Anki Sketching"
echo "  http://localhost:${PORT}"
echo "=========================================="
echo ""

uv run uvicorn src.anki_sketching.main:app --reload --port "$PORT"
