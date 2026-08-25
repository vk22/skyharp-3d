"""
Phase 1, step 2: fit a 3D UMAP over the exported track embeddings.

Run with the same Python env used by revibed-archiver's m-rec pipeline
(already has numpy/umap-learn installed):
  /Users/kushnir/apps/m-rec/.venv/bin/python compute-umap.py

Reads tracks-raw.json (from export-tracks.js), writes
tracks-with-coords.json with the embedding field replaced by x/y/z.
"""
import json
import os

import numpy as np
from umap import UMAP

INPUT_PATH = os.path.join(os.path.dirname(__file__), "tracks-raw.json")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "tracks-with-coords.json")


def l2_normalize_rows(matrix):
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return matrix / norms


def main():
    with open(INPUT_PATH) as f:
        tracks = json.load(f)

    if len(tracks) < 4:
        raise ValueError("Need at least 4 tracks with embeddings to fit a UMAP projection")

    vectors = l2_normalize_rows(np.array([t["embedding"] for t in tracks], dtype=np.float32))
    n_neighbors = max(2, min(15, len(vectors) - 1))

    reducer = UMAP(n_components=3, n_neighbors=n_neighbors, metric="cosine", random_state=42)
    coords = reducer.fit_transform(vectors)

    for track, (x, y, z) in zip(tracks, coords.tolist()):
        track["x"] = x
        track["y"] = y
        track["z"] = z
        del track["embedding"]

    with open(OUTPUT_PATH, "w") as f:
        json.dump(tracks, f)

    print(f"Wrote {len(tracks)} tracks with 3D coordinates to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
