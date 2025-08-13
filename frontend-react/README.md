# Leesmaatje React Frontend

This SPA is built with **React 18**, **TypeScript**, **Tailwind CSS** and
uses Zustand for state management. The app lives under `/static/react/`
after building with Vite.

```
src/
├─ components/        reusable UI pieces
│  ├─ layout/         app wide layout components
│  └─ ui/             small UI primitives (button, card, ...)
├─ pages/             route pages
├─ lib/               stores & utilities
└─ types.ts           shared interfaces
```

## Extending levels and themes

Levels and themes are currently derived from
`webapp/backend/config.py::STORIES`. Once the backend exposes an API for
these, update `src/lib/themeData.ts` to fetch them dynamically and adjust
`LevelMap`/`LevelPage` accordingly.

## Environment variables

Add your OpenAI key to the repository's root `.env` file:

```
OPENAI_API_KEY=<your OpenAI API key>
```

Vite is configured to load this variable from the project root and expose it
to the client.

### Scripts

- `npm run dev` – development server
- `npm run lint` – ESLint
- `npm run build` – production build
