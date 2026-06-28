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

## Configuration: env vars

All are documented in `.env.example`. Locally they're unset; on Railway the prod-side ones are set.

| Env var | Purpose | Behavior when unset |
|---|---|---|
| `DATA_DIR` | Absolute path where `cards.db`, `graph.db`, `card_positions.json`, and `images/` live. Set to the mounted volume path (`/data`) in prod. | Falls back to `<project_root>/data` (`get_data_dir()` in `src/utilities/paths.py`). |
| `APP_PASSWORD` | Single shared password for HTTP Basic Auth. | Auth middleware is a no-op — the app is fully open (fine for local dev). |
| `APP_ENV` | Explicit environment name (`production` on Railway). Primary signal for `is_production()`. | Falls back to Railway's auto-injected vars; if none, treated as **local/dev**. |
| `PROD_URL` | Base URL the **local** instance pulls from during prod → Mac sync. | Defaults to the known Railway URL (`DEFAULT_PROD_URL` in `routes.py`). |
| `PROD_PASSWORD` | Password the local instance sends as Basic Auth when pulling from prod. **Same value** as prod's `APP_PASSWORD`. Only set this **locally** — never name it `APP_PASSWORD` locally or you'd switch on the local auth middleware. | Sync calls hit prod unauthenticated and get 401. |

`PROD_URL` / `PROD_PASSWORD` live in a gitignored `.env` at the repo root, loaded at startup by `load_dotenv()` in `main.py` (dependency: `python-dotenv`).

### Environment detection — `is_production()`

`is_production()` (`src/utilities/env.py`) is the **single source of truth** for "am I running on the hosted instance?". Use it instead of re-deriving the answer from side-effect proxies (`APP_PASSWORD` set, `DATA_DIR` set, etc.).

Rule:
1. If `APP_ENV` is set → `production`/`prod` (case-insensitive) means prod; anything else means local.
2. Otherwise fall back to Railway's auto-injected vars (`RAILWAY_ENVIRONMENT`, `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_PROJECT_ID`) — present on Railway, absent locally.
3. Neither → **local/dev**.

So prod is detected automatically on Railway even without `APP_ENV`; setting `APP_ENV=production` makes it explicit and platform-independent.

**Current uses:** the editor passes `is_prod` to its template to hide prod-irrelevant UI — the **Anki status chip + import popover** (AnkiConnect is Mac-only) and the **"Sync depuis la prod" button** (only meaningful when run locally). The auth middleware and seed still key off `APP_PASSWORD` / `DATA_DIR` respectively; they're candidates to migrate onto `is_production()` later but are left as-is for now.

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

Both directions exist. Because prod and local both mutate the same SQLite files, **sync is "pick a winner and overwrite," not a merge.** Whichever side is authoritative for a session pushes (or the other pulls); the loser accepts the overwrite. In practice reviews now happen on prod, so the common move is **prod → Mac**.

### Mac → prod (supported)

Because prod data lives on the volume and the committed `data/` is only a first-boot seed, you cannot ship data changes through git. Two admin endpoints push files straight onto the volume (both behind Basic Auth, both atomic via `.upload` + `os.replace`):

| Endpoint | Accepts |
|---|---|
| `POST /admin/upload_data_file` | multipart `file`; filename must be exactly `cards.db`, `graph.db`, or `card_positions.json` |
| `POST /admin/upload_image_file` | multipart `file`; basename only (no path traversal); extension in `.png/.jpg/.jpeg/.gif/.webp` |

Uploaded DBs take effect immediately — new requests open a fresh connection and see the new file; no redeploy needed.

### Prod → Mac (supported)

The reverse mirror. The **served side** (i.e. prod) exposes download endpoints; the **local instance** pulls from them and overwrites its own `./data`. All behind Basic Auth, all atomic via `.download` temp + `os.replace`:

| Endpoint | Role |
|---|---|
| `GET /admin/download_data_file?name=<f>` | Returns one of `cards.db` / `graph.db` / `card_positions.json` (allowlisted). 400 on bad name, 404 if absent. |
| `GET /admin/list_images` | JSON `{"images": [...]}` — every image basename in `<DATA_DIR>/images/`. (The images themselves download via the existing `/static/images/<name>` mount.) |
| `POST /admin/sync_from_prod` | Run on the **local** instance. Pulls the 3 data files + all images from `PROD_URL` using `PROD_PASSWORD`, then overwrites local `./data`. |

`sync_from_prod` (in `routes.py`, uses `requests`):

1. Downloads the 3 data files to `<DATA_DIR>/<name>.download`.
2. Backs up the current 3 files to `<DATA_DIR>/.sync_backup/` (one-level undo).
3. Atomically swaps each in via `os.replace`.
4. Lists prod images, downloads each via `/static/images/<name>`, overwrites local copies. **Local images absent from prod are left untouched** (add/overwrite, never delete).
5. Resets the in-process `_cached_crt` (graph.db changed).
6. Returns `{success, data_files, images: <count>}`; network errors → 502.

**Deployment dependency:** the download endpoints must be running *on prod* for the pull to work, so a new download endpoint only takes effect after a redeploy. The local app can still serve (and self-test) these endpoints before deploying.

## Module map (deployment-relevant)

| Path | Role |
|---|---|
| `Procfile` | Railway start command. Binds uvicorn to `$PORT`. |
| `.env.example` | Documents `DATA_DIR` and `APP_PASSWORD`. |
| `src/anki_sketching/seed.py` | `seed_data_dir()` — idempotent first-boot volume seed. |
| `src/anki_sketching/main.py` | `load_dotenv()` at import; `basic_auth_middleware`; calls `seed_data_dir()` before migrations. |
| `src/utilities/paths.py` | `get_data_dir()` / `get_images_dir()` honor `DATA_DIR`. |
| `src/anki_sketching/api/routes.py` | Upload: `/admin/upload_data_file`, `/admin/upload_image_file`. Download/pull: `/admin/download_data_file`, `/admin/list_images`, `/admin/sync_from_prod`. |
| `.env` (gitignored) | Local-only `PROD_URL` / `PROD_PASSWORD` for prod → Mac sync. |

## Future shape: one-shot bundle

The current pull fetches files one request at a time. If that gets slow with many images, a `GET /admin/export` returning a zip/tar of the whole `/data` tree (and a matching local import) would collapse it to one round-trip. Not built — the per-file pull is fine at current scale.
