# Kino XII

Cinema site built with TypeScript and Vite. It talks to the Kino XII API and has no other dependencies.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`.

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run typecheck` | Type-check without building |
| `npm run build` | Type-check and write `dist/` |
| `npm run preview` | Serve the production build |

## API

Requests go to `https://api.kinoxii.redberryinternship.ge/api`. To point at another host, add a `.env` file:

```
VITE_API_BASE_URL=https://api.kinoxii.redberryinternship.ge/api
```

Restart the dev server after changing it. The login token is stored in the browser under `kinoxii.token`.

## Pages

`/` home, `/sessions` showtimes, `/movies/:slug` a film, `/profile` account and tickets. Guests who open `/profile` are sent home and asked to log in.
