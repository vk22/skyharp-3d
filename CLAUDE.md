# skyharp-3d

Spatial music discovery MVP: a 3D map of tracks (CLAP embeddings → UMAP →
x/y/z), gated by login, click a point to play. Pulls its catalog from
`revibed-archiver`'s `revibedclusters` Mongo db (only seed + curator-accepted
tracks, never rejected) but is otherwise a fully separate app - own repo, own
Mongo db (`skyharp3d`), own deploy target (Linode VPS via Docker).

## Layout

- `data-pipeline/` - one-off Node+Python scripts run locally to build
  `manifest.json` (track metadata + x/y/z) and upload audio to MEGA S4.
  Already run once; 499 tracks uploaded. Re-run only if the source catalog
  in revibed-archiver changes.
- `backend/` - Express+TS API: `/api/login` (JWT, no self-registration -
  accounts made via `backend/scripts/create-user.js`), `/api/tracks`,
  `/api/tracks/:id/audio-url` (mints a 30-min signed MEGA S4 URL on demand).
  Serves `backend/data/manifest.json` from memory, no live DB dependency for
  track data.
- `frontend/` - Vue 3 + Vite, not Electron. Login screen gates a 3D map
  (Three.js, ported from revibed-archiver's `ClapSpace.vue`) with a
  Howler.js player bar at the bottom.
- `docker-compose.yml` + `Caddyfile` - mongo + backend + frontend behind
  Caddy (automatic HTTPS via Let's Encrypt for a real domain, or Caddy's
  internal self-signed CA for `localhost`).

## Status (as of this handoff)

Phases 1-4 done and verified locally:
1. Data pipeline - manifest built, 499 tracks uploaded to MEGA S4 (bucket
   `skyharp-3d-audio`).
2. Backend - login, tracks list, signed audio URLs. Tested end-to-end.
3. Frontend - login gate, 3D map, Howler player (play/pause/seek/volume,
   `next()` walks to the nearest track in 3D space, `prev()` retraces actual
   listening history via a stack, not a symmetric walk).
4. Docker Compose - full stack (mongo/backend/frontend/Caddy) built and run
   locally, confirmed working through Caddy's TLS termination exactly as it
   will run in production (login → 499 tracks → real signed S3 URL, all
   over `https://localhost`).

**Not done yet - Phase 5, actual deployment:**
- No Linode VPS has been provisioned or confirmed reachable yet.
- No real domain has been picked/pointed at a VPS IP (Caddy needs one for a
  real Let's Encrypt cert - `localhost` only works for local testing via its
  internal CA).
- Nothing has been pushed anywhere; this repo has no git remote configured
  (`git remote -v` is empty, local-only).
- Next concrete step when resuming: ask the user whether a Linode VPS
  already exists (IP + SSH access) or needs provisioning, and what domain to
  use - both are blocked on facts only the user has. See the last
  `AskUserQuestion` in the conversation history around "докер-compose и
  деплой на linod" for the exact framing.

## Local dev / test loop

```
cd backend && cp .env.example .env   # fill in real secrets, never paste them into chat
npm install && npm run dev            # localhost:4001

cd frontend && cp .env.example .env.local
npm install && npm run dev            # localhost:5173 (or next free port)
```

Full stack via compose (mirrors production topology):
```
cp .env.example .env                          # DOMAIN=localhost for local testing
cp backend/.env.production.example backend/.env.production   # fill in real secrets
docker compose up -d --build
docker compose exec backend node scripts/create-user.js <user> <pass>
# https://localhost (self-signed cert warning is expected for DOMAIN=localhost)
```

A test account `testuser`/`testpass123` was created against whatever mongo
volume was live at the time of testing - may or may not still exist
depending on whether `docker compose down -v` was run since.

## Conventions established in this project

- **Never paste real secrets into chat.** Ask the user to fill `.env` files
  directly; verify presence/shape with `grep -c`, `wc -l`, redacted `sed`,
  never `cat`/print raw values.
- Real env files (`.env`, `backend/.env`, `backend/.env.production`,
  `data-pipeline/.env`, `frontend/.env.local`) are all gitignored - confirmed
  via `git status --ignored` before every commit in this repo.
- `data-pipeline/export-tracks.js` must only ever pull seed tracks +
  `musicclusterreviews` docs with `decision: 'accepted'` - rejected/uncertain
  tracks must never enter this catalog. This was explicitly verified against
  the live DB (0 leaks) - re-verify if the pipeline is ever rerun after
  changes to that query.
- Caddy global options (like `email`) must go in a bare `{ }` block as the
  *first* block in the Caddyfile, not inside the site block - `email` as a
  site-block directive fails with "unrecognized directive: email".
- The backend Docker image must include `scripts/` (not just `dist/` and
  `data/`) - `create-user.js` is the only way to make an account and needs
  to run inside the deployed container.
