#!/bin/sh
# pnpm dev:local: the whole app on this laptop, with no accounts.
set -eu

# Run from the repo root, wherever the script is called from.
cd "$(dirname "$0")/.."

# pglite keeps the database and the generated session secret here.
mkdir -p .data

# Only .env can lift the block on outbound requests, as before, so a PARKSHAPE_OFFLINE=0 left in
# the shell does not.
unset PARKSHAPE_OFFLINE

# Build every package and app once, before anything starts. This runs before .env is read, so a
# key there never reaches turbo, tsc or Vite.
turbo run build --output-logs=errors-only

# Read the git-ignored .env, if there is one, so a Gemini key pasted there reaches the API.
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

# pglite on disk and the OpenStreetMap basemap, which the new project wizard needs to find a park.
# The browser fetches the tiles; .env can set VITE_MAP_TILES=static for a plain fill with no network.
# Outbound requests from the API stay blocked unless .env sets PARKSHAPE_OFFLINE=0, which lets the
# API reach Gemini.
export DATABASE_URL="pglite://$PWD/.data/parkshape"
# Blobs on disk, so the API serves the thumbnails and heightmap the seed process wrote.
export BLOB_STORE=local-fs
export BLOB_DIR="$PWD/.data/blobs"
export PARKSHAPE_OFFLINE="${PARKSHAPE_OFFLINE:-1}"
export VITE_MAP_TILES="${VITE_MAP_TILES:-osm-raster}"

# Seed the demo park offline, as before. The seed always uses the fixed rules and the recorded
# Jonathan Rogers Park files, even when .env picks the live providers for the running app.
PARKSHAPE_OFFLINE=1 TERRAIN_PROVIDER=static SITE_FEATURES_PROVIDER=static SITE_CONTEXT_PROVIDER=static \
  pnpm run --if-present seed

# The API and the web app in watch mode.
exec pnpm --parallel --filter @parkshape/api --filter @parkshape/web run dev
