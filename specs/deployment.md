# Deployment

> How the app runs in production (Railway), how local and prod stay in sync, and where the seams are.

## What's deployed

The same FastAPI app that runs locally also runs on **Railway** as a hosted instance, so exercises can be reviewed from any device (notably the phone — see [mobile.md](./mobile.md)) without the Mac being on.

| | Local | Production (Railway) |
|---|---|---|
| URL | `http://localhost:5050` | `https://web-production-e02fd.up.railway.app` |
| Process | `bash start.sh` / uvicorn `--reload` | `Procfile`: `uvicorn … --port $PORT` |
| Auth | none (`APP_PASSWORD` unset) | HTTP Basic (`APP_PASSWORD` set) |
| Data location | `./data` | volume mounted at `/data` (`DATA_DIR=/data`) |
| Anki integration | works (AnkiConnect at `localhost:8765`) | unavailable — returns 503 |

It is the **same codebase, same app object** (`src.anki_sketching.main:app`). Environment variables are the only thing that changes behavior between the two.

## Configuration: two env vars

Both are documented in `.env.example`. Locally both are unset; on Railway both are set.

| Env var | Purpose | Behavior when unset |
|---|---|---|
| `DATA_DIR` | Absolute path where `cards.db`, `graph.db`, `card_positions.json`, and `images/` live. Set to the mounted volume path (`/data`) in prod. | Falls back to `<project_root>/data` (`get_data_dir()` in `src/utilities/paths.py`). |
| `APP_PASSWORD` | Single shared password for HTTP Basic Auth. | Auth middleware is a no-op — the app is fully open (fine for local dev). |

### Auth model

`basic_auth_middleware` (`src/anki_sketching/main.py`) gates **every** request when `APP_PASSWORD` is set. This is a doorman, not a real auth system:

- The **username is ignored** — any value works.
- Only the password is checked, against `APP_PASSWORD`, via `secrets.compare_digest`.
- No `APP_PASSWORD` → middleware passes everything through.

## The volume and seeding

Railway's filesystem is ephemeral except for the mounted volume at `/data`. All mutable user state lives there:

```
/data
  cards.db
  graph.db
  card_positions.json
  images/        ← card images (local_*.png), see cards.md
```

`get_images_dir()` puts images under `DATA_DIR` too, so they persist with the databases rather than living in the (ephemeral) app image.

### First-boot seed (`src/anki_sketching/seed.py`)

`seed_data_dir()` runs once at import time in `main.py`, **before** any DB open or migration. It bootstraps an empty volume from the `data/` directory bundled in the git image:

- If `DATA_DIR` is unset (local) → **no-op**. Local files already exist.
- If set → for each of `cards.db`, `graph.db`, `card_positions.json`, and every file in `data/images/`: copy from the bundled `data/` to the volume **only if the destination doesn't already exist.**

The "only if absent" rule makes it **idempotent**: redeploys never overwrite live prod data with the stale snapshot committed to git. The committed `data/` is just the initial seed, not an ongoing source of truth.

## Sync: local ↔ prod

This is the crux, and it is currently **one-directional**.

### Mac → prod (supported)

Because prod data lives on the volume and the committed `data/` is only a first-boot seed, you cannot ship data changes through git. Two admin endpoints push files straight onto the volume (both behind Basic Auth, both atomic via `.upload` + `os.replace`):

| Endpoint | Accepts |
|---|---|
| `POST /admin/upload_data_file` | multipart `file`; filename must be exactly `cards.db`, `graph.db`, or `card_positions.json` |
| `POST /admin/upload_image_file` | multipart `file`; basename only (no path traversal); extension in `.png/.jpg/.jpeg/.gif/.webp` |

Uploaded DBs take effect immediately — new requests open a fresh connection and see the new file; no redeploy needed.

### Prod → Mac (not yet built)

There is **no endpoint to download** `cards.db` / `graph.db` / `card_positions.json` / images back from the volume. So changes made *on the hosted site* (reviews, new exercises created on the phone) currently cannot be pulled back to the Mac. This is a known gap — see [the open question below](#open-question-prod--mac-sync).

## Module map (deployment-relevant)

| Path | Role |
|---|---|
| `Procfile` | Railway start command. Binds uvicorn to `$PORT`. |
| `.env.example` | Documents `DATA_DIR` and `APP_PASSWORD`. |
| `src/anki_sketching/seed.py` | `seed_data_dir()` — idempotent first-boot volume seed. |
| `src/anki_sketching/main.py` | `basic_auth_middleware`; calls `seed_data_dir()` before migrations. |
| `src/utilities/paths.py` | `get_data_dir()` / `get_images_dir()` honor `DATA_DIR`. |
| `src/anki_sketching/api/routes.py` | `/admin/upload_data_file`, `/admin/upload_image_file`. |

## Open question: prod → Mac sync

The reverse direction is unbuilt. Possible shapes (to decide later):

- **Download endpoints** — `GET /admin/download_data_file?name=cards.db` etc., mirroring the upload pair, then a small local script to pull all four artifacts.
- A **bundle endpoint** — `GET /admin/export` returning a zip/tar of the whole `/data` tree in one request.

Either way the merge story matters: prod and local both mutate the same SQLite files, so "sync" is really "pick a winner and overwrite," not a true merge. Whichever side is authoritative for a given session should push; the other side pulls and accepts the overwrite.
