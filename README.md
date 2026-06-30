# Fencing Pro Visualizer

An interactive fence layout planner: drag posts and panels onto a property photo, customize materials/colors/gates, and get a live cost estimate.

This is a static web app — no backend/server required.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. (Optional) Copy `.env.example` to `.env.local` and fill in any values you want to customize (see below).
3. Run the app:
   `npm run dev`

## Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and click **Add New → Project**.
2. Import this GitHub repo. No settings need to be changed — Vercel will detect the build automatically (it uses the included `vercel.json`).
3. Click **Deploy**.
4. (Optional) To set the env vars below, go to **Project Settings → Environment Variables** after deploying, then redeploy.

## Deploy on Netlify

1. Go to [netlify.com](https://netlify.com) and click **Add new site → Import an existing project**.
2. Connect this GitHub repo. No settings need to be changed — Netlify will detect the build automatically (it uses the included `netlify.toml`).
3. Click **Deploy site**.
4. (Optional) To set the env vars below, go to **Site configuration → Environment variables** after deploying, then redeploy.

## Optional environment variables

See `.env.example` for the full list:

- `VITE_APP_PASSWORD` — changes the portal login password (defaults to `Uassistant` if not set).
- `VITE_GOOGLE_MAPS_API_KEY` — enables the live Google Maps satellite measuring tool. Without it, the app uses a built-in mock map instead.

**Note on the password screen:** it's a simple front-door check, not real security — the password lives in the code that's sent to every visitor's browser, so it can be viewed/bypassed by anyone who opens their browser's developer tools. It's fine for keeping casual visitors out, but don't rely on it to protect sensitive information.
