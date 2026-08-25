# skyharp-3d frontend

3D map of tracks (Three.js), gated by login. Talks to the skyharp-3d backend via `VITE_API_URL`.

## Dev

```
cp .env.example .env.local   # point VITE_API_URL at your local backend
npm install
npm run dev
```

## Build

```
npm run build      # static output in dist/
```

Or via Docker: `docker build --build-arg VITE_API_URL=https://api.example.com/api -t skyharp-3d-frontend .`
