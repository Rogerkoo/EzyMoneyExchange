# Currency Converter — Foundation

A simple Astro + TypeScript + vanilla JavaScript currency converter scaffold, intended for deployment to Vercel.

## Requirements

- Node.js 22 or a Node.js version supported by the installed Astro/Vercel adapter
- npm
- An ExchangeRate-API account and API key (needed in a later stage)

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows Command Prompt, use `copy .env.example .env` instead of `cp`.

The app currently displays the project foundation. The live rate API and interactive controls are intentionally not implemented yet.

## Commands

```bash
npm run dev     # local development server
npm run check   # Astro and TypeScript checks
npm run build   # production build
npm run preview # preview the production build
```

## Environment variable

The next stage will read `EXCHANGERATE_API_KEY` only from the server-side API route. Keep the real `.env` file out of Git and never expose the key using an `PUBLIC_`-prefixed variable.

## Deployment

1. Push this project to a Git repository.
2. Import the repository in Vercel.
3. Add `EXCHANGERATE_API_KEY` in the Vercel project's Environment Variables when the API integration is implemented.
4. Deploy.

The Vercel adapter and `output: 'server'` are configured to support server-rendered API routes.
